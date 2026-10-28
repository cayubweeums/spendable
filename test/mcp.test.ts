import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { apiContract } from "../src/core/contract";
import { handleMcp, toolName } from "../src/core/mcp";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-mcp-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("mcp lists every api action and returns that action's result", async () => {
  const v1 = apiContract.routes.filter((route) => route.path.startsWith("/api/v1"));
  const names = v1.map((route) => toolName(route.method, route.path));
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.every((name) => /^[a-z0-9_]+$/.test(name)), true);

  const listed = await handleMcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }, async () => {
    throw new Error("not called");
  });
  const tools = (listed?.result as { tools: { name: string }[] }).tools;
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...names].sort());

  const init = await handleMcp(
    { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    async () => {
      throw new Error("not called");
    },
  );
  assert.equal((init?.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
  assert.equal(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, async () => ({ status: 200, text: "" })), null);

  let called = "";
  const ok = await handleMcp(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_snapshot", arguments: {} } },
    async (route) => {
      called = `${route.method} ${route.path}`;
      return { status: 200, text: "{\"spendableCents\":1}" };
    },
  );
  assert.equal(called, "GET /api/v1/snapshot");
  assert.equal((ok?.result as { isError: boolean }).isError, false);

  const missing = await handleMcp(
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope", arguments: {} } },
    async () => ({ status: 200, text: "" }),
  );
  assert.equal((missing?.error as { code: number }).code, -32602);

  const denied = await handleMcp(
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_snapshot", arguments: {} } },
    async () => ({ status: 401, text: "Sign in first." }),
  );
  assert.equal((denied?.result as { isError: boolean }).isError, true);
});

test("mcp snapshot is the app snapshot and leaves the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  const { POST, mcpHandlers } = await import("../src/app/api/mcp/route");
  const expected = apiContract.routes.filter((route) => route.path.startsWith("/api/v1")).map((route) => `${route.method} ${route.path}`);
  assert.deepEqual(Object.keys(mcpHandlers).sort(), [...expected].sort());
  try {
    service.ready();
    service.establishPassword("mcp-pass-1", "mcp-pass-1");
    const token = service.signIn("mcp-pass-1");
    const before = store.getAccount("demo_checking")?.balanceCents;
    const response = await POST(
      new Request("http://127.0.0.1/api/mcp", {
        method: "POST",
        headers: { cookie: `spendable_session=${token}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_snapshot", arguments: {} } }),
      }),
    );
    const json = (await response.json()) as { result: { isError: boolean; content: { text: string }[] } };
    assert.equal(json.result.isError, false);
    assert.equal(JSON.parse(json.result.content[0].text).spendableCents, service.getSnapshot().spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, before);
    service.closeSession(token);
  } finally {
    store.closeDb();
  }
});
