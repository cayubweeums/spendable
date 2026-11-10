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
    // Minimum 2 IDs required (pickedIds deduplicates and filters empties)
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

test("batch categorization works with many transactions and deduplicates IDs", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const allTxns = store.listTransactions();
    assert.ok(allTxns.length > 3, "Demo DB should have multiple transactions for testing");

    // Use at least 5 unique IDs from the demo data
    const txnIds = allTxns.slice(0, 5).map((t) => t.id);
    const beforeCategories = new Map(txnIds.map((id) => [id, store.getTransaction(id)?.category]));

    // Set same category on all 5 transactions
    service.editCharges(txnIds, "BatchTest");

    // Verify all got the category
    for (const id of txnIds) {
      assert.equal(store.getTransaction(id)?.category, "BatchTest");
    }

    // Deduplication: passing duplicate IDs should not cause issues
    const duped = [...txnIds, ...txnIds.slice(0, 2)]; // 7 entries but only 5 unique
    service.editCharges(duped, "DedupTest");
    for (const id of txnIds) {
      assert.equal(store.getTransaction(id)?.category, "DedupTest");
    }

    // Clear category on a subset by passing null
    const toClear = [txnIds[0], txnIds[1]];
    service.editCharges(toClear, null);
    for (const id of toClear) {
      assert.equal(store.getTransaction(id)?.category, null);
    }

    // Uncategorized transactions should not have been modified beyond expectations
    const unchanged = allTxns.filter((t) => !txnIds.includes(t.id));
    for (const txn of unchanged) {
      assert.notEqual(store.getTransaction(txn.id)?.category, "DedupTest");
    }
  } finally {
    store.closeDb();
  }
});
