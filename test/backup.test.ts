import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SpendableError } from "../src/core/errors";
import { zipDatabase } from "../src/core/zip";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-backup-"));
const dbPath = path.join(dir, "spendable.db");
process.env.SPENDABLE_DB_PATH = dbPath;

type Service = typeof import("../src/core/service");
type Store = typeof import("../src/core/db");
let service: Service;
let store: Store;

const password = "correct-horse";

describe("backup zip", { concurrency: 1 }, () => {
  before(async () => {
    process.env.SPENDABLE_DB_PATH = dbPath;
    service = await import("../src/core/service");
    store = await import("../src/core/db");
    service.closeDb();
  });

  after(() => {
    service.closeDb();
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips the sealed database and drops the current session", () => {
    service.establishPassword(password, password);
    store.setMeta("marker", "kept");
    const zip = service.downloadBackup();
    assert.equal(zip.subarray(0, 2).toString(), "PK");
    store.setMeta("marker", "replaced");
    const compressed = zipDatabase(store.readDatabaseFile(), true);
    service.restoreBackup(zip);
    assert.equal(store.isUnlocked(), false);
    assert.throws(() => service.signIn("wrong-password"), (error: unknown) => error instanceof SpendableError);
    service.signIn(password);
    assert.equal(store.getMeta("marker"), "kept");
    service.restoreBackup(compressed);
    service.signIn(password);
    assert.equal(store.getMeta("marker"), "replaced");
  });

  it("rejects a zip that is not this backup", () => {
    const zip = service.downloadBackup();
    const bad = Buffer.from(zip);
    const name = Buffer.from("spendable.db");
    const other = Buffer.from("not-this-one");
    let at = 0;
    while ((at = bad.indexOf(name, at)) !== -1) {
      other.copy(bad, at, 0, name.length);
      at += name.length;
    }
    assert.throws(() => service.restoreBackup(bad), /spendable\.db/);
    assert.throws(() => service.restoreBackup(Buffer.from("not a zip")), /not a zip/);
    assert.equal(store.getMeta("marker"), "replaced");
  });
});
