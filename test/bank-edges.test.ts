import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferKind, inferRole, mergeBankAccount, roleForKind } from "../src/core/bank";

describe("guessing a role from the bank's account name", () => {
  const cases: [string, string][] = [
    ["Everyday Checking", "spend"],
    ["Debit Visa", "credit"],
    ["Freedom Mastercard", "credit"],
    ["Platinum Amex", "credit"],
    ["American Express Gold", "credit"],
    ["Store Credit Card", "credit"],
    ["Credit Union Checking", "spend"],
    ["High Yield Savings", "reserve"],
    ["Money Market", "reserve"],
    ["Emergency Fund", "reserve"],
    ["Brokerage", "ignore"],
    ["Roth IRA", "ignore"],
    ["401(k)", "ignore"],
    ["Retirement", "ignore"],
    ["Mutual Fund", "ignore"],
    ["Auto Loan", "ignore"],
    ["Mortgage", "ignore"],
  ];

  for (const [name, role] of cases) {
    it(`reads "${name}" as ${role}`, () => {
      assert.equal(inferRole(name), role);
    });
  }
});

describe("account types", () => {
  it("maps the bank name onto a type, then onto how it counts", () => {
    assert.equal(inferKind("Roth IRA"), "roth_ira");
    assert.equal(inferKind("Roth"), "roth");
    assert.equal(inferKind("Brokerage"), "stocks");
    assert.equal(inferKind("Robinhood Roth IRA (1601)"), "roth_ira");
    assert.equal(inferKind("Robinhood individual (8502)"), "stocks");
    assert.equal(inferKind("Everyday Checking"), "checking");
    assert.equal(inferKind("High Yield Savings"), "savings");
    assert.equal(roleForKind("roth_ira"), "ignore");
    assert.equal(roleForKind("roth"), "ignore");
    assert.equal(roleForKind("stocks"), "ignore");
    assert.equal(roleForKind("checking"), "spend");
    assert.equal(roleForKind("savings"), "reserve");
    assert.equal(roleForKind("credit"), "credit");
  });
});

describe("keeping the user's rules across a sync", () => {
  it("does not invent a card payment on the first copy", () => {
    const fresh = mergeBankAccount(null, "Harbor Visa");
    assert.deepEqual(fresh, { role: "credit", dueDay: null, payMode: "none", minimumCents: 0 });
  });

  it("returns the saved role, due day, and payment rule unchanged", () => {
    const saved = { role: "spend" as const, dueDay: 12, payMode: "minimum" as const, minimumCents: 2500 };
    assert.deepEqual(mergeBankAccount(saved, "Something Else Entirely"), saved);
    assert.notEqual(mergeBankAccount(saved, "Something Else Entirely"), saved);
  });
});
