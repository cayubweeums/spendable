import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decimalToCents, formatMoney, isIsoCurrency } from "../src/core/money";

describe("decimal amounts", () => {
  it("trims surrounding space", () => {
    assert.equal(decimalToCents("  12.30  "), 1230);
  });

  it("accepts a leading plus", () => {
    assert.equal(decimalToCents("+8.05"), 805);
  });

  it("keeps a whole dollar amount in cents", () => {
    assert.equal(decimalToCents("0"), 0);
    assert.equal(decimalToCents("2"), 200);
  });

  it("rounds the third decimal digit half up", () => {
    assert.equal(decimalToCents("1.005"), 101);
    assert.equal(decimalToCents("1.004"), 100);
    assert.equal(decimalToCents("-1.005"), -101);
  });

  it("rejects commas, blanks, and letters", () => {
    for (const bad of ["", "12.3.4", "1,200.00", "abc", "--1", "12.", "."]) {
      assert.throws(() => decimalToCents(bad), /Invalid amount/);
    }
  });
});

describe("currency display", () => {
  it("recognizes a three-letter ISO code", () => {
    assert.equal(isIsoCurrency("USD"), true);
    assert.equal(isIsoCurrency("usd"), false);
    assert.equal(isIsoCurrency("US"), false);
    assert.equal(isIsoCurrency("https://example.com/miles"), false);
  });

  it("formats zero and a custom unit without calling it dollars", () => {
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(250, "https://example.com/miles"), "2.50 units");
    assert.equal(formatMoney(-250, "POINTS"), "−2.50 units");
  });
});
