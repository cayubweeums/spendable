# spendable

A personal answer to “how much money can I spend right now?”

Balances are copied from your bank through [SimpleFIN](https://www.simplefin.org/protocol.html). The number on the home page is that cash, minus bills due before payday, minus a card payment you opted into, minus a buffer you set. Categories are labels on transactions. None of those views replace the copied balance.

The safe-to-spend layout takes its cue from [giorobert88/financial-dashboard](https://github.com/giorobert88/financial-dashboard): cash in accounts you spend from, obligations before the next payday, and a comparison against last cycle’s outflows.

## Run

```bash
npm install
npm test
npm run dev
```

`npm test` prints every test, how long it took, and a failure with its stack when one breaks. Open http://127.0.0.1:3000. The first launch loads sample numbers so the receipt is visible before a bank is connected.

The dev server listens on localhost only. The SimpleFIN access URL is a secret and lives in `data/spendable.db`, which git ignores.

## Docker

```bash
docker compose up --build
```

The image listens on port 3000 inside the container. Compose publishes that port on `127.0.0.1` only. The database is the `spendable-data` volume, mounted at `/app/data`.

## GitHub

A pull request into `main` has to pass two checks before it can merge:

- `verify` runs the test suite and the typecheck
- `image-builds` builds the container and does not push it

A merge to `main` runs `verify` again. When that passes, `publish-image` builds the same container and pushes it to GitHub Container Registry:

- `ghcr.io/<owner>/spendable:latest`
- `ghcr.io/<owner>/spendable:<commit sha>`

## Connect a bank

1. Create a setup token at https://bridge.simplefin.org/simplefin/create
2. Paste it on the Bank page.

A token can be claimed once. For a fake bank, the [SimpleFIN developer page](https://beta-bridge.simplefin.org/info/developers) prints a demo token. Sync copies balances and transactions. SimpleFIN asks apps to stay around 24 account requests a day, and 90 days of history at a time. This app syncs only when you ask it to.

If a claim or a later request is refused with 403, create a new token. If you did not use the old one, disable it at the bridge.

## The answer

Spend-from accounts contribute their available balance when the bank sends one. Otherwise the ledger balance is used, with pending debits taken off. Pending debits are not taken off a second time when an available balance is already present.

Savings stay visible and out of the total until you mark them “spend from this.” A credit card balance is money owed. It is subtracted only when you set a due day and choose to hold the full balance or a minimum, and that day falls before payday.

## Later: an agent API

`GET /api/v1` lists the HTTP contract. `GET /api/v1/snapshot` is the answer, in integer cents, with every subtraction. A future MCP server should call these routes, or import `src/core/service.ts`, and should not invent a second way to compute balances. Account balances change when a sync copies them from SimpleFIN.
