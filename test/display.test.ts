import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { formatLong, weekdayIndex } from "../src/core/dates";
import { formatMoney } from "../src/core/money";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-display-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("figure settings change the words and leave the balances", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    assert.equal(formatLong("2026-11-06"), "Fri, Nov 6");
    assert.equal(formatLong("2026-11-06", "dmy"), "Fri, 6 Nov");
    assert.equal(formatLong("2026-11-06", "ymd"), "2026-11-06");
    assert.equal(weekdayIndex("2026-11-01"), 0);
    assert.equal(weekdayIndex("2026-11-02"), 1);
    assert.equal(formatMoney(-160000), "−$1,600.00");
    assert.equal(formatMoney(40, "USD", false, { hideCents: true }), "$0");
    assert.match(formatMoney(160050, "USD", false, { number: "eu" }), /1\.600,50/);

    service.saveDisplay({ date: "ymd", number: "eu", weekStart: "1", hideCents: true });
    const after = service.getSnapshot();
    const due = after.receipt.lines.find((line) => line.detail.startsWith("Due "));
    assert.equal(service.getSettings().date, "ymd");
    assert.equal(service.getSettings().weekStart, 1);
    assert.equal(service.getSettings().hideCents, true);
    assert.match(due?.detail ?? "", /^Due \d{4}-\d{2}-\d{2}$/);
    assert.equal(after.spendableCents, before.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.throws(
      () => service.saveDisplay({ date: "nope", number: "us", weekStart: "0", hideCents: false }),
      (error: Error & { code?: string }) => error.code === "bad_display",
    );
    assert.equal(service.getSettings().date, "ymd");
  } finally {
    store.closeDb();
  }
});
