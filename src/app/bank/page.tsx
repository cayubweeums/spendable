import { connectBank, disconnectBank, loadSample } from "../actions";
import { Flash } from "@/components/flash";
import { connectionStatus } from "@/core/service";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const status = connectionStatus();
  return (
    <>
      <Flash error={query.error} notice={query.notice} />
      <h1 className="question">Bank</h1>
      <div className="page-intro stack">
        <p>
          SimpleFIN gives this app a read-only copy of your balances and transactions. Your bank password stays with them.
        </p>
        <p>
          <a href="https://bridge.simplefin.org/simplefin/create" target="_blank" rel="noreferrer">
            Create a setup token
          </a>
          , paste it below, and the sample numbers are replaced. To rehearse with a fake bank first, use a demo token from the{" "}
          <a href="https://beta-bridge.simplefin.org/info/developers" target="_blank" rel="noreferrer">
            SimpleFIN developer page
          </a>
          . A token works once.
        </p>
        <p>Sync when you want a fresh copy. SimpleFIN asks apps to stay around 24 account requests a day, and 90 days of history at a time.</p>
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
        <button type="submit">Connect</button>
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
