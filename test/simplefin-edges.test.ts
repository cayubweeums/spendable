import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SpendableError } from "../src/core/errors";
import { accountsRequest, claimAccessUrl, decodeSetupToken, fetchAccountSet, mapAccountSet } from "../src/core/simplefin";

function tokenFor(url: string): string {
  return Buffer.from(url).toString("base64url");
}

describe("setup tokens", () => {
  it("accepts base64url tokens and ignores surrounding space", () => {
    const token = `  ${tokenFor("https://bridge.example/claim/once")}  `;
    assert.equal(decodeSetupToken(token), "https://bridge.example/claim/once");
  });

  it("rejects an empty token, a plain URL, and an http claim", () => {
    assert.throws(() => decodeSetupToken("   "), (error: unknown) => error instanceof SpendableError && error.code === "bad_token");
    assert.throws(() => decodeSetupToken(Buffer.from("not a url").toString("base64")), /https/);
    assert.throws(() => decodeSetupToken(Buffer.from("http://bridge.example/claim/x").toString("base64")), /https/);
  });
});

describe("access URLs", () => {
  it("builds an accounts URL that does not carry the password", () => {
    const request = accountsRequest("https://user:p%40ss@bridge.example/simplefin/", {
      "start-date": "10",
      pending: "1",
      version: "2",
    });
    assert.equal(request.url.includes("p%40ss"), false);
    assert.equal(request.url.includes("user"), false);
    assert.equal(request.url, "https://bridge.example/simplefin/accounts?start-date=10&pending=1&version=2");
    assert.match(request.authorization, /^Basic /);
    assert.equal(Buffer.from(request.authorization.slice(6), "base64").toString("utf8"), "user:p@ss");
  });

  it("rejects http and missing credentials", () => {
    assert.throws(() => accountsRequest("http://user:pw@example.com/simplefin", {}), /https/);
    assert.throws(() => accountsRequest("https://example.com/simplefin", {}), /credentials/);
    assert.throws(() => accountsRequest("not a url", {}), /access URL/);
  });
});

describe("account payloads", () => {
  it("keeps transaction ids unique per account and reads pending plus available balance", () => {
    const mapped = mapAccountSet({
      errlist: [],
      connections: [{ conn_id: "CON", org_name: "Northwind" }],
      accounts: [
        {
          id: "chk",
          name: "Checking",
          conn_id: "CON",
          currency: "USD",
          balance: "20.00",
          "available-balance": "18.50",
          "balance-date": 50,
          transactions: [
            { id: "same", posted: 40, amount: "-1.25", description: "Coffee", pending: false },
            { id: "hold", posted: 0, amount: "-1.50", description: "Hold", pending: true },
          ],
        },
      ],
    });
    const account = mapped.accounts[0];
    assert.equal(account?.balanceCents, 2000);
    assert.equal(account?.availableCents, 1850);
    assert.equal(account?.transactions[1]?.pending, true);
    assert.equal(account?.transactions[1]?.posted, 0);
    assert.equal(account?.transactions[0]?.id, "CON:chk:same");
  });

  it("strips markup from bank errors and skips an account with no balance", () => {
    const mapped = mapAccountSet({
      errlist: [{ msg: "<script>alert(1)</script> Try again" }],
      errors: ["  extra   warning  "],
      accounts: [{ id: "x", name: "Broken", conn_id: "CON" }],
    });
    assert.deepEqual(mapped.accounts, []);
    assert.equal(mapped.errors[0], "alert(1) Try again");
    assert.equal(mapped.errors[1], "extra warning");
    assert.match(mapped.errors.at(-1) ?? "", /skipped/);
  });

  it("caps a very long bank message", () => {
    const mapped = mapAccountSet({
      errlist: [{ msg: "x".repeat(500) }],
      accounts: [],
    });
    assert.equal(mapped.errors[0]?.length, 280);
  });

  it("rejects a payload that is not an account set", () => {
    assert.throws(() => mapAccountSet(null), (error: unknown) => error instanceof SpendableError && error.code === "bad_payload");
    assert.throws(() => mapAccountSet({ errlist: [] }), /unexpected/);
  });
});

describe("claiming and fetching", () => {
  const token = tokenFor("https://bridge.example/claim/once");

  it("tells the user when the bridge refuses a token", async () => {
    await assert.rejects(
      () => claimAccessUrl(token, async () => new Response("used", { status: 403 })),
      (error: unknown) => error instanceof SpendableError && error.code === "claim_rejected" && error.status === 403,
    );
  });

  it("stores an access URL only after it has credentials", async () => {
    const access = await claimAccessUrl(token, async () => new Response("https://ada:secret@bridge.example/simplefin"));
    assert.equal(access, "https://ada:secret@bridge.example/simplefin");
    await assert.rejects(
      () => claimAccessUrl(token, async () => new Response("https://bridge.example/simplefin")),
      /credentials/,
    );
  });

  it("reports a network failure without the claim URL", async () => {
    await assert.rejects(
      () =>
        claimAccessUrl(token, async () => {
          throw new Error("https://ada:secret@bridge.example/claim/once down");
        }),
      (error: unknown) => error instanceof SpendableError && error.code === "claim_unreachable" && !error.message.includes("secret"),
    );
  });

  it("surfaces a revoked access URL and a non-JSON body", async () => {
    await assert.rejects(
      () => fetchAccountSet("https://ada:secret@bridge.example/simplefin", 10, async () => new Response("no", { status: 403 })),
      (error: unknown) => error instanceof SpendableError && error.code === "bank_auth",
    );
    await assert.rejects(
      () =>
        fetchAccountSet("https://ada:secret@bridge.example/simplefin", 10, async () => new Response("nope", { status: 200 })),
      /not JSON/,
    );
  });

  it("asks for pending transactions inside a version 2 window", async () => {
    let seen = "";
    await fetchAccountSet("https://ada:secret@bridge.example/simplefin", 1700000000, async (url) => {
      seen = String(url);
      return Response.json({ errlist: [], accounts: [] });
    });
    assert.match(seen, /start-date=1700000000/);
    assert.match(seen, /pending=1/);
    assert.match(seen, /version=2/);
    assert.equal(seen.includes("secret"), false);
  });
});
