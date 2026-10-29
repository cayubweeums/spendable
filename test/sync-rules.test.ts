import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-sync-rules-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

const accessUrl = "https://ada:secret@bridge.example/simplefin";
const originalFetch = globalThis.fetch;
const range = "Requested date range exceeds recommended range of 45 days.";
const attention = "Connection to Northwind may need attention";

after(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

test("a later sync fills an empty category, keeps one already set, and drops the date-range warning", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    service.saveRules([
      {
        id: "fuel",
        ord: 1,
        stage: "after",
        field: "imported_payee",
        op: "contains",
        value: "North Fuel",
        action: "category",
        actionValue: "Cafe",
      },
    ]);
    assert.equal(store.getTransaction("demo_txn_fuel")?.category, "Gas");
    store.saveConnection(accessUrl, new Date().toISOString());
    globalThis.fetch = (async () =>
      Response.json({
        errors: [range],
        errlist: [{ msg: attention }],
        accounts: [],
      })) as typeof fetch;

    await service.sync();
    assert.equal(store.getTransaction("demo_txn_fuel")?.category, "Gas");
    assert.deepEqual(service.getSnapshot().syncErrors, [attention]);

    store.setTransactionCategory("demo_txn_fuel", null);
    await service.sync();
    assert.equal(store.getTransaction("demo_txn_fuel")?.category, "Cafe");
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);

    store.markSynced(new Date().toISOString(), [range]);
    assert.deepEqual(service.connectionStatus().errors, []);
  } finally {
    store.closeDb();
  }
});
