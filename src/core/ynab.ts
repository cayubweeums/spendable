import { isISODate } from "./dates";
import { SpendableError } from "./errors";
import { sanitizeLabel } from "./sanitize";
import { unzipEntries } from "./zip";

export type YnabCharge = {
  account: string;
  posted: string;
  amountCents: number;
  description: string;
  category: string | null;
  note: string;
  cleared: boolean;
  splits: { category: string; amountCents: number }[];
};

// shortcut: charges only, onto an account with the same name. Budgets, schedules, and new accounts wait. YNAB4 amounts are dollars. nYNAB amounts are milliunits.
export function parseYnab(bytes: Buffer, name: string): YnabCharge[] {
  const ext = name.toLowerCase().split(".").pop();
  const data = ext === "zip" || ext === "ynab4" ? readZip(bytes) : readJson(bytes);
  const accounts = Array.isArray(data.accounts) ? data.accounts : [];
  const yfull = Array.isArray(data.masterCategories) || accounts.some((account) => account != null && typeof account === "object" && "accountName" in account);
  const rows = yfull ? fromYnab4(data) : fromPlan(data);
  if (rows.length === 0) throw new SpendableError("That file has no charges.", "bad_import");
  if (rows.length > 20_000) throw new SpendableError("That file has too many charges.", "bad_import");
  return rows;
}

export function ynabName(name: string): boolean {
  const ext = name.toLowerCase().split(".").pop();
  return ext === "json" || ext === "zip" || ext === "ynab4";
}

type Bag = Record<string, unknown> & { accounts?: Record<string, unknown>[] };

function readJson(bytes: Buffer): Bag {
  try {
    return unwrap(JSON.parse(bytes.toString("utf8")) as unknown);
  } catch (error) {
    if (error instanceof SpendableError) throw error;
    throw new SpendableError("That file is not a YNAB budget.", "bad_import");
  }
}

function unwrap(value: unknown): Bag {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new SpendableError("That file is not a YNAB budget.", "bad_import");
  }
  let data = value as Bag;
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)) data = data.data as Bag;
  if (data.plan && typeof data.plan === "object") return data.plan as Bag;
  if (data.budget && typeof data.budget === "object") return data.budget as Bag;
  return data;
}

function readZip(bytes: Buffer): Bag {
  const files = unzipEntries(bytes);
  const json = files.find((file) => file.name.toLowerCase().endsWith(".json") && !file.name.endsWith("Budget.ymeta"));
  const meta = files.find((file) => file.name.endsWith("Budget.ymeta"));
  if (meta) return yfull(files, meta);
  if (json) return readJson(json.data);
  throw new SpendableError("That file is not a YNAB budget.", "bad_import");
}

function yfull(files: { name: string; data: Buffer }[], metaFile: { name: string; data: Buffer }): Bag {
  const meta = readJson(metaFile.data);
  const folder = typeof meta.relativeDataFolderName === "string" ? meta.relativeDataFolderName : "";
  let best = "";
  let score = -1;
  for (const file of files) {
    if (!file.name.includes(`/${folder}/devices/`)) continue;
    let device: { hasFullKnowledge?: boolean; deviceGUID?: string; knowledge?: string };
    try {
      device = JSON.parse(file.data.toString("utf8")) as { hasFullKnowledge?: boolean; deviceGUID?: string; knowledge?: string };
    } catch {
      continue;
    }
    if (!device.hasFullKnowledge || !device.deviceGUID) continue;
    const recent = String(device.knowledge ?? "")
      .split(",")
      .reduce((total, version) => total + (Number(version.split("-")[1]) || 0), 0);
    if (recent >= score) {
      score = recent;
      best = device.deviceGUID;
    }
  }
  const full = files.find((file) => file.name.endsWith(`/${best}/Budget.yfull`));
  if (!full) throw new SpendableError("That file is not a YNAB budget.", "bad_import");
  return readJson(full.data);
}

function centsFromMilli(amount: unknown): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) throw new SpendableError("That amount could not be read.", "bad_amount");
  return Math.round(value / 10);
}

function centsFromDollars(amount: unknown): number {
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) throw new SpendableError("That amount could not be read.", "bad_amount");
  return Math.round(value * 100);
}

function posted(value: unknown): string {
  const date = typeof value === "string" ? value.slice(0, 10) : "";
  if (!isISODate(date)) throw new SpendableError("That date could not be read.", "bad_date");
  return date;
}

function nameOf(rows: Record<string, unknown>[] | undefined, id: unknown, field = "name"): string {
  const row = rows?.find((item) => item.id === id || item.entityId === id);
  const name = row && typeof row[field] === "string" ? row[field] : "";
  return sanitizeLabel(name, field === "accountName" ? 80 : 180);
}

function fromPlan(data: Bag): YnabCharge[] {
  const accounts = list(data.accounts);
  const payees = list(data.payees);
  const categories = list(data.categories);
  const subs = list(data.subtransactions);
  return list(data.transactions).flatMap((txn) => {
    if (txn.deleted) return [];
    const payee = nameOf(payees, txn.payee_id);
    if (payee === "Starting Balance") return [];
    const amountCents = centsFromMilli(txn.amount);
    if (amountCents === 0) return [];
    const parts = subs
      .filter((part) => part.transaction_id === txn.id && !part.deleted)
      .map((part) => ({ category: sanitizeLabel(nameOf(categories, part.category_id), 40), amountCents: centsFromMilli(part.amount) }))
      .filter((part) => part.category && part.amountCents !== 0);
    const nested = list(txn.subtransactions)
      .filter((part) => !part.deleted)
      .map((part) => ({ category: sanitizeLabel(nameOf(categories, part.category_id), 40), amountCents: centsFromMilli(part.amount) }))
      .filter((part) => part.category && part.amountCents !== 0);
    const splits = parts.length >= 2 ? parts : nested;
    return [
      {
        account: nameOf(accounts, txn.account_id),
        posted: posted(txn.date),
        amountCents,
        description: payee || "Transaction",
        category: splits.length >= 2 ? null : sanitizeLabel(nameOf(categories, txn.category_id), 40) || null,
        note: sanitizeLabel(typeof txn.memo === "string" ? txn.memo : "", 280),
        cleared: txn.cleared === "cleared" || txn.cleared === "reconciled",
        splits: splits.length >= 2 && splits.reduce((total, part) => total + part.amountCents, 0) === amountCents ? splits : [],
      },
    ];
  });
}

function fromYnab4(data: Bag): YnabCharge[] {
  const accounts = list(data.accounts).filter((account) => !account.isTombstone);
  const payees = list(data.payees).filter((payee) => !payee.isTombstone);
  const categories = list(data.masterCategories).flatMap((group) => list(group.subCategories).filter((category) => !category.isTombstone));
  return list(data.transactions).flatMap((txn) => {
    if (txn.isTombstone) return [];
    const payee = nameOf(payees, txn.payeeId);
    if (payee === "Starting Balance") return [];
    const amountCents = centsFromDollars(txn.amount);
    if (amountCents === 0) return [];
    const splits = list(txn.subTransactions)
      .filter((part) => !part.isTombstone)
      .map((part) => ({ category: sanitizeLabel(nameOf(categories, part.categoryId), 40), amountCents: centsFromDollars(part.amount) }))
      .filter((part) => part.category && part.amountCents !== 0);
    return [
      {
        account: nameOf(accounts, txn.accountId, "accountName"),
        posted: posted(txn.date),
        amountCents,
        description: payee || "Transaction",
        category: splits.length >= 2 ? null : sanitizeLabel(nameOf(categories, txn.categoryId), 40) || null,
        note: sanitizeLabel(typeof txn.memo === "string" ? txn.memo : "", 280),
        cleared: txn.cleared === "Cleared" || txn.cleared === "Reconciled",
        splits: splits.length >= 2 && splits.reduce((total, part) => total + part.amountCents, 0) === amountCents ? splits : [],
      },
    ];
  });
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item != null && typeof item === "object") as Record<string, unknown>[] : [];
}
