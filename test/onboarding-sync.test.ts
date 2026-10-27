import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SpendableError } from "../src/core/errors";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-onboarding-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

type Service = typeof import("../src/core/service");
type Store = typeof import("../src/core/db");
let service: Service;
let store: Store;
const originalFetch = globalThis.fetch;

const claimUrl = "https://bridge.example/claim/once";
const token = Buffer.from(claimUrl).toString("base64");
const accessUrl = "https://ada:secret@bridge.example/simplefin";

const accountSet = {
  errors: [],
  connections: [{ conn_id: "CON", org_name: "Northwind" }],
  accounts: [
    {
      id: "chk",
      name: "Everyday Checking",
      conn_id: "CON",
      currency: "USD",
      balance: "4280.11",
      "available-balance": "4200.00",
      "balance-date": 1700000000,
      transactions: [{ id: "t1", posted: 1700000000, amount: "-12.40", description: "Coffee", pending: false }],
    },
  ],
};

function mockBridge(claimBody: string | Response, accounts: unknown = accountSet) {
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      assert.equal(String(url), claimUrl);
      assert.equal(init.redirect, "manual");
      return typeof claimBody === "string" ? new Response(claimBody) : claimBody;
    }
    const href = String(url);
    assert.equal(href.includes("secret"), false);
    assert.match(href, /\/accounts\?/);
    assert.match(href, /pending=1/);
    const start = Number(new URL(href).searchParams.get("start-date"));
    const ageDays = (Math.floor(Date.now() / 1000) - start) / 86_400;
    assert.ok(ageDays < 90 && ageDays >= 88, `start-date was ${ageDays} days ago`);
    const authorization = new Headers(init?.headers).get("authorization") ?? "";
    assert.equal(authorization, `Basic ${Buffer.from("ada:secret").toString("base64")}`);
    return Response.json(accounts);
  }) as typeof fetch;
}

before(async () => {
  service = await import("../src/core/service");
  store = await import("../src/core/db");
});

function freshDemo() {
  store.setMeta("onboarded", "0");
  service.restoreDemo();
}

after(() => {
  globalThis.fetch = originalFetch;
  service.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

describe("onboarding sync", { concurrency: 1 }, () => {
  it("will not leave setup before a bank is connected", () => {
    freshDemo();
    assert.equal(service.needsOnboarding(), true);
    assert.throws(
      () => service.completeOnboarding(),
      (error: unknown) => error instanceof SpendableError && error.code === "not_connected",
    );
  });

  it("does not save a Forbidden claim or replace the sample balances", async () => {
    freshDemo();
    mockBridge("Forbidden (was it already claimed?)\n");
    await assert.rejects(
      () => service.connect(token),
      (error: unknown) => error instanceof SpendableError && error.code === "claim_rejected",
    );
    assert.equal(service.connectionStatus().connected, false);
    assert.equal(service.connectionStatus().demo, true);
    assert.equal(service.listAccounts().some((account) => account.id === "demo_checking"), true);
    assert.equal(service.needsOnboarding(), true);
  });

  it("claims the token, copies accounts, and stays on setup until those accounts are accepted", async () => {
    freshDemo();
    mockBridge(`${accessUrl}\n`);
    const result = await service.connect(token);
    assert.equal(result.accounts, 1);
    assert.equal(result.errors.length, 0);
    assert.equal(service.connectionStatus().connected, true);
    assert.equal(service.connectionStatus().demo, false);
    assert.equal(service.needsOnboarding(), true);
    const account = service.listAccounts().find((item) => item.name === "Everyday Checking");
    assert.ok(account);
    assert.equal(account.balanceCents, 428011);
    assert.equal(account.availableCents, 420000);
    assert.equal(account.orgName, "Northwind");
    assert.equal(service.listAccounts().some((item) => item.id === "demo_checking"), false);
    const transactions = service.listTransactions();
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0]?.amountCents, -1240);
    assert.equal(transactions[0]?.description, "Coffee");

    service.completeOnboarding();
    assert.equal(service.needsOnboarding(), false);
  });

  it("keeps setup open when SimpleFIN returns no accounts", async () => {
    freshDemo();
    mockBridge(accessUrl, { accounts: [], errors: ["Connection to Northwind may need attention"] });
    const result = await service.connect(token);
    assert.equal(result.accounts, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(service.connectionStatus().connected, true);
    assert.throws(
      () => service.completeOnboarding(),
      (error: unknown) => error instanceof SpendableError && error.code === "no_accounts",
    );
    assert.equal(service.needsOnboarding(), true);
  });
});
