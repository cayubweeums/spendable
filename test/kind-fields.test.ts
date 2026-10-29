import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KindFields } from "../src/components/kind-fields";

function markup(kind: "checking" | "savings", tracked: boolean) {
  return renderToStaticMarkup(
    createElement(KindFields, {
      id: "a",
      kind,
      tracked,
      dueDay: null,
      payMode: "none",
      minimumCents: 0,
    }),
  );
}

describe("follow checkbox", () => {
  it("shows only for checking and keeps other types followed", () => {
    const checking = markup("checking", false);
    assert.match(checking, /Follow this account/);
    assert.equal(checking.includes("hidden"), false);

    const savings = markup("savings", false);
    assert.equal(savings.includes("Follow this account"), false);
    assert.match(savings, /name="track:a"/);
    assert.match(savings, /value="1"/);
  });
});
