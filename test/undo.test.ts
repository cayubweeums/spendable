import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-undo-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("undo puts the last charge edit back and leaves the bank amount", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    store.insertTransaction({
      id: "undo-shop",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -4200,
      description: "Undo Shop",
      pending: false,
      category: "Old",
    });
    store.setTransactionNote("undo-shop", "keep");
    store.setTransactionTags("undo-shop", ["weekly"]);

    service.saveTransactionDetails({
      id: "undo-shop",
      category: "Ignored",
      contains: "undo shop",
      remember: true,
      billable: false,
      recurring: false,
      note: "later",
      tags: "fuel",
      splits: [
        { category: "Undo Groceries", amount: "20.00" },
        { category: "Undo Gas", amount: "22.00" },
      ],
    });

    const edited = store.getTransaction("undo-shop");
    assert.equal(edited?.category, null);
    assert.equal(edited?.note, "later");
    assert.deepEqual(edited?.tags, ["fuel"]);
    assert.equal(edited?.splits?.length, 2);
    assert.equal(service.canUndo(), true);

    service.undoEdit();

    const restored = store.getTransaction("undo-shop");
    assert.equal(restored?.amountCents, -4200);
    assert.equal(restored?.description, "Undo Shop");
    assert.equal(restored?.category, "Old");
    assert.equal(restored?.note, "keep");
    assert.deepEqual(restored?.tags, ["weekly"]);
    assert.deepEqual(restored?.splits, []);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.canUndo(), false);
    assert.throws(() => service.undoEdit(), /Nothing to undo/);
  } finally {
    store.closeDb();
  }
});
