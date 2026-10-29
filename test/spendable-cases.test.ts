import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isoToLocalNoonUnix } from "../src/core/dates";
import { computeSpendable } from "../src/core/spendable";
import type { Account, Bill, Transaction } from "../src/core/types";

function account(overrides: Partial<Account> & Pick<Account, "id" | "role">): Account {
  return {
    name: overrides.id,
    orgName: "Bank",
    currency: "USD",
    balanceCents: 0,
    availableCents: null,
    balanceDate: 1,
    dueDay: null,
    payMode: "none",
    minimumCents: 0,
    ...overrides,
  };
}

function bill(overrides: Partial<Bill> & Pick<Bill, "name" | "amountCents" | "dueDay">): Bill {
  return { id: overrides.name, active: true, ...overrides };
}

function txn(overrides: Partial<Transaction> & Pick<Transaction, "amountCents">): Transaction {
  return {
    id: overrides.id ?? `txn-${overrides.amountCents}`,
    accountId: "checking",
    posted: isoToLocalNoonUnix("2026-10-25"),
    description: "Txn",
    pending: false,
    category: "Coffee",
    ...overrides,
  };
}

function answer(overrides: Partial<Parameters<typeof computeSpendable>[0]> = {}) {
  return computeSpendable({
    today: "2026-10-27",
    paydayFrequency: "biweekly",
    paydayAnchor: "2026-10-23",
    bufferCents: 0,
    demo: false,
    syncedAt: null,
    syncErrors: [],
    accounts: [account({ id: "checking", role: "spend", balanceCents: 10_000, availableCents: 10_000 })],
    bills: [],
    transactions: [],
    ...overrides,
  });
}

describe("what gets subtracted", () => {
  const visa = account({
    id: "visa",
    name: "Harbor Visa",
    role: "credit",
    balanceCents: -18_000,
    dueDay: 3,
    payMode: "full",
    minimumCents: 4_000,
  });

  it("holds a minimum instead of the whole card balance", () => {
    const snapshot = answer({ accounts: [account({ id: "checking", role: "spend", availableCents: 50_000, balanceCents: 50_000 }), { ...visa, payMode: "minimum" }] });
    assert.equal(snapshot.spendableCents, 46_000);
    assert.equal(snapshot.receipt.lines.some((line) => line.label === "Harbor Visa minimum" && line.cents === -4_000), true);
  });

  it("holds nothing when the card rule is off or the due day is after payday", () => {
    const off = answer({ accounts: [account({ id: "checking", role: "spend", availableCents: 50_000, balanceCents: 50_000 }), { ...visa, payMode: "none" }] });
    const later = answer({
      accounts: [account({ id: "checking", role: "spend", availableCents: 50_000, balanceCents: 50_000 }), { ...visa, dueDay: 15 }],
    });
    assert.equal(off.spendableCents, 50_000);
    assert.equal(later.spendableCents, 50_000);
  });

  it("ignores an inactive bill and a bill due on payday", () => {
    const snapshot = answer({
      bills: [
        bill({ name: "Paused", amountCents: 9_999, dueDay: 30, active: false }),
        bill({ name: "Payday bill", amountCents: 9_999, dueDay: 6 }),
        bill({ name: "Internet", amountCents: 8_000, dueDay: 30 }),
      ],
    });
    assert.equal(snapshot.spendableCents, 2_000);
    assert.deepEqual(
      snapshot.receipt.lines.filter((line) => line.kind === "sub").map((line) => line.label),
      ["Internet"],
    );
  });

  it("leaves a zero buffer off the receipt and shows a shortfall", () => {
    const open = answer({ bufferCents: 0 });
    assert.equal(open.receipt.lines.some((line) => line.label === "Buffer"), false);
    const short = answer({
      bufferCents: 15_000,
      accounts: [account({ id: "checking", role: "spend", availableCents: 10_000, balanceCents: 10_000 })],
    });
    assert.equal(short.spendableCents, -5_000);
    assert.equal(short.perDayCents, -500);
    assert.equal(short.receipt.lines.some((line) => line.label === "Buffer" && line.detail === ""), true);
  });

  it("uses an available balance of zero instead of the ledger", () => {
    const snapshot = answer({
      accounts: [account({ id: "checking", role: "spend", balanceCents: 5_000, availableCents: 0 })],
      transactions: [txn({ amountCents: -100, pending: true })],
    });
    assert.equal(snapshot.spendableCents, 0);
    assert.match(snapshot.receipt.lines[0]?.detail ?? "", /Available/);
  });

  it("takes pending debits off the ledger only when the bank omitted available balance", () => {
    const snapshot = answer({
      accounts: [account({ id: "checking", role: "spend", balanceCents: 5_000, availableCents: null })],
      transactions: [txn({ amountCents: -125, pending: true }), txn({ id: "posted", amountCents: -50, pending: false })],
    });
    assert.equal(snapshot.spendableCents, 4_875);
    assert.match(snapshot.receipt.lines[0]?.detail ?? "", /pending/);
  });
});

describe("what stays visible and out of the total", () => {
  it("keeps savings and hidden accounts out of spendable cash", () => {
    const snapshot = answer({
      accounts: [
        account({ id: "checking", name: "Checking", role: "spend", balanceCents: 8_000, availableCents: 8_000 }),
        account({ id: "savings", name: "Savings", role: "reserve", balanceCents: 90_000, availableCents: 90_000 }),
        account({ id: "ira", name: "Roth IRA", role: "ignore", balanceCents: 400_000, availableCents: 400_000 }),
      ],
    });
    assert.equal(snapshot.spendableCents, 8_000);
    assert.equal(snapshot.depositsCents, 98_000);
    assert.equal(snapshot.deposits.some((item) => item.name === "Roth IRA"), false);
    assert.equal(snapshot.receipt.lines.some((line) => line.label === "Savings"), false);
  });

  it("does not add a second currency into the dollar total", () => {
    const snapshot = answer({
      accounts: [
        account({ id: "checking", role: "spend", balanceCents: 5_000, availableCents: 5_000, currency: "USD" }),
        account({ id: "euro", name: "Euro", role: "spend", balanceCents: 9_000, availableCents: 9_000, currency: "EUR" }),
      ],
    });
    assert.equal(snapshot.currency, "USD");
    assert.equal(snapshot.spendableCents, 5_000);
    assert.match(snapshot.receipt.lines.find((line) => line.label === "Euro")?.detail ?? "", /Different currency/);
  });

  it("leaves an account out of the answer when it is not followed", () => {
    const snapshot = answer({
      accounts: [
        account({ id: "checking", role: "spend", balanceCents: 10_000, availableCents: 10_000 }),
        account({ id: "hidden", role: "spend", balanceCents: 90_000, availableCents: 90_000, tracked: false }),
      ],
    });
    assert.equal(snapshot.spendableCents, 10_000);
    assert.equal(snapshot.deposits.some((item) => item.id === "hidden"), false);
  });

  it("does not hold a monthly bill again after the charge already posted this pay period", () => {
    const held = answer({
      bills: [bill({ name: "Electric", amountCents: 2_000, dueDay: 28, matchText: "city electric" })],
    });
    assert.equal(held.spendableCents, 8_000);
    const posted = answer({
      bills: [bill({ name: "Electric", amountCents: 2_000, dueDay: 28, matchText: "city electric" })],
      transactions: [txn({ id: "elec", amountCents: -2_000, description: "CITY ELECTRIC ACH", posted: isoToLocalNoonUnix("2026-10-26") })],
    });
    assert.equal(posted.spendableCents, 10_000);
  });

  it("does not treat a credit balance as cash", () => {
    const snapshot = answer({
      accounts: [
        account({
          id: "visa",
          name: "Harbor Visa",
          role: "credit",
          balanceCents: 2_000,
          dueDay: 3,
          payMode: "full",
        }),
      ],
    });
    assert.equal(snapshot.spendableCents, 0);
    assert.equal(snapshot.owedCents, 0);
    assert.equal(snapshot.receipt.lines.some((line) => line.kind === "sub"), false);
  });
});

describe("the pace lines", () => {
  it("counts posted outflows on spend accounts and skips income, pending, and other accounts", () => {
    const snapshot = answer({
      transactions: [
        txn({ id: "pay", amountCents: 200_000, posted: isoToLocalNoonUnix("2026-10-23") }),
        txn({ id: "groceries", amountCents: -2_000, posted: isoToLocalNoonUnix("2026-10-24") }),
        txn({ id: "hold", amountCents: -9_000, pending: true, posted: isoToLocalNoonUnix("2026-10-25") }),
        txn({ id: "card", accountId: "visa", amountCents: -4_000, posted: isoToLocalNoonUnix("2026-10-25") }),
      ],
    });
    assert.equal(snapshot.pace.thisSoFarCents, 2_000);
    assert.equal(snapshot.pace.dayNumber, 5);
    assert.equal(snapshot.pace.cycleDays, 14);
    assert.equal(snapshot.recent[0]?.category, "Coffee");
  });

  it("starts a new cycle on payday itself", () => {
    const snapshot = answer({ today: "2026-10-23" });
    assert.equal(snapshot.previousPayday, "2026-10-23");
    assert.equal(snapshot.nextPayday, "2026-11-06");
    assert.equal(snapshot.daysUntilPayday, 14);
    assert.equal(snapshot.pace.dayNumber, 1);
  });
});
