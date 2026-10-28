import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { cookieValue, gateDecision } from "../src/core/gate";
import { SpendableError } from "../src/core/errors";
import { passwordMatches } from "../src/core/password";

const dir = mkdtempSync(path.join(tmpdir(), "spendable-password-"));
const dbPath = path.join(dir, "spendable.db");
process.env.SPENDABLE_DB_PATH = dbPath;

type Service = typeof import("../src/core/service");
type Store = typeof import("../src/core/db");
type Http = typeof import("../src/core/http");
let service: Service;
let store: Store;
let http: Http;

const password = "correct-horse";

describe("password gate", { concurrency: 1 }, () => {
  before(async () => {
    process.env.SPENDABLE_DB_PATH = dbPath;
    service = await import("../src/core/service");
    store = await import("../src/core/db");
    http = await import("../src/core/http");
    service.closeDb();
  });

  after(() => {
    service.closeDb();
    rmSync(dir, { recursive: true, force: true });
  });

  it("does not open the ledger while asking for a password", async () => {
    assert.equal(service.passwordIsSet(), false);
    assert.equal(store.getMeta("initialized"), "");
    assert.equal(gateDecision({ pathname: "/", method: "GET", signedIn: false, passwordSet: false }), "onboarding");
    assert.equal(gateDecision({ pathname: "/onboarding", method: "POST", signedIn: false, passwordSet: false }), "next");
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../src/proxy");
    const first = proxy(new NextRequest("http://127.0.0.1:3000/"));
    assert.equal(new URL(first.headers.get("location") ?? "", "http://127.0.0.1:3000").pathname, "/onboarding");
  });

  it("rejects a short password and a mismatch without saving either", () => {
    assert.throws(() => service.establishPassword("short", "short"), /8 to 128/);
    assert.throws(() => service.establishPassword(password, "different-one"), /do not match/);
    assert.equal(service.passwordIsSet(), false);
    assert.equal(store.getMeta("password_hash").includes(password), false);
  });

  it("stores a hash, opens a session, and rejects the wrong password", () => {
    const token = service.establishPassword(password, password);
    assert.equal(service.passwordIsSet(), true);
    assert.equal(store.getMeta("password_hash").includes(password), false);
    assert.equal(passwordMatches(password, store.getMeta("password_hash")), true);
    assert.equal(passwordMatches("wrong-password", store.getMeta("password_hash")), false);
    assert.equal(service.sessionIsOpen(token), true);
    assert.throws(
      () => service.signIn("wrong-password"),
      (error: unknown) => error instanceof SpendableError && error.status === 401,
    );
    assert.throws(() => service.establishPassword(password, password), /already set/);
    const again = service.signIn(password);
    assert.equal(service.sessionIsOpen(again), true);
    assert.equal(service.sessionIsOpen(token, Date.now() + 31 * 24 * 60 * 60 * 1000), false);
    service.closeSession(again);
    assert.equal(service.sessionIsOpen(again), false);
  });

  it("blocks the API until the cookie matches an open session", async () => {
    let called = false;
    const denied = await http.guard(new Request("http://local/api/v1/snapshot"), () => {
      called = true;
      return { ok: true };
    });
    assert.equal(denied.status, 401);
    assert.equal(called, false);
    const token = service.signIn(password);
    const allowed = await http.guard(
      new Request("http://local/api/v1/snapshot", { headers: { cookie: `other=1; spendable_session=${token}` } }),
      () => ({ ok: true }),
    );
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true });
  });

  it("sends pages to login and APIs to 401, and leaves sign-in open", async () => {
    assert.equal(gateDecision({ pathname: "/", method: "GET", signedIn: false, passwordSet: true }), "login");
    assert.equal(gateDecision({ pathname: "/onboarding", method: "GET", signedIn: false, passwordSet: true }), "login");
    assert.equal(gateDecision({ pathname: "/api/v1/snapshot", method: "GET", signedIn: false, passwordSet: true }), "unauthorized");
    assert.equal(gateDecision({ pathname: "/login", method: "POST", signedIn: false, passwordSet: true }), "next");
    assert.equal(gateDecision({ pathname: "/icon", method: "GET", signedIn: false, passwordSet: false }), "next");
    assert.equal(gateDecision({ pathname: "/api/v1/session", method: "POST", signedIn: false, passwordSet: false }), "next");
    assert.equal(gateDecision({ pathname: "/api/mcp", method: "POST", signedIn: false, passwordSet: true }), "next");
    assert.equal(gateDecision({ pathname: "/api/mcp", method: "GET", signedIn: false, passwordSet: true }), "unauthorized");
    assert.equal(gateDecision({ pathname: "/api/mcp", method: "POST", signedIn: true, passwordSet: true, mustChange: true }), "unauthorized");
    assert.equal(gateDecision({ pathname: "/api/v1/flash", method: "DELETE", signedIn: false, passwordSet: false }), "next");
    assert.equal(gateDecision({ pathname: "/api/v1/snapshot", method: "GET", signedIn: true, passwordSet: true }), "next");
    assert.equal(cookieValue("spendable_session=abc%3D; theme=dark", "spendable_session"), "abc=");

    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../src/proxy");
    const stranger = proxy(new NextRequest("http://127.0.0.1:3000/accounts"));
    assert.equal(stranger.status, 307);
    assert.equal(new URL(stranger.headers.get("location") ?? "", "http://127.0.0.1:3000").pathname, "/login");
    const api = proxy(new NextRequest("http://127.0.0.1:3000/api/v1/snapshot"));
    assert.equal(api.status, 401);
    assert.deepEqual(await api.json(), { error: { code: "unauthorized", message: "Sign in first." } });
    const token = service.signIn(password);
    const open = proxy(
      new NextRequest("http://127.0.0.1:3000/", { headers: { cookie: `spendable_session=${token}` } }),
    );
    assert.equal(open.headers.get("location"), null);
    assert.notEqual(open.status, 401);
  });
});
