# spendable

Spendable copies balances from SimpleFIN and shows how much you can spend right now. The copied balances stay as the bank reported them.

## Quick start

Save this as `docker-compose.yml`:

```yaml
services:
  spendable:
    image: ghcr.io/cayubweeums/spendable:latest
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - spendable-data:/app/data
    restart: unless-stopped

volumes:
  spendable-data:
```

```bash
docker compose up -d
```

Open http://127.0.0.1:3000.

## Planned features

Checked items are in the app. The rest are not built yet, and they are listed in the order to build them.

- [x] Copy balances from SimpleFIN
- [x] Show how much can be spent right now without rewriting bank balances
- [x] Choose which accounts to follow and set account type
- [x] Category rules for later transactions
- [x] Monthly bills that stay on until turned off
- [x] Show those bills on a calendar through the next payday
- [x] Compare this pay cycle with the last one
- [x] Docker install
- [x] Require a password before the app opens
- [x] Encrypt the data with the login password, and decrypt it after login. The server does not keep that key.
- [ ] Download a zip of the server data, and import that zip later
- [ ] Turn bank sync on or off, and choose how often it runs and when
- [ ] Rename an account and keep a note on it
- [ ] Categories, with groups, rename, merge, delete, hide, and notes
- [ ] Payees: rename, merge, favorite, and a default category
- [ ] Notes on transactions, categories, and accounts
- [ ] Tags on transactions. A tag is only a label. A rule can set one.
- [ ] Rules that match imported payee, payee, account, category, date, notes, amount, or tag, then set category, payee, notes, or tag. Rules run in order, before and after import.
- [ ] Saving a category or payee can create a rule for the next import. That can be turned off.
- [ ] A rule action can fill notes, date, amount, payee, or cleared status from the transaction
- [ ] Split one transaction across categories
- [ ] Undo an edit
- [ ] Filters that stack, and that you can save
- [ ] Edit or duplicate several transactions at once
- [ ] Merge two duplicate transactions and keep the fields that were filled in
- [ ] Projected income, savings, and expenses on a repeating date. They count in the spendable number until a bank transaction matches the rule for that projection. Then they count as actual, and the bank figure stays the bank figure.
- [ ] Show how far under or over the month landed against the spendable number. That display does not change the number. It is there so most of the amount can stay unspent.
- [ ] Reset sync: drop the copied transactions and balances, pull them again from the bank, and run the rules again. Rules and settings stay.
- [ ] Reports for a calendar of income and expenses, spending over a period, a summary total, net worth, and cash flow
- [ ] Hide amounts on screen
- [ ] Date format, number format, first day of the week, and hiding cents
- [ ] Export transactions as CSV
- [ ] Import QIF, OFX, QFX, and CSV, including column mapping, date format, and sign
- [ ] Skip a transaction that is already imported, and use the bank date when a hand-entered one matches
- [ ] Import a YNAB4 or nYNAB file
- [ ] The first user is the admin. Later accounts come from that admin, or from sign-up when the container allows it. A new account starts with a temporary password and must set a new one before it continues. Each user sees only their own data, encrypted with the password they set.
- [ ] A layout that fits a phone
- [ ] An MCP server that can do everything the app can do. It calls the same actions the app calls, and it does not keep a second copy of the rules.
