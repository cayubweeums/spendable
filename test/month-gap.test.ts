import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { isoToLocalNoonUnix } from "../src/core/dates";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-month-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("the month gap follows outflows and leaves the spendable number", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const fuel = store.listTransactions().find((txn) => txn.accountId === "demo_checking");
    assert.ok(fuel);
    store.insertTransaction({
      id: "gap-shop",
      accountId: fuel.accountId,
      posted: isoToLocalNoonUnix(before.today),
      amountCents: -5_000,
      description: "Gap Shop",
      pending: false,
      category: null,
    });
    const posted = service.getSnapshot();
    assert.equal(posted.spendableCents, before.spendableCents);
    assert.equal(posted.monthGapCents, before.monthGapCents - 5_000);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);

    store.insertTransaction({
      id: "gap-pending",
      accountId: fuel.accountId,
      posted: isoToLocalNoonUnix(before.today),
      amountCents: -9_000,
      description: "Gap Pending",
      pending: true,
      category: null,
    });
    const pending = service.getSnapshot();
    assert.equal(pending.monthGapCents, posted.monthGapCents);
    assert.equal(pending.spendableCents, before.spendableCents);
  } finally {
    store.closeDb();
  }
});
