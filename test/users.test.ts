import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-users-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");
delete process.env.SPENDABLE_SIGNUP;

after(() => {
  delete process.env.SPENDABLE_SIGNUP;
  rmSync(dir, { recursive: true, force: true });
});

test("a new user gets a separate file and must replace the temporary password", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const spendable = service.getSnapshot().spendableCents;
    service.establishPassword("admin-pass-1", "admin-pass-1", "Owner");
    assert.throws(() => service.addUser("Owner", "temporary1"), /taken/);
    service.addUser("Ada", "temporary1");
    assert.throws(() => service.registerUser("Bea", "temporary2"), (error: Error & { code?: string }) => error.code === "forbidden");

    service.signIn("temporary1", "Ada");
    assert.equal(service.mustChangePassword(), true);
    assert.equal(store.getAccount("demo_checking"), null);
    assert.throws(() => service.changePassword("temporary1", "temporary1"), (error: Error & { code?: string }) => error.code === "password_same");
    service.changePassword("permanent1", "permanent1");
    assert.equal(service.mustChangePassword(), false);

    assert.throws(() => service.signIn("admin-pass-1"), /wrong/);
    service.signIn("admin-pass-1", "Owner");
    assert.equal(service.isAdmin(), true);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.getSnapshot().spendableCents, spendable);

    process.env.SPENDABLE_SIGNUP = "1";
    service.registerUser("Bea", "temporary2");
    assert.equal(service.mustChangePassword(), true);
    assert.equal(store.getAccount("demo_checking"), null);
    service.signIn("admin-pass-1", "Owner");
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    delete process.env.SPENDABLE_SIGNUP;
    store.closeDb();
  }
});
