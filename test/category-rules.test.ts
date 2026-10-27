import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { categoryFor } from "../src/core/rules";
import { syncIsDue } from "../src/core/sync-due";
import { syncIsStale, SYNC_INTERVAL_MS } from "../src/core/service";

describe("category rules", () => {
  it("uses the longest matching description", () => {
    const rules = [
      { contains: "market", category: "Groceries" },
      { contains: "market basket", category: "Food" },
    ];
    assert.equal(categoryFor("MARKET BASKET #12", rules), "Food");
    assert.equal(categoryFor("Corner Market", rules), "Groceries");
    assert.equal(categoryFor("Payroll", rules), null);
  });
});

describe("when a bank copy is due", () => {
  it("is due with no timestamp, and not due inside 12 hours", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    assert.equal(syncIsStale(null, now), true);
    assert.equal(syncIsStale("2026-10-27T01:00:00.000Z", now), false);
    assert.equal(syncIsStale(new Date(now - SYNC_INTERVAL_MS).toISOString(), now), true);
  });

  it("waits for the local clock and stays quiet when sync is off", () => {
    const early = new Date(2026, 9, 27, 6, 0).getTime();
    const later = new Date(2026, 9, 27, 8, 0).getTime();
    const yesterday = new Date(2026, 9, 26, 8, 0).toISOString();
    const schedule = { on: true, everyHours: 12, at: "07:00" };
    assert.equal(syncIsDue(yesterday, schedule, early), false);
    assert.equal(syncIsDue(yesterday, schedule, later), true);
    assert.equal(syncIsDue(yesterday, { ...schedule, on: false }, later), false);
    assert.equal(syncIsDue(new Date(later).toISOString(), schedule, later), false);
  });
});

const dir = mkdtempSync(path.join(tmpdir(), "spendable-rules-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("saving a rule and a monthly bill", () => {
  it("fills later matches and keeps the bill until it is turned off", async () => {
    const service = await import("../src/core/service");
    const store = await import("../src/core/db");
    try {
      service.ready();
      const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
      assert.ok(coffee);
      store.insertTransaction({
        id: "later-coffee",
        accountId: coffee.accountId,
        posted: coffee.posted,
        amountCents: -600,
        description: "Lane Coffee downtown",
        pending: false,
        category: null,
      });
      service.saveTransactionDetails({
        id: coffee.id,
        category: "Coffee",
        contains: "Lane Coffee",
        remember: true,
        billable: true,
        recurring: true,
        tags: "morning, weekly",
      });
      assert.equal(store.getTransaction("later-coffee")?.category, "Coffee");
      assert.deepEqual(store.getTransaction(coffee.id)?.tags, ["morning", "weekly"]);
      assert.deepEqual(store.getTransaction("later-coffee")?.tags, ["morning"]);
      store.upsertSyncedTransaction({
        id: "later-coffee",
        accountId: coffee.accountId,
        posted: coffee.posted,
        amountCents: -600,
        description: "Lane Coffee downtown",
        pending: false,
      });
      assert.deepEqual(store.getTransaction("later-coffee")?.tags, ["morning"]);
      const bill = store.listBills().find((item) => item.matchText === "lane coffee");
      assert.ok(bill);
      assert.equal(bill.active, true);
      assert.equal(bill.amountCents, Math.abs(coffee.amountCents));

      service.saveTransactionDetails({
        id: coffee.id,
        category: "Coffee",
        contains: "Lane Coffee",
        remember: true,
        billable: true,
        recurring: false,
      });
      assert.equal(store.listBills().find((item) => item.matchText === "lane coffee")?.active, false);
      assert.equal(store.getAccount("demo_checking")?.balanceCents, 441_255);

      assert.deepEqual(service.connectionStatus().sync, { on: true, everyHours: 12, at: "" });
      assert.deepEqual(service.saveSyncSchedule({ on: true, everyHours: 24, at: "07:00:00" }), {
        on: true,
        everyHours: 24,
        at: "07:00",
      });
      const off = service.saveSyncSchedule({ on: false });
      assert.equal(off.on, false);
      assert.equal(off.everyHours, 24);
      assert.throws(() => service.saveSyncSchedule({ everyHours: 3 }), /Not a choice/);
      assert.equal(service.connectionStatus().sync.everyHours, 24);
    } finally {
      service.closeDb();
    }
  });
});
