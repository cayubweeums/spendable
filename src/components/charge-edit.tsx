import { saveTransaction } from "@/app/actions";
import type { NumberFormat } from "@/core/money";
import { ChargeCategory } from "./charge-category";
import { PendingNote } from "./pending-note";
import { SubmitButton } from "./submit-button";

export function ChargeEdit({
  id,
  category,
  splits,
  amountCents,
  currency,
  note,
  tags,
  categories,
  contains,
  remembered,
  monthly,
  hidden,
  numberFormat,
  hideCents,
  back,
}: {
  id: string;
  category: string | null;
  splits: { category: string; amountCents: number }[];
  amountCents: number;
  currency: string;
  note: string;
  tags: string[];
  categories: { name: string; group: string }[];
  contains: string;
  remembered: boolean;
  monthly: boolean;
  hidden: boolean;
  numberFormat: NumberFormat;
  hideCents: boolean;
  back?: string;
}) {
  return (
    <form action={saveTransaction} className="txn-edit">
      <input type="hidden" name="id" value={id} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <ChargeCategory
        categories={categories}
        category={category}
        splits={splits}
        amountCents={amountCents}
        currency={currency}
        hidden={hidden}
        numberFormat={numberFormat}
        hideCents={hideCents}
      />
      <details className="txn-more" suppressHydrationWarning>
        <summary>More</summary>
        <label>
          Note
          <input name="note" defaultValue={note} maxLength={280} />
        </label>
        <label>
          Tags
          <input name="tags" defaultValue={tags.join(", ")} maxLength={200} />
        </label>
        <label>
          Description contains
          <input name="contains" defaultValue={contains} maxLength={80} />
        </label>
        <label className="check">
          <input type="checkbox" name="remember" value="1" defaultChecked={remembered} />
          Use this category next time
        </label>
        {amountCents < 0 ? (
          <>
            <input type="hidden" name="billable" value="1" />
            <label className="check">
              <input type="checkbox" name="recurring" value="1" defaultChecked={monthly} />
              Count it as a monthly bill
            </label>
          </>
        ) : null}
        <PendingNote>Saving this charge.</PendingNote>
        <SubmitButton pending="Saving…">Save</SubmitButton>
      </details>
    </form>
  );
}
