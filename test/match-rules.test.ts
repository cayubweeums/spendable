import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { ruleMatches } from "../src/core/rules";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-match-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("rules run in order, before then after, and leave a set field and the bank text", async () => {
  const blank = {
    importedPayee: "",
    payee: "",
    account: "",
    category: "",
    date: "",
    notes: "",
    amountCents: 0,
    tags: [] as string[],
  };
  assert.equal(ruleMatches({ field: "account", op: "contains", value: "checking" }, { ...blank, account: "Everyday Checking" }), true);
  assert.equal(ruleMatches({ field: "tag", op: "is", value: "big" }, { ...blank, tags: ["Big"] }), true);
  assert.equal(ruleMatches({ field: "amount", op: "over", value: "20.00" }, { ...blank, amountCents: -2500 }), true);
  assert.equal(ruleMatches({ field: "amount", op: "under", value: "20.00" }, { ...blank, amountCents: -500 }), true);
  assert.equal(ruleMatches({ field: "date", op: "before", value: "2099-01-01" }, { ...blank, date: "2026-01-02" }), true);
  assert.equal(ruleMatches({ field: "imported_payee", op: "contains", value: "n" }, blank), false);

  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const coffee = store.listTransactions().find((txn) => txn.description === "Lane Coffee");
    assert.ok(coffee);
    service.updatePayee("Lane Coffee", { name: "Cafe" });
    store.insertTransaction({
      id: "fuel-new",
      accountId: "demo_checking",
      posted: coffee.posted,
      amountCents: -2500,
      description: "North Fuel",
      pending: false,
      category: null,
    });
    store.insertTransaction({
      id: "fuel-kept",
      accountId: "demo_checking",
      posted: coffee.posted,
      amountCents: -3000,
      description: "North Fuel",
      pending: false,
      category: "Travel",
    });

    service.saveRules([
      {
        id: "rename-lane",
        ord: 1,
        stage: "before",
        field: "imported_payee",
        op: "contains",
        value: "lane coffee",
        action: "payee",
        actionValue: "Nope",
      },
      {
        id: "name-fuel",
        ord: 2,
        stage: "before",
        field: "imported_payee",
        op: "contains",
        value: "north fuel",
        action: "payee",
        actionValue: "Fuel Stop",
      },
      {
        id: "gas",
        ord: 1,
        stage: "after",
        field: "payee",
        op: "is",
        value: "Fuel Stop",
        action: "category",
        actionValue: "Gas",
      },
      {
        id: "winter",
        ord: 2,
        stage: "after",
        field: "date",
        op: "before",
        value: "2099-01-01",
        action: "notes",
        actionValue: "Winter",
      },
      {
        id: "big",
        ord: 3,
        stage: "after",
        field: "amount",
        op: "over",
        value: "20.00",
        action: "tag",
        actionValue: "big",
      },
    ]);

    const created = store.getTransaction("fuel-new");
    assert.equal(created?.description, "North Fuel");
    assert.equal(created?.category, "Gas");
    assert.equal(created?.note, "Winter");
    assert.deepEqual(created?.tags, ["big"]);
    const kept = store.getTransaction("fuel-kept");
    assert.equal(kept?.category, "Travel");
    assert.equal(kept?.note, "Winter");
    assert.deepEqual(kept?.tags, ["big"]);
    assert.equal(service.listPayees().some((payee) => payee.name === "Nope"), false);
    assert.equal(service.listPayees().some((payee) => payee.name === "Cafe"), true);
    assert.deepEqual(
      service.listPayees().find((payee) => payee.name === "Fuel Stop")?.descriptions,
      ["North Fuel"],
    );

    store.upsertSyncedTransaction({
      id: "fuel-later",
      accountId: "demo_checking",
      posted: coffee.posted,
      amountCents: -500,
      description: "North Fuel",
      pending: false,
    });
    const later = store.getTransaction("fuel-later");
    assert.equal(later?.description, "North Fuel");
    assert.equal(later?.category, "Gas");
    assert.equal(later?.note, "Winter");
    assert.deepEqual(later?.tags, []);

    assert.throws(
      () =>
        service.saveRules([
          {
            id: "bad",
            ord: 1,
            stage: "after",
            field: "amount",
            op: "contains",
            value: "nope",
            action: "tag",
            actionValue: "x",
          },
        ]),
      /choice/,
    );
    assert.equal(service.listMatchRules().length, 5);

    service.removeMatchRule("gas");
    assert.equal(service.listMatchRules().some((rule) => rule.id === "gas"), false);
    assert.equal(store.getTransaction("fuel-new")?.category, "Gas");
    assert.throws(() => service.removeMatchRule("missing"), /No rule/);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    service.closeDb();
  }
});
