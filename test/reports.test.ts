import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { isoToLocalNoonUnix } from "../src/core/dates";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-reports-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a report totals this month and leaves the balances", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getReport();
    const snapshot = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const posted = isoToLocalNoonUnix(snapshot.today);
    store.insertTransaction({
      id: "rep-in",
      accountId: "demo_checking",
      posted,
      amountCents: 8_000,
      description: "Pay",
      pending: false,
      category: null,
    });
    store.insertTransaction({
      id: "rep-out",
      accountId: "demo_checking",
      posted,
      amountCents: -5_000,
      description: "Shop",
      pending: false,
      category: null,
    });
    store.insertTransaction({
      id: "rep-card",
      accountId: "demo_visa",
      posted,
      amountCents: -7_000,
      description: "Card",
      pending: false,
      category: null,
    });
    store.insertTransaction({
      id: "rep-wait",
      accountId: "demo_checking",
      posted,
      amountCents: -9_000,
      description: "Wait",
      pending: true,
      category: null,
    });
    const after = service.getReport();
    const day = after.days.find((item) => item.date === snapshot.today);
    const prior = before.days.find((item) => item.date === snapshot.today);
    assert.equal(after.month, snapshot.today.slice(0, 7));
    assert.equal(after.incomeCents, before.incomeCents + 8_000);
    assert.equal(after.spendingCents, before.spendingCents + 5_000);
    assert.equal(after.summaryCents, before.summaryCents + 3_000);
    assert.equal(day?.incomeCents, (prior?.incomeCents ?? 0) + 8_000);
    assert.equal(day?.expenseCents, (prior?.expenseCents ?? 0) + 5_000);
    assert.equal(after.netWorthCents, snapshot.depositsCents - snapshot.owedCents);
    assert.equal(service.getSnapshot().spendableCents, snapshot.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
