import { connectBank, disconnectBank, importBackup, importFile, loadSample, resetBank } from "../../actions";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { SyncScheduleForm } from "@/components/sync-schedule";
import { accountTitle } from "@/core/bank";
import { connectionStatus, listAccounts } from "@/core/service";

export default async function BankPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const query = await searchParams;
  const status = connectionStatus();
  const accounts = listAccounts();
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
      <form action={importFile} className="section stack">
        <h2>Import</h2>
        <label>
          Account
          <select name="account" required defaultValue={accounts[0]?.id ?? ""}>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {accountTitle(account)}
              </option>
            ))}
          </select>
        </label>
        <label>
          File
          <input name="file" type="file" accept=".csv,.qif,.ofx,.qfx,text/csv" required />
        </label>
        <div className="row">
          <label>
            Format
            <select name="date" defaultValue="mdy">
              <option value="mdy">Month day</option>
              <option value="dmy">Day month</option>
              <option value="ymd">Year first</option>
            </select>
          </label>
          <label>
            Sign
            <select name="sign" defaultValue="as">
              <option value="as">As written</option>
              <option value="flip">Flip</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>
            Date
            <input name="dateColumn" defaultValue="date" aria-label="Date column" />
          </label>
          <label>
            Amount
            <input name="amountColumn" defaultValue="amount" aria-label="Amount column" />
          </label>
          <label>
            Payee
            <input name="payeeColumn" defaultValue="payee" aria-label="Payee column" />
          </label>
        </div>
        <SubmitButton pending="Importing…">Import</SubmitButton>
      </form>
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
