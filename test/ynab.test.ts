import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-ynab-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

function zipStored(files: { name: string; data: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = Buffer.from(file.data);
    const sum = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("a YNAB file lands on the account with the same name", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const spendable = service.getSnapshot().spendableCents;
    const plan = {
      data: {
        plan: {
          accounts: [
            { id: "a", name: "Everyday Checking", deleted: false },
            { id: "b", name: "Nope", deleted: false },
          ],
          payees: [
            { id: "p", name: "Cafe Plan", deleted: false },
            { id: "s", name: "Starting Balance", deleted: false },
          ],
          categories: [
            { id: "c", name: "Snacks", deleted: false },
            { id: "d", name: "Gas", deleted: false },
          ],
          transactions: [
            { id: "t1", account_id: "a", date: "2026-03-03", amount: -12400, payee_id: "p", category_id: "c", memo: "noon", cleared: "cleared", deleted: false },
            { id: "t2", account_id: "b", date: "2026-03-04", amount: -5000, payee_id: "p", deleted: false },
            { id: "t3", account_id: "a", date: "2026-03-01", amount: 100000, payee_id: "s", deleted: false },
            { id: "t4", account_id: "a", date: "2026-03-05", amount: -2000, payee_id: "p", deleted: true },
          ],
          subtransactions: [
            { id: "s1", transaction_id: "t1", amount: -8000, category_id: "d", deleted: false },
            { id: "s2", transaction_id: "t1", amount: -4400, category_id: "c", deleted: false },
          ],
        },
      },
    };
    const file = Buffer.from(JSON.stringify(plan));
    assert.equal(service.importYnab(file, "plan.json").imported, 1);
    assert.equal(service.importYnab(file, "plan.json").imported, 0);
    const cafe = store.listTransactions().find((txn) => txn.description === "Cafe Plan");
    assert.equal(cafe?.amountCents, -1240);
    assert.equal(cafe?.accountId, "demo_checking");
    assert.equal(cafe?.note, "noon");
    assert.equal(cafe?.cleared, true);
    assert.equal(cafe?.category, null);
    assert.deepEqual(
      (cafe?.splits ?? []).map((part) => [part.category, part.amountCents]).sort(),
      [["Gas", -800], ["Snacks", -440]].sort(),
    );
    assert.equal(store.listTransactions().some((txn) => txn.description === "Starting Balance"), false);
    assert.equal(store.listTransactions().filter((txn) => txn.amountCents === -200).length, 0);

    const older = {
      accounts: [{ entityId: "A", accountName: "Everyday Checking" }],
      payees: [{ entityId: "P", name: "Old Device" }],
      masterCategories: [{ name: "Food", subCategories: [{ entityId: "C", name: "Snacks" }] }],
      transactions: [{ entityId: "T", accountId: "A", payeeId: "P", categoryId: "C", amount: -9.99, date: "2026-04-04" }],
    };
    const newer = {
      accounts: [{ entityId: "A", accountName: "Everyday Checking" }],
      payees: [{ entityId: "P", name: "Cafe Four" }],
      masterCategories: [{ name: "Food", subCategories: [{ entityId: "C", name: "Snacks" }] }],
      transactions: [
        { entityId: "T", accountId: "A", payeeId: "P", categoryId: "C", amount: -4.2, date: "2026-04-04", memo: "yum", cleared: "Cleared" },
        { entityId: "X", accountId: "A", payeeId: "P", categoryId: "C", amount: -1, date: "2026-04-05", isTombstone: true },
      ],
    };
    const zip = zipStored([
      { name: "Budget~1.ynab4/Budget.ymeta", data: JSON.stringify({ relativeDataFolderName: "data1-ABC" }) },
      { name: "Budget~1.ynab4/data1-ABC/devices/old.ydevice", data: JSON.stringify({ hasFullKnowledge: true, deviceGUID: "OLD", knowledge: "A-1" }) },
      { name: "Budget~1.ynab4/data1-ABC/OLD/Budget.yfull", data: JSON.stringify(older) },
      { name: "Budget~1.ynab4/data1-ABC/devices/new.ydevice", data: JSON.stringify({ hasFullKnowledge: true, deviceGUID: "NEW", knowledge: "A-3" }) },
      { name: "Budget~1.ynab4/data1-ABC/NEW/Budget.yfull", data: JSON.stringify(newer) },
    ]);
    assert.equal(service.importYnab(zip, "Budget.ynab4").imported, 1);
    const four = store.listTransactions().find((txn) => txn.description === "Cafe Four");
    assert.equal(four?.amountCents, -420);
    assert.equal(four?.category, "Snacks");
    assert.equal(four?.note, "yum");
    assert.equal(store.listTransactions().some((txn) => txn.description === "Old Device"), false);
    assert.throws(
      () => service.importYnab(Buffer.from(JSON.stringify({ data: { budget: { accounts: [{ id: "a", name: "Everyday Checking" }], payees: [{ id: "p", name: "Bad" }], categories: [], transactions: [{ id: "t", account_id: "a", payee_id: "p", date: "nope", amount: -1000 }] } } })), "bad.json"),
      (error: Error & { code?: string }) => error.code === "bad_date",
    );
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
    assert.equal(service.getSnapshot().spendableCents, spendable);
  } finally {
    store.closeDb();
  }
});
