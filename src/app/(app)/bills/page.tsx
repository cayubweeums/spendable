import { addBill, addPlan, deleteBill, removePlan } from "../../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { eachDate, formatLong, ordinal } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { PLAN_KINDS, getSnapshot, listBills, listProjections } from "@/core/service";

function dayLabel(iso: string, first: boolean, payday: boolean): string {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  const part = (option: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...option, timeZone: "UTC" }).format(date).toUpperCase();
  if (first || payday) return `${part({ weekday: "short" })} ${day}`;
  if (day === 1) return `${part({ month: "short" })} 1`;
  return String(day);
}

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const bills = listBills();
  const plans = listProjections();
  const snapshot = getSnapshot();
  const money = (cents: number) => formatMoney(cents, snapshot.currency);
  const days = eachDate(snapshot.today, snapshot.nextPayday);
  const held = snapshot.receipt.lines.filter((line) => line.when);
  const buffer = snapshot.receipt.lines.find((line) => line.kind === "sub" && !line.when);

  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Bills</h1>
      <div className="runway-head">
        <p className={snapshot.spendableCents < 0 ? "figure short" : "figure"}>{money(snapshot.spendableCents)}</p>
        <p className="allowance">
          {snapshot.spendableCents < 0
            ? `Short before payday, ${formatLong(snapshot.nextPayday)}.`
            : `${money(snapshot.perDayCents)} a day for ${snapshot.daysUntilPayday} days.`}
        </p>
      </div>

      <ol className="runway" aria-label={`Today to payday, ${formatLong(snapshot.nextPayday)}`}>
        {days.map((iso, index) => {
          const payday = iso === snapshot.nextPayday;
          const hits = held.filter((line) => line.when === iso);
          const classes = [index === 0 ? "now" : "", payday ? "pay" : "", hits.length > 0 ? "hit" : ""].join(" ").trim();
          return (
            <li key={iso} className={classes || undefined}>
              <span className="d" title={formatLong(iso)}>
                {dayLabel(iso, index === 0, payday)}
              </span>
              {hits.map((line) => (
                <p key={line.label}>
                  {line.label}
                  <b>{money(line.cents)}</b>
                </p>
              ))}
              {payday ? <p>Payday</p> : null}
            </li>
          );
        })}
      </ol>
      <p className="runway-under">
        <span>{buffer ? `Buffer ${money(buffer.cents)} held the whole way` : "No buffer held"}</span>
        <span>Bank balances unchanged</span>
      </p>

      <section className="section">
        <h2>Every bill</h2>
        <p className="page-intro">
          Held back when the day falls before payday. Mark a charge on Now to repeat it.
        </p>
        <ul className="rows">
          {bills.map((bill) => (
            <li key={bill.id}>
              <span>
                {bill.name}
                {bill.matchText ? <span className="quiet-note"> · repeats</span> : null}
              </span>
              <span className="quiet-note">{ordinal(bill.dueDay)}</span>
              <span className="num">{formatMoney(bill.amountCents)}</span>
              <form action={deleteBill} className="inline">
                <input type="hidden" name="id" value={bill.id} />
                <button className="quiet" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <form action={addBill} className="section stack">
        <h2>Add a bill</h2>
        <div className="row">
          <label>
            Name
            <input name="name" required maxLength={80} />
          </label>
          <label>
            Amount
            <input name="amount" inputMode="decimal" required placeholder="80.00" />
          </label>
          <label>
            Day of month
            <input name="dueDay" type="number" min={1} max={31} required />
          </label>
        </div>
        <PendingNote>Adding the bill.</PendingNote>
        <SubmitButton pending="Adding…">Add bill</SubmitButton>
      </form>

      <section className="section">
        <h2>Plans</h2>
        <ul className="rows">
          {plans.map((plan) => (
            <li key={plan.id}>
              <span>
                {plan.name}
                <span className="quiet-note"> · {PLAN_KINDS.find(([id]) => id === plan.kind)?.[1]}</span>
              </span>
              <span className="quiet-note">
                {ordinal(plan.dueDay)}
                {plan.matchText ? ` · ${plan.matchText}` : ""}
              </span>
              <span className="num">{money(plan.kind === "income" ? plan.amountCents : -plan.amountCents)}</span>
              <form action={removePlan} className="inline">
                <input type="hidden" name="id" value={plan.id} />
                <button className="quiet" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <form action={addPlan} className="section stack">
        <div className="row">
          <label>
            Name
            <input name="name" required maxLength={80} />
          </label>
          <label>
            Amount
            <input name="amount" inputMode="decimal" required placeholder="80.00" />
          </label>
          <label>
            Day
            <input name="dueDay" type="number" min={1} max={31} required />
          </label>
          <label>
            Kind
            <select name="kind" defaultValue="income">
              {PLAN_KINDS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Match
            <input name="match" maxLength={80} />
          </label>
        </div>
        <PendingNote>Adding the plan.</PendingNote>
        <SubmitButton pending="Adding…">Add</SubmitButton>
      </form>
    </>
  );
}
