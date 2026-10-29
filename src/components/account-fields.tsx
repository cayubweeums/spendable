import { accountTitle, kindFromRole } from "@/core/bank";
import { formatMoney } from "@/core/money";
import { amountsHidden, getSettings } from "@/core/service";
import type { Account } from "@/core/types";
import { KindFields } from "./kind-fields";

export function AccountFields({ account }: { account: Account }) {
  const kind = account.kind ?? kindFromRole(account.role);
  const hidden = amountsHidden();
  const settings = getSettings();
  return (
    <fieldset className="account">
      <legend>{accountTitle(account)}</legend>
      <p className="org">
        {account.orgName} · {formatMoney(account.balanceCents, account.currency, hidden, settings)}
        {account.availableCents != null && account.availableCents !== account.balanceCents
          ? ` · available ${formatMoney(account.availableCents, account.currency, hidden, settings)}`
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
      <KindFields
        id={account.id}
        kind={kind}
        tracked={account.tracked !== false}
        dueDay={account.dueDay}
        payMode={account.payMode}
        minimumCents={account.minimumCents}
      />
    </fieldset>
  );
}
