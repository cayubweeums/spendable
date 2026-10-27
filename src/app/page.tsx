import { saveSettings } from "./actions";
import { Flash } from "@/components/flash";
import { PaceChart, paceCaption } from "@/components/pace-chart";
import { formatLong, formatTimestamp } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { getSettings, getSnapshot } from "@/core/service";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const snapshot = getSnapshot();
  const settings = getSettings();
  const money = (cents: number) => formatMoney(cents, snapshot.currency);
  const stamps = [...snapshot.deposits.map((account) => account.balanceDate), ...snapshot.debts.map((account) => account.balanceDate)];
  const asOf = stamps.length > 0 ? Math.max(...stamps) : null;
  const empty = snapshot.deposits.length === 0 && snapshot.debts.length === 0;

  return (
    <>
      <Flash error={query.error} notice={query.notice} />
      {snapshot.demo ? (
        <p className="banner">
          Sample numbers, so you can see the shape of the answer. <a href="/bank">Connect a bank</a> when you want yours.
        </p>
      ) : null}
      {snapshot.syncErrors.length > 0 ? (
        <ul className="errors">
          {snapshot.syncErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <div className="layout">
        <section>
          <h1 className="question">{snapshot.question}</h1>
          <p className={snapshot.spendableCents < 0 ? "figure short" : "figure"}>{money(snapshot.spendableCents)}</p>
          <p className="allowance">
            {snapshot.spendableCents < 0
              ? `Short ${money(-snapshot.spendableCents)} before ${formatLong(snapshot.nextPayday)}.`
              : `${money(snapshot.perDayCents)} a day until ${formatLong(snapshot.nextPayday)}.`}
          </p>
          {empty ? (
            <p className="principle">
              No balances are copied yet. Connect SimpleFIN, or load the sample from the bank page.
            </p>
          ) : (
            <ol className="receipt">
              {snapshot.receipt.lines.map((line, index) => (
                <li key={`${line.kind}-${line.label}-${index}`} className={line.kind === "sub" ? "sub" : undefined}>
                  <span>{line.label}</span>
                  <span className="amount">{money(line.cents)}</span>
                  <span className="detail">{line.detail}</span>
                </li>
              ))}
              <li className="total">
                <span>{snapshot.spendableCents < 0 ? "Short" : "You can spend"}</span>
                <span className="amount">{money(snapshot.spendableCents)}</span>
              </li>
            </ol>
          )}
          <p className="principle">
            Balances are copied from the bank. Bills, the card payment, and the buffer sit underneath them.
          </p>
        </section>

        <aside className="bank-col">
          <p className="kicker">{asOf ? `As of ${formatTimestamp(asOf)}` : "Bank"}</p>
          <h2>What the bank says</h2>
          <ul className="bank-list">
            {snapshot.deposits.map((account) => (
              <li key={account.id}>
                <p className="name">{account.name}</p>
                <p className="org">
                  {account.orgName} · {account.role === "spend" ? "Spend from this" : "Set aside"}
                </p>
                <p className="balance">{money(account.ledgerCents)}</p>
                {account.availableCents != null && account.availableCents !== account.ledgerCents ? (
                  <p className="meta">Available {money(account.availableCents)}</p>
                ) : null}
              </li>
            ))}
            {snapshot.debts.map((account) => (
              <li key={account.id}>
                <p className="name">{account.name}</p>
                <p className="org">{account.orgName} · Owed</p>
                <p className="balance">{money(account.owedCents)}</p>
              </li>
            ))}
          </ul>
          <p className="totals">
            Ledger on deposit
            <strong>{money(snapshot.depositsCents)}</strong>
            Owed on cards
            <strong>{money(snapshot.owedCents)}</strong>
          </p>
        </aside>
      </div>

      <section className="section">
        <p className="kicker">Since {formatLong(snapshot.previousPayday)}</p>
        <h2>What already left</h2>
        <p>{paceCaption(snapshot)} Unpaid bills stay in the receipt above.</p>
        <PaceChart snapshot={snapshot} />
        <p className="legend">
          <span>
            <i className="swatch" /> This cycle
          </span>
          <span>
            <i className="swatch last" /> Last cycle
          </span>
        </p>
      </section>

      <section className="section">
        <h2>Latest activity</h2>
        <table className="ledger">
          <thead>
            <tr>
              <th>When</th>
              <th>Description</th>
              <th className="hide-sm">Account</th>
              <th className="hide-sm">Label</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.recent.map((txn) => (
              <tr key={txn.id}>
                <td>{txn.pending ? "Pending" : txn.posted ? formatLong(txn.posted) : "Pending"}</td>
                <td>{txn.description}</td>
                <td className="hide-sm">{txn.accountName}</td>
                <td className="hide-sm">{txn.category ?? ""}</td>
                <td className={txn.amountCents < 0 ? "num out" : "num"}>{formatMoney(txn.amountCents, txn.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="section">
        <h2>Payday and buffer</h2>
        <p className="page-intro">
          These decide which bills count and how much you want left alone. They do not rewrite a balance.
        </p>
        <form action={saveSettings} className="stack">
          <div className="row">
            <label>
              How often you get paid
              <select name="frequency" defaultValue={settings.paydayFrequency}>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label>
              A payday you remember
              <input type="date" name="anchor" defaultValue={settings.paydayAnchor} required />
            </label>
            <label>
              Buffer to leave untouched
              <input name="buffer" inputMode="decimal" defaultValue={(settings.bufferCents / 100).toFixed(2)} />
            </label>
          </div>
          <button type="submit">Update the answer</button>
        </form>
      </section>
    </>
  );
}
