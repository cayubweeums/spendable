import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-merge-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("merging two charges keeps a filled field and leaves the bank amount", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const spendable = service.getSnapshot().spendableCents;
    const fuel = store.listTransactions().find((txn) => txn.description === "North Fuel");
    assert.ok(fuel);
    store.insertTransaction({
      id: "bank-fuel",
      accountId: fuel.accountId,
      posted: fuel.posted,
      amountCents: fuel.amountCents,
      description: fuel.description,
      pending: false,
      category: null,
    });
    store.setTransactionNote("bank-fuel", "keep");
    store.insertTransaction({
      id: "copy_fuel",
      accountId: fuel.accountId,
      posted: fuel.posted,
      amountCents: -100,
      description: fuel.description,
      pending: false,
      category: "Batch",
    });
    store.setTransactionNote("copy_fuel", "other");
    store.setTransactionTags("copy_fuel", ["fuel"]);
    store.setTransactionCleared("copy_fuel", true);
    store.replaceSplits("copy_fuel", [
      { category: "Gas", amountCents: -50 },
      { category: "Food", amountCents: -50 },
    ]);

    const kept = service.mergeCharges(["copy_fuel", "bank-fuel"]);
    const row = store.getTransaction(kept);
    assert.equal(kept, "bank-fuel");
    assert.equal(row?.category, "Batch");
    assert.equal(row?.note, "keep");
    assert.deepEqual(row?.tags, ["fuel"]);
    assert.equal(row?.cleared, true);
    assert.equal(row?.splits?.length, 0);
    assert.equal(row?.amountCents, fuel.amountCents);
    assert.equal(store.getTransaction("copy_fuel"), null);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.getSnapshot().spendableCents, spendable);
    store.insertTransaction({
      id: "other-account",
      accountId: "demo_savings",
      posted: fuel.posted,
      amountCents: -100,
      description: "Other",
      pending: false,
      category: null,
    });
    assert.throws(() => service.mergeCharges([kept, "other-account"]), /different accounts/);
  } finally {
    store.closeDb();
  }
});
