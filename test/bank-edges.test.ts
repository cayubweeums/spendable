import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inferRole, mergeBankAccount } from "../src/core/bank";

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
