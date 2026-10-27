import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-fill-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("a rule copies one field from the charge into notes, date, amount, payee, or cleared", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  const { isoToLocalNoonUnix, postedToISO } = await import("../src/core/dates");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const posted = isoToLocalNoonUnix("2024-01-15");
    for (const [id, description, amountCents] of [
      ["fill-notes", "Rule Fill Notes", -1250],
      ["fill-date", "Rule Fill Date", -800],
      ["fill-amount", "Rule Fill Amount", -1250],
      ["fill-payee", "Rule Fill Payee", -900],
      ["fill-cleared", "Rule Fill Cleared", -700],
    ] as const) {
      store.insertTransaction({
        id,
        accountId: "demo_checking",
        posted,
        amountCents,
        description,
        pending: false,
        category: null,
      });
    }
    store.setTransactionNote("fill-date", "2024-06-01");
    store.setTransactionNote("fill-amount", "4.50");
    store.setTransactionNote("fill-payee", "Cafe");
    store.setTransactionNote("fill-cleared", "yes");

    service.saveRules([
      {
        id: "notes",
        ord: 1,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Rule Fill Notes",
        action: "notes",
        actionValue: "{{date}}",
      },
      {
        id: "date",
        ord: 2,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Rule Fill Date",
        action: "date",
        actionValue: "{{notes}}",
      },
      {
        id: "amount",
        ord: 3,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Rule Fill Amount",
        action: "amount",
        actionValue: "{{notes}}",
      },
      {
        id: "payee",
        ord: 4,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Rule Fill Payee",
        action: "payee",
        actionValue: "{{notes}}",
      },
      {
        id: "cleared",
        ord: 5,
        stage: "after",
        field: "imported_payee",
        op: "is",
        value: "Rule Fill Cleared",
        action: "cleared",
        actionValue: "{{notes}}",
      },
    ]);

    const notes = store.getTransaction("fill-notes");
    assert.equal(notes?.note, "2024-01-15");
    assert.equal(notes?.description, "Rule Fill Notes");
    assert.equal(notes?.amountCents, -1250);
    assert.equal(notes?.cleared, false);

    const dated = store.getTransaction("fill-date");
    assert.equal(postedToISO(dated?.posted ?? 0), "2024-06-01");
    assert.equal(dated?.note, "2024-06-01");
    assert.equal(dated?.amountCents, -800);
    assert.equal(dated?.description, "Rule Fill Date");

    const amount = store.getTransaction("fill-amount");
    assert.equal(amount?.amountCents, 450);
    assert.equal(amount?.description, "Rule Fill Amount");

    const payee = store.getTransaction("fill-payee");
    assert.equal(payee?.description, "Rule Fill Payee");
    const named = store.listPayees().find((item) => item.descriptions.includes("Rule Fill Payee"));
    assert.equal(named?.name, "Cafe");

    const cleared = store.getTransaction("fill-cleared");
    assert.equal(cleared?.cleared, true);
    assert.equal(cleared?.amountCents, -700);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
