import { saveSettings, saveTransaction } from "../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { PaceChart, paceCaption } from "@/components/pace-chart";
import { SubmitButton } from "@/components/submit-button";
import { formatLong, formatTimestamp, ordinal } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { kindLabel } from "@/core/bank";
import { matchingRule } from "@/core/rules";
import { getSettings, getSnapshot, listBills, listCategories, listPayees, listRules } from "@/core/service";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const snapshot = getSnapshot();
  const settings = getSettings();
  const rules = listRules();
  const bills = listBills();
  const categoryNames = listCategories()
    .filter((category) => !category.hidden)
    .map((category) => category.name);
  const payeeName = new Map(listPayees().flatMap((payee) => payee.descriptions.map((description) => [description, payee.name] as const)));
  const money = (cents: number) => formatMoney(cents, snapshot.currency);
  const stamps = [...snapshot.deposits.map((account) => account.balanceDate), ...snapshot.debts.map((account) => account.balanceDate)];
  const asOf = stamps.length > 0 ? Math.max(...stamps) : null;
  const empty = snapshot.deposits.length === 0 && snapshot.debts.length === 0;

  return (
    <>
      <ReadFlash notice={query.notice} />
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
        <section className="sum">
          <h1 className="question">{snapshot.question}</h1>
          {empty ? (
            <p className="principle">
              No balances are copied yet. Connect SimpleFIN, or load the sample from the bank page.
            </p>
          ) : (
            <ol className="receipt">
              {snapshot.receipt.lines.map((line, index) => (
                <li key={`${line.kind}-${line.label}-${index}`} className={line.kind === "sub" ? "sub" : undefined}>
                  <span className="label">
                    {line.label}
                    <small>{line.detail}</small>
                  </span>
                  <span className="amount">{money(line.cents)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className={snapshot.spendableCents < 0 ? "figure short" : "figure"}>
            <span className="sr">{snapshot.spendableCents < 0 ? "Short " : "You can spend "}</span>
            {money(snapshot.spendableCents)}
          </p>
          <p className="allowance">
            {snapshot.spendableCents < 0
              ? `Short ${money(-snapshot.spendableCents)} before ${formatLong(snapshot.nextPayday)}.`
              : `${money(snapshot.perDayCents)} a day until ${formatLong(snapshot.nextPayday)}.`}
          </p>
          <p className="principle">Balances are copied from the bank. Nothing here changes them.</p>
        </section>

        <div className="lists">
          <section>
            <h2 className="kicker">Accounts</h2>
            <ul className="rows">
              {snapshot.deposits.map((account) => (
                <li key={account.id}>
                  <span>
                    {account.name} <span className="quiet-note">{account.orgName}</span>
                    {account.note ? <small>{account.note}</small> : null}
                    {account.availableCents != null && account.availableCents !== account.ledgerCents ? (
                      <small>Available {money(account.availableCents)}</small>
                    ) : null}
                  </span>
                  <span className="quiet-note">{kindLabel(account.kind)}</span>
                  <span className="num">{money(account.ledgerCents)}</span>
                </li>
              ))}
              {snapshot.debts.map((account) => (
                <li key={account.id}>
                  <span>
                    {account.name} <span className="quiet-note">{account.orgName}</span>
                    {account.note ? <small>{account.note}</small> : null}
                  </span>
                  <span className="quiet-note">Owed</span>
                  <span className="num">{money(account.owedCents)}</span>
                </li>
              ))}
            </ul>
            <p className="totals">
              <span>On deposit <strong>{money(snapshot.depositsCents)}</strong></span>
              <span>Owed on cards <strong>{money(snapshot.owedCents)}</strong></span>
              <span>{asOf ? `As of ${formatTimestamp(asOf)}` : null}</span>
            </p>
          </section>

          <section>
            <h2 className="kicker">Charges</h2>
            <datalist id="categories">
              {categoryNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <table className="ledger">
              <thead className="sr">
                <tr>
                  <th>Charge</th>
                  <th>Account</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recent.map((txn) => {
                  const rule = matchingRule(txn.description, rules);
                  const bill = bills.find(
                    (item) =>
                      item.active && item.matchText && txn.description.toLowerCase().includes(item.matchText.toLowerCase()),
                  );
                  return (
                    <tr key={txn.id}>
                      <td>
                        {payeeName.get(txn.description) ?? txn.description}
                        <span className="quiet-note">
                          {" "}
                          {txn.pending ? "pending" : txn.posted ? formatLong(txn.posted) : "pending"}
                          {txn.category ? ` · ${txn.category}` : null}
                          {txn.note ? ` · ${txn.note}` : null}
                          {txn.tags.length ? ` · ${txn.tags.join(", ")}` : null}
                          {txn.cleared ? " · cleared" : null}
                          {bill ? " · monthly" : null}
                        </span>
                        <details className="txn-more" suppressHydrationWarning>
                          <summary>{rule || bill ? "Edit rule" : "Set category"}</summary>
                          <form action={saveTransaction}>
                            <input type="hidden" name="id" value={txn.id} />
                            <label>
                              Category
                              <input name="category" list="categories" defaultValue={txn.category ?? ""} maxLength={40} />
                            </label>
                            <label>
                              Note
                              <input name="note" defaultValue={txn.note ?? ""} maxLength={280} />
                            </label>
                            <label>
                              Tags
                              <input name="tags" defaultValue={txn.tags.join(", ")} maxLength={200} />
                            </label>
                            <label>
                              Description contains
                              <input name="contains" defaultValue={rule?.contains ?? txn.description.slice(0, 80)} maxLength={80} />
                            </label>
                            <label className="check">
                              <input type="checkbox" name="remember" value="1" defaultChecked={Boolean(rule)} />
                              Use this category next time
                            </label>
                            {txn.amountCents < 0 ? (
                              <>
                                <input type="hidden" name="billable" value="1" />
                                <label className="check">
                                  <input type="checkbox" name="recurring" value="1" defaultChecked={Boolean(bill)} />
                                  Count it as a monthly bill
                                </label>
                              </>
                            ) : null}
                            <PendingNote>Saving this charge.</PendingNote>
                            <SubmitButton pending="Saving…">Save</SubmitButton>
                          </form>
                        </details>
                      </td>
                      <td className="hide-sm quiet-note">{txn.accountName}</td>
                      <td className={txn.amountCents < 0 ? "num out" : "num"}>{formatMoney(txn.amountCents, txn.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="principle">A charge that already posted this pay period is not held twice.</p>
          </section>

          <section>
            <h2 className="kicker">Bills</h2>
            <ul className="rows">
              {bills
                .filter((bill) => bill.active)
                .map((bill) => (
                  <li key={bill.id}>
                    <span>{bill.name}</span>
                    <span className="quiet-note">{ordinal(bill.dueDay)}</span>
                    <span className="num">{money(bill.amountCents)}</span>
                  </li>
                ))}
            </ul>
            <p className="principle">
              <a href="/bills">See them by day</a>
            </p>
          </section>
        </div>
      </div>

      <section className="section">
        <p className="kicker">Since {formatLong(snapshot.previousPayday)}</p>
        <h2>What already left</h2>
        <p>{paceCaption(snapshot)} Unpaid bills stay in the sum above.</p>
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
        <h2>Payday and buffer</h2>
        <p className="page-intro">These pick which bills count. They do not change a balance.</p>
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
          <PendingNote>Updating the answer.</PendingNote>
          <SubmitButton pending="Updating…">Update the answer</SubmitButton>
        </form>
      </section>
    </>
  );
}
