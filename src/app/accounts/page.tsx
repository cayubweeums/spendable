import { saveAccounts } from "../actions";
import { Flash } from "@/components/flash";
import { formatMoney } from "@/core/money";
import { listAccounts } from "@/core/service";

const roles = [
  ["spend", "Spend from this"],
  ["reserve", "Set aside"],
  ["credit", "Credit card"],
  ["ignore", "Hide from the answer"],
] as const;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const accounts = listAccounts();
  return (
    <>
      <Flash error={query.error} notice={query.notice} />
      <h1 className="question">Accounts</h1>
      <p className="page-intro">
        The balance on each row is the last figure copied from the bank. Choosing how it counts changes the answer, and leaves that figure where it is.
      </p>
      <form action={saveAccounts}>
        {accounts.map((account) => (
          <fieldset key={account.id} className="account">
            <legend>{account.name}</legend>
            <p className="org">
              {account.orgName} · {formatMoney(account.balanceCents, account.currency)}
              {account.availableCents != null && account.availableCents !== account.balanceCents
                ? ` · available ${formatMoney(account.availableCents, account.currency)}`
                : ""}
            </p>
            <label>
              How it counts
              <select name={`role:${account.id}`} defaultValue={account.role}>
                {roles.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {account.role === "credit" ? (
              <div className="row">
                <label>
                  Due day
                  <input name={`due:${account.id}`} type="number" min={1} max={31} defaultValue={account.dueDay ?? ""} />
                </label>
                <label>
                  Before payday
                  <select name={`pay:${account.id}`} defaultValue={account.payMode}>
                    <option value="none">Don&apos;t hold a payment</option>
                    <option value="full">Hold the full balance</option>
                    <option value="minimum">Hold a minimum</option>
                  </select>
                </label>
                <label>
                  Minimum
                  <input
                    name={`minimum:${account.id}`}
                    inputMode="decimal"
                    defaultValue={(account.minimumCents / 100).toFixed(2)}
                  />
                </label>
              </div>
            ) : null}
          </fieldset>
        ))}
        <button type="submit">Save accounts</button>
      </form>
    </>
  );
}
