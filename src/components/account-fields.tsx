import { accountTitle, kindFromRole } from "@/core/bank";
import { formatMoney } from "@/core/money";
import type { Account } from "@/core/types";
import { KindFields } from "./kind-fields";

export function AccountFields({ account }: { account: Account }) {
  const kind = account.kind ?? kindFromRole(account.role);
  return (
    <fieldset className="account">
      <legend>{accountTitle(account)}</legend>
      <p className="org">
        {account.orgName} · {formatMoney(account.balanceCents, account.currency)}
        {account.availableCents != null && account.availableCents !== account.balanceCents
          ? ` · available ${formatMoney(account.availableCents, account.currency)}`
          : ""}
      </p>
      <label>
        Name
        <input name={`label:${account.id}`} defaultValue={accountTitle(account)} maxLength={80} />
      </label>
      <label>
        Note
        <input name={`note:${account.id}`} defaultValue={account.note ?? ""} maxLength={280} />
      </label>
      <label className="check">
        <input type="checkbox" name={`track:${account.id}`} value="1" defaultChecked={account.tracked !== false} />
        Follow this account
      </label>
      <KindFields
        id={account.id}
        kind={kind}
        dueDay={account.dueDay}
        payMode={account.payMode}
        minimumCents={account.minimumCents}
      />
    </fieldset>
  );
}
