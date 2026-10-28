import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { formatMoney } from "../src/core/money";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-hide-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("hiding amounts leaves the balances and the spendable number", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const ledger = before.receipt.lines.find((line) => line.detail.startsWith("Available. Ledger"));
    assert.ok(ledger);
    assert.equal(service.amountsHidden(), false);
    assert.equal(formatMoney(before.spendableCents, before.currency, true), "••••");

    service.setAmountsHidden(true);
    const after = service.getSnapshot();
    const masked = after.receipt.lines.find((line) => line.label === ledger.label);
    assert.equal(service.amountsHidden(), true);
    assert.equal(masked?.detail, "Available");
    assert.equal(after.spendableCents, before.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);

    service.setAmountsHidden(false);
    assert.equal(service.amountsHidden(), false);
  } finally {
    store.closeDb();
  }
});
