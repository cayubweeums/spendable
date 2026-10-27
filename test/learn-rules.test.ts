import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-learn-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("saving a category or a payee category learns one rule until Learn is off", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    assert.equal(service.learnRules(), true);
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    store.insertTransaction({
      id: "later-lane",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -100,
      description: "Lane Coffee",
      pending: false,
      category: null,
    });

    service.saveTransactionDetails({
      id: coffee.id,
      category: "Coffee",
      contains: "lane",
      remember: false,
      billable: false,
      recurring: false,
    });
    const learned = service.listMatchRules().find((rule) => rule.field === "imported_payee");
    assert.equal(learned?.stage, "after");
    assert.equal(learned?.op, "is");
    assert.equal(learned?.value, "Lane Coffee");
    assert.equal(learned?.action, "category");
    assert.equal(learned?.actionValue, "Coffee");
    assert.equal(store.getTransaction("later-lane")?.category, "Coffee");
    assert.equal(store.getTransaction(coffee.id)?.description, "Lane Coffee");
    store.insertTransaction({
      id: "third-lane",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -100,
      description: "Lane Coffee",
      pending: false,
      category: null,
    });

    service.saveTransactionDetails({
      id: coffee.id,
      category: "Latte",
      contains: "lane",
      remember: false,
      billable: false,
      recurring: false,
    });
    assert.equal(service.listMatchRules().filter((rule) => rule.field === "imported_payee").length, 1);
    assert.equal(service.listMatchRules().find((rule) => rule.field === "imported_payee")?.actionValue, "Latte");
    assert.equal(store.getTransaction("later-lane")?.category, "Coffee");
    assert.equal(store.getTransaction("third-lane")?.category, "Latte");

    service.setLearnRules(false);
    service.saveTransactionDetails({
      id: coffee.id,
      category: "Groceries",
      contains: "lane",
      remember: false,
      billable: false,
      recurring: false,
    });
    assert.equal(service.listMatchRules().find((rule) => rule.field === "imported_payee")?.actionValue, "Latte");
    assert.equal(store.getTransaction(coffee.id)?.category, "Groceries");

    service.setLearnRules(true);
    service.updatePayee("Market Basket", { category: "Eating out" });
    const payeeRule = service.listMatchRules().find((rule) => rule.field === "payee");
    assert.equal(payeeRule?.op, "is");
    assert.equal(payeeRule?.value, "Market Basket");
    assert.equal(payeeRule?.actionValue, "Eating out");
    store.writePayee("Market Basket", { favorite: false, category: "" });
    store.insertTransaction({
      id: "rule-market",
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: -100,
      description: "Market Basket",
      pending: false,
      category: null,
    });
    store.applyMatchRules("after");
    assert.equal(store.getTransaction("rule-market")?.category, "Eating out");

    service.setLearnRules(false);
    service.updatePayee("Market Basket", { category: "Health" });
    assert.equal(service.listMatchRules().find((rule) => rule.field === "payee")?.actionValue, "Eating out");
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    service.closeDb();
  }
});
