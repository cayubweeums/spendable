import type { AccountKind, PayMode, Role } from "./types";

export const ACCOUNT_KINDS: [AccountKind, string][] = [
  ["checking", "Checking"],
  ["savings", "Savings"],
  ["credit", "Credit card"],
  ["roth_ira", "Roth IRA"],
  ["roth", "Roth"],
  ["stocks", "Stocks"],
  ["other", "Other"],
];

const KINDS = new Set<string>(ACCOUNT_KINDS.map(([kind]) => kind));

export function isAccountKind(value: string | undefined): value is AccountKind {
  return value != null && KINDS.has(value);
}

export function accountTitle(account: { name: string; label?: string | null }): string {
  const label = account.label?.trim();
  return label ? label : account.name;
}

export function inferKind(name: string): AccountKind {
  const normalized = name.toLowerCase();
  if (/roth\s*ira/.test(normalized)) return "roth_ira";
  if (/\broth\b/.test(normalized)) return "roth";
  if (/credit card|\bvisa\b|\bmastercard\b|\bamex\b|american express/.test(normalized)) return "credit";
  if (/\bloan\b|mortgage/.test(normalized)) return "other";
  if (/saving|money market|emergency/.test(normalized)) return "savings";
  if (/brokerage|investment|mutual fund|\bstocks?\b|\brobinhood\b/.test(normalized)) return "stocks";
  if (/401\(k\)|retirement|\bira\b/.test(normalized)) return "other";
  return "checking";
}

export function roleForKind(kind: AccountKind): Role {
  if (kind === "checking") return "spend";
  if (kind === "savings") return "reserve";
  if (kind === "credit") return "credit";
  return "ignore";
}

export function kindLabel(kind: AccountKind): string {
  return ACCOUNT_KINDS.find(([value]) => value === kind)?.[1] ?? "Other";
}

export function kindFromRole(role: Role): AccountKind {
  if (role === "reserve") return "savings";
  if (role === "credit") return "credit";
  if (role === "ignore") return "other";
  return "checking";
}

export function inferRole(name: string): Role {
  return roleForKind(inferKind(name));
}

export function mergeBankAccount<T extends { role: Role; dueDay: number | null; payMode: PayMode; minimumCents: number }>(
  existing: T | null,
  remoteName: string,
): { role: Role; dueDay: number | null; payMode: PayMode; minimumCents: number } {
  if (existing) {
    return {
      role: existing.role,
      dueDay: existing.dueDay,
      payMode: existing.payMode,
      minimumCents: existing.minimumCents,
    };
  }
  return {
    role: inferRole(remoteName),
    dueDay: null,
    payMode: "none",
    minimumCents: 0,
  };
}
