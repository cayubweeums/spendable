import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-batch-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a batch sets one category or copies the charges and leaves the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const spendable = service.getSnapshot().spendableCents;
    const rules = store.listMatchRules().length;
    const rows = store.listTransactions().filter((txn) => txn.description === "North Fuel");
    assert.equal(rows.length, 2);
    const [first, second] = rows;
    assert.ok(first && second);
    assert.throws(() => service.editCharges([first.id], "Nope"), /Select two charges/);

    service.editCharges([first.id, second.id], "Batch");
    assert.equal(store.getTransaction(first.id)?.category, "Batch");
    assert.equal(store.getTransaction(second.id)?.category, "Batch");
    assert.equal(store.getTransaction(first.id)?.amountCents, first.amountCents);
    assert.equal(store.listMatchRules().length, rules);

    const copies = service.copyCharges([first.id, second.id]);
    assert.equal(copies.length, 2);
    const copy = store.getTransaction(copies[0]);
    assert.ok(copy);
    assert.equal(copy.amountCents, first.amountCents);
    assert.equal(copy.description, first.description);
    assert.equal(copy.category, "Batch");
    assert.notEqual(copy.id, first.id);
    assert.equal(store.getTransaction(first.id)?.id, first.id);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.getSnapshot().spendableCents, spendable);
  } finally {
    store.closeDb();
  }
});
