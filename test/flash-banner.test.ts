import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bankNoteKey, FlashBanner } from "../src/components/flash-banner";

describe("temporary notes", () => {
  it("renders a notice as a toast", () => {
    const html = renderToStaticMarkup(createElement(FlashBanner, { notice: "Saved." }));
    assert.match(html, /Saved\./);
    assert.match(html, /class="toast"/);
    assert.equal(html.includes("flash"), false);
  });

  it("uses the sync time so the same bank note is not new", () => {
    const warnings = ["Requested date range exceeds recommended range of 45 days."];
    const key = bankNoteKey("2026-10-28T18:00:00.000Z", warnings);
    assert.equal(key, bankNoteKey("2026-10-28T18:00:00.000Z", warnings));
    assert.notEqual(key, bankNoteKey("2026-10-28T19:00:00.000Z", warnings));
  });
});
