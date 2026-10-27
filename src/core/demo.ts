import { addDays, isoToLocalNoonUnix, localISODate } from "./dates";
import type { Account, Bill, Settings, Transaction } from "./types";

export function buildDemo(today = localISODate()): {
  settings: Settings;
  accounts: Account[];
  bills: Bill[];
  transactions: Transaction[];
} {
  const anchor = addDays(today, -4);
  const lastStart = addDays(anchor, -14);
  const now = Math.floor(Date.now() / 1000);

  const accounts: Account[] = [
    {
      id: "demo_checking",
      name: "Everyday Checking",
      orgName: "Northwind Bank",
      currency: "USD",
      balanceCents: 441_255,
      availableCents: 428_011,
      balanceDate: now,
      role: "spend",
      dueDay: null,
      payMode: "none",
      minimumCents: 0,
    },
    {
      id: "demo_savings",
      name: "Rainy Day Savings",
      orgName: "Northwind Bank",
      currency: "USD",
      balanceCents: 1_240_000,
      availableCents: 1_240_000,
      balanceDate: now,
      role: "reserve",
      dueDay: null,
      payMode: "none",
      minimumCents: 0,
    },
    {
      id: "demo_visa",
      name: "Harbor Visa",
      orgName: "Harbor Card",
      currency: "USD",
      balanceCents: -184_219,
      availableCents: null,
      balanceDate: now,
      role: "credit",
      dueDay: Number(addDays(today, 7).slice(8, 10)),
      payMode: "full",
      minimumCents: 4_000,
    },
  ];

  const bills: Bill[] = [
    { id: "demo_internet", name: "Internet", amountCents: 8_000, dueDay: Number(addDays(today, 3).slice(8, 10)), active: true },
    { id: "demo_rent", name: "Rent", amountCents: 160_000, dueDay: Number(addDays(today, 5).slice(8, 10)), active: true },
    { id: "demo_electric", name: "Electric", amountCents: 9_500, dueDay: Number(addDays(today, 6).slice(8, 10)), active: true },
  ];

  const transactions: Transaction[] = [
    txn("pay", 0, 240_000, "Northwind Payroll", "Income", false, anchor),
    txn("market", 1, -5_418, "Market Basket", "Groceries", false, anchor),
    txn("coffee", 2, -575, "Lane Coffee", "Coffee", false, anchor),
    txn("fuel", 3, -4_120, "North Fuel", "Gas", false, anchor),
    txn("hold", 4, -13_244, "Hold · Market Basket", "Groceries", true, anchor),
  ];

  const lastCycle: [number, number, string, string][] = [
    [1, -8_620, "Market Basket", "Groceries"],
    [2, -640, "Lane Coffee", "Coffee"],
    [3, -4_800, "North Fuel", "Gas"],
    [5, -6_215, "Corner Oven", "Eating out"],
    [6, -8_000, "Harbor Internet", "Bills"],
    [9, -9_430, "Market Basket", "Groceries"],
    [10, -1_475, "Lane Coffee", "Coffee"],
    [12, -2_210, "Elm Pharmacy", "Health"],
    [13, -7_140, "Corner Oven", "Eating out"],
  ];
  for (const [offset, amount, description, category] of lastCycle) {
    transactions.push(txn(`last-${offset}`, offset, amount, description, category, false, lastStart));
  }

  return {
    settings: { paydayFrequency: "biweekly", paydayAnchor: anchor, bufferCents: 20_000 },
    accounts,
    bills,
    transactions,
  };
}

function txn(
    id: string,
    offset: number,
    amountCents: number,
    description: string,
    category: string,
    pending: boolean,
    start: string,
  ): Transaction {
    return {
      id: `demo_txn_${id}`,
      accountId: "demo_checking",
      posted: isoToLocalNoonUnix(addDays(start, offset)),
      amountCents,
      description,
      pending,
      category,
    };
}
