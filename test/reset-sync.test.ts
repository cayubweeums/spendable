import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-reset-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

const accessUrl = "https://ada:secret@bridge.example/simplefin";
const originalFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("reset drops the copy, pulls again, and keeps the rules", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    service.updateSettings({ bufferCents: 12_345 });
    service.saveRules([
      {
        id: "coffee",
        ord: 1,
        stage: "after",
        field: "imported_payee",
        op: "contains",
        value: "coffee",
        action: "category",
        actionValue: "Cafe",
      },
    ]);
    const rent = store.listBills().find((bill) => bill.name === "Rent");
    assert.ok(rent);
    store.setTransactionNote("demo_txn_fuel", "keep me");
    store.saveConnection(accessUrl, new Date().toISOString());
    store.markSynced(new Date().toISOString(), []);

    globalThis.fetch = (async () => {
      throw new Error("down");
    }) as typeof fetch;
    await assert.rejects(() => service.resetSync());
    assert.equal(store.getTransaction("demo_txn_fuel")?.note, "keep me");
    assert.equal(store.getAccount("demo_checking")?.balanceCents, 441_255);

    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const start = Number(new URL(String(url)).searchParams.get("start-date"));
      const ageDays = (Math.floor(Date.now() / 1000) - start) / 86_400;
      assert.ok(ageDays < 90 && ageDays >= 88);
      return Response.json({
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
      });
    }) as typeof fetch;

    await service.resetSync();
    assert.equal(store.getTransaction("demo_txn_fuel"), null);
    const coffee = store.listTransactions().find((txn) => txn.description === "Coffee");
    assert.equal(coffee?.category, "Cafe");
    assert.equal(coffee?.amountCents, -1240);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, 0);
    assert.equal(store.getAccount("CON:chk")?.balanceCents, 428_011);
    assert.equal(service.getSettings().bufferCents, 12_345);
    assert.equal(store.listMatchRules().some((rule) => rule.id === "coffee"), true);
    assert.equal(store.listBills().some((bill) => bill.id === rent.id), true);
    assert.ok(store.getConnection());
  } finally {
    store.closeDb();
  }
});
