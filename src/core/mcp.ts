import { apiContract } from "./contract";

// shortcut: one tool per API route, answered as JSON. An event stream waits. Hide, sample, and onboarding stay on the page.
const protocolVersions = ["2024-11-05", "2025-03-26", "2025-06-18"];

export type McpOutcome = { status: number; text: string };

export function toolName(method: string, path: string): string {
  const tail = path.replace(/^\/api\/v1\/?/, "") || "contract";
  return `${method.toLowerCase()}_${tail.replaceAll("/", "_").replaceAll(":", "")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function tools() {
  return apiContract.routes
    .filter((route) => route.path.startsWith("/api/v1"))
    .map((route) => ({
      name: toolName(route.method, route.path),
      description: route.purpose,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          query: { type: "object" },
          body: { type: "object" },
        },
      },
    }));
}

export async function handleMcp(
  message: unknown,
  invoke: (route: { method: string; path: string }, args: Record<string, unknown>) => Promise<McpOutcome> | McpOutcome,
): Promise<Record<string, unknown> | null> {
  const msg = asRecord(message);
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return rpcError(msg?.id ?? null, -32600, "Invalid request.");
  if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") return null;
  const id = "id" in msg ? msg.id : undefined;
  if (id === undefined) return null;
  if (msg.method === "initialize") {
    const params = asRecord(msg.params);
    const asked = typeof params?.protocolVersion === "string" ? params.protocolVersion : "";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: protocolVersions.includes(asked) ? asked : "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "spendable", version: "0.1.0" },
      },
    };
  }
  if (msg.method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (msg.method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: tools() } };
  if (msg.method !== "tools/call") return rpcError(id, -32601, "Method not found.");
  const params = asRecord(msg.params);
  const name = typeof params?.name === "string" ? params.name : "";
  const args = asRecord(params?.arguments) ?? {};
  const route = apiContract.routes.find((item) => item.path.startsWith("/api/v1") && toolName(item.method, item.path) === name);
  if (!route) return rpcError(id, -32602, "No such action.");
  try {
    const outcome = await invoke(route, args);
    return {
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: outcome.text }], isError: outcome.status >= 400 },
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : "Something went wrong.";
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
  }
}
