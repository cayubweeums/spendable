import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-categories-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("categories can be renamed, merged, hidden, and deleted without moving a balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    const starters = service.listCategories();
    assert.equal(starters.find((category) => category.name === "Income")?.group, "Income");
    assert.equal(starters.some((category) => category.name === "Starting Balances"), false);
    assert.equal(starters.find((category) => category.name === "Food")?.group, "Usual Expenses");
    assert.equal(starters.find((category) => category.name === "General")?.group, "Usual Expenses");
    assert.equal(starters.find((category) => category.name === "Bills")?.group, "Usual Expenses");
    assert.equal(starters.find((category) => category.name === "Bills (Flexible)")?.group, "Usual Expenses");
    assert.equal(starters.find((category) => category.name === "Savings")?.group, "Investments and Savings");
    service.removeCategory("Food");
    assert.equal(service.listCategories().some((category) => category.name === "Food"), false);
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.category === "Coffee");
    assert.ok(coffee);
    service.saveTransactionDetails({
      id: coffee.id,
      category: "Coffee",
      contains: "Lane Coffee",
      remember: true,
      billable: false,
      recurring: false,
    });

    assert.ok(service.listCategories().some((category) => category.name === "Coffee"));
    service.updateCategory("Coffee", { name: "Cafe", group: "Food", note: "Morning", hidden: true });
    assert.equal(store.getTransaction(coffee.id)?.category, "Cafe");
    assert.equal(store.listRules().find((rule) => rule.contains === "lane coffee")?.category, "Cafe");
    const cafe = service.listCategories().find((category) => category.name === "Cafe");
    assert.equal(cafe?.group, "Food");
    assert.equal(cafe?.note, "Morning");
    assert.equal(cafe?.hidden, true);

    assert.throws(() => service.updateCategory("Cafe", { name: "Groceries" }), /taken/);
    service.mergeCategory("Cafe", "Groceries");
    assert.equal(store.getTransaction(coffee.id)?.category, "Groceries");
    assert.equal(store.listRules().find((rule) => rule.contains === "lane coffee")?.category, "Groceries");
    assert.equal(service.listCategories().some((category) => category.name === "Cafe"), false);
    assert.equal(service.listCategories().find((category) => category.name === "Groceries")?.note, "");

    service.setCategory(coffee.id, "Latte");
    assert.ok(service.listCategories().some((category) => category.name === "Latte"));
    service.removeCategory("Latte");
    assert.equal(store.getTransaction(coffee.id)?.category, null);
    assert.throws(() => service.removeCategory("Latte"), /No category/);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    service.closeDb();
  }
});
