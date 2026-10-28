import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { isoToLocalNoonUnix } from "../src/core/dates";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-plan-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a plan counts until a bank charge matches and leaves the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const dueDay = Number(before.today.slice(8, 10));
    service.createProjection({ name: "Paycheck", amountCents: 10_000, dueDay, kind: "income", matchText: "Paycheck" });
    const planned = service.getSnapshot();
    assert.equal(planned.spendableCents, before.spendableCents + 10_000);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);

    const fuel = store.listTransactions().find((txn) => txn.accountId === "demo_checking");
    assert.ok(fuel);
    store.insertTransaction({
      id: "plan-pay",
      accountId: fuel.accountId,
      posted: isoToLocalNoonUnix(before.today),
      amountCents: 10_000,
      description: "Paycheck",
      pending: false,
      category: null,
    });
    const matched = service.getSnapshot();
    assert.equal(matched.spendableCents, before.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
