import type { PaydayFrequency } from "./dates";

export type Role = "spend" | "reserve" | "credit" | "ignore";
export type PayMode = "full" | "minimum" | "none";
export type AccountKind = "checking" | "savings" | "credit" | "roth" | "roth_ira" | "stocks" | "other";

export type Account = {
  id: string;
  name: string;
  orgName: string;
  currency: string;
  balanceCents: number;
  availableCents: number | null;
  balanceDate: number;
  role: Role;
  dueDay: number | null;
  payMode: PayMode;
  minimumCents: number;
  kind?: AccountKind;
  tracked?: boolean;
  label?: string;
  note?: string;
};

export type Bill = {
  id: string;
  name: string;
  amountCents: number;
  dueDay: number;
  active: boolean;
  matchText?: string | null;
};

export type Transaction = {
  id: string;
  accountId: string;
  posted: number;
  amountCents: number;
  description: string;
  pending: boolean;
  category: string | null;
};

export type Settings = {
  paydayFrequency: PaydayFrequency;
  paydayAnchor: string;
  bufferCents: number;
};

export type ReceiptLine = {
  label: string;
  detail: string;
  cents: number;
  kind: "bank" | "sub";
  when?: string;
};

export type Snapshot = {
  principle: string;
  question: string;
  today: string;
  demo: boolean;
  currency: string;
  syncedAt: string | null;
  syncErrors: string[];
  nextPayday: string;
  previousPayday: string;
  daysUntilPayday: number;
  perDayCents: number;
  spendableCents: number;
  depositsCents: number;
  owedCents: number;
  deposits: {
    id: string;
    name: string;
    orgName: string;
    role: "spend" | "reserve";
    kind: AccountKind;
    currency: string;
    ledgerCents: number;
    availableCents: number | null;
    balanceDate: number;
    note: string;
  }[];
  debts: {
    id: string;
    name: string;
    orgName: string;
    note: string;
    currency: string;
    owedCents: number;
    balanceDate: number;
  }[];
  receipt: {
    lines: ReceiptLine[];
    totalCents: number;
  };
  pace: {
    cycleDays: number;
    dayNumber: number;
    thisCycle: number[];
    lastCycle: number[];
    thisSoFarCents: number;
    lastAtSameDayCents: number;
  };
  recent: {
    id: string;
    posted: string | null;
    description: string;
    amountCents: number;
    accountName: string;
    pending: boolean;
    category: string | null;
    currency: string;
  }[];
};
