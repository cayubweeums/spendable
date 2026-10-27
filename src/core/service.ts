import { randomBytes, randomUUID } from "node:crypto";
import { inferKind, isAccountKind, kindFromRole, mergeBankAccount, roleForKind } from "./bank";
import { isISODate, localISODate, postedToISO, type PaydayFrequency } from "./dates";
import * as store from "./db";
import { SpendableError, scrubSecrets } from "./errors";
import { decimalToCents } from "./money";
import { hashPassword, passwordMatches } from "./password";
import { unzipDatabase, zipDatabase } from "./zip";
import { normalizeContains, type CategoryRule } from "./rules";
import { sanitizeLabel } from "./sanitize";
import { claimAccessUrl, fetchAccountSet } from "./simplefin";
import { computeSpendable } from "./spendable";
import { SYNC_HOUR_CHOICES, syncIsDue, type SyncSchedule } from "./sync-due";
import type { AccountKind, PayMode, Role, Settings, Snapshot } from "./types";

export const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
export { syncIsDue, type SyncSchedule };
export const SESSION_COOKIE = "spendable_session";
export const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60;

// shortcut: session cookie is not marked Secure, set Secure when the app is served over https
export const sessionCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SEC,
};

const ROLES: Role[] = ["spend", "reserve", "credit", "ignore"];
const PAY_MODES: PayMode[] = ["full", "minimum", "none"];
const FREQUENCIES: PaydayFrequency[] = ["weekly", "biweekly", "monthly"];

export function closeDb(): void {
  store.closeDb();
}

function assertPassword(password: string): void {
  if (password.length < 8 || password.length > 128) {
    throw new SpendableError("Use 8 to 128 characters.", "weak_password");
  }
}

function startSession(): string {
  return store.insertSession(randomBytes(32).toString("base64url"), Date.now() + SESSION_MAX_AGE_SEC * 1000);
}

export function passwordIsSet(): boolean {
  if (store.isSealed()) return true;
  return store.getMeta("password_hash") !== "";
}

export function establishPassword(password: string, confirm: string): string {
  assertPassword(password);
  if (password !== confirm) throw new SpendableError("Those passwords do not match.", "password_mismatch");
  if (store.isSealed()) throw new SpendableError("A password is already set.", "password_set");
  store.withTransaction(() => {
    if (store.getMeta("password_hash")) throw new SpendableError("A password is already set.", "password_set");
    store.setMeta("password_hash", hashPassword(password));
  });
  store.seal(password);
  return startSession();
}

// shortcut: wrong passwords are not rate limited, add a delay if this port is reachable beyond the host
export function signIn(password: string): string {
  if (store.isSealed()) {
    if (!store.isUnlocked()) store.unlock(password);
    else if (!passwordMatches(password, store.getMeta("password_hash"))) {
      throw new SpendableError("That password is wrong.", "bad_password", 401);
    }
    return startSession();
  }
  const stored = store.getMeta("password_hash");
  if (!stored) throw new SpendableError("Choose a password first.", "no_password");
  if (!passwordMatches(password, stored)) throw new SpendableError("That password is wrong.", "bad_password", 401);
  store.seal(password);
  return startSession();
}

export function sessionIsOpen(token: string | null | undefined, now = Date.now()): boolean {
  if (!token) return false;
  if (store.isSealed() && !store.isUnlocked()) return false;
  return store.sessionOpen(token, now);
}

export function closeSession(token: string | null | undefined): void {
  if (!store.isUnlocked()) {
    if (!store.isSealed() && token) store.deleteSession(token);
    return;
  }
  if (token) store.deleteSession(token);
  store.lock();
}

export function downloadBackup(): Buffer {
  return zipDatabase(store.readDatabaseFile());
}

export function restoreBackup(bytes: Buffer): void {
  store.replaceDatabase(unzipDatabase(bytes));
}

export function ready(): void {
  if (store.getMeta("initialized") === "1") return;
  store.withTransaction(() => {
    if (store.getMeta("initialized") === "1") return;
    store.seedDemo();
    store.setMeta("initialized", "1");
  });
}

export function getSnapshot(): Snapshot {
  ready();
  const connection = store.getConnection();
  const settings = store.readSettings();
  return computeSpendable({
    ...settings,
    today: localISODate(),
    demo: store.getMeta("demo") === "1",
    syncedAt: connection?.lastSyncAt ?? null,
    syncErrors: connection?.errors ?? [],
    accounts: store.listAccounts(),
    bills: store.listBills(),
    transactions: store.listTransactions(),
  });
}

export function listAccounts() {
  ready();
  return store.listAccounts();
}

export function listBills() {
  ready();
  return store.listBills();
}

export function listTransactions(since?: string) {
  ready();
  const rows = store.listTransactions();
  if (!since) return rows;
  if (!isISODate(since)) throw new SpendableError("since should be YYYY-MM-DD.", "bad_date");
  return rows.filter((txn) => {
    const iso = postedToISO(txn.posted);
    return iso != null && iso >= since;
  });
}

export function getSettings(): Settings {
  ready();
  return store.readSettings();
}

export function needsOnboarding(): boolean {
  ready();
  return store.getMeta("onboarded") !== "1";
}

export function completeOnboarding(): void {
  ready();
  if (!store.getConnection()) {
    throw new SpendableError("Connect SimpleFIN before leaving setup.", "not_connected");
  }
  if (store.listAccounts().length === 0) {
    throw new SpendableError(
      "SimpleFIN did not return an account. Add a bank there, then sync again.",
      "no_accounts",
    );
  }
  store.setMeta("onboarded", "1");
}

export function connectionStatus() {
  ready();
  const connection = store.getConnection();
  return {
    connected: connection != null,
    demo: store.getMeta("demo") === "1",
    claimedAt: connection?.claimedAt ?? null,
    syncedAt: connection?.lastSyncAt ?? null,
    errors: connection?.errors ?? [],
    sync: readSyncSchedule(),
  };
}

function readSyncSchedule(): SyncSchedule {
  const hours = Number(store.getMeta("sync_hours", "12"));
  const at = store.getMeta("sync_at", "");
  return {
    on: store.getMeta("sync_on", "1") !== "0",
    everyHours: (SYNC_HOUR_CHOICES as readonly number[]).includes(hours) ? hours : 12,
    at: /^([01]\d|2[0-3]):[0-5]\d$/.test(at) ? at : "",
  };
}

export function saveSyncSchedule(patch: { on?: boolean; everyHours?: number; at?: string }): SyncSchedule {
  ready();
  const current = readSyncSchedule();
  const everyHours = patch.everyHours ?? current.everyHours;
  if (!(SYNC_HOUR_CHOICES as readonly number[]).includes(everyHours)) {
    throw new SpendableError("Not a choice.", "bad_sync");
  }
  let at = patch.at ?? current.at;
  if (at !== "") {
    const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(at);
    if (!match) throw new SpendableError("Bad time.", "bad_sync");
    at = `${match[1]}:${match[2]}`;
  }
  store.setMeta("sync_on", (patch.on ?? current.on) ? "1" : "0");
  store.setMeta("sync_hours", String(everyHours));
  store.setMeta("sync_at", at);
  return readSyncSchedule();
}

export function syncIsStale(syncedAt: string | null, now = Date.now()): boolean {
  return syncIsDue(syncedAt, { on: true, everyHours: SYNC_INTERVAL_MS / 3_600_000, at: "" }, now);
}

export function listRules(): CategoryRule[] {
  ready();
  return store.listRules();
}

function assertRole(role: string): Role {
  if (!ROLES.includes(role as Role)) throw new SpendableError("Unknown account role.", "bad_role");
  return role as Role;
}

function assertKind(kind: string): AccountKind {
  if (!isAccountKind(kind)) throw new SpendableError("Unknown account type.", "bad_kind");
  return kind;
}

function assertPayMode(mode: string): PayMode {
  if (!PAY_MODES.includes(mode as PayMode)) throw new SpendableError("Unknown card payment rule.", "bad_pay_mode");
  return mode as PayMode;
}

function assertDueDay(value: number | null): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new SpendableError("Due day has to be a day of the month, from 1 to 31.", "bad_due_day");
  }
  return value;
}

function assertCents(value: number, label: string, allowZero = false): number {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 100_000_000_00) {
    throw new SpendableError(`${label} is not a usable amount.`, "bad_amount");
  }
  return value;
}

function accountLabel(label: string | undefined, current: { name: string; label?: string }): string {
  const next = label == null ? (current.label ?? "") : sanitizeLabel(label, 80);
  return next === current.name ? "" : next;
}

export function updateAccount(
  id: string,
  patch: {
    role?: string;
    kind?: string;
    tracked?: boolean;
    dueDay?: number | null;
    payMode?: string;
    minimumCents?: number;
    label?: string;
    note?: string;
  },
): void {
  ready();
  const current = store.getAccount(id);
  if (!current) throw new SpendableError("No account with that id.", "not_found", 404);
  let role = current.role;
  let kind = current.kind ?? kindFromRole(current.role);
  if (patch.kind != null) {
    kind = assertKind(patch.kind);
    role = roleForKind(kind);
  } else if (patch.role != null) {
    role = assertRole(patch.role);
    kind = kindFromRole(role);
  }
  const next = {
    role,
    kind,
    tracked: patch.tracked == null ? current.tracked !== false : patch.tracked,
    dueDay: patch.dueDay === undefined ? current.dueDay : assertDueDay(patch.dueDay),
    payMode: patch.payMode == null ? current.payMode : assertPayMode(patch.payMode),
    minimumCents:
      patch.minimumCents == null ? current.minimumCents : assertCents(patch.minimumCents, "Minimum payment", true),
    label: accountLabel(patch.label, current),
    note: patch.note == null ? (current.note ?? "") : sanitizeLabel(patch.note, 280),
  };
  store.updateAccountRules(id, next);
}

function dueDayFromPosted(posted: number): number {
  const iso = posted > 0 ? postedToISO(posted) : null;
  const day = Number((iso ?? localISODate()).slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
}

export function saveTransactionDetails(input: {
  id: string;
  category: string | null;
  contains: string;
  remember: boolean;
  billable: boolean;
  recurring: boolean;
}): void {
  ready();
  const txn = store.getTransaction(input.id);
  if (!txn) throw new SpendableError("No transaction with that id.", "not_found", 404);
  const category = input.category == null || input.category.trim() === "" ? null : sanitizeLabel(input.category, 40);
  const contains = normalizeContains(input.contains || txn.description);
  if (input.remember && !category) {
    throw new SpendableError("Add a category before saving that rule.", "bad_category");
  }
  if ((input.remember || input.recurring) && contains.length < 2) {
    throw new SpendableError("The match text needs at least two characters.", "bad_rule");
  }
  if (input.recurring && txn.amountCents >= 0) {
    throw new SpendableError("A bill is money leaving the account.", "bad_bill");
  }
  store.withTransaction(() => {
    if (store.setTransactionCategory(input.id, category) === 0) {
      throw new SpendableError("No transaction with that id.", "not_found", 404);
    }
    if (input.remember && category) {
      store.upsertRule(contains, category);
      store.applyCategoryRules();
    } else if (contains) {
      store.deleteRule(contains);
    }
    if (!input.billable || !contains) return;
    if (input.recurring) {
      store.upsertRecurringBill({
        matchText: contains,
        name: sanitizeLabel(txn.description, 80) || contains,
        amountCents: Math.abs(txn.amountCents),
        dueDay: dueDayFromPosted(txn.posted),
      });
      return;
    }
    store.deactivateRecurringBill(contains);
  });
}

export function createBill(input: { name: string; amountCents: number; dueDay: number }): { id: string } {
  ready();
  const name = sanitizeLabel(input.name, 80);
  if (!name) throw new SpendableError("A bill needs a name.", "bad_bill");
  const bill = {
    id: randomUUID(),
    name,
    amountCents: assertCents(input.amountCents, "Bill amount"),
    dueDay: assertDueDay(input.dueDay) ?? 1,
    active: true,
  };
  store.insertBill(bill);
  return { id: bill.id };
}

export function removeBill(id: string): void {
  ready();
  if (store.deleteBill(id) === 0) throw new SpendableError("No bill with that id.", "not_found", 404);
}

export function setCategory(id: string, category: string | null): void {
  ready();
  const cleaned = category == null || category.trim() === "" ? null : sanitizeLabel(category, 40);
  if (store.setTransactionCategory(id, cleaned) === 0) {
    throw new SpendableError("No transaction with that id.", "not_found", 404);
  }
}

export function updateSettings(patch: { paydayFrequency?: string; paydayAnchor?: string; bufferCents?: number }): Settings {
  ready();
  const current = store.readSettings();
  const paydayFrequency = patch.paydayFrequency == null ? current.paydayFrequency : patch.paydayFrequency;
  if (!FREQUENCIES.includes(paydayFrequency as PaydayFrequency)) {
    throw new SpendableError("Payday can be weekly, biweekly, or monthly.", "bad_payday");
  }
  const paydayAnchor = patch.paydayAnchor ?? current.paydayAnchor;
  if (!isISODate(paydayAnchor)) throw new SpendableError("Payday anchor should be YYYY-MM-DD.", "bad_date");
  const bufferCents = patch.bufferCents == null ? current.bufferCents : assertCents(patch.bufferCents, "Buffer", true);
  const settings: Settings = {
    paydayFrequency: paydayFrequency as PaydayFrequency,
    paydayAnchor,
    bufferCents,
  };
  store.writeSettings(settings);
  return settings;
}

export function dollarsToCents(input: string, label: string): number {
  try {
    return decimalToCents(input.trim());
  } catch {
    throw new SpendableError(`${label} should look like 42.50.`, "bad_amount");
  }
}

function syncStart(lastSyncAt: string | null): number {
  const now = Math.floor(Date.now() / 1000);
  // 89 days: a 90-day window makes the bridge return an error.
  const earliest = now - 89 * 86_400;
  if (!lastSyncAt) return earliest;
  const last = Math.floor(Date.parse(lastSyncAt) / 1000);
  if (!Number.isFinite(last)) return earliest;
  return Math.max(earliest, last - 5 * 86_400);
}

export async function sync(): Promise<{ syncedAt: string; accounts: number; errors: string[] }> {
  ready();
  const connection = store.getConnection();
  if (!connection) throw new SpendableError("Connect a bank before syncing.", "not_connected");
  let result: Awaited<ReturnType<typeof fetchAccountSet>>;
  try {
    result = await fetchAccountSet(connection.accessUrl, syncStart(connection.lastSyncAt));
  } catch (error) {
    console.error(scrubSecrets(error instanceof Error ? error.stack ?? error.message : String(error)));
    throw error;
  }
  const syncedAt = new Date().toISOString();
  store.withTransaction(() => {
    for (const remote of result.accounts) {
      const existing = store.getAccount(remote.id);
      const kept = mergeBankAccount(existing, remote.name);
      const kind = existing?.kind && isAccountKind(existing.kind) ? existing.kind : inferKind(remote.name);
      store.upsertSyncedAccount({
        id: remote.id,
        name: remote.name,
        orgName: remote.orgName,
        currency: remote.currency,
        balanceCents: remote.balanceCents,
        availableCents: remote.availableCents,
        balanceDate: remote.balanceDate,
        ...kept,
        role: existing ? kept.role : roleForKind(kind),
        kind,
        tracked: existing ? existing.tracked !== false : true,
      });
      for (const txn of remote.transactions) {
        store.upsertSyncedTransaction({
          id: txn.id,
          accountId: remote.id,
          posted: txn.posted,
          amountCents: txn.amountCents,
          description: txn.description,
          pending: txn.pending,
        });
      }
    }
    store.applyCategoryRules();
    store.markSynced(syncedAt, result.errors);
  });
  return { syncedAt, accounts: result.accounts.length, errors: result.errors };
}

export async function connect(setupToken: string): Promise<{ syncedAt: string; accounts: number; errors: string[] }> {
  ready();
  let accessUrl: string;
  try {
    accessUrl = await claimAccessUrl(setupToken);
  } catch (error) {
    console.error(scrubSecrets(error instanceof Error ? error.message : String(error)));
    throw error;
  }
  const wasDemo = store.getMeta("demo") === "1";
  store.withTransaction(() => {
    if (wasDemo) {
      store.wipeFinancialRows();
      store.setMeta("demo", "0");
    }
    store.saveConnection(accessUrl, new Date().toISOString());
  });
  return sync();
}

export function disconnect(): void {
  ready();
  store.deleteConnection();
}

export function restoreDemo(): void {
  ready();
  store.withTransaction(() => {
    store.wipeFinancialRows();
    store.seedDemo();
    store.setMeta("initialized", "1");
  });
}
