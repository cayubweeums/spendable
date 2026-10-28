import { accountTitle, kindFromRole } from "./bank";
import { formatMoney, isIsoCurrency } from "./money";
import {
  addDays,
  diffDays,
  dueDatesInWindow,
  formatLong,
  nextPayday,
  postedToISO,
  previousPayday,
} from "./dates";
import type { Account, Bill, Projection, Settings, Snapshot, Transaction } from "./types";

export const PRINCIPLE =
  "Account balances are the figures last copied from the bank. Bills, card payments, the buffer, and categories are a view on top of those figures. They never replace them.";

const QUESTION = "How much can I spend right now?";

type Input = Settings & {
  today: string;
  demo: boolean;
  syncedAt: string | null;
  syncErrors: string[];
  accounts: Account[];
  bills: Bill[];
  projections?: Projection[];
  transactions: Transaction[];
  hideAmounts?: boolean;
};

function liquidCents(account: Account, transactions: Transaction[]): number {
  if (account.availableCents != null) return account.availableCents;
  const pending = transactions
    .filter((txn) => txn.accountId === account.id && txn.pending && txn.amountCents < 0)
    .reduce((sum, txn) => sum + txn.amountCents, 0);
  return account.balanceCents + pending;
}

export type MonthReport = {
  month: string;
  days: { date: string; incomeCents: number; expenseCents: number }[];
  incomeCents: number;
  spendingCents: number;
  summaryCents: number;
  netWorthCents: number;
};

// shortcut: this month, posted charges on spend accounts. A chosen range, and card purchases, wait.
export function monthReport(
  transactions: Transaction[],
  spendIds: Set<string>,
  today: string,
  netWorthCents: number,
): MonthReport {
  const month = today.slice(0, 7);
  const byDay = new Map<string, { date: string; incomeCents: number; expenseCents: number }>();
  let incomeCents = 0;
  let spendingCents = 0;
  for (const txn of transactions) {
    if (!spendIds.has(txn.accountId) || txn.pending || txn.amountCents === 0) continue;
    const iso = postedToISO(txn.posted);
    if (!iso?.startsWith(month)) continue;
    const day = byDay.get(iso) ?? { date: iso, incomeCents: 0, expenseCents: 0 };
    if (txn.amountCents > 0) {
      day.incomeCents += txn.amountCents;
      incomeCents += txn.amountCents;
    } else {
      day.expenseCents += -txn.amountCents;
      spendingCents += -txn.amountCents;
    }
    byDay.set(iso, day);
  }
  return {
    month,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    incomeCents,
    spendingCents,
    summaryCents: incomeCents - spendingCents,
    netWorthCents,
  };
}

// shortcut: today's spendable number, not the one from the first of the month. Outflows on spend accounts. The number stays.
function monthOutflowCents(transactions: Transaction[], spendIds: Set<string>, today: string): number {
  const month = today.slice(0, 7);
  let spent = 0;
  for (const txn of transactions) {
    if (!spendIds.has(txn.accountId) || txn.pending || txn.amountCents >= 0) continue;
    const iso = postedToISO(txn.posted);
    if (iso?.startsWith(month)) spent += -txn.amountCents;
  }
  return spent;
}

function cumulativeOutflows(
  transactions: Transaction[],
  spendIds: Set<string>,
  start: string,
  days: number,
): number[] {
  const daily = Array.from({ length: days }, () => 0);
  for (const txn of transactions) {
    if (!spendIds.has(txn.accountId) || txn.pending || txn.amountCents >= 0) continue;
    const iso = postedToISO(txn.posted);
    if (!iso) continue;
    const index = diffDays(start, iso);
    if (index < 0 || index >= days) continue;
    daily[index] += -txn.amountCents;
  }
  let running = 0;
  return daily.map((value) => {
    running += value;
    return running;
  });
}

function projectionRecorded(plan: Projection, transactions: Transaction[], previous: string, today: string): boolean {
  const needle = plan.matchText.trim().toLowerCase();
  if (!needle) return false;
  const income = plan.kind === "income";
  return transactions.some((txn) => {
    if (income ? txn.amountCents <= 0 : txn.amountCents >= 0) return false;
    if (!txn.description.toLowerCase().includes(needle)) return false;
    if (txn.pending) return true;
    const iso = postedToISO(txn.posted);
    return iso != null && iso >= previous && iso <= today;
  });
}

function billAlreadyRecorded(bill: Bill, transactions: Transaction[], previous: string, today: string): boolean {
  const needle = bill.matchText?.trim().toLowerCase();
  if (!needle) return false;
  return transactions.some((txn) => {
    if (txn.amountCents >= 0) return false;
    if (!txn.description.toLowerCase().includes(needle)) return false;
    if (txn.pending) return true;
    const iso = postedToISO(txn.posted);
    return iso != null && iso >= previous && iso <= today;
  });
}

export function computeSpendable(input: Input): Snapshot {
  const accounts = input.accounts.filter((account) => account.tracked !== false);
  const trackedIds = new Set(accounts.map((account) => account.id));
  const transactions = input.transactions.filter((txn) => trackedIds.has(txn.accountId));
  const next = nextPayday(input.today, input.paydayFrequency, input.paydayAnchor);
  const previous = previousPayday(input.today, input.paydayFrequency, input.paydayAnchor);
  const daysUntilPayday = Math.max(1, diffDays(input.today, next));
  const cycleDays = Math.max(1, diffDays(previous, next));
  const dayNumber = Math.min(cycleDays, diffDays(previous, input.today) + 1);

  const spendAccounts = accounts.filter((account) => account.role === "spend");
  const currency =
    spendAccounts.find((account) => isIsoCurrency(account.currency))?.currency ??
    accounts.find((account) => isIsoCurrency(account.currency))?.currency ??
    "USD";

  const lines: Snapshot["receipt"]["lines"] = [];
  const subs: { when: string; line: Snapshot["receipt"]["lines"][number] }[] = [];
  let liquid = 0;

  for (const account of spendAccounts) {
    if (account.currency !== currency) {
      lines.push({
        kind: "bank",
        label: accountTitle(account),
        detail: "Different currency, left out of the total",
        cents: 0,
      });
      continue;
    }
    const available = liquidCents(account, transactions);
    liquid += available;
    const detail =
      account.availableCents != null && account.availableCents !== account.balanceCents
        ? input.hideAmounts
          ? "Available"
          : `Available. Ledger ${formatMoney(account.balanceCents, account.currency)}`
        : account.availableCents != null
          ? "Reported by the bank"
          : "Ledger balance, with pending charges taken off";
    lines.push({
      kind: "bank",
      label: accountTitle(account),
      detail,
      cents: available,
    });
  }

  for (const bill of input.bills.filter((item) => item.active)) {
    if (billAlreadyRecorded(bill, transactions, previous, input.today)) continue;
    const dates = dueDatesInWindow(bill.dueDay, input.today, next);
    for (const date of dates) {
      liquid -= bill.amountCents;
      subs.push({
        when: date,
        line: {
          kind: "sub",
          label: bill.name,
          detail: `Due ${formatLong(date)}`,
          cents: -bill.amountCents,
          when: date,
        },
      });
    }
  }

  for (const plan of input.projections ?? []) {
    if (projectionRecorded(plan, transactions, previous, input.today)) continue;
    const dates = dueDatesInWindow(plan.dueDay, input.today, next);
    const signed = plan.kind === "income" ? plan.amountCents : -plan.amountCents;
    for (const date of dates) {
      liquid += signed;
      subs.push({
        when: date,
        line: {
          kind: plan.kind === "income" ? "add" : "sub",
          label: plan.name,
          detail: `Due ${formatLong(date)}`,
          cents: signed,
          when: date,
        },
      });
    }
  }

  for (const account of accounts.filter((item) => item.role === "credit")) {
    if (account.currency !== currency || account.payMode === "none" || account.dueDay == null) continue;
    const dates = dueDatesInWindow(account.dueDay, input.today, next);
    if (dates.length === 0) continue;
    const owed = account.balanceCents < 0 ? -account.balanceCents : 0;
    const payment = account.payMode === "full" ? owed : Math.min(account.minimumCents, owed);
    if (payment <= 0) continue;
    for (const date of dates) {
      liquid -= payment;
      subs.push({
        when: date,
        line: {
          kind: "sub",
          label: account.payMode === "full" ? `${accountTitle(account)} payment` : `${accountTitle(account)} minimum`,
          detail: `Due ${formatLong(date)}`,
          cents: -payment,
          when: date,
        },
      });
    }
  }

  subs.sort((a, b) => a.when.localeCompare(b.when) || a.line.label.localeCompare(b.line.label));
  lines.push(...subs.map((item) => item.line));

  if (input.bufferCents > 0) {
    liquid -= input.bufferCents;
    lines.push({
      kind: "sub",
      label: "Left untouched",
      detail: "Your buffer",
      cents: -input.bufferCents,
    });
  }

  const spendableCents = liquid;
  const spendIds = new Set(
    spendAccounts.filter((account) => account.currency === currency).map((account) => account.id),
  );
  const lastStart = addDays(previous, -cycleDays);
  const lastCycle = cumulativeOutflows(transactions, spendIds, lastStart, cycleDays);
  const thisCycle = cumulativeOutflows(transactions, spendIds, previous, dayNumber);

  const deposits = accounts
    .filter(
      (account): account is Account & { role: "spend" | "reserve" } =>
        account.role === "spend" || account.role === "reserve",
    )
    .map((account) => ({
      id: account.id,
      name: accountTitle(account),
      orgName: account.orgName,
      role: account.role,
      kind: account.kind ?? kindFromRole(account.role),
      currency: account.currency,
      ledgerCents: account.balanceCents,
      availableCents: account.availableCents,
      balanceDate: account.balanceDate,
      note: account.note?.trim() ?? "",
    }));

  const debts = accounts
    .filter((account) => account.role === "credit")
    .map((account) => ({
      id: account.id,
      name: accountTitle(account),
      orgName: account.orgName,
      currency: account.currency,
      owedCents: account.balanceCents < 0 ? -account.balanceCents : 0,
      balanceDate: account.balanceDate,
      note: account.note?.trim() ?? "",
    }));

  const names = new Map(accounts.map((account) => [account.id, account]));
  const recent = [...transactions]
    .sort((a, b) => b.posted - a.posted || a.description.localeCompare(b.description))
    .slice(0, 15)
    .map((txn) => ({
      id: txn.id,
      posted: postedToISO(txn.posted),
      description: txn.description,
      amountCents: txn.amountCents,
      accountName: names.get(txn.accountId)?.name ?? "Account",
      pending: txn.pending,
      category: txn.category,
      note: txn.note ?? "",
      tags: txn.tags ?? [],
      cleared: txn.cleared === true,
      splits: txn.splits ?? [],
      currency: names.get(txn.accountId)?.currency ?? currency,
    }));

  return {
    principle: PRINCIPLE,
    question: QUESTION,
    today: input.today,
    demo: input.demo,
    currency,
    syncedAt: input.syncedAt,
    syncErrors: input.syncErrors,
    nextPayday: next,
    previousPayday: previous,
    daysUntilPayday,
    perDayCents: Math.trunc(spendableCents / daysUntilPayday),
    spendableCents,
    monthGapCents: spendableCents - monthOutflowCents(transactions, spendIds, input.today),
    depositsCents: deposits
      .filter((account) => account.currency === currency)
      .reduce((sum, account) => sum + account.ledgerCents, 0),
    owedCents: debts
      .filter((account) => account.currency === currency)
      .reduce((sum, account) => sum + account.owedCents, 0),
    deposits,
    debts,
    receipt: { lines, totalCents: spendableCents },
    pace: {
      cycleDays,
      dayNumber,
      thisCycle,
      lastCycle,
      thisSoFarCents: thisCycle.at(-1) ?? 0,
      lastAtSameDayCents: lastCycle[dayNumber - 1] ?? 0,
    },
    recent,
  };
}
