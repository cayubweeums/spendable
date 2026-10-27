import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  diffDays,
  dueDatesInWindow,
  eachDate,
  formatLong,
  isISODate,
  isoToLocalNoonUnix,
  nextPayday,
  postedToISO,
  previousPayday,
} from "../src/core/dates";

describe("civil dates", () => {
  it("rejects dates that are not real calendar days", () => {
    assert.equal(isISODate("2026-02-29"), false);
    assert.equal(isISODate("2024-02-29"), true);
    assert.equal(isISODate("2026-13-01"), false);
    assert.equal(isISODate("10/27/2026"), false);
    assert.equal(isISODate(""), false);
  });

  it("crosses month and year boundaries by a day count", () => {
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(diffDays("2026-10-27", "2026-11-06"), 10);
    assert.equal(diffDays("2026-11-06", "2026-10-27"), -10);
  });

  it("lists every civil date in a closed range", () => {
    assert.deepEqual(eachDate("2026-10-30", "2026-11-02"), [
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("formats a weekday from the civil date, not the local offset", () => {
    assert.equal(formatLong("2026-11-06"), "Fri, Nov 6");
  });
});

describe("paydays", () => {
  it("steps weekly from an anchor, including when today is payday", () => {
    assert.equal(nextPayday("2026-10-27", "weekly", "2026-10-23"), "2026-10-30");
    assert.equal(previousPayday("2026-10-27", "weekly", "2026-10-23"), "2026-10-23");
    assert.equal(nextPayday("2026-10-23", "weekly", "2026-10-23"), "2026-10-30");
    assert.equal(previousPayday("2026-10-23", "weekly", "2026-10-23"), "2026-10-23");
  });

  it("uses the anchor itself when it is still ahead", () => {
    assert.equal(nextPayday("2026-10-01", "biweekly", "2026-10-23"), "2026-10-23");
    assert.equal(previousPayday("2026-10-01", "biweekly", "2026-10-23"), "2026-10-09");
  });

  it("clamps a 31st payday into February", () => {
    assert.equal(nextPayday("2026-02-01", "monthly", "2026-01-31"), "2026-02-28");
    assert.equal(previousPayday("2026-03-31", "monthly", "2026-01-31"), "2026-03-31");
    assert.equal(nextPayday("2026-03-31", "monthly", "2026-01-31"), "2026-04-30");
  });
});

describe("due dates and posted timestamps", () => {
  it("finds only the occurrence strictly before payday", () => {
    assert.deepEqual(dueDatesInWindow(1, "2026-10-27", "2026-11-06"), ["2026-11-01"]);
    assert.deepEqual(dueDatesInWindow(31, "2026-02-01", "2026-02-28"), []);
    assert.deepEqual(dueDatesInWindow(28, "2026-02-01", "2026-03-01"), ["2026-02-28"]);
  });

  it("treats a UTC midnight timestamp as that civil date", () => {
    const midnight = Date.parse("2026-10-30T00:00:00Z") / 1000;
    assert.equal(postedToISO(midnight), "2026-10-30");
    assert.equal(postedToISO(0), null);
    assert.equal(postedToISO(-1), null);
  });

  it("round-trips a local noon timestamp back to the same civil date", () => {
    assert.equal(postedToISO(isoToLocalNoonUnix("2026-10-23")), "2026-10-23");
  });
});
