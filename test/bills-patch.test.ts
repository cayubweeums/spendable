import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-bills-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

// Use a fixed due day that will always fall in the biweekly window regardless of when the test runs.
// Biweekly cycles: if today is any day, next payday = today + 14 days.
// A bill due on day X appears if X falls between [today, today+14].
// Using day+3 guarantees it's in the window (since day+3 <= day+14).
function calcDueDay() {
  const today = new Date();
  const d = today.getDate();
  // Avoid month boundaries: if we're within 3 days of end of month, use next month's 1st
  if (d > 27) return 1;
  return d + 3;
}

test("patchBill toggles active on a bill", async () => {
  const service = await import("../src/core/service");
  try {
    service.ready();
    const dd = calcDueDay();
    const bill = service.createBill({ name: "MortgageTest", amountCents: 1_500_000, dueDay: dd });

    let stored = service.getSnapshot();
    // Verify the bill appears in the receipt (active bills have kind=sub and negative cents)
    const mortgageLine = stored.receipt.lines.find((l) => l.label === "MortgageTest");
    assert.ok(mortgageLine, `Expected MortgageTest in receipt. Lines: ${stored.receipt.lines.map(l => l.label).join(", ")}`);
    assert.equal(mortgageLine.cents, -1_500_000);

    // Deactivate the bill
    service.patchBill(bill.id, { active: false });

    stored = service.getSnapshot();
    const deactivated = stored.receipt.lines.find((l) => l.label === "MortgageTest");
    assert.equal(deactivated, undefined, "Deactivated bill should not appear in receipt");
  } finally {
    service.closeDb();
  }
});

test("patchBill reactivates a previously disabled bill", async () => {
  const service = await import("../src/core/service");
  try {
    service.ready();
    // Use the same calculation as the other test for consistency
    const dd = calcDueDay();
    const bill = service.createBill({ name: "ElectricityTest2", amountCents: 200_000, dueDay: dd });

    // Verify initially present
    let stored = service.getSnapshot();
    assert.ok(stored.receipt.lines.find((l) => l.label === "ElectricityTest2"), "Should appear initially");

    // Deactivate
    service.patchBill(bill.id, { active: false });

    stored = service.getSnapshot();
    const before = stored.receipt.lines.find((l) => l.label === "ElectricityTest2");
    assert.equal(before, undefined, "Deactivated bill should not appear in receipt");

    // Verify it's stored as inactive
    const store = await import("../src/core/db");
    const dbBill = store.getBill(bill.id);
    assert.ok(dbBill, "Bill should exist in store");
    assert.equal(dbBill.active, false, "Should be inactive in store");

    // Reactivate
    service.patchBill(bill.id, { active: true });

    stored = service.getSnapshot();
    const line = stored.receipt.lines.find((l) => l.label === "ElectricityTest2");
    assert.ok(line, `Reactivated bill should appear. Lines found: ${JSON.stringify(stored.receipt.lines.map(l => ({ label: l.label, kind: l.kind })))}`);
    assert.equal(line.cents, -200_000);
  } finally {
    service.closeDb();
  }
});

test("patchBill returns 404 for nonexistent bill", async () => {
  const service = await import("../src/core/service");
  try {
    service.ready();
    assert.throws(
      () => service.patchBill("no-such-id", { active: false }),
      { message: "No bill with that id." },
    );
  } finally {
    service.closeDb();
  }
});

test("patchBill preserves other fields when toggling active", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const dd = calcDueDay() + 7;
    const bill = service.createBill({ name: "InternetTest", amountCents: 89_900, dueDay: dd });

    service.patchBill(bill.id, { active: false });

    const dbBill = store.getBill(bill.id);
    assert.ok(dbBill);
    assert.equal(dbBill.name, "InternetTest");
    assert.equal(dbBill.amountCents, 89_900);
    assert.equal(dbBill.dueDay, dd);
    assert.equal(dbBill.active, false);
  } finally {
    service.closeDb();
  }
});
