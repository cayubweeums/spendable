import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SpendableError } from "../src/core/errors";
import { hashPassword } from "../src/core/password";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-vault-"));
const dbPath = path.join(dir, "spendable.db");
process.env.SPENDABLE_DB_PATH = dbPath;

type Service = typeof import("../src/core/service");
type Store = typeof import("../src/core/db");
let service: Service;
let store: Store;

const password = "correct-horse";

describe("encrypted database", { concurrency: 1 }, () => {
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

  it("seals the file on the first password and drops the key on sign-out", () => {
    service.establishPassword(password, password);
    const sealed = readFileSync(dbPath);
    assert.equal(sealed.subarray(0, 5).toString(), "SPEN1");
    assert.equal(sealed.includes(Buffer.from(password)), false);
    assert.equal(sealed.includes(Buffer.from("SQLite format 3")), false);
    const hash = store.getMeta("password_hash");
    assert.equal(sealed.includes(Buffer.from(hash)), false);
    service.closeDb();
    assert.equal(service.passwordIsSet(), true);
    assert.equal(service.sessionIsOpen("leftover"), false);
    assert.throws(() => store.getMeta("password_hash"), (error: unknown) => error instanceof SpendableError);
    assert.throws(
      () => service.signIn("wrong-password"),
      (error: unknown) => error instanceof SpendableError && error.status === 401,
    );
    assert.equal(store.isUnlocked(), false);
    service.signIn(password);
    assert.equal(store.getMeta("password_hash"), hash);
    store.setMeta("marker", "kept");
    service.closeDb();
    service.signIn(password);
    assert.equal(store.getMeta("marker"), "kept");
    service.closeDb();
  });

  it("seals an older plaintext database on the next sign-in", () => {
    const legacyDir = mkdtempSync(path.join(tmpdir(), "spendable-vault-legacy-"));
    const legacyPath = path.join(legacyDir, "spendable.db");
    service.closeDb();
    process.env.SPENDABLE_DB_PATH = legacyPath;
    try {
      store.setMeta("password_hash", hashPassword(password));
      store.setMeta("marker", "legacy");
      service.closeDb();
      assert.equal(readFileSync(legacyPath).subarray(0, 15).toString(), "SQLite format 3");
      assert.throws(() => service.signIn("wrong-password"), (error: unknown) => error instanceof SpendableError);
      assert.equal(readFileSync(legacyPath).subarray(0, 15).toString(), "SQLite format 3");
      service.signIn(password);
      assert.equal(readFileSync(legacyPath).subarray(0, 5).toString(), "SPEN1");
      assert.equal(store.getMeta("marker"), "legacy");
    } finally {
      service.closeDb();
      process.env.SPENDABLE_DB_PATH = dbPath;
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });
});
