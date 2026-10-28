import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { addDays, postedToISO } from "../src/core/dates";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-skip-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

const accessUrl = "https://ada:secret@bridge.example/simplefin";
const originalFetch = globalThis.fetch;
const bankPosted = 1_700_000_000;

after(() => {
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
});

function mdy(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year}`;
}

test("a repeat is skipped and a near file charge takes the bank date", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const spendable = service.getSnapshot().spendableCents;
    const file = {
      accountId: "demo_checking",
      name: "cafe.csv",
      date: "mdy",
      sign: "flip" as const,
      dateColumn: "date",
      amountColumn: "amount",
      payeeColumn: "payee",
      text: "date,amount,payee\n01/15/2026,12.40,Cafe\n01/15/2026,12.40,Cafe\n",
    };
    assert.equal(service.importCharges(file).imported, 1);
    assert.equal(service.importCharges(file).imported, 0);
    assert.equal(store.listTransactions().filter((txn) => txn.description === "Cafe").length, 1);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.getSnapshot().spendableCents, spendable);

    const bankIso = postedToISO(bankPosted);
    assert.ok(bankIso);
    store.saveConnection(accessUrl, new Date().toISOString());
    const accounts = (transactions: { id: string; posted: number; amount: string; description: string }[]) =>
      Response.json({
        errors: [],
        connections: [{ conn_id: "CON", org_name: "Northwind" }],
        accounts: [
          {
            id: "chk",
            name: "Everyday Checking",
            conn_id: "CON",
            currency: "USD",
            balance: "4280.11",
            "available-balance": "4200.00",
            "balance-date": bankPosted,
            transactions,
          },
        ],
      });
    globalThis.fetch = (async () => accounts([])) as typeof fetch;
    await service.sync();
    const near = addDays(bankIso, -1);
    const far = addDays(bankIso, -10);
    service.importCharges({
      accountId: "CON:chk",
      name: "coffee.csv",
      date: "mdy",
      sign: "flip",
      dateColumn: "date",
      amountColumn: "amount",
      payeeColumn: "payee",
      text: `date,amount,payee\n${mdy(near)},12.40,Coffee\n${mdy(far)},12.40,Far Coffee\n`,
    });
    globalThis.fetch = (async () =>
      accounts([
        { id: "t1", posted: bankPosted, amount: "-12.40", description: "Coffee" },
        { id: "t2", posted: bankPosted, amount: "-12.40", description: "Far Coffee" },
      ])) as typeof fetch;
    await service.sync();

    const coffee = store.listTransactions().filter((txn) => txn.description === "Coffee");
    const farRows = store.listTransactions().filter((txn) => txn.description === "Far Coffee");
    assert.equal(coffee.length, 1);
    assert.equal(coffee[0]?.id.startsWith("import_"), true);
    assert.equal(coffee[0]?.posted, bankPosted);
    assert.equal(store.getTransaction("CON:chk:t1"), null);
    assert.equal(farRows.length, 2);
    assert.equal(store.getTransaction("CON:chk:t2")?.posted, bankPosted);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(store.getAccount("CON:chk")?.balanceCents, 428_011);
  } finally {
    store.closeDb();
  }
});
