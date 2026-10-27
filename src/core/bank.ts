import type { PayMode, Role } from "./types";

export function inferRole(name: string): Role {
  const normalized = name.toLowerCase();
  if (/brokerage|investment|401\(k\)|\bira\b|retirement|mutual fund/.test(normalized)) {
    return "ignore";
  }
  if (/\bloan\b|mortgage/.test(normalized)) return "ignore";
  if (/credit card|\bvisa\b|\bmastercard\b|\bamex\b|american express/.test(normalized)) {
    return "credit";
  }
  if (/saving|money market|emergency/.test(normalized)) return "reserve";
  return "spend";
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
