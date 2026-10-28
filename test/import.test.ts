import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-import-"));
process.env.SPENDABLE_DB_PATH = path.join(dir, "spendable.db");

after(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("an import adds charges and leaves the balance", async () => {
  const service = await import("../src/core/service");
  const store = await import("../src/core/db");
  try {
    service.ready();
    const before = service.getSnapshot();
    const balance = store.getAccount("demo_checking")?.balanceCents;
    const base = {
      accountId: "demo_checking",
      date: "mdy",
      sign: "flip" as const,
      dateColumn: "date",
      amountColumn: "amount",
      payeeColumn: "payee",
    };
    assert.throws(
      () => service.importCharges({ ...base, name: "bad.csv", text: "date,amount,payee\nnope,1.00,X", sign: "as" }),
      (error: Error & { code?: string }) => error.code === "bad_date",
    );
    assert.equal(store.listTransactions().some((txn) => txn.description === "X"), false);

    const csv = service.importCharges({
      ...base,
      name: "cafe.csv",
      text: 'date,amount,payee\n01/15/2026,"1,234.50","Cafe, North"\n',
    });
    const qif = service.importCharges({
      ...base,
      name: "cafe.qif",
      text: "!Type:Bank\nD01/16/2026\nT12.40\nPCafe Qif\n^\n",
    });
    const ofx = service.importCharges({
      ...base,
      name: "cafe.ofx",
      sign: "as",
      text: "<STMTTRN><DTPOSTED>20260117<TRNAMT>-3.00<NAME>Cafe Ofx</STMTTRN>",
    });
    const qfx = service.importCharges({
      ...base,
      name: "cafe.qfx",
      sign: "as",
      text: "OFXHEADER:100\n<STMTTRN><DTPOSTED>20260118<TRNAMT>4.00<MEMO>Cafe Qfx</STMTTRN>",
    });
    const rows = store.listTransactions();
    const cafe = rows.find((txn) => txn.description === "Cafe, North");
    assert.equal(csv.imported, 1);
    assert.equal(qif.imported, 1);
    assert.equal(ofx.imported, 1);
    assert.equal(qfx.imported, 1);
    assert.equal(cafe?.amountCents, -123_450);
    assert.equal(cafe?.accountId, "demo_checking");
    assert.equal(rows.find((txn) => txn.description === "Cafe Qif")?.amountCents, -1_240);
    assert.equal(rows.find((txn) => txn.description === "Cafe Ofx")?.amountCents, -300);
    assert.equal(rows.find((txn) => txn.description === "Cafe Qfx")?.amountCents, 400);
    assert.equal(service.getSnapshot().spendableCents, before.spendableCents);
    assert.equal(store.getAccount("demo_checking")?.balanceCents, balance);
  } finally {
    store.closeDb();
  }
});
