import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apiContract } from "../src/core/contract";
import { SpendableError, publicErrorMessage, scrubSecrets } from "../src/core/errors";
import { handle, readJson } from "../src/core/http";
import { sanitizeBankMessage, sanitizeLabel } from "../src/core/sanitize";

describe("errors shown to a person", () => {
  it("keeps a known message and hides an unknown failure", () => {
    const error = new SpendableError("SimpleFIN refused that token.", "claim_rejected", 403);
    assert.equal(error.name, "SpendableError");
    assert.equal(publicErrorMessage(error), "SimpleFIN refused that token.");
    assert.equal(publicErrorMessage(new Error("https://user:pw@bank.example/secret")), "Could not reach the bank connection.");
  });

  it("removes userinfo from a logged URL", () => {
    const scrubbed = scrubSecrets("fetch failed https://ada:secret@bridge.example/simplefin/accounts more");
    assert.equal(scrubbed.includes("secret"), false);
    assert.match(scrubbed, /https:\/\/bridge\.example\/simplefin\/accounts/);
  });
});

describe("text copied from the bank", () => {
  it("drops tags and control characters, then caps the length", () => {
    assert.equal(sanitizeBankMessage("  <b>Hi</b>\nthere  "), "Hi there");
    assert.equal(sanitizeBankMessage("y".repeat(400)).length, 280);
    assert.equal(sanitizeLabel("  Rent\nbill  ", 8), "Rent bil");
  });
});

describe("HTTP helpers", () => {
  it("reads a JSON object and rejects anything else", async () => {
    assert.deepEqual(await readJson(new Request("http://local", { method: "POST", body: '{"a":1}' })), { a: 1 });
    await assert.rejects(() => readJson(new Request("http://local", { method: "POST", body: "[]" })), /JSON object/);
    await assert.rejects(() => readJson(new Request("http://local", { method: "POST", body: "nope" })), /JSON object/);
  });

  it("returns the value, a coded error, or a generic 500", async () => {
    const ok = await handle(() => ({ spendableCents: 1 }));
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { spendableCents: 1 });

    const coded = await handle(() => {
      throw new SpendableError("No bill with that id.", "not_found", 404);
    });
    assert.equal(coded.status, 404);
    assert.deepEqual(await coded.json(), { error: { code: "not_found", message: "No bill with that id." } });

    const generic = await handle(() => {
      throw new Error("https://ada:secret@bridge.example broke");
    });
    assert.equal(generic.status, 500);
    assert.deepEqual(await generic.json(), { error: { code: "internal", message: "Something went wrong." } });
  });
});

describe("the agent contract", () => {
  it("exposes the snapshot and never a route that returns the access URL", () => {
    const paths = apiContract.routes.map((route) => `${route.method} ${route.path}`);
    assert.ok(paths.includes("GET /api/v1/snapshot"));
    assert.ok(paths.includes("POST /api/v1/sync"));
    assert.equal(paths.some((path) => path.toLowerCase().includes("access")), false);
    assert.match(apiContract.principle, /never write account balances/);
  });
});
