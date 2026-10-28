import { connectBank, disconnectBank, importBackup, loadSample, resetBank } from "../../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { SyncScheduleForm } from "@/components/sync-schedule";
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
      </div>
      {status.connected ? (
        <p>Connected{status.syncedAt ? ` · last copy ${status.syncedAt}` : ""}.</p>
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
      <section className="section stack">
        <h2>Sync</h2>
        <SyncScheduleForm on={status.sync.on} everyHours={status.sync.everyHours} at={status.sync.at} />
      </section>
      <section className="section stack">
        <h2>Backup</h2>
        <p>
          <a className="button" href="/api/v1/backup">
            Download zip
          </a>
        </p>
        <form action={importBackup} className="stack">
          <label>
            Zip file
            <input name="backup" type="file" accept=".zip,application/zip" required />
          </label>
          <SubmitButton pending="Importing…">Import zip</SubmitButton>
        </form>
      </section>
      <div className="section row">
        {status.connected ? (
          <>
            <form action={resetBank}>
              <button className="quiet" type="submit">
                Reset
              </button>
            </form>
            <form action={disconnectBank}>
              <button className="quiet" type="submit">
                Forget the connection
              </button>
            </form>
          </>
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
