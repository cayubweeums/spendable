import { addFilter, batchCharges, dropFilter, forgetFilter, keepFilter, saveSettings, saveTransaction, undoTransaction } from "../actions";
import { ChargeCategory } from "@/components/charge-category";
import { MenuSelect } from "@/components/menu-select";
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
  amountsHidden,
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
  const categories = listCategories().filter((category) => !category.hidden);
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
  const hidden = amountsHidden();
  const money = (cents: number, currency = snapshot.currency) => formatMoney(cents, currency, hidden, settings);
  const day = (iso: string) => formatLong(iso, settings.date);
  const stamps = [...snapshot.deposits.map((account) => account.balanceDate), ...snapshot.debts.map((account) => account.balanceDate)];
  const asOf = stamps.length > 0 ? Math.max(...stamps) : null;
  const empty = snapshot.deposits.length === 0 && snapshot.debts.length === 0;

  return (
    <>
      <ReadFlash notice={query.notice} warnings={snapshot.syncErrors} stamp={snapshot.syncedAt} />
      {snapshot.demo ? (
        <p className="banner">
          Sample numbers, so you can see the shape of the answer. <a href="/bank">Connect a bank</a> when you want yours.
        </p>
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
                    {line.detail ? <small>{line.detail}</small> : null}
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
              ? `Short ${money(-snapshot.spendableCents)} before ${day(snapshot.nextPayday)}.`
              : `${money(snapshot.perDayCents)} a day until ${day(snapshot.nextPayday)}.`}
          </p>
        </section>

        <div className="lists">
          <section>
            <h2 className="kicker">
              <a href="/accounts">Accounts</a>
            </h2>
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
              <span>Owed on cards <strong>{money(snapshot.owedCents)}</strong></span>
              <span>{asOf ? `As of ${formatTimestamp(asOf, settings.date)}` : null}</span>
            </p>
          </section>

          <section>
            <h2 className="kicker">
              <a href="/bills">Bills</a>
            </h2>
            {bills.some((bill) => bill.active) ? (
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
            ) : (
              <p className="principle">
                <a href="/bills">None found, set them up to see them here.</a>
              </p>
            )}
          </section>
        </div>
      </div>

      <section className="section charges">
            <div className="charge-head">
              <h2 className="kicker">Charges</h2>
              <a href="/charges">All</a>
              <a href="/api/v1/transactions?format=csv">CSV</a>
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
            <form action={addFilter} className="filter-row">
              {named ? <input type="hidden" name="name" value={named} /> : null}
              {conditions.map((filter, index) => (
                <input key={index} type="hidden" name="c" value={encodeFilter(filter)} />
              ))}
              <label>
                Field
                <MenuSelect name="field" defaultValue="category" label="Field" options={FILTER_FIELDS} />
              </label>
              <label>
                Op
                <MenuSelect name="op" defaultValue="is" label="Op" options={RULE_OPS} />
              </label>
              <label>
                Value
                <input name="value" maxLength={180} required />
              </label>
              <SubmitButton pending="Adding…">Add</SubmitButton>
            </form>
            {conditions.length > 0 ? (
              <form action={keepFilter} className="filter-row">
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
            <form id="batch" action={batchCharges} className="filter-row">
              {named ? <input type="hidden" name="name" value={named} /> : null}
              {conditions.map((filter, index) => (
                <input key={index} type="hidden" name="c" value={encodeFilter(filter)} />
              ))}
              <CategorySelect name="category" categories={categories} value="" label="Category" />
              <SubmitButton pending="Saving…">Apply</SubmitButton>
              <button className="quiet" name="intent" value="copy" type="submit">
                Copy
              </button>
              <button className="quiet" name="intent" value="merge" type="submit">
                Merge
              </button>
            </form>
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
                          {txn.pending ? "pending" : txn.posted ? day(txn.posted) : "pending"}
                          {txn.splits.length
                            ? txn.splits.map((part) => ` · ${part.category} ${money(part.amountCents, txn.currency)}`)
                            : txn.category
                              ? ` · ${txn.category}`
                              : null}
                          {txn.note ? ` · ${txn.note}` : null}
                          {txn.tags.length ? ` · ${txn.tags.join(", ")}` : null}
                          {txn.cleared ? " · cleared" : null}
                          {bill ? " · monthly" : null}
                        </span>
                        <form action={saveTransaction} className="txn-edit">
                          <input type="hidden" name="id" value={txn.id} />
                          <ChargeCategory
                            categories={categories}
                            category={txn.category}
                            splits={txn.splits}
                            amountCents={txn.amountCents}
                            currency={txn.currency}
                            hidden={hidden}
                            numberFormat={settings.number}
                            hideCents={settings.hideCents}
                          />
                          <details className="txn-more" suppressHydrationWarning>
                            <summary>More</summary>
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
                          </details>
                        </form>
                      </td>
                      <td className="hide-sm quiet-note">{txn.accountName}</td>
                      <td className={txn.amountCents < 0 ? "num out" : "num"}>{money(txn.amountCents, txn.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
      </section>

      <section className="section">
        <p className="kicker">Since {day(snapshot.previousPayday)}</p>
        <h2>What already left</h2>
        <p>{paceCaption(snapshot)}</p>
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
        <form action={saveSettings} className="stack">
          <div className="row">
            <label>
              How often you get paid
              <MenuSelect
                name="frequency"
                defaultValue={settings.paydayFrequency}
                label="How often you get paid"
                options={[
                  ["weekly", "Weekly"],
                  ["biweekly", "Every two weeks"],
                  ["monthly", "Monthly"],
                  ["days", "Days of the month"],
                ]}
              />
            </label>
            <label>
              A payday you remember
              <input type="date" name="anchor" defaultValue={settings.paydayAnchor} required />
            </label>
            <label>
              Days
              <input name="days" defaultValue={(settings.paydayDays ?? []).join(", ")} placeholder="15, 25" maxLength={40} />
            </label>
            <label>
              Buffer
              <input name="buffer" inputMode="decimal" defaultValue={(settings.bufferCents / 100).toFixed(2)} />
            </label>
          </div>
          <h2>Figures</h2>
          <div className="row">
            <label>
              Date
              <MenuSelect
                name="date"
                defaultValue={settings.date}
                label="Date"
                options={[
                  ["mdy", "Oct 28"],
                  ["dmy", "28 Oct"],
                  ["ymd", "2026-10-28"],
                ]}
              />
            </label>
            <label>
              Number
              <MenuSelect
                name="number"
                defaultValue={settings.number}
                label="Number"
                options={[
                  ["us", "1,234.56"],
                  ["eu", "1.234,56"],
                ]}
              />
            </label>
            <label>
              Week
              <MenuSelect
                name="week"
                defaultValue={String(settings.weekStart)}
                label="Week"
                options={[
                  ["0", "Sunday"],
                  ["1", "Monday"],
                ]}
              />
            </label>
            <label className="check">
              <input type="checkbox" name="cents" value="1" defaultChecked={!settings.hideCents} />
              Cents
            </label>
          </div>
          <PendingNote>Updating the answer.</PendingNote>
          <SubmitButton pending="Updating…">Update the answer</SubmitButton>
        </form>
      </section>
    </>
  );
}

function CategorySelect({
  name,
  categories,
  value,
  allowSplit,
  label,
}: {
  name: string;
  categories: { name: string; group: string }[];
  value: string;
  allowSplit?: boolean;
  label: string;
}) {
  const choices = [...categories];
  if (value && value !== "__split" && !choices.some((category) => category.name === value)) {
    choices.unshift({ name: value, group: "" });
  }
  const groups: { group: string; names: string[] }[] = [];
  for (const category of choices) {
    const last = groups.at(-1);
    if (last && last.group === category.group) last.names.push(category.name);
    else groups.push({ group: category.group, names: [category.name] });
  }
  return (
    <label>
      {label}
      <MenuSelect
        name={name}
        defaultValue={value}
        label={label || "Category"}
        options={[
          { value: "", label: "" },
          ...groups.flatMap((group) => group.names.map((item) => ({ value: item, label: item, group: group.group }))),
          ...(allowSplit ? [{ value: "__split", label: "Split" }] : []),
        ]}
        creatable
      />
    </label>
  );
}
