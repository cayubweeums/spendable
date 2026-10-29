import { accountTitle } from "@/core/bank";
import { formatLong, postedToISO } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { amountsHidden, getSettings, listAccounts, listPayees, listTransactions } from "@/core/service";

const sorts = ["date", "payee", "account", "category", "amount"] as const;
type Sort = (typeof sorts)[number];

function sortOf(value: string | undefined): Sort {
  return sorts.includes(value as Sort) ? (value as Sort) : "date";
}

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const query = await searchParams;
  const sort = sortOf(query.sort);
  const dir = query.dir === "asc" ? "asc" : "desc";
  const settings = getSettings();
  const hidden = amountsHidden();
  const accounts = new Map(listAccounts().map((account) => [account.id, account]));
  const payeeName = new Map(listPayees().flatMap((payee) => payee.descriptions.map((description) => [description, payee.name] as const)));
  const rows = listTransactions().map((txn) => {
    const account = accounts.get(txn.accountId);
    return {
      id: txn.id,
      posted: txn.posted,
      date: postedToISO(txn.posted),
      pending: txn.pending,
      payee: payeeName.get(txn.description) ?? txn.description,
      account: account ? accountTitle(account) : "Account",
      category: txn.category ?? "",
      amountCents: txn.amountCents,
      currency: account?.currency ?? "USD",
    };
  });
  const sign = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "amount") return (a.amountCents - b.amountCents) * sign;
    if (sort === "date") return (a.posted - b.posted) * sign || a.payee.localeCompare(b.payee);
    return a[sort].localeCompare(b[sort]) * sign || b.posted - a.posted;
  });
  const money = (cents: number, currency: string) => formatMoney(cents, currency, hidden, settings);
  const head = (name: Sort, label: string) => {
    const next = sort === name && dir === "desc" ? "asc" : "desc";
    const first = name === "date" || name === "amount" ? "desc" : "asc";
    return (
      <th className={name === "amount" ? "num" : undefined}>
        <a href={`/charges?sort=${name}&dir=${sort === name ? next : first}`} aria-current={sort === name ? "page" : undefined}>
          {label}
        </a>
      </th>
    );
  };

  return (
    <>
      <h1 className="question">Charges</h1>
      <div className="ledger-scroll">
        <table className="ledger">
          <thead>
            <tr>
              {head("date", "Date")}
              {head("payee", "Payee")}
              {head("category", "Category")}
              {head("account", "Account")}
              {head("amount", "Amount")}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>None</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.pending || !row.date ? "pending" : formatLong(row.date, settings.date)}</td>
                  <td>{row.payee}</td>
                  <td>{row.category}</td>
                  <td>{row.account}</td>
                  <td className={row.amountCents < 0 ? "num out" : "num"}>{money(row.amountCents, row.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
