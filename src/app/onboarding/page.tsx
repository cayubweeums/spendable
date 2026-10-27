import { redirect } from "next/navigation";
import { connectFromOnboarding, finishOnboarding, openApp, syncFromOnboarding } from "../actions";
import { requirePage } from "../auth";
import { AccountFields } from "@/components/account-fields";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SetupTokenField } from "@/components/setup-token-field";
import { SubmitButton } from "@/components/submit-button";
import { connectionStatus, listAccounts, needsOnboarding, passwordIsSet } from "@/core/service";

const steps = [
  { id: "user", label: "User" },
  { id: "bank", label: "Bank" },
  { id: "accounts", label: "Accounts" },
] as const;

type StepId = (typeof steps)[number]["id"];

function currentStep(value: string | undefined, connected: boolean, passwordSet: boolean): StepId {
  if (!passwordSet) return "user";
  if (value === "user" || value === "bank") return value;
  if (value === "accounts") return connected ? "accounts" : "bank";
  return connected ? "accounts" : "bank";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; notice?: string }>;
}) {
  const passwordSet = passwordIsSet();
  if (passwordSet) {
    await requirePage();
    if (!needsOnboarding()) redirect("/");
  }
  const query = await searchParams;
  const status = passwordSet
    ? connectionStatus()
    : { connected: false, syncedAt: null as string | null, errors: [] as string[] };
  const step = currentStep(query.step, status.connected, passwordSet);
  const stepIndex = steps.findIndex((item) => item.id === step);
  const accounts = status.connected ? listAccounts() : [];

  return (
    <div className="wizard">
      <ReadFlash notice={query.notice} />
      <p className="kicker">Step {stepIndex + 1} of {steps.length}</p>
      <ol className="steps">
        {steps.map((item, index) => {
          const locked = (item.id !== "user" && !passwordSet) || (item.id === "accounts" && !status.connected);
          const href = item.id === "user" ? "/onboarding?step=user" : `/onboarding?step=${item.id}`;
          return (
            <li key={item.id}>
              {locked ? (
                <span>
                  {index + 1} {item.label}
                </span>
              ) : (
                <a href={href} aria-current={item.id === step ? "step" : undefined}>
                  {index + 1} {item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>

      {step === "user" ? (
        passwordSet ? (
          <>
            <h1 className="question">Setup user</h1>
            <p className="page-intro">Admin password is set.</p>
            <a className="button" href="/onboarding?step=bank">
              Setup bank
            </a>
          </>
        ) : (
          <>
            <h1 className="question">Setup user</h1>
            <p className="page-intro">Password for the admin account on this app. It encrypts the data on this server. The bank password stays at your bank.</p>
            <form action={openApp}>
              <label>
                Password
                <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} autoFocus />
              </label>
              <label>
                Confirm password
                <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
              </label>
              <div className="actions">
                <SubmitButton pending="Saving…">Save</SubmitButton>
              </div>
            </form>
          </>
        )
      ) : null}

      {step === "bank" ? (
        status.connected ? (
          <>
            <h1 className="question">Setup bank</h1>
            <p className="page-intro">Token claimed.</p>
            <a className="button" href="/onboarding?step=accounts">
              Accounts
            </a>
          </>
        ) : (
          <>
            <h1 className="question">Setup bank</h1>
            <p className="page-intro">
              You need a SimpleFIN account with your banks linked. SimpleFIN charges $1.50 a month or $15 a year before the first bank.
            </p>
            <ol className="bridge">
              <li>
                Open{" "}
                <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">
                  SimpleFIN Bridge
                </a>
                . Choose Get Started and enter your email.
              </li>
              <li>Open the link in that email. Accept the terms. You land on My Account.</li>
              <li>Under Financial Institutions, choose New Connection and link your banks.</li>
              <li>Under Apps, choose New Connection. Name it so you can recognize this app. Choose Create Setup Token.</li>
              <li>Copy the token. It works once. If this app refuses it, disable that connection and create another token.</li>
            </ol>
            <p className="page-intro">
              SimpleFIN refreshes each bank about once a day. A copy here asks for at most 90 days of transactions. For a fake bank, the{" "}
              <a href="https://beta-bridge.simplefin.org/info/developers" target="_blank" rel="noreferrer">
                developer page
              </a>{" "}
              prints a demo token.
            </p>
            <form action={connectFromOnboarding} className="stack">
              <SetupTokenField />
              <PendingNote>Copying accounts.</PendingNote>
              <SubmitButton pending="Adding token…">Add token</SubmitButton>
            </form>
          </>
        )
      ) : null}

      {step === "accounts" ? (
        <>
          <h1 className="question">Which of these should this follow?</h1>
          <p className="page-intro">
            Check the ones to keep and set the type. Only checking is spendable. This does not write back to the bank.
            {status.syncedAt ? ` Last copy ${status.syncedAt}.` : ""}
          </p>
          {status.errors.length > 0 ? (
            <ul className="errors">
              {status.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {accounts.length === 0 ? (
            <div className="stack">
              <p>SimpleFIN accepted the token and returned no accounts. Add a bank under Financial Institutions, then sync again.</p>
              <form action={syncFromOnboarding}>
                <PendingNote>Copying accounts from the bank.</PendingNote>
                <SubmitButton pending="Copying accounts…">Sync again</SubmitButton>
              </form>
            </div>
          ) : (
            <>
              <form action={finishOnboarding}>
                {accounts.map((account) => (
                  <AccountFields key={account.id} account={account} />
                ))}
                <PendingNote>Saving your account choices.</PendingNote>
                <div className="row actions">
                  <SubmitButton pending="Saving…">Finish setup</SubmitButton>
                </div>
              </form>
              <form action={syncFromOnboarding}>
                <PendingNote>Copying accounts from the bank.</PendingNote>
                <SubmitButton quiet pending="Copying accounts…">
                  Sync again
                </SubmitButton>
              </form>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
