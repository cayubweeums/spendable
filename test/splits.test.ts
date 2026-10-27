import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-split-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a split divides one charge and leaves the bank amount", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    store.insertTransaction({
      id: "split-shop",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -4200,
      description: "Split Shop",
      pending: false,
      category: "Old",
    });

    service.saveTransactionDetails({
      id: "split-shop",
      category: "Ignored",
      contains: "split shop",
      remember: false,
      billable: false,
      recurring: false,
      splits: [
        { category: "Split Groceries", amount: "20.00" },
        { category: "Split Gas", amount: "22.00" },
      ],
    });

    const split = store.getTransaction("split-shop");
    assert.equal(split?.amountCents, -4200);
    assert.equal(split?.description, "Split Shop");
    assert.equal(split?.category, null);
    assert.deepEqual(split?.splits, [
      { category: "Split Groceries", amountCents: -2000 },
      { category: "Split Gas", amountCents: -2200 },
    ]);

    assert.throws(
      () =>
        service.setSplits("split-shop", [
          { category: "Split Groceries", amount: "10.00" },
          { category: "Split Gas", amount: "10.00" },
        ]),
      /do not add up/,
    );
    assert.equal(store.getTransaction("split-shop")?.splits?.[0]?.amountCents, -2000);
    assert.throws(() => service.setSplits("split-shop", [{ category: "Split Gas", amount: "42.00" }]), /two parts/);

    service.saveRules([
      {
        id: "snack",
        ord: 1,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Split Shop",
        action: "category",
        actionValue: "Snacks",
      },
      {
        id: "resize",
        ord: 2,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Split Shop",
        action: "amount",
        actionValue: "1.00",
      },
    ]);
    const held = store.getTransaction("split-shop");
    assert.equal(held?.category, null);
    assert.equal(held?.amountCents, -4200);

    store.insertCategory("Split Groceries");
    service.updateCategory("Split Groceries", { name: "Split Food" });
    assert.equal(store.getTransaction("split-shop")?.splits?.[0]?.category, "Split Food");

    service.setSplits("split-shop", []);
    const cleared = store.getTransaction("split-shop");
    assert.equal(cleared?.splits?.length, 0);
    assert.equal(cleared?.amountCents, -4200);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
