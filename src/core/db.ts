import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inferKind, isAccountKind, kindFromRole, roleForKind } from "./bank";
import { buildDemo } from "./demo";
import { SpendableError } from "./errors";
import { isISODate, isoToLocalNoonUnix, postedToISO, type PaydayFrequency } from "./dates";
import { decimalToCents } from "./money";
import { categoryFor, clearedFlag, fillRuleValue, matchingRule, ruleMatches, ruleSource, type CategoryRule, type MatchRule, type RuleStage } from "./rules";
import { sanitizeLabel } from "./sanitize";
import type { Account, AccountKind, Bill, PayMode, Role, Settings, Transaction } from "./types";
import { isSeal, openSeal, sealPlaintext, sealWithKey } from "./vault";

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
  kind?: string;
  tracked?: number;
  label?: string;
  note?: string;
};

type BillRow = {
  id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  active: number;
  match_text?: string | null;
};

type TransactionRow = {
  id: string;
  account_id: string;
  posted: number;
  amount_cents: number;
  description: string;
  pending: number;
  category: string | null;
  note?: string;
  cleared?: number;
};

type ConnectionRow = {
  access_url: string;
  claimed_at: string;
  last_sync_at: string | null;
  last_errors: string;
};

// shortcut: one key for this process, and sign-out drops it. Keep a key per session when a second user exists.
const globalForDb = globalThis as unknown as {
  spendableDb?: DatabaseSync;
  spendableKey?: Buffer;
  spendableSalt?: Buffer;
  txDepth?: number;
  dirty?: boolean;
};

function databasePath(): string {
  return process.env.SPENDABLE_DB_PATH ?? path.join(process.cwd(), "data", "spendable.db");
}

function fileIsSealed(file: string): boolean {
  if (!fs.existsSync(file)) return false;
  const fd = fs.openSync(file, "r");
  try {
    const buf = Buffer.alloc(5);
    return fs.readSync(fd, buf, 0, 5, 0) === 5 && isSeal(buf);
  } finally {
    fs.closeSync(fd);
  }
}

export function isSealed(): boolean {
  return globalForDb.spendableKey != null || fileIsSealed(databasePath());
}

export function isUnlocked(): boolean {
  return globalForDb.spendableKey != null;
}

function atomicWrite(file: string, body: Buffer): void {
  const tmp = `${file}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, body);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function persistUnlocked(): void {
  const key = globalForDb.spendableKey;
  const salt = globalForDb.spendableSalt;
  const database = globalForDb.spendableDb;
  if (!key || !salt || !database) {
    globalForDb.dirty = false;
    return;
  }
  atomicWrite(databasePath(), sealWithKey(database.serialize(), key, salt));
  globalForDb.dirty = false;
}

function noteWrite(): void {
  if ((globalForDb.txDepth ?? 0) > 0) {
    globalForDb.dirty = true;
    return;
  }
  persistUnlocked();
}

function remember(database: DatabaseSync): DatabaseSync {
  const prepare = database.prepare.bind(database);
  const exec = database.exec.bind(database);
  const writes = /^\s*(insert|update|delete|replace|alter)\b/i;
  database.prepare = (sql: string) => {
    const stmt = prepare(sql);
    if (!writes.test(sql)) return stmt;
    const run = stmt.run.bind(stmt);
    stmt.run = ((...args: Parameters<typeof run>) => {
      const result = run(...args);
      noteWrite();
      return result;
    }) as typeof stmt.run;
    return stmt;
  };
  database.exec = (sql: string) => {
    exec(sql);
    if (writes.test(sql)) noteWrite();
  };
  return database;
}

function openMemory(plain: Uint8Array, key: Buffer, salt: Buffer): void {
  const memory = new DatabaseSync(":memory:");
  memory.deserialize(plain);
  memory.exec("PRAGMA foreign_keys = ON;");
  remember(memory);
  globalForDb.spendableDb = memory;
  globalForDb.spendableKey = key;
  globalForDb.spendableSalt = salt;
  ensureColumns(memory);
}

export function seal(password: string): void {
  if (globalForDb.spendableKey) return;
  const database = db();
  // A WAL snapshot cannot be loaded into a memory database.
  database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  database.exec("PRAGMA journal_mode = DELETE");
  const plain = Buffer.from(database.serialize());
  const sealed = sealPlaintext(plain, password);
  database.close();
  globalForDb.spendableDb = undefined;
  const file = databasePath();
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
  atomicWrite(file, sealed.packed);
  openMemory(plain, sealed.key, sealed.salt);
}

// shortcut: a damaged seal reports the same error as a wrong password. Split them when a backup can be offered.
export function unlock(password: string): void {
  let opened: ReturnType<typeof openSeal>;
  try {
    opened = openSeal(fs.readFileSync(/*turbopackIgnore: true*/ databasePath()), password);
  } catch {
    throw new SpendableError("That password is wrong.", "bad_password", 401);
  }
  if (!opened.plain.subarray(0, 15).equals(Buffer.from("SQLite format 3"))) {
    opened.key.fill(0);
    throw new SpendableError("That password is wrong.", "bad_password", 401);
  }
  openMemory(opened.plain, opened.key, opened.salt);
}

export function lock(): void {
  if (globalForDb.spendableKey) persistUnlocked();
  globalForDb.spendableDb?.close();
  globalForDb.spendableDb = undefined;
  globalForDb.spendableKey?.fill(0);
  globalForDb.spendableKey = undefined;
  globalForDb.spendableSalt = undefined;
  globalForDb.dirty = false;
  globalForDb.txDepth = 0;
}

export function readDatabaseFile(): Buffer {
  if (globalForDb.spendableKey) persistUnlocked();
  const file = databasePath();
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) throw new SpendableError("There is no data to download.", "no_data");
  return fs.readFileSync(/*turbopackIgnore: true*/ file);
}

export function replaceDatabase(bytes: Buffer): void {
  const header = bytes.subarray(0, 15).toString("utf8");
  if (!isSeal(bytes) && header !== "SQLite format 3") {
    throw new SpendableError("That zip does not contain a spendable database.", "bad_backup");
  }
  lock();
  const file = databasePath();
  atomicWrite(file, bytes);
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
}

export function db(): DatabaseSync {
  if (!globalForDb.spendableDb) {
    const file = databasePath();
    if (fileIsSealed(file)) throw new SpendableError("Sign in first.", "locked", 401);
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
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL
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
  ensureColumns(globalForDb.spendableDb);
  return globalForDb.spendableDb;
}

function tableColumns(database: DatabaseSync, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function ensureColumns(database: DatabaseSync): void {
  const accounts = tableColumns(database, "accounts");
  if (!accounts.has("kind")) {
    database.exec("ALTER TABLE accounts ADD COLUMN kind TEXT NOT NULL DEFAULT 'checking'");
    database.exec(`UPDATE accounts SET kind = CASE role
      WHEN 'reserve' THEN 'savings'
      WHEN 'credit' THEN 'credit'
      WHEN 'ignore' THEN 'other'
      ELSE 'checking' END`);
  }
  if (!accounts.has("tracked")) {
    database.exec("ALTER TABLE accounts ADD COLUMN tracked INTEGER NOT NULL DEFAULT 1");
  }
  if (!accounts.has("label")) {
    database.exec("ALTER TABLE accounts ADD COLUMN label TEXT NOT NULL DEFAULT ''");
  }
  if (!accounts.has("note")) {
    database.exec("ALTER TABLE accounts ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (!tableColumns(database, "transactions").has("note")) {
    database.exec("ALTER TABLE transactions ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (!tableColumns(database, "transactions").has("cleared")) {
    database.exec("ALTER TABLE transactions ADD COLUMN cleared INTEGER NOT NULL DEFAULT 0");
  }
  if (!tableColumns(database, "bills").has("match_text")) {
    database.exec("ALTER TABLE bills ADD COLUMN match_text TEXT");
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      contains_text TEXT PRIMARY KEY,
      category TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transaction_tags (
      transaction_id TEXT NOT NULL,
      name TEXT NOT NULL,
      PRIMARY KEY (transaction_id, name)
    );
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      group_name TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS payees (
      name TEXT PRIMARY KEY,
      favorite INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT ''
    );
    -- shortcut: the bank text is the key. Two wordings of one shop stay two payees until they are merged.
    CREATE TABLE IF NOT EXISTS payee_keys (
      description TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_rules (
      id TEXT PRIMARY KEY,
      ord INTEGER NOT NULL,
      stage TEXT NOT NULL,
      field TEXT NOT NULL,
      op TEXT NOT NULL,
      value TEXT NOT NULL,
      action TEXT NOT NULL,
      action_value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bills_match_text ON bills(match_text) WHERE match_text IS NOT NULL;
  `);
  if (!tableColumns(database, "rules").has("tag")) {
    database.exec("ALTER TABLE rules ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
  }
  const named = database.prepare("SELECT value FROM meta WHERE key = ?").get("kinds_named") as { value: string } | undefined;
  if (!named) {
    const rows = database.prepare("SELECT id, name, kind FROM accounts").all() as { id: string; name: string; kind: string }[];
    const update = database.prepare("UPDATE accounts SET kind = ?, role = ? WHERE id = ? AND kind = 'other'");
    for (const row of rows) {
      if (row.kind !== "other") continue;
      const kind = inferKind(row.name);
      if (kind === "other" || kind === "checking") continue;
      update.run(kind, roleForKind(kind), row.id);
    }
    database
      .prepare("INSERT INTO meta (key, value) VALUES ('kinds_named', '1') ON CONFLICT(key) DO UPDATE SET value = '1'")
      .run();
  }
}

function storedKind(account: Account): AccountKind {
  return account.kind && isAccountKind(account.kind) ? account.kind : kindFromRole(account.role);
}

export function closeDb(): void {
  lock();
}

export function withTransaction<T>(fn: () => T): T {
  const database = db();
  globalForDb.txDepth = (globalForDb.txDepth ?? 0) + 1;
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    globalForDb.txDepth = (globalForDb.txDepth ?? 1) - 1;
    if (globalForDb.dirty) persistUnlocked();
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    globalForDb.txDepth = (globalForDb.txDepth ?? 1) - 1;
    globalForDb.dirty = false;
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

export function insertSession(token: string, expiresAt: number): string {
  const database = db();
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  database.prepare("INSERT INTO sessions (token, expires_at) VALUES (?, ?)").run(token, expiresAt);
  return token;
}

export function sessionOpen(token: string, now = Date.now()): boolean {
  const row = db().prepare("SELECT token FROM sessions WHERE token = ? AND expires_at > ?").get(token, now);
  return row != null;
}

export function deleteSession(token: string): void {
  db().prepare("DELETE FROM sessions WHERE token = ?").run(token);
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
    kind: isAccountKind(row.kind) ? row.kind : kindFromRole(row.role),
    tracked: row.tracked == null ? true : row.tracked === 1,
    label: row.label ?? "",
    note: row.note ?? "",
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
        role, due_day, pay_mode, minimum_cents, kind, tracked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      storedKind(account),
      account.tracked === false ? 0 : 1,
    );
}

// Sync writes balances only. Role, type, and card rules stay.
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
        role, due_day, pay_mode, minimum_cents, kind, tracked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      storedKind(account),
      account.tracked === false ? 0 : 1,
    );
}

export function updateAccountRules(
  id: string,
  rules: {
    role: Role;
    kind: AccountKind;
    tracked: boolean;
    dueDay: number | null;
    payMode: PayMode;
    minimumCents: number;
    label: string;
    note: string;
  },
): number {
  const result = db()
    .prepare(
      "UPDATE accounts SET role = ?, kind = ?, tracked = ?, due_day = ?, pay_mode = ?, minimum_cents = ?, label = ?, note = ? WHERE id = ?",
    )
    .run(
      rules.role,
      rules.kind,
      rules.tracked ? 1 : 0,
      rules.dueDay,
      rules.payMode,
      rules.minimumCents,
      rules.label,
      rules.note,
      id,
    );
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
    matchText: row.match_text ?? null,
  }));
}

export function insertBill(bill: Bill): void {
  db()
    .prepare("INSERT INTO bills (id, name, amount_cents, due_day, active, match_text) VALUES (?, ?, ?, ?, ?, ?)")
    .run(bill.id, bill.name, bill.amountCents, bill.dueDay, bill.active ? 1 : 0, bill.matchText ?? null);
}

export function deleteBill(id: string): number {
  const result = db().prepare("DELETE FROM bills WHERE id = ?").run(id);
  return Number(result.changes ?? 0);
}

export function listTransactions(): Transaction[] {
  const tags = tagMap();
  const rows = db().prepare("SELECT * FROM transactions ORDER BY posted DESC, description").all() as TransactionRow[];
  return rows.map((row) => ({
    id: row.id,
    accountId: row.account_id,
    posted: row.posted,
    amountCents: row.amount_cents,
    description: row.description,
    pending: row.pending === 1,
    category: row.category,
    note: row.note ?? "",
    tags: tags.get(row.id) ?? [],
    cleared: row.cleared === 1,
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

export function upsertSyncedTransaction(txn: Omit<Transaction, "category" | "note">): void {
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
  applyMatchRules("before", txn.id);
  applyPayeeCategory(txn.id);
  applyMatchRules("after", txn.id);
}

function applyPayeeCategory(id: string): void {
  db()
    .prepare(
      `UPDATE transactions
       SET category = (
         SELECT p.category FROM payee_keys k
         JOIN payees p ON p.name = k.name
         WHERE k.description = transactions.description AND p.category != ''
       )
       WHERE id = ? AND category IS NULL
         AND EXISTS (
           SELECT 1 FROM payee_keys k
           JOIN payees p ON p.name = k.name
           WHERE k.description = transactions.description AND p.category != ''
         )`,
    )
    .run(id);
}

function tagMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const rows = db().prepare("SELECT transaction_id, name FROM transaction_tags ORDER BY name COLLATE NOCASE").all() as {
    transaction_id: string;
    name: string;
  }[];
  for (const row of rows) {
    const names = map.get(row.transaction_id) ?? [];
    names.push(row.name);
    map.set(row.transaction_id, names);
  }
  return map;
}

export function setTransactionTags(id: string, names: string[]): void {
  const database = db();
  database.prepare("DELETE FROM transaction_tags WHERE transaction_id = ?").run(id);
  const insert = database.prepare("INSERT INTO transaction_tags (transaction_id, name) VALUES (?, ?)");
  for (const name of names) insert.run(id, name);
}

export function getTransaction(id: string): Transaction | null {
  const row = db().prepare("SELECT * FROM transactions WHERE id = ?").get(id) as TransactionRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    accountId: row.account_id,
    posted: row.posted,
    amountCents: row.amount_cents,
    description: row.description,
    pending: row.pending === 1,
    category: row.category,
    note: row.note ?? "",
    tags: tagMap().get(row.id) ?? [],
    cleared: row.cleared === 1,
  };
}

export function listRules(): CategoryRule[] {
  const rows = db().prepare("SELECT contains_text, category, tag FROM rules").all() as {
    contains_text: string;
    category: string;
    tag: string | null;
  }[];
  return rows.map((row) => ({ contains: row.contains_text, category: row.category, tag: row.tag ?? "" }));
}

export function upsertRule(contains: string, category: string, tag?: string): void {
  if (tag == null) {
    db()
      .prepare(
        `INSERT INTO rules (contains_text, category) VALUES (?, ?)
         ON CONFLICT(contains_text) DO UPDATE SET category = excluded.category`,
      )
      .run(contains, category);
    return;
  }
  db()
    .prepare(
      `INSERT INTO rules (contains_text, category, tag) VALUES (?, ?, ?)
       ON CONFLICT(contains_text) DO UPDATE SET category = excluded.category, tag = excluded.tag`,
    )
    .run(contains, category, tag);
}

export function deleteRule(contains: string): void {
  db().prepare("DELETE FROM rules WHERE contains_text = ?").run(contains);
}

export type StoredCategory = {
  name: string;
  group: string;
  note: string;
  hidden: boolean;
};

export function listCategories(): StoredCategory[] {
  const database = db();
  database.exec(`
    INSERT INTO categories (name)
    SELECT DISTINCT category FROM transactions
    WHERE category IS NOT NULL AND category != ''
    ON CONFLICT(name) DO NOTHING;
    INSERT INTO categories (name)
    SELECT DISTINCT category FROM rules
    WHERE category != ''
    ON CONFLICT(name) DO NOTHING;
  `);
  const rows = database
    .prepare("SELECT name, group_name, note, hidden FROM categories ORDER BY group_name COLLATE NOCASE, name COLLATE NOCASE")
    .all() as { name: string; group_name: string; note: string; hidden: number }[];
  return rows.map((row) => ({
    name: row.name,
    group: row.group_name,
    note: row.note,
    hidden: row.hidden === 1,
  }));
}

export function getCategory(name: string): StoredCategory | null {
  return listCategories().find((category) => category.name === name) ?? null;
}

export function insertCategory(name: string): void {
  db().prepare("INSERT INTO categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(name);
}

export function writeCategory(name: string, fields: { group: string; note: string; hidden: boolean }): number {
  const result = db()
    .prepare("UPDATE categories SET group_name = ?, note = ?, hidden = ? WHERE name = ?")
    .run(fields.group, fields.note, fields.hidden ? 1 : 0, name);
  return Number(result.changes ?? 0);
}

export function renameCategory(from: string, to: string): void {
  if (from === to) return;
  if (db().prepare("SELECT 1 AS ok FROM categories WHERE name = ?").get(to)) {
    throw new SpendableError("That name is taken.", "bad_category");
  }
  const result = db().prepare("UPDATE categories SET name = ? WHERE name = ?").run(to, from);
  if (!Number(result.changes ?? 0)) throw new SpendableError("No category with that name.", "not_found", 404);
  db().prepare("UPDATE transactions SET category = ? WHERE category = ?").run(to, from);
  db().prepare("UPDATE rules SET category = ? WHERE category = ?").run(to, from);
}

export function retargetCategory(from: string, into: string): void {
  db().prepare("UPDATE transactions SET category = ? WHERE category = ?").run(into, from);
  db().prepare("UPDATE rules SET category = ? WHERE category = ?").run(into, from);
  db().prepare("DELETE FROM categories WHERE name = ?").run(from);
}

export function forgetCategory(name: string): number {
  db().prepare("UPDATE transactions SET category = NULL WHERE category = ?").run(name);
  db().prepare("DELETE FROM rules WHERE category = ?").run(name);
  const result = db().prepare("DELETE FROM categories WHERE name = ?").run(name);
  return Number(result.changes ?? 0);
}

export type StoredPayee = {
  name: string;
  favorite: boolean;
  category: string;
  descriptions: string[];
};

export function listPayees(): StoredPayee[] {
  const database = db();
  database.exec(`
    INSERT INTO payees (name)
    SELECT DISTINCT description FROM transactions
    WHERE description != '' AND description NOT IN (SELECT description FROM payee_keys)
    ON CONFLICT(name) DO NOTHING;
    INSERT INTO payee_keys (description, name)
    SELECT DISTINCT description, description FROM transactions
    WHERE description != '' AND description NOT IN (SELECT description FROM payee_keys)
    ON CONFLICT(description) DO NOTHING;
  `);
  const rows = database
    .prepare(
      `SELECT p.name, p.favorite, p.category, k.description
       FROM payees p
       LEFT JOIN payee_keys k ON k.name = p.name
       ORDER BY p.favorite DESC, p.name COLLATE NOCASE, k.description COLLATE NOCASE`,
    )
    .all() as { name: string; favorite: number; category: string; description: string | null }[];
  const payees: StoredPayee[] = [];
  for (const row of rows) {
    const last = payees.at(-1);
    const descriptions = row.description ? [row.description] : [];
    if (!last || last.name !== row.name) {
      payees.push({ name: row.name, favorite: row.favorite === 1, category: row.category, descriptions });
    } else if (row.description) last.descriptions.push(row.description);
  }
  return payees;
}

export function getPayee(name: string): StoredPayee | null {
  return listPayees().find((payee) => payee.name === name) ?? null;
}

export function renamePayee(from: string, to: string): void {
  if (from === to) return;
  if (db().prepare("SELECT 1 AS ok FROM payees WHERE name = ?").get(to)) {
    throw new SpendableError("That name is taken.", "bad_payee");
  }
  const result = db().prepare("UPDATE payees SET name = ? WHERE name = ?").run(to, from);
  if (!Number(result.changes ?? 0)) throw new SpendableError("No payee with that name.", "not_found", 404);
  db().prepare("UPDATE payee_keys SET name = ? WHERE name = ?").run(to, from);
}

export function writePayee(name: string, fields: { favorite: boolean; category: string }): number {
  const result = db().prepare("UPDATE payees SET favorite = ?, category = ? WHERE name = ?").run(fields.favorite ? 1 : 0, fields.category, name);
  return Number(result.changes ?? 0);
}

export function fillPayeeCategory(name: string): void {
  db()
    .prepare(
      `UPDATE transactions SET category = (SELECT category FROM payees WHERE name = ? AND category != '')
       WHERE category IS NULL AND description IN (SELECT description FROM payee_keys WHERE name = ?)`,
    )
    .run(name, name);
}

export function retargetPayee(from: string, into: string): void {
  db().prepare("UPDATE payee_keys SET name = ? WHERE name = ?").run(into, from);
  db().prepare("DELETE FROM payees WHERE name = ?").run(from);
}

export function applyCategoryRules(): number {
  const rules = listRules();
  if (rules.length === 0) return 0;
  const rows = db().prepare("SELECT id, description FROM transactions WHERE category IS NULL").all() as {
    id: string;
    description: string;
  }[];
  const update = db().prepare("UPDATE transactions SET category = ? WHERE id = ? AND category IS NULL");
  let changed = 0;
  for (const row of rows) {
    const category = categoryFor(row.description, rules);
    if (!category) continue;
    changed += Number(update.run(category, row.id).changes ?? 0);
  }
  const untagged = db()
    .prepare("SELECT id, description FROM transactions WHERE id NOT IN (SELECT transaction_id FROM transaction_tags)")
    .all() as { id: string; description: string }[];
  const insert = db().prepare("INSERT INTO transaction_tags (transaction_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING");
  for (const row of untagged) {
    const tag = matchingRule(row.description, rules)?.tag ?? "";
    if (!tag) continue;
    changed += Number(insert.run(row.id, tag).changes ?? 0);
  }
  return changed;
}

export function upsertRecurringBill(bill: {
  matchText: string;
  name: string;
  amountCents: number;
  dueDay: number;
}): void {
  const existing = db().prepare("SELECT id FROM bills WHERE match_text = ?").get(bill.matchText) as { id: string } | undefined;
  if (existing) {
    db()
      .prepare("UPDATE bills SET name = ?, amount_cents = ?, due_day = ?, active = 1 WHERE id = ?")
      .run(bill.name, bill.amountCents, bill.dueDay, existing.id);
    return;
  }
  db()
    .prepare("INSERT INTO bills (id, name, amount_cents, due_day, active, match_text) VALUES (?, ?, ?, ?, 1, ?)")
    .run(randomUUID(), bill.name, bill.amountCents, bill.dueDay, bill.matchText);
}

export function deactivateRecurringBill(matchText: string): void {
  db().prepare("UPDATE bills SET active = 0 WHERE match_text = ?").run(matchText);
}

export function setTransactionCategory(id: string, category: string | null): number {
  const result = db().prepare("UPDATE transactions SET category = ? WHERE id = ?").run(category, id);
  if (category) db().prepare("INSERT INTO categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(category);
  return Number(result.changes ?? 0);
}

export function setTransactionNote(id: string, note: string): number {
  const result = db().prepare("UPDATE transactions SET note = ? WHERE id = ?").run(note, id);
  return Number(result.changes ?? 0);
}

export function listMatchRules(): MatchRule[] {
  const rows = db()
    .prepare("SELECT id, ord, stage, field, op, value, action, action_value FROM match_rules ORDER BY ord, id")
    .all() as {
    id: string;
    ord: number;
    stage: RuleStage;
    field: MatchRule["field"];
    op: MatchRule["op"];
    value: string;
    action: MatchRule["action"];
    action_value: string;
  }[];
  return rows.map((row) => ({
    id: row.id,
    ord: row.ord,
    stage: row.stage,
    field: row.field,
    op: row.op,
    value: row.value,
    action: row.action,
    actionValue: row.action_value,
  }));
}

export function replaceMatchRules(rules: MatchRule[]): void {
  const database = db();
  database.exec("DELETE FROM match_rules");
  const insert = database.prepare(
    "INSERT INTO match_rules (id, ord, stage, field, op, value, action, action_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const rule of rules) {
    insert.run(rule.id, rule.ord, rule.stage, rule.field, rule.op, rule.value, rule.action, rule.actionValue);
  }
}

export function deleteMatchRule(id: string): number {
  const result = db().prepare("DELETE FROM match_rules WHERE id = ?").run(id);
  return Number(result.changes ?? 0);
}

type RuleFactRow = {
  id: string;
  description: string;
  category: string | null;
  note: string | null;
  posted: number;
  amount_cents: number;
  cleared: number;
  account_label: string | null;
  account_name: string | null;
  payee: string | null;
};

function loadRuleFacts(onlyId?: string): RuleFactRow[] {
  return db()
    .prepare(
      `SELECT t.id, t.description, t.category, t.note, t.posted, t.amount_cents, t.cleared,
              a.label AS account_label, a.name AS account_name, k.name AS payee
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN payee_keys k ON k.description = t.description
       ${onlyId ? "WHERE t.id = ?" : ""}`,
    )
    .all(...(onlyId ? [onlyId] : [])) as RuleFactRow[];
}

// shortcut: a rule fills an empty category, note, or tag. Date, amount, and cleared replace the charge. A payee changes only while its name is still the bank text. Amount does not change the account balance.
function setRulePayee(description: string, next: string): number {
  if (!description || description === next) return 0;
  const key = db().prepare("SELECT name FROM payee_keys WHERE description = ?").get(description) as { name: string } | undefined;
  const current = key?.name ?? description;
  if (current !== description) return 0;
  const others = db()
    .prepare("SELECT COUNT(*) AS n FROM payee_keys WHERE name = ? AND description != ?")
    .get(current, description) as { n: number };
  const target = db().prepare("SELECT 1 AS ok FROM payees WHERE name = ?").get(next);
  if (!target && others.n === 0 && db().prepare("SELECT 1 AS ok FROM payees WHERE name = ?").get(current)) {
    db().prepare("UPDATE payees SET name = ? WHERE name = ?").run(next, current);
    if (key) db().prepare("UPDATE payee_keys SET name = ? WHERE description = ?").run(next, description);
    else db().prepare("INSERT INTO payee_keys (description, name) VALUES (?, ?)").run(description, next);
    return 1;
  }
  db().prepare("INSERT INTO payees (name) VALUES (?) ON CONFLICT(name) DO NOTHING").run(next);
  if (key) db().prepare("UPDATE payee_keys SET name = ? WHERE description = ? AND name = ?").run(next, description, current);
  else db().prepare("INSERT INTO payee_keys (description, name) VALUES (?, ?)").run(description, next);
  db().prepare("DELETE FROM payees WHERE name = ? AND NOT EXISTS (SELECT 1 FROM payee_keys WHERE name = ?)").run(current, current);
  return 1;
}

export function applyMatchRules(stage: RuleStage, onlyId?: string): number {
  const rules = listMatchRules().filter((rule) => rule.stage === stage);
  if (rules.length === 0) return 0;
  const tags = tagMap();
  const facts = loadRuleFacts(onlyId).map((row) => ({
    id: row.id,
    description: row.description,
    importedPayee: row.description,
    payee: row.payee ?? row.description,
    account: row.account_label?.trim() || row.account_name || "",
    category: row.category ?? "",
    notes: row.note ?? "",
    date: postedToISO(row.posted) ?? "",
    amountCents: row.amount_cents,
    tags: tags.get(row.id) ?? [],
    cleared: row.cleared === 1,
  }));
  let changed = 0;
  for (const rule of rules) {
    for (const fact of facts) {
      if (!ruleMatches(rule, fact)) continue;
      if (rule.action === "category") {
        if (fact.category) continue;
        changed += setTransactionCategory(fact.id, rule.actionValue);
        fact.category = rule.actionValue;
        continue;
      }
      if (rule.action === "notes") {
        if (fact.notes) continue;
        const note = sanitizeLabel(fillRuleValue(rule.actionValue, fact), 280);
        if (!note) continue;
        changed += setTransactionNote(fact.id, note);
        fact.notes = note;
        continue;
      }
      if (rule.action === "tag") {
        if (fact.tags.some((tag) => tag.toLowerCase() === rule.actionValue.toLowerCase())) continue;
        const result = db()
          .prepare("INSERT INTO transaction_tags (transaction_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING")
          .run(fact.id, rule.actionValue);
        const count = Number(result.changes ?? 0);
        if (count) fact.tags.push(rule.actionValue);
        changed += count;
        continue;
      }
      if (rule.action === "date") {
        const next = fillRuleValue(rule.actionValue, fact).trim();
        if (!isISODate(next) || next === fact.date) continue;
        db().prepare("UPDATE transactions SET posted = ? WHERE id = ?").run(isoToLocalNoonUnix(next), fact.id);
        fact.date = next;
        changed += 1;
        continue;
      }
      if (rule.action === "amount") {
        let cents = fact.amountCents;
        if (ruleSource(rule.actionValue) !== "amount") {
          try {
            cents = decimalToCents(fillRuleValue(rule.actionValue, fact));
          } catch {
            continue;
          }
        }
        if (cents === fact.amountCents) continue;
        db().prepare("UPDATE transactions SET amount_cents = ? WHERE id = ?").run(cents, fact.id);
        fact.amountCents = cents;
        changed += 1;
        continue;
      }
      if (rule.action === "cleared") {
        const flag = clearedFlag(fillRuleValue(rule.actionValue, fact));
        if (flag === null || flag === fact.cleared) continue;
        db().prepare("UPDATE transactions SET cleared = ? WHERE id = ?").run(flag ? 1 : 0, fact.id);
        fact.cleared = flag;
        changed += 1;
        continue;
      }
      const payee = sanitizeLabel(fillRuleValue(rule.actionValue, fact), 180);
      if (payee && setRulePayee(fact.description, payee)) {
        fact.payee = payee;
        changed += 1;
      }
    }
  }
  return changed;
}

export function fillEmptyPayeeCategories(): void {
  db()
    .prepare(
      `UPDATE transactions
       SET category = (
         SELECT p.category FROM payee_keys k
         JOIN payees p ON p.name = k.name
         WHERE k.description = transactions.description AND p.category != ''
       )
       WHERE category IS NULL
         AND EXISTS (
           SELECT 1 FROM payee_keys k
           JOIN payees p ON p.name = k.name
           WHERE k.description = transactions.description AND p.category != ''
         )`,
    )
    .run();
}

export function applyImportedRules(): void {
  applyMatchRules("before");
  fillEmptyPayeeCategories();
  applyMatchRules("after");
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
  db().exec(
    "DELETE FROM match_rules; DELETE FROM transaction_tags; DELETE FROM transactions; DELETE FROM bills; DELETE FROM rules; DELETE FROM accounts; DELETE FROM connection;",
  );
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
