import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { commitSubjectOk, imageBuildNeeded } from "../scripts/conventional-commit.mjs";

describe("semantic commit subjects", () => {
  it("accepts a type, an optional scope, and a breaking mark", () => {
    assert.equal(commitSubjectOk("feat: Require a password before the ledger opens."), true);
    assert.equal(commitSubjectOk("fix(sync): keep the bank date"), true);
    assert.equal(commitSubjectOk("feat!: drop the old token"), true);
    assert.equal(commitSubjectOk("chore(main): release 0.2.0"), true);
  });

  it("rejects a subject with no type", () => {
    assert.equal(commitSubjectOk("Require a password before the ledger opens."), false);
    assert.equal(commitSubjectOk("feat:"), false);
    assert.equal(commitSubjectOk("feat: "), false);
    assert.equal(commitSubjectOk("feat(): add a token"), false);
    assert.equal(commitSubjectOk(`feat: ${"a".repeat(120)}`), false);
  });

  it("builds an image only when a commit can change it", () => {
    assert.equal(imageBuildNeeded(["docs: add the logo", "chore: tidy"]), false);
    assert.equal(imageBuildNeeded(["ci: publish an arm64 image"]), false);
    assert.equal(imageBuildNeeded(["test: cover the menu"]), false);
    assert.equal(imageBuildNeeded(["feat: pay on named days"]), true);
    assert.equal(imageBuildNeeded(["docs: add the logo", "fix(sync): keep the date"]), true);
    assert.equal(imageBuildNeeded(["style: tint the rule"]), true);
    assert.equal(imageBuildNeeded([]), true);
  });
});
