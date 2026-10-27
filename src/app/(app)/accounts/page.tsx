import { saveAccounts } from "../../actions";
import { AccountFields } from "@/components/account-fields";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { listAccounts } from "@/core/service";

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const accounts = listAccounts();
  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Which accounts should this follow?</h1>
      <p className="page-intro">
        Checked accounts are included. Checking is spendable. Savings, Roth, Roth IRA, stocks, and other types are not. Followed accounts copy again after 12 hours while this app is open.
      </p>
      <form action={saveAccounts}>
        {accounts.map((account) => (
          <AccountFields key={account.id} account={account} />
        ))}
        <PendingNote>Saving which accounts to follow.</PendingNote>
        <SubmitButton pending="Saving…">Save accounts</SubmitButton>
      </form>
    </>
  );
}
