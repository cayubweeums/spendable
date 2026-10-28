import { formatLong } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { getReport } from "@/core/service";

export default function ReportsPage() {
  const report = getReport();
  const money = (cents: number) => formatMoney(cents, report.currency);
  const name = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${report.today}T00:00:00Z`),
  );

  return (
    <>
      <h1 className="question">Reports</h1>
      <p className={report.summaryCents < 0 ? "figure short" : "figure"}>{money(report.summaryCents)}</p>
      <p className="allowance">Summary · {name}</p>
      <p className="allowance">Spending {money(report.spendingCents)}</p>
      <p className="allowance">
        Cash flow {money(report.incomeCents)} in, {money(report.spendingCents)} out
      </p>
      <p className="allowance">Net worth {money(report.netWorthCents)}</p>
      <section className="section">
        <h2>Calendar</h2>
        <div className="ledger-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">In</th>
                <th className="num">Out</th>
              </tr>
            </thead>
            <tbody>
              {report.days.length === 0 ? (
                <tr>
                  <td colSpan={3}>None</td>
                </tr>
              ) : (
                report.days.map((day) => (
                  <tr key={day.date}>
                    <td>{formatLong(day.date)}</td>
                    <td className="num">{money(day.incomeCents)}</td>
                    <td className={day.expenseCents > 0 ? "num out" : "num"}>{money(day.expenseCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
