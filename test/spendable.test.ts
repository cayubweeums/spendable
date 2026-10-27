import assert from "node:assert/strict";
import { test } from "node:test";
import { inferRole, mergeBankAccount } from "../src/core/bank";
import { dueDatesInWindow, nextPayday, previousPayday } from "../src/core/dates";
import { decimalToCents, formatMoney } from "../src/core/money";
import { accountsRequest, claimAccessUrl, decodeSetupToken, mapAccountSet } from "../src/core/simplefin";
import { computeSpendable } from "../src/core/spendable";
import type { Account, Bill, Transaction } from "../src/core/types";

test("parses bank decimal strings into cents", () => {
  assert.equal(decimalToCents("75.23"), 7523);
  assert.equal(decimalToCents("-33293.43"), -3_329_343);
  assert.equal(decimalToCents("100"), 10_000);
  assert.equal(decimalToCents("10.1"), 1010);
  assert.equal(decimalToCents("0.005"), 1);
  assert.equal(decimalToCents("0.004"), 0);
  assert.equal(formatMoney(-160000), "−$1,600.00");
});

test("payday stays on the calendar, including short months", () => {
  assert.equal(nextPayday("2026-10-27", "biweekly", "2026-10-23"), "2026-11-06");
  assert.equal(previousPayday("2026-10-27", "biweekly", "2026-10-23"), "2026-10-23");
  assert.equal(nextPayday("2026-10-23", "biweekly", "2026-10-23"), "2026-11-06");
  assert.equal(previousPayday("2026-10-23", "biweekly", "2026-10-23"), "2026-10-23");
  assert.equal(nextPayday("2026-02-15", "monthly", "2026-01-31"), "2026-02-28");
  assert.equal(previousPayday("2026-02-15", "monthly", "2026-01-31"), "2026-01-31");
  assert.equal(nextPayday("2026-03-01", "monthly", "2026-01-31"), "2026-03-31");
  assert.equal(previousPayday("2026-03-01", "monthly", "2026-01-31"), "2026-02-28");
  assert.equal(previousPayday("2026-01-10", "monthly", "2025-01-31"), "2025-12-31");
  assert.deepEqual(dueDatesInWindow(30, "2026-10-27", "2026-11-06"), ["2026-10-30"]);
  assert.deepEqual(dueDatesInWindow(6, "2026-10-27", "2026-11-06"), []);
});

test("roles are guessed once, then left alone", () => {
  assert.equal(inferRole("Freedom Visa"), "credit");
  assert.equal(inferRole("Credit Union Checking"), "spend");
  assert.equal(inferRole("Rainy Day Savings"), "reserve");
  assert.equal(inferRole("Brokerage"), "ignore");
  const kept = mergeBankAccount(
    { role: "reserve" as const, dueDay: 3, payMode: "full" as const, minimumCents: 2500 },
    "Everyday Checking",
  );
  assert.equal(kept.role, "reserve");
  assert.equal(kept.payMode, "full");
  assert.equal(mergeBankAccount(null, "High Yield Savings").role, "reserve");
  assert.equal(mergeBankAccount(null, "Harbor Visa").payMode, "none");
});

test("simplefin tokens and account payloads stay free of credentials", async () => {
  const token = Buffer.from("https://example.com/simplefin/claim/abc").toString("base64");
  assert.equal(decodeSetupToken(token), "https://example.com/simplefin/claim/abc");
  const request = accountsRequest("https://user:secret@example.com/simplefin", { pending: "1" });
  assert.equal(request.url, "https://example.com/simplefin/accounts?pending=1");
  assert.match(request.authorization, /^Basic /);
  assert.equal(request.url.includes("secret"), false);

  await assert.rejects(
    () => claimAccessUrl(token, async () => new Response("no", { status: 403 })),
    /refused that token/,
  );

  const mapped = mapAccountSet({
    errlist: [{ code: "con.auth", msg: "<b>Sign in again</b>" }],
    errors: ["plain warning"],
    connections: [{ conn_id: "CON-1", name: "Northwind", org_name: "Northwind Bank" }],
    accounts: [
      {
        id: "1",
        name: "Checking",
        conn_id: "CON-1",
        currency: "USD",
        balance: "10.00",
        "balance-date": 10,
        transactions: [{ id: "t", posted: 10, amount: "-1.50", description: "Coffee" }],
      },
      {
        id: "1",
        name: "Visa",
        conn_id: "CON-2",
        currency: "USD",
        balance: "-5.00",
        "balance-date": 10,
        transactions: [{ id: "t", posted: 10, amount: "-5.00", description: "Same id, other account" }],
      },
    ],
  });
  assert.deepEqual(mapped.errors, ["Sign in again", "plain warning"]);
  assert.equal(mapped.accounts[0]?.id, "CON-1:1");
  assert.equal(mapped.accounts[1]?.id, "CON-2:1");
  assert.notEqual(mapped.accounts[0]?.transactions[0]?.id, mapped.accounts[1]?.transactions[0]?.id);
  assert.equal(mapped.accounts[0]?.orgName, "Northwind Bank");
  assert.equal(mapped.accounts[0]?.availableCents, null);
});

function checking(available: number | null): Account {
  return {
    id: "checking",
    name: "Everyday Checking",
    orgName: "Northwind Bank",
    currency: "USD",
    balanceCents: 441_255,
    availableCents: available,
    balanceDate: 1,
    role: "spend",
    dueDay: null,
    payMode: "none",
    minimumCents: 0,
  };
}

const savings: Account = {
  id: "savings",
  name: "Rainy Day Savings",
  orgName: "Northwind Bank",
  currency: "USD",
  balanceCents: 1_240_000,
  availableCents: 1_240_000,
  balanceDate: 1,
  role: "reserve",
  dueDay: null,
  payMode: "none",
  minimumCents: 0,
};

const visa: Account = {
  id: "visa",
  name: "Harbor Visa",
  orgName: "Harbor Card",
  currency: "USD",
  balanceCents: -184_219,
  availableCents: null,
  balanceDate: 1,
  role: "credit",
  dueDay: 3,
  payMode: "full",
  minimumCents: 4_000,
};

const bills: Bill[] = [
  { id: "internet", name: "Internet", amountCents: 8_000, dueDay: 30, active: true },
  { id: "rent", name: "Rent", amountCents: 160_000, dueDay: 1, active: true },
  { id: "electric", name: "Electric", amountCents: 9_500, dueDay: 2, active: true },
  { id: "payday", name: "Payday bill", amountCents: 50_000, dueDay: 6, active: true },
];

const hold: Transaction = {
  id: "hold",
  accountId: "checking",
  posted: Date.parse("2026-10-27T12:00:00Z") / 1000,
  amountCents: -13_244,
  description: "Hold",
  pending: true,
  category: "Groceries",
};

test("spendable is bank cash minus bills due before payday", () => {
  const snapshot = computeSpendable({
    today: "2026-10-27",
    paydayFrequency: "biweekly",
    paydayAnchor: "2026-10-23",
    bufferCents: 20_000,
    demo: true,
    syncedAt: null,
    syncErrors: [],
    accounts: [checking(428_011), savings, visa],
    bills,
    transactions: [hold],
  });

  assert.equal(snapshot.spendableCents, 46_292);
  assert.equal(snapshot.daysUntilPayday, 10);
  assert.equal(snapshot.depositsCents, 441_255 + 1_240_000);
  assert.equal(snapshot.owedCents, 184_219);
  assert.equal(
    snapshot.receipt.lines.reduce((sum, line) => sum + line.cents, 0),
    snapshot.spendableCents,
  );
  assert.equal(snapshot.receipt.lines.some((line) => line.label === "Payday bill"), false);
  assert.equal(snapshot.receipt.lines.some((line) => line.label === "Rainy Day Savings"), false);
  assert.equal(snapshot.receipt.lines.some((line) => line.label === "Harbor Visa payment"), true);

  const fromLedger = computeSpendable({
    today: "2026-10-27",
    paydayFrequency: "biweekly",
    paydayAnchor: "2026-10-23",
    bufferCents: 20_000,
    demo: true,
    syncedAt: null,
    syncErrors: [],
    accounts: [checking(null), savings, visa],
    bills,
    transactions: [hold],
  });
  assert.equal(fromLedger.spendableCents, 46_292);

  const doubled = computeSpendable({
    today: "2026-10-27",
    paydayFrequency: "biweekly",
    paydayAnchor: "2026-10-23",
    bufferCents: 20_000,
    demo: true,
    syncedAt: null,
    syncErrors: [],
    accounts: [checking(428_011), savings, visa],
    bills,
    transactions: [hold],
  });
  assert.equal(doubled.spendableCents, 46_292);

  const short = computeSpendable({
    today: "2026-10-27",
    paydayFrequency: "biweekly",
    paydayAnchor: "2026-10-23",
    bufferCents: 500_000,
    demo: false,
    syncedAt: null,
    syncErrors: [],
    accounts: [checking(428_011), savings, visa],
    bills,
    transactions: [],
  });
  assert.equal(short.spendableCents < 0, true);
});
