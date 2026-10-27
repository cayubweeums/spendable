import { addBill, deleteBill } from "../actions";
import { Flash } from "@/components/flash";
import { formatMoney } from "@/core/money";
import { listBills } from "@/core/service";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const bills = listBills();
  return (
    <>
      <Flash error={query.error} notice={query.notice} />
      <h1 className="question">Bills</h1>
      <p className="page-intro">
        A bill is held back when its day falls before the next payday. The bank balance stays the bank balance.
      </p>
      <table className="ledger">
        <thead>
          <tr>
            <th>Name</th>
            <th>Day</th>
            <th className="num">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bills.map((bill) => (
            <tr key={bill.id}>
              <td>{bill.name}</td>
              <td>{bill.dueDay}</td>
              <td className="num">{formatMoney(bill.amountCents)}</td>
              <td>
                <form action={deleteBill} className="inline">
                  <input type="hidden" name="id" value={bill.id} />
                  <button className="quiet" type="submit">
                    Remove
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        <button type="submit">Add bill</button>
      </form>
    </>
  );
}
