import { ChargeEdit } from "@/components/charge-edit";
import { ReadFlash } from "@/components/read-flash";
import { accountTitle } from "@/core/bank";
import { formatLong, postedToISO } from "@/core/dates";
import { formatMoney } from "@/core/money";
import { matchingRule } from "@/core/rules";
import { amountsHidden, canUndo, getSettings, listAccounts, listBills, listCategories, listPayees, listRules, listTransactions, needsCategory } from "@/core/service";
import { undoTransaction } from "../../actions";

const sorts = ["date", "payee", "account", "category", "amount"] as const;
type Sort = (typeof sorts)[number];

function sortOf(value: string | undefined): Sort {
  return sorts.includes(value as Sort) ? (value as Sort) : "date";
}

function listHref(sort: Sort, dir: "asc" | "desc", blank: boolean) {
  const params = new URLSearchParams({ sort, dir });
  if (blank) params.set("blank", "1");
  return `/charges?${params}`;
}

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; blank?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const sort = sortOf(query.sort);
  const dir = query.dir === "asc" ? "asc" : "desc";
  const blank = query.blank === "1";
  const here = listHref(sort, dir, blank);
  const settings = getSettings();
  const hidden = amountsHidden();
  const accounts = new Map(listAccounts().map((account) => [account.id, account]));
  const payeeName = new Map(listPayees().flatMap((payee) => payee.descriptions.map((description) => [description, payee.name] as const)));
  const categories = listCategories().filter((category) => !category.hidden);
  const rules = listRules();
  const bills = listBills();
  const rows = listTransactions().flatMap((txn) => {
    if (blank && !needsCategory(txn)) return [];
    const account = accounts.get(txn.accountId);
    return [{
      id: txn.id,
      posted: txn.posted,
      date: postedToISO(txn.posted),
      pending: txn.pending,
      description: txn.description,
      payee: payeeName.get(txn.description) ?? txn.description,
      account: account ? accountTitle(account) : "Account",
      category: txn.category,
      note: txn.note ?? "",
      tags: txn.tags ?? [],
      splits: txn.splits ?? [],
      amountCents: txn.amountCents,
      currency: account?.currency ?? "USD",
    }];
  });
  const sign = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "amount") return (a.amountCents - b.amountCents) * sign;
    if (sort === "date") return (a.posted - b.posted) * sign || a.payee.localeCompare(b.payee);
    const left = sort === "category" ? (a.category ?? "") : a[sort];
    const right = sort === "category" ? (b.category ?? "") : b[sort];
    return left.localeCompare(right) * sign || b.posted - a.posted;
  });
  const money = (cents: number, currency: string) => formatMoney(cents, currency, hidden, settings);
  const head = (name: Sort, label: string) => {
    const next = sort === name && dir === "desc" ? "asc" : "desc";
    const first = name === "date" || name === "amount" ? "desc" : "asc";
    return (
      <th className={name === "amount" ? "num" : undefined}>
        <a href={listHref(name, sort === name ? next : first, blank)} aria-current={sort === name ? "page" : undefined}>
          {label}
        </a>
      </th>
    );
  };

  return (
    <>
      <ReadFlash notice={query.notice} />
      <div className="charge-head">
        <h1 className="question">Charges</h1>
        <a href={listHref(sort, dir, false)} aria-current={blank ? undefined : "page"}>
          All
        </a>
        {/* shortcut: one uncategorized toggle. Upgrade when this page should keep the Now filter stack. */}
        <a href={listHref(sort, dir, true)} aria-current={blank ? "page" : undefined}>
          Uncategorized
        </a>
        {canUndo() ? (
          <form action={undoTransaction}>
            <input type="hidden" name="back" value={here} />
            <button className="quiet" type="submit">
              Undo
            </button>
          </form>
        ) : null}
      </div>
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
              rows.map((row) => {
                const rule = matchingRule(row.description, rules);
                const bill = bills.find(
                  (item) => item.active && item.matchText && row.description.toLowerCase().includes(item.matchText.toLowerCase()),
                );
                return (
                  <tr key={row.id}>
                    <td>{row.pending || !row.date ? "pending" : formatLong(row.date, settings.date)}</td>
                    <td>{row.payee}</td>
                    <td>
                      <ChargeEdit
                        id={row.id}
                        category={row.category}
                        splits={row.splits}
                        amountCents={row.amountCents}
                        currency={row.currency}
                        note={row.note}
                        tags={row.tags}
                        categories={categories}
                        contains={rule?.contains ?? row.description.slice(0, 80)}
                        remembered={Boolean(rule)}
                        monthly={Boolean(bill)}
                        hidden={hidden}
                        numberFormat={settings.number}
                        hideCents={settings.hideCents}
                        back={here}
                      />
                    </td>
                    <td>{row.account}</td>
                    <td className={row.amountCents < 0 ? "num out" : "num"}>{money(row.amountCents, row.currency)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
