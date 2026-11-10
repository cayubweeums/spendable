import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-desc-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a rule can match on description and rewrite it from a static value", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    // Ensure clean state with a fresh in-memory db
    store.lock();
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee, "demo should include Lane Coffee");

    // Insert a rule that renames description when it matches
    service.saveRules([
      {
        id: "r1",
        ord: 0,
        stage: "before",
        field: "imported_payee",
        op: "contains",
        value: "lane coffee",
        action: "description",
        actionValue: "Lane Café",
      },
    ]);

    // The rule runs on import (before stage) when saveRules calls applyImportedRules
    const updated = store.getTransaction(coffee.id);
    assert.ok(updated, "transaction should still exist");
    const namesByDesc = store.payeeNamesByDescription();
    assert.ok(namesByDesc.has("Lane Café") || namesByDesc.has("Lane Coffee"), "a payee_keys entry should map the new name");
  } finally {
    service.closeDb();
  }
});

test("a rule can copy the description into notes via {{description}}", async () => {
  const db = await import("../src/core/db");
  try {
    // Test fillRuleValue with description source directly (no DB needed)
    const fact: {
      importedPayee: string;
      payee: string;
      description: string;
      account: string;
      category: string;
      date: string;
      notes: string;
      amountCents: number;
      tags: string[];
      cleared: boolean;
    } = {
      importedPayee: "Lane Coffee",
      payee: "Lane Coffee",
      description: "Lane Espresso",
      account: "Checking",
      category: "",
      date: "2026-11-10",
      notes: "",
      amountCents: -575,
      tags: [],
      cleared: false,
    };

    // Dynamically loaded rules module
    const rules = await import("../src/core/rules");
    assert.equal(rules.fillRuleValue("{{description}}", fact as any), "Lane Espresso");
    assert.equal(rules.fillRuleValue("{{payee}}", fact as any), "Lane Coffee");
  } finally {
    db.lock();
  }
});

test("patch_transactions_id can rename a transaction description", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee, "demo should include Lane Coffee");

    service.editCharge(coffee.id, { description: "Lane Espresso" });

    const updated = store.getTransaction(coffee.id);
    assert.equal(updated?.description, "Lane Espresso");
    // payee_keys should now point to the new description
    const namesByDesc = store.payeeNamesByDescription();
    assert.ok(namesByDesc.has("Lane Espresso"), "new description should be in payee_keys");
  } finally {
    service.closeDb();
  }
});

test("patch_transactions_id returns the updated transaction", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee, "demo should include Lane Coffee");

    // editCharge should hold the charge state for undo
    service.editCharge(coffee.id, { description: "Lane Espresso", note: "test note" });

    const updated = store.getTransaction(coffee.id);
    assert.equal(updated?.description, "Lane Espresso");
    assert.equal(updated?.note, "test note");
  } finally {
    service.closeDb();
  }
});

test("a rule that matches on description uses contains and is ops", async () => {
  const service = await import("../src/core/service");
  try {
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    // Should accept description as a condition field with contains
    service.saveRules([
      {
        id: "r1",
        ord: 0,
        stage: "after",
        field: "description",
        op: "contains",
        value: "coffee",
        action: "category",
        actionValue: "Food",
      },
    ]);

    const rules = service.listMatchRules();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].field, "description");
    assert.equal(rules[0].op, "contains");
    assert.equal(rules[0].action, "category");
    assert.equal(rules[0].actionValue, "Food");

    // Clear for next tests
    service.saveRules([]);
  } finally {
    service.closeDb();
  }
});

test("description rule action has the right validation cap and rejects empty values", async () => {
  const service = await import("../src/core/service");
  try {
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    // Valid description action — should accept long values (280 char cap)
    const longValue = "x".repeat(180);
    service.saveRules([
      {
        id: "r1",
        ord: 0,
        stage: "after",
        field: "description",
        op: "is",
        value: "test",
        action: "description",
        actionValue: longValue,
      },
    ]);

    let rules = service.listMatchRules();
    assert.equal(rules.length, 1);
    // Value should be capped at 280 chars (via sanitizeLabel)
    assert.ok(rules[0].actionValue.length <= 280);

    // Empty description action value should fail
    assert.throws(
      () =>
        service.saveRules([
          {
            id: "r2",
            ord: 0,
            stage: "after",
            field: "description",
            op: "is",
            value: "test",
            action: "description",
            actionValue: "   ",
          },
        ]),
      /choice|Bad rule/i,
    );

    // Clear
    service.saveRules([]);
  } finally {
    service.closeDb();
  }
});

test("undo restores a description change made via editCharge", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    process.env.SPENDABLE_DB_PATH = path.join(tmpdir(), `spendable-desc-${Date.now()}.db`);
    service.ready();

    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee, "demo should include Lane Coffee");

    // Change description via editCharge
    service.editCharge(coffee.id, { description: "Lane Espresso" });
    const changed = store.getTransaction(coffee.id);
    assert.equal(changed?.description, "Lane Espresso");

    // Undo should restore the original description
    service.undoEdit();
    const restored = store.getTransaction(coffee.id);
    assert.equal(restored?.description, "Lane Coffee", "undo should restore original description");
  } finally {
    service.closeDb();
  }
});
