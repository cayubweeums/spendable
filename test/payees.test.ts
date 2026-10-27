import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-payees-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a payee rename keeps the bank text and can fill an empty category", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.listPayees();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    store.upsertSyncedTransaction({
      id: "plain-lane",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -100,
      description: "Lane Coffee",
      pending: false,
    });

    service.updatePayee("Lane Coffee", { name: "Cafe", favorite: true, category: "Groceries" });
    assert.equal(store.getTransaction(coffee.id)?.description, "Lane Coffee");
    assert.equal(store.getTransaction(coffee.id)?.category, "Coffee");
    assert.equal(store.getTransaction("plain-lane")?.category, "Groceries");
    const cafe = service.listPayees().find((payee) => payee.name === "Cafe");
    assert.equal(cafe?.favorite, true);
    assert.equal(cafe?.category, "Groceries");
    assert.deepEqual(cafe?.descriptions, ["Lane Coffee"]);
    assert.equal(service.listPayees().some((payee) => payee.name === "Lane Coffee"), false);

    store.upsertSyncedTransaction({
      id: "new-lane",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -200,
      description: "Lane Coffee",
      pending: false,
    });
    assert.equal(store.getTransaction("new-lane")?.description, "Lane Coffee");
    assert.equal(store.getTransaction("new-lane")?.category, "Groceries");

    assert.throws(() => service.updatePayee("Cafe", { name: "Market Basket" }), /taken/);
    service.mergePayee("Cafe", "Market Basket");
    const market = service.listPayees().find((payee) => payee.name === "Market Basket");
    assert.equal(service.listPayees().some((payee) => payee.name === "Cafe"), false);
    assert.equal(market?.category, "");
    assert.equal(market?.descriptions.includes("Lane Coffee"), true);
    assert.throws(() => service.updatePayee("Cafe", { favorite: true }), /No payee/);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    service.closeDb();
  }
});
