import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { SpendableError } from "../src/core/errors";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-rules-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

type Service = typeof import("../src/core/service");
let service: Service;

before(async () => {
  service = await import("../src/core/service");
  service.restoreDemo();
});

after(() => {
  service.closeDb();
  rmSync(dir, { recursive: true, force: true });
});

function codes(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof SpendableError) return error.code;
    throw error;
  }
  return "";
}

describe("service rules", { concurrency: 1 }, () => {
  it("rejects a bill with no name, no amount, or a day outside the month", () => {
    assert.equal(codes(() => service.createBill({ name: "   ", amountCents: 100, dueDay: 1 })), "bad_bill");
    assert.equal(codes(() => service.createBill({ name: "Water", amountCents: 0, dueDay: 1 })), "bad_amount");
    assert.equal(codes(() => service.createBill({ name: "Water", amountCents: 100, dueDay: 32 })), "bad_due_day");
    assert.equal(service.listBills().some((bill) => bill.name === "Water"), false);
  });

  it("rejects an unknown account, role, and payment rule", () => {
    assert.equal(codes(() => service.updateAccount("missing", { role: "spend" })), "not_found");
    const checking = service.listAccounts().find((account) => account.id === "demo_checking");
    assert.ok(checking);
    assert.equal(codes(() => service.updateAccount(checking.id, { role: "cash" })), "bad_role");
    assert.equal(codes(() => service.updateAccount(checking.id, { payMode: "sometimes" })), "bad_pay_mode");
    assert.equal(codes(() => service.updateAccount(checking.id, { minimumCents: -1 })), "bad_amount");
    assert.equal(service.listAccounts().find((account) => account.id === checking.id)?.role, "spend");
    assert.equal(service.listAccounts().find((account) => account.id === checking.id)?.balanceCents, checking.balanceCents);
  });

  it("clears a category without touching the amount", () => {
    const coffee = service.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    service.setCategory(coffee.id, "   ");
    const cleared = service.listTransactions().find((txn) => txn.id === coffee.id);
    assert.equal(cleared?.category, null);
    assert.equal(cleared?.amountCents, coffee.amountCents);
    assert.equal(codes(() => service.setCategory("missing", "Food")), "not_found");
  });

  it("rejects a payday that is not a real date or frequency", () => {
    const before = service.getSettings();
    assert.equal(codes(() => service.updateSettings({ paydayFrequency: "daily" })), "bad_payday");
    assert.equal(codes(() => service.updateSettings({ paydayAnchor: "2026-02-29" })), "bad_date");
    assert.equal(codes(() => service.updateSettings({ bufferCents: -5 })), "bad_amount");
    assert.deepEqual(service.getSettings(), before);
  });

  it("filters transactions by civil date and rejects a bad since", () => {
    const rows = service.listTransactions("2026-01-01");
    assert.ok(rows.length > 0);
    assert.equal(codes(() => service.listTransactions("yesterday")), "bad_date");
  });

  it("refuses to sync before a bank is connected", async () => {
    await assert.rejects(() => service.sync(), (error: unknown) => error instanceof SpendableError && error.code === "not_connected");
    assert.equal(service.connectionStatus().connected, false);
  });

  it("leaves the sample balances in place when the setup token is nonsense", async () => {
    const before = service.listAccounts().map((account) => [account.id, account.balanceCents]);
    await assert.rejects(() => service.connect("not-a-token"), /https|token/);
    assert.deepEqual(
      service.listAccounts().map((account) => [account.id, account.balanceCents]),
      before,
    );
    assert.equal(service.getSnapshot().demo, true);
  });

  it("removes a bill and restores the sample after the numbers were edited", () => {
    const created = service.createBill({ name: "Water", amountCents: 4_500, dueDay: 4 });
    assert.equal(service.listBills().some((bill) => bill.id === created.id), true);
    service.removeBill(created.id);
    assert.equal(codes(() => service.removeBill(created.id)), "not_found");

    service.updateAccount("demo_checking", { role: "reserve" });
    service.restoreDemo();
    const checking = service.listAccounts().find((account) => account.id === "demo_checking");
    assert.equal(checking?.role, "spend");
    assert.equal(checking?.balanceCents, 441_255);
    assert.equal(checking?.availableCents, 428_011);
    assert.equal(service.getSnapshot().demo, true);
    assert.equal(service.connectionStatus().connected, false);
    const status: Record<string, unknown> = service.connectionStatus();
    assert.equal("accessUrl" in status, false);
  });

  it("parses a dollar string and rejects one that is not an amount", () => {
    assert.equal(service.dollarsToCents(" 42.50 ", "Buffer"), 4250);
    assert.equal(codes(() => service.dollarsToCents("forty", "Buffer")), "bad_amount");
  });
});
