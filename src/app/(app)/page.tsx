import { addFilter, batchCharges, dropFilter, forgetFilter, keepFilter, saveSettings, saveTransaction, undoTransaction } from "../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { PaceChart, paceCaption } from "@/components/pace-chart";
import { SubmitButton } from "@/components/submit-button";
import { postedToISO, formatLong, formatTimestamp, ordinal } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { accountTitle, kindLabel } from "@/core/bank";
import { matchingRule, RULE_OPS } from "@/core/rules";
import {
  canUndo,
  decodeFilter,
  encodeFilter,
  FILTER_FIELDS,
  getSettings,
  getSnapshot,
  listAccounts,
  listBills,
  listCategories,
  listPayees,
  listRules,
  listSavedFilters,
  listTransactions,
  readSavedFilter,
  type ChargeFilter,
} from "@/core/service";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; name?: string; c?: string | string[] }>;
}) {
  const query = await searchParams;
  const named = typeof query.name === "string" ? query.name : "";
  const edited = query.c != null;
  const fromQuery = (edited ? (Array.isArray(query.c) ? query.c : [query.c]) : []).flatMap((item) => {
    const filter = item ? decodeFilter(item) : null;
    return filter ? [filter] : [];
  });
  const conditions: ChargeFilter[] = edited ? fromQuery : named ? readSavedFilter(named) : [];
  const saved = listSavedFilters();
  const snapshot = getSnapshot();
  const settings = getSettings();
  const rules = listRules();
  const bills = listBills();
  const categoryNames = listCategories()
    .filter((category) => !category.hidden)
    .map((category) => category.name);
  const payeeName = new Map(listPayees().flatMap((payee) => payee.descriptions.map((description) => [description, payee.name] as const)));
  const accountById = new Map(listAccounts().map((account) => [account.id, account]));
  const charges = conditions.length
    ? listTransactions(undefined, conditions)
        .sort((a, b) => b.posted - a.posted || a.description.localeCompare(b.description))
        .map((txn) => {
          const account = accountById.get(txn.accountId);
          return {
            id: txn.id,
            posted: postedToISO(txn.posted),
            description: txn.description,
            amountCents: txn.amountCents,
            accountName: account ? accountTitle(account) : "Account",
            pending: txn.pending,
            category: txn.category,
            note: txn.note ?? "",
            tags: txn.tags ?? [],
            cleared: txn.cleared === true,
            splits: txn.splits ?? [],
            currency: account?.currency ?? snapshot.currency,
          };
        })
    : snapshot.recent;
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
            <div className="charge-head">
              <h2 className="kicker">Charges</h2>
              {canUndo() ? (
                <form action={undoTransaction}>
                  <button className="quiet" type="submit">
                    Undo
                  </button>
                </form>
              ) : null}
            </div>
            {conditions.length > 0 ? (
              <div className="filter-line">
                {conditions.map((filter, index) => (
                  <form action={dropFilter} key={`${encodeFilter(filter)}-${index}`}>
                    {named ? <input type="hidden" name="name" value={named} /> : null}
                    {conditions.map((item, itemIndex) => (
                      <input key={itemIndex} type="hidden" name="c" value={encodeFilter(item)} />
                    ))}
                    <input type="hidden" name="index" value={index} />
                    <span>
                      {FILTER_FIELDS.find(([id]) => id === filter.field)?.[1]} {filter.op} {filter.value}
                    </span>
                    <button className="quiet" type="submit">
                      Remove
                    </button>
                  </form>
                ))}
              </div>
            ) : null}
            <form action={addFilter} className="row">
              {named ? <input type="hidden" name="name" value={named} /> : null}
              {conditions.map((filter, index) => (
                <input key={index} type="hidden" name="c" value={encodeFilter(filter)} />
              ))}
              <label>
                Field
                <select name="field" defaultValue="category">
                  {FILTER_FIELDS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Op
                <select name="op" defaultValue="is">
                  {RULE_OPS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Value
                <input name="value" maxLength={180} required />
              </label>
              <SubmitButton pending="Adding…">Add</SubmitButton>
            </form>
            {conditions.length > 0 ? (
              <form action={keepFilter} className="row">
                {conditions.map((filter, index) => (
                  <input key={index} type="hidden" name="c" value={encodeFilter(filter)} />
                ))}
                <label>
                  Name
                  <input name="name" defaultValue={named} maxLength={40} required />
                </label>
                <SubmitButton pending="Saving…">Save</SubmitButton>
                {named && saved.some((filter) => filter.name === named) ? (
                  <button className="quiet" form="forget-filter" type="submit">
                    Delete
                  </button>
                ) : null}
              </form>
            ) : null}
            {named && saved.some((filter) => filter.name === named) ? (
              <form id="forget-filter" action={forgetFilter}>
                <input type="hidden" name="name" value={named} />
              </form>
            ) : null}
            {saved.length > 0 ? (
              <p className="filter-saved">
                {saved.map((filter) => (
                  <a key={filter.name} href={`/?name=${encodeURIComponent(filter.name)}`} aria-current={filter.name === named ? "page" : undefined}>
                    {filter.name}
                  </a>
                ))}
              </p>
            ) : null}
            <form id="batch" action={batchCharges} className="row">
              {named ? <input type="hidden" name="name" value={named} /> : null}
              {conditions.map((filter, index) => (
                <input key={index} type="hidden" name="c" value={encodeFilter(filter)} />
              ))}
              <label>
                Category
                <input name="category" list="categories" maxLength={40} />
              </label>
              <SubmitButton pending="Saving…">Apply</SubmitButton>
              <button className="quiet" name="intent" value="copy" type="submit">
                Copy
              </button>
            </form>
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
                {charges.map((txn) => {
                  const rule = matchingRule(txn.description, rules);
                  const bill = bills.find(
                    (item) =>
                      item.active && item.matchText && txn.description.toLowerCase().includes(item.matchText.toLowerCase()),
                  );
                  return (
                    <tr key={txn.id}>
                      <td>
                        <input
                          type="checkbox"
                          name="id"
                          value={txn.id}
                          form="batch"
                          aria-label={`Select ${payeeName.get(txn.description) ?? txn.description}`}
                        />
                        {payeeName.get(txn.description) ?? txn.description}
                        <span className="quiet-note">
                          {" "}
                          {txn.pending ? "pending" : txn.posted ? formatLong(txn.posted) : "pending"}
                          {txn.splits.length
                            ? txn.splits.map((part) => ` · ${part.category} ${formatMoney(part.amountCents, txn.currency)}`)
                            : txn.category
                              ? ` · ${txn.category}`
                              : null}
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
                            {Array.from({ length: Math.max(txn.splits.length + (txn.splits.length >= 2 ? 1 : 0), 2) }, (_, index) => {
                              const part = txn.splits[index];
                              return (
                                <div className="split" key={index}>
                                  <label>
                                    {index === 0 ? "Split" : ""}
                                    <input
                                      name="split-amount"
                                      inputMode="decimal"
                                      defaultValue={part ? (Math.abs(part.amountCents) / 100).toFixed(2) : ""}
                                      maxLength={20}
                                      aria-label={`Split ${index + 1} amount`}
                                    />
                                  </label>
                                  <label>
                                    {index === 0 ? "Category" : ""}
                                    <input
                                      name="split-category"
                                      list="categories"
                                      defaultValue={part?.category ?? ""}
                                      maxLength={40}
                                      aria-label={`Split ${index + 1} category`}
                                    />
                                  </label>
                                </div>
                              );
                            })}
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
