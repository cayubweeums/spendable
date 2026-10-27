import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildDemo } from "./demo";
import type { Account, Bill, PayMode, Role, Settings, Transaction } from "./types";
import type { PaydayFrequency } from "./dates";

type AccountRow = {
  id: string;
  name: string;
  org_name: string;
  currency: string;
  balance_cents: number;
  available_cents: number | null;
  balance_date: number;
  role: Role;
  due_day: number | null;
  pay_mode: PayMode;
  minimum_cents: number;
};

type BillRow = {
  id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  active: number;
};

type TransactionRow = {
  id: string;
  account_id: string;
  posted: number;
  amount_cents: number;
  description: string;
  pending: number;
  category: string | null;
};

type ConnectionRow = {
  access_url: string;
  claimed_at: string;
  last_sync_at: string | null;
  last_errors: string;
};

const globalForDb = globalThis as unknown as { spendableDb?: DatabaseSync };

function databasePath(): string {
  return process.env.SPENDABLE_DB_PATH ?? path.join(process.cwd(), "data", "spendable.db");
}

export function db(): DatabaseSync {
  if (!globalForDb.spendableDb) {
    const file = databasePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const database = new DatabaseSync(file);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 2000;
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS connection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        access_url TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        last_sync_at TEXT,
        last_errors TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        org_name TEXT NOT NULL,
        currency TEXT NOT NULL,
        balance_cents INTEGER NOT NULL,
        available_cents INTEGER,
        balance_date INTEGER NOT NULL,
        role TEXT NOT NULL,
        due_day INTEGER,
        pay_mode TEXT NOT NULL,
        minimum_cents INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        posted INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        description TEXT NOT NULL,
        pending INTEGER NOT NULL,
        category TEXT,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      );
      CREATE TABLE IF NOT EXISTS bills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        due_day INTEGER NOT NULL,
        active INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS transactions_posted ON transactions (posted DESC);
    `);
    globalForDb.spendableDb = database;
  }
  return globalForDb.spendableDb;
}

export function closeDb(): void {
  globalForDb.spendableDb?.close();
  globalForDb.spendableDb = undefined;
}

export function withTransaction<T>(fn: () => T): T {
  const database = db();
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

function metaRow(key: string): string | null {
  const row = db().prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function getMeta(key: string, fallback = ""): string {
  return metaRow(key) ?? fallback;
}

export function setMeta(key: string, value: string): void {
  db().prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    orgName: row.org_name,
    currency: row.currency,
    balanceCents: row.balance_cents,
    availableCents: row.available_cents,
    balanceDate: row.balance_date,
    role: row.role,
    dueDay: row.due_day,
    payMode: row.pay_mode,
    minimumCents: row.minimum_cents,
  };
}

export function listAccounts(): Account[] {
  const rows = db().prepare("SELECT * FROM accounts ORDER BY name COLLATE NOCASE").all() as AccountRow[];
  return rows.map(mapAccount);
}

export function getAccount(id: string): Account | null {
  const row = db().prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
  return row ? mapAccount(row) : null;
}

export function insertAccount(account: Account): void {
  db()
    .prepare(
      `INSERT INTO accounts (
        id, name, org_name, currency, balance_cents, available_cents, balance_date,
        role, due_day, pay_mode, minimum_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      account.id,
      account.name,
      account.orgName,
      account.currency,
      account.balanceCents,
      account.availableCents,
      account.balanceDate,
      account.role,
      account.dueDay,
      account.payMode,
      account.minimumCents,
    );
}

// Bank sync is the only writer of balance_cents, available_cents, and balance_date
// on an existing account. Role and payment rules are left as the user set them.
export function upsertSyncedAccount(
  account: Omit<Account, "role" | "dueDay" | "payMode" | "minimumCents"> & {
    role: Role;
    dueDay: number | null;
    payMode: PayMode;
    minimumCents: number;
  },
): void {
  db()
    .prepare(
      `INSERT INTO accounts (
        id, name, org_name, currency, balance_cents, available_cents, balance_date,
        role, due_day, pay_mode, minimum_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        org_name = excluded.org_name,
        currency = excluded.currency,
        balance_cents = excluded.balance_cents,
        available_cents = excluded.available_cents,
        balance_date = excluded.balance_date`,
    )
    .run(
      account.id,
      account.name,
      account.orgName,
      account.currency,
      account.balanceCents,
      account.availableCents,
      account.balanceDate,
      account.role,
      account.dueDay,
      account.payMode,
      account.minimumCents,
    );
}

export function updateAccountRules(
  id: string,
  rules: { role: Role; dueDay: number | null; payMode: PayMode; minimumCents: number },
): number {
  const result = db()
    .prepare("UPDATE accounts SET role = ?, due_day = ?, pay_mode = ?, minimum_cents = ? WHERE id = ?")
    .run(rules.role, rules.dueDay, rules.payMode, rules.minimumCents, id);
  return Number(result.changes ?? 0);
}

export function listBills(): Bill[] {
  const rows = db().prepare("SELECT * FROM bills ORDER BY due_day, name COLLATE NOCASE").all() as BillRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    amountCents: row.amount_cents,
    dueDay: row.due_day,
    active: row.active === 1,
  }));
}

export function insertBill(bill: Bill): void {
  db()
    .prepare("INSERT INTO bills (id, name, amount_cents, due_day, active) VALUES (?, ?, ?, ?, ?)")
    .run(bill.id, bill.name, bill.amountCents, bill.dueDay, bill.active ? 1 : 0);
}

export function deleteBill(id: string): number {
  const result = db().prepare("DELETE FROM bills WHERE id = ?").run(id);
  return Number(result.changes ?? 0);
}

export function listTransactions(): Transaction[] {
  const rows = db().prepare("SELECT * FROM transactions ORDER BY posted DESC, description").all() as TransactionRow[];
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    posted: row.posted,
    amountCents: row.amount_cents,
    description: row.description,
    pending: row.pending === 1,
    category: row.category,
  }));
}

export function insertTransaction(txn: Transaction): void {
  db()
    .prepare(
      `INSERT INTO transactions (id, account_id, posted, amount_cents, description, pending, category)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(txn.id, txn.accountId, txn.posted, txn.amountCents, txn.description, txn.pending ? 1 : 0, txn.category);
}

export function upsertSyncedTransaction(txn: Omit<Transaction, "category">): void {
  db()
    .prepare(
      `INSERT INTO transactions (id, account_id, posted, amount_cents, description, pending, category)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(id) DO UPDATE SET
         posted = excluded.posted,
         amount_cents = excluded.amount_cents,
         description = excluded.description,
         pending = excluded.pending`,
    )
    .run(txn.id, txn.accountId, txn.posted, txn.amountCents, txn.description, txn.pending ? 1 : 0);
}

export function setTransactionCategory(id: string, category: string | null): number {
  const result = db().prepare("UPDATE transactions SET category = ? WHERE id = ?").run(category, id);
  return Number(result.changes ?? 0);
}

export function getConnection(): { accessUrl: string; claimedAt: string; lastSyncAt: string | null; errors: string[] } | null {
  const row = db().prepare("SELECT access_url, claimed_at, last_sync_at, last_errors FROM connection WHERE id = 1").get() as
    | ConnectionRow
    | undefined;
  if (!row) return null;
  let errors: string[] = [];
  try {
    const parsed = JSON.parse(row.last_errors) as unknown;
    if (Array.isArray(parsed)) errors = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    errors = [];
  }
  return {
    accessUrl: row.access_url,
    claimedAt: row.claimed_at,
    lastSyncAt: row.last_sync_at,
    errors,
  };
}

export function saveConnection(accessUrl: string, claimedAt: string): void {
  db()
    .prepare(
      `INSERT INTO connection (id, access_url, claimed_at, last_sync_at, last_errors)
       VALUES (1, ?, ?, NULL, '[]')
       ON CONFLICT(id) DO UPDATE SET
         access_url = excluded.access_url,
         claimed_at = excluded.claimed_at,
         last_sync_at = NULL,
         last_errors = '[]'`,
    )
    .run(accessUrl, claimedAt);
}

export function markSynced(syncedAt: string, errors: string[]): void {
  db().prepare("UPDATE connection SET last_sync_at = ?, last_errors = ? WHERE id = 1").run(syncedAt, JSON.stringify(errors));
}

export function deleteConnection(): void {
  db().prepare("DELETE FROM connection WHERE id = 1").run();
}

export function wipeFinancialRows(): void {
  db().exec("DELETE FROM transactions; DELETE FROM bills; DELETE FROM accounts; DELETE FROM connection;");
}

export function readSettings(): Settings {
  const frequency = getMeta("payday_frequency", "biweekly");
  const paydayFrequency: PaydayFrequency =
    frequency === "weekly" || frequency === "monthly" || frequency === "biweekly" ? frequency : "biweekly";
  return {
    paydayFrequency,
    paydayAnchor: getMeta("payday_anchor"),
    bufferCents: Number(getMeta("buffer_cents", "0")) || 0,
  };
}

export function writeSettings(settings: Settings): void {
  setMeta("payday_frequency", settings.paydayFrequency);
  setMeta("payday_anchor", settings.paydayAnchor);
  setMeta("buffer_cents", String(settings.bufferCents));
}

export function seedDemo(today?: string): void {
  const demo = buildDemo(today);
  writeSettings(demo.settings);
  setMeta("demo", "1");
  for (const account of demo.accounts) insertAccount(account);
  for (const bill of demo.bills) insertBill(bill);
  for (const txn of demo.transactions) insertTransaction(txn);
}
