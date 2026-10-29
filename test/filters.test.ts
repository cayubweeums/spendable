import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-filter-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("stacked filters narrow the charges and leave the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const fuel = store.listTransactions().filter((txn) => txn.description === "North Fuel");
    assert.ok(fuel.length >= 2);
    store.setTransactionNote(fuel[0].id, "Commute");
    const gas = service.normalizeFilter({ field: "category", op: "is", value: "Gas" });
    const commute = service.normalizeFilter({ field: "notes", op: "contains", value: "commute" });
    const gasRows = service.listTransactions(undefined, [gas]);
    const both = service.listTransactions(undefined, [gas, commute]);
    assert.ok(gasRows.length > both.length);
    assert.equal(both.length, 1);
    assert.equal(both[0]?.id, fuel[0].id);

    const lane = store.listTransactions().find((txn) => txn.description === "Lane Coffee" && txn.amountCents === -575);
    assert.ok(lane);
    service.setSplits(lane.id, [
      { category: "Filter Groceries", amount: "3.00" },
      { category: "Filter Coffee", amount: "2.75" },
    ]);
    const split = service.listTransactions(undefined, [
      service.normalizeFilter({ field: "category", op: "is", value: "Filter Coffee" }),
    ]);
    assert.equal(split.some((txn) => txn.id === lane.id), true);
    assert.equal(store.getTransaction(lane.id)?.amountCents, -575);

    assert.equal(service.saveNamedFilter("Fuel", [gas, commute]), "Fuel");
    assert.deepEqual(service.readSavedFilter("Fuel"), [gas, commute]);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.needsCategory({ category: null, splits: [] }), true);
    assert.equal(service.needsCategory({ category: "Gas", splits: [] }), false);
    assert.equal(service.needsCategory({ category: null, splits: [{ category: "Filter Coffee" }] }), false);
    assert.equal(service.chargesReturn("/charges?blank=1&sort=date&dir=desc"), "/charges?blank=1&sort=date&dir=desc");
    assert.equal(service.chargesReturn("https://example.com"), "/");
  } finally {
    store.closeDb();
  }
});
