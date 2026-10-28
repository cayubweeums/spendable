import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-csv-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a csv lists the charges and leaves the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    service.setNote("demo_txn_fuel", 'say "hi", now');
    service.setSplits("demo_txn_fuel", [
      { category: "Gas", amount: "20.00" },
      { category: "Snacks", amount: "21.20" },
    ]);
    const csv = service.transactionsCsv();
    assert.match(csv, /^date,account,payee,amount,category,note,tags\n/);
    assert.ok(csv.includes('North Fuel,-41.20,Gas -20.00; Snacks -21.20,"say ""hi"", now",'));
    assert.equal(service.getSnapshot().spendableCents, before.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
