import { SpendableError } from "./errors";
import { decimalToCents } from "./money";
import { sanitizeBankMessage, sanitizeLabel } from "./sanitize";

export type RemoteTransaction = {
  id: string;
  posted: number;
  amountCents: number;
  description: string;
  pending: boolean;
};

export type RemoteAccount = {
  id: string;
  name: string;
  orgName: string;
  currency: string;
  balanceCents: number;
  availableCents: number | null;
  balanceDate: number;
  transactions: RemoteTransaction[];
};

type ErrorItem = { msg?: unknown };
type ConnectionItem = { conn_id?: unknown; name?: unknown; org_name?: unknown };
type TransactionItem = {
  id?: unknown;
  posted?: unknown;
  amount?: unknown;
  description?: unknown;
  pending?: unknown;
};
type AccountItem = {
  id?: unknown;
  name?: unknown;
  conn_id?: unknown;
  currency?: unknown;
  balance?: unknown;
  "available-balance"?: unknown;
  "balance-date"?: unknown;
  transactions?: unknown;
};

export function decodeSetupToken(token: string): string {
  const cleaned = token.trim().replace(/\s/g, "");
  if (!cleaned) throw new SpendableError("Paste a SimpleFIN setup token first.", "bad_token");
  const pad = cleaned.length % 4 === 0 ? "" : "=".repeat(4 - (cleaned.length % 4));
  const normalized = cleaned.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const decoded = Buffer.from(normalized, "base64").toString("utf8");
  if (!decoded.startsWith("https://")) {
    throw new SpendableError("That token did not decode to an https SimpleFIN claim URL.", "bad_token");
  }
  try {
    const url = new URL(decoded);
    if (url.protocol !== "https:") {
      throw new SpendableError("Setup tokens have to point at https.", "bad_token");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof SpendableError) throw error;
    throw new SpendableError("That token is not a SimpleFIN setup token.", "bad_token");
  }
}

export function parseAccessUrl(accessUrl: string): {
  origin: string;
  basePath: string;
  authorization: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(accessUrl.trim());
  } catch {
    throw new SpendableError("SimpleFIN did not return a usable access URL.", "bad_access_url");
  }
  if (parsed.protocol !== "https:") {
    throw new SpendableError("SimpleFIN access URLs have to be https.", "bad_access_url");
  }
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!username || !password) {
    throw new SpendableError("SimpleFIN returned an access URL without credentials.", "bad_access_url");
  }
  const authorization = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  return {
    origin: parsed.origin,
    basePath: parsed.pathname.replace(/\/$/, ""),
    authorization,
  };
}

export function accountsRequest(
  accessUrl: string,
  params: Record<string, string>,
): { url: string; authorization: string } {
  const parsed = parseAccessUrl(accessUrl);
  const url = new URL(`${parsed.basePath}/accounts`, parsed.origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return { url: url.toString(), authorization: parsed.authorization };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function mapAccountSet(body: unknown): { accounts: RemoteAccount[]; errors: string[] } {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.accounts)) {
    throw new SpendableError("SimpleFIN returned an unexpected accounts payload.", "bad_payload");
  }

  const errors: string[] = [];
  if (Array.isArray(record.errlist)) {
    for (const item of record.errlist as ErrorItem[]) {
      if (typeof item?.msg === "string" && item.msg.trim()) errors.push(sanitizeBankMessage(item.msg));
    }
  }
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === "string" && item.trim()) errors.push(sanitizeBankMessage(item));
    }
  }

  const orgs = new Map<string, string>();
  if (Array.isArray(record.connections)) {
    for (const item of record.connections as ConnectionItem[]) {
      if (typeof item?.conn_id !== "string") continue;
      const name =
        typeof item.org_name === "string"
          ? item.org_name
          : typeof item.name === "string"
            ? item.name
            : "Bank";
      orgs.set(item.conn_id, sanitizeLabel(name));
    }
  }

  const accounts: RemoteAccount[] = [];
  for (const item of record.accounts as AccountItem[]) {
    if (typeof item?.id !== "string" || typeof item.name !== "string" || typeof item.balance !== "string") {
      errors.push("An account came back without a name or balance, so it was skipped.");
      continue;
    }
    const connId = typeof item.conn_id === "string" ? item.conn_id : "account";
    const id = `${connId}:${item.id}`;
    let balanceCents: number;
    try {
      balanceCents = decimalToCents(item.balance);
    } catch {
      errors.push(`${sanitizeLabel(item.name)} came back with a balance that could not be read.`);
      continue;
    }
    let availableCents: number | null = null;
    if (typeof item["available-balance"] === "string") {
      try {
        availableCents = decimalToCents(item["available-balance"]);
      } catch {
        availableCents = null;
      }
    }
    const transactions: RemoteTransaction[] = [];
    if (Array.isArray(item.transactions)) {
      for (const txn of item.transactions as TransactionItem[]) {
        if (typeof txn?.id !== "string" || typeof txn.amount !== "string") continue;
        try {
          transactions.push({
            id: `${id}:${txn.id}`,
            posted: typeof txn.posted === "number" ? txn.posted : 0,
            amountCents: decimalToCents(txn.amount),
            description: sanitizeLabel(typeof txn.description === "string" ? txn.description : "Transaction", 180),
            pending: txn.pending === true,
          });
        } catch {
          continue;
        }
      }
    }
    accounts.push({
      id,
      name: sanitizeLabel(item.name),
      orgName: orgs.get(connId) ?? "Bank",
      currency: typeof item.currency === "string" ? sanitizeLabel(item.currency, 200) : "USD",
      balanceCents,
      availableCents,
      balanceDate: typeof item["balance-date"] === "number" ? item["balance-date"] : Math.floor(Date.now() / 1000),
      transactions,
    });
  }

  return { accounts, errors };
}

export async function claimAccessUrl(setupToken: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const claimUrl = decodeSetupToken(setupToken);
  let response: Response;
  try {
    response = await fetchImpl(claimUrl, {
      method: "POST",
      headers: { "Content-Length": "0" },
      redirect: "manual",
    });
  } catch {
    throw new SpendableError("Could not reach SimpleFIN to claim that token.", "claim_unreachable", 502);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new SpendableError(
      "SimpleFIN sent a redirect instead of an access URL. The token was not saved.",
      "claim_redirect",
      502,
    );
  }
  if (response.status === 403) {
    throw new SpendableError(
      "SimpleFIN refused that token. It may already be used. If you did not claim it, disable it and create a new one.",
      "claim_rejected",
      403,
    );
  }
  if (!response.ok) {
    throw new SpendableError(`SimpleFIN did not accept that token (${response.status}).`, "claim_failed", 502);
  }
  const accessUrl = (await response.text()).trim();
  if (accessUrl.startsWith("Forbidden")) {
    throw new SpendableError(
      "SimpleFIN refused that token. It may already be used. If you did not claim it, disable it and create a new one.",
      "claim_rejected",
      403,
    );
  }
  parseAccessUrl(accessUrl);
  return accessUrl;
}

export async function fetchAccountSet(
  accessUrl: string,
  startUnix: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accounts: RemoteAccount[]; errors: string[] }> {
  const request = accountsRequest(accessUrl, {
    "start-date": String(startUnix),
    pending: "1",
    version: "2",
  });
  let response: Response;
  try {
    response = await fetchImpl(request.url, {
      headers: { Authorization: request.authorization, Accept: "application/json" },
      redirect: "follow",
    });
  } catch {
    throw new SpendableError("Could not reach SimpleFIN to read accounts.", "sync_unreachable", 502);
  }
  if (response.status === 403) {
    throw new SpendableError(
      "The saved bank connection was refused. It may have been turned off. Connect again with a new token.",
      "bank_auth",
      403,
    );
  }
  if (!response.ok) {
    throw new SpendableError(`SimpleFIN accounts request failed (${response.status}).`, "sync_failed", 502);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new SpendableError("SimpleFIN returned a response that was not JSON.", "bad_payload", 502);
  }
  return mapAccountSet(body);
}
