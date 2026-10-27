import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("bills and labels leave copied balances alone", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    const snapshot = service.getSnapshot();
    assert.equal(snapshot.question, "How much can I spend right now?");
    assert.equal(snapshot.demo, true);
    assert.equal(snapshot.receipt.lines.some((line) => line.label === "Rent"), true);
    assert.equal(snapshot.receipt.lines.some((line) => line.label === "Harbor Visa payment"), true);
    assert.equal(
      snapshot.receipt.lines.reduce((sum, line) => sum + line.cents, 0),
      snapshot.spendableCents,
    );

    const before = store.listAccounts().map((account) => [account.id, account.balanceCents, account.availableCents]);
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    service.createBill({ name: "Extra", amountCents: 2_500, dueDay: new Date().getDate() });
    service.setCategory(coffee.id, "Latte");
    service.updateSettings({ bufferCents: snapshot.demo ? service.getSettings().bufferCents : 0 });
    const after = store.listAccounts().map((account) => [account.id, account.balanceCents, account.availableCents]);
    assert.deepEqual(after, before);
    assert.equal(store.listTransactions().find((txn) => txn.id === coffee.id)?.category, "Latte");

    store.upsertSyncedTransaction({
      id: coffee.id,
      accountId: coffee.accountId,
      posted: coffee.posted,
      amountCents: coffee.amountCents,
      description: "Lane Coffee",
      pending: false,
    });
    assert.equal(store.listTransactions().find((txn) => txn.id === coffee.id)?.category, "Latte");

    const checking = store.getAccount("demo_checking");
    assert.ok(checking);
    service.updateAccount(checking.id, { role: "reserve", label: "Rent money", note: "Joint" });
    store.upsertSyncedAccount({
      ...checking,
      name: "Everyday Checking NEW",
      balanceCents: 100,
      role: "spend",
      dueDay: null,
      payMode: "none",
      minimumCents: 0,
    });
    const updated = store.getAccount(checking.id);
    assert.equal(updated?.balanceCents, 100);
    assert.equal(updated?.role, "reserve");
    assert.equal(updated?.name, "Everyday Checking NEW");
    assert.equal(updated?.label, "Rent money");
    assert.equal(updated?.note, "Joint");
    const shown = service.getSnapshot().deposits.find((account) => account.id === checking.id);
    assert.equal(shown?.name, "Rent money");
    assert.equal(shown?.note, "Joint");
    service.updateAccount(checking.id, { label: "Everyday Checking NEW", note: "   " });
    assert.equal(store.getAccount(checking.id)?.label, "");
    assert.equal(store.getAccount(checking.id)?.note, "");

    const status = service.connectionStatus();
    assert.equal(status.connected, false);
    assert.equal(Object.hasOwn(status, "accessUrl"), false);

    const again = service.getSnapshot();
    assert.equal(again.demo, true);
    assert.equal(store.getAccount("demo_savings")?.balanceCents, 1_240_000);
  } finally {
    service.closeDb();
  }
});
