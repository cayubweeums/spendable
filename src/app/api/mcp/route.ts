import { GET as getContract } from "../v1/route";
import { DELETE as deleteSession, POST as postSession } from "../v1/session/route";
import { POST as postUsers } from "../v1/users/route";
import { POST as postPassword } from "../v1/password/route";
import { GET as getSnapshot } from "../v1/snapshot/route";
import { GET as getReports } from "../v1/reports/route";
import { GET as getAccounts } from "../v1/accounts/route";
import { PATCH as patchAccount } from "../v1/accounts/[id]/route";
import { GET as getBills, POST as postBills } from "../v1/bills/route";
import { DELETE as deleteBill } from "../v1/bills/[id]/route";
import { GET as getProjections, POST as postProjections } from "../v1/projections/route";
import { DELETE as deleteProjection } from "../v1/projections/[id]/route";
import { GET as getTransactions, POST as postTransactions } from "../v1/transactions/route";
import { PATCH as patchTransaction } from "../v1/transactions/[id]/route";
import { GET as getFilters, PUT as putFilters } from "../v1/filters/route";
import { DELETE as deleteFilter } from "../v1/filters/[name]/route";
import { POST as postUndo } from "../v1/undo/route";
import { GET as getCategories, POST as postCategories } from "../v1/categories/route";
import { DELETE as deleteCategory, PATCH as patchCategory } from "../v1/categories/[name]/route";
import { GET as getPayees } from "../v1/payees/route";
import { PATCH as patchPayee } from "../v1/payees/[name]/route";
import { GET as getRules, PUT as putRules } from "../v1/rules/route";
import { DELETE as deleteRule } from "../v1/rules/[id]/route";
import { GET as getSettings, PATCH as patchSettings } from "../v1/settings/route";
import { DELETE as deleteConnection, GET as getConnection, PATCH as patchConnection, POST as postConnection } from "../v1/connection/route";
import { POST as postSync } from "../v1/sync/route";
import { POST as postSyncReset } from "../v1/sync/reset/route";
import { GET as getBackup, POST as postBackup } from "../v1/backup/route";
import { POST as postImport } from "../v1/import/route";
import { handleMcp, type McpOutcome } from "@/core/mcp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Handler = (request: Request, context: { params: Promise<{ id: string; name: string }> }) => Promise<Response> | Response;

export const mcpHandlers = {
  "GET /api/v1": getContract,
  "POST /api/v1/session": postSession,
  "POST /api/v1/users": postUsers,
  "POST /api/v1/password": postPassword,
  "DELETE /api/v1/session": deleteSession,
  "GET /api/v1/snapshot": getSnapshot,
  "GET /api/v1/reports": getReports,
  "GET /api/v1/accounts": getAccounts,
  "PATCH /api/v1/accounts/:id": patchAccount,
  "GET /api/v1/bills": getBills,
  "POST /api/v1/bills": postBills,
  "DELETE /api/v1/bills/:id": deleteBill,
  "GET /api/v1/projections": getProjections,
  "POST /api/v1/projections": postProjections,
  "DELETE /api/v1/projections/:id": deleteProjection,
  "GET /api/v1/transactions": getTransactions,
  "POST /api/v1/transactions": postTransactions,
  "PATCH /api/v1/transactions/:id": patchTransaction,
  "GET /api/v1/filters": getFilters,
  "PUT /api/v1/filters": putFilters,
  "DELETE /api/v1/filters/:name": deleteFilter,
  "POST /api/v1/undo": postUndo,
  "GET /api/v1/categories": getCategories,
  "POST /api/v1/categories": postCategories,
  "PATCH /api/v1/categories/:name": patchCategory,
  "DELETE /api/v1/categories/:name": deleteCategory,
  "GET /api/v1/payees": getPayees,
  "PATCH /api/v1/payees/:name": patchPayee,
  "GET /api/v1/rules": getRules,
  "PUT /api/v1/rules": putRules,
  "DELETE /api/v1/rules/:id": deleteRule,
  "GET /api/v1/settings": getSettings,
  "PATCH /api/v1/settings": patchSettings,
  "GET /api/v1/connection": getConnection,
  "POST /api/v1/connection": postConnection,
  "PATCH /api/v1/connection": patchConnection,
  "DELETE /api/v1/connection": deleteConnection,
  "POST /api/v1/sync": postSync,
  "POST /api/v1/sync/reset": postSyncReset,
  "GET /api/v1/backup": getBackup,
  "POST /api/v1/backup": postBackup,
  "POST /api/v1/import": postImport,
} as Record<string, Handler>;

export async function callAction(
  request: Request,
  route: { method: string; path: string },
  args: Record<string, unknown>,
): Promise<McpOutcome> {
  const handler = mcpHandlers[`${route.method} ${route.path}`];
  if (!handler) return { status: 404, text: "No such action." };
  const id = typeof args.id === "string" ? args.id : "";
  const name = typeof args.name === "string" ? args.name : "";
  let path = route.path;
  if (path.includes(":id")) path = path.replace(":id", encodeURIComponent(id));
  if (path.includes(":name")) path = path.replace(":name", encodeURIComponent(name));
  const url = new URL(path, "http://127.0.0.1");
  const query = args.query;
  if (query && typeof query === "object" && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
      else if (value != null) url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  let body: BodyInit | undefined;
  if (route.method !== "GET" && route.method !== "DELETE") {
    const payload = args.body;
    if (
      route.path === "/api/v1/backup" &&
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      typeof (payload as { data?: unknown }).data === "string"
    ) {
      body = Buffer.from((payload as { data: string }).data, "base64");
      headers.set("content-type", "application/zip");
    } else {
      body = JSON.stringify(payload ?? {});
      headers.set("content-type", "application/json");
    }
  }
  const response = await handler(new Request(url, { method: route.method, headers, body }), {
    params: Promise.resolve({ id, name }),
  });
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("zip")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, text: bytes.toString("base64") };
  }
  return { status: response.status, text: await response.text() };
}

export async function POST(request: Request) {
  let message: unknown;
  try {
    message = await request.json();
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error." } });
  }
  const result = await handleMcp(message, (route, args) => callAction(request, route, args));
  if (result == null) return new Response(null, { status: 202 });
  return Response.json(result);
}
