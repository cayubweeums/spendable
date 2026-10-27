import { connectBank, disconnectBank, loadSample } from "../../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { connectionStatus } from "@/core/service";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const status = connectionStatus();
  return (
    <>
      <ReadFlash notice={query.notice} />
      <h1 className="question">Bank</h1>
      <div className="page-intro stack">
        <p>SimpleFIN copies balances. Your bank password stays with them. A token works once.</p>
        <p>
          Under Apps, choose New Connection, then Create Setup Token. A demo token is on the{" "}
          <a href="https://beta-bridge.simplefin.org/info/developers" target="_blank" rel="noreferrer">
            developer page
          </a>
          .
        </p>
        <p>Sync in the header. After 12 hours, opening the app copies again.</p>
      </div>
      {status.connected ? (
        <p>
          Connected{status.syncedAt ? ` · last copy ${status.syncedAt}` : ""}. The access URL stays in the local database and is not shown here.
        </p>
      ) : (
        <p>No bank is connected.</p>
      )}
      {status.errors.length > 0 ? (
        <ul className="errors">
          {status.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <form action={connectBank} className="section stack">
        <label>
          Setup token
          <textarea name="token" required spellCheck={false} autoComplete="off" />
        </label>
        <PendingNote>Claiming the token and copying accounts.</PendingNote>
        <SubmitButton pending="Claiming the token…">Connect</SubmitButton>
      </form>
      <div className="section row">
        {status.connected ? (
          <form action={disconnectBank}>
            <button className="quiet" type="submit">
              Forget the connection
            </button>
          </form>
        ) : null}
        <form action={loadSample}>
          <button className="quiet" type="submit">
            Replace with sample numbers
          </button>
        </form>
      </div>
    </>
  );
}
