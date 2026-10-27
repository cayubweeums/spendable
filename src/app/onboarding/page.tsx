import { redirect } from "next/navigation";
import { connectFromOnboarding, finishOnboarding, syncFromOnboarding } from "../actions";
import { AccountFields } from "@/components/account-fields";
import { PendingNote } from "@/components/pending-note";
import { ReadFlash } from "@/components/read-flash";
import { SetupTokenField } from "@/components/setup-token-field";
import { SubmitButton } from "@/components/submit-button";
import { connectionStatus, listAccounts, needsOnboarding } from "@/core/service";

const steps = [
  { id: "start", label: "Start" },
  { id: "bridge", label: "SimpleFIN" },
  { id: "token", label: "Token" },
  { id: "accounts", label: "Accounts" },
] as const;

type StepId = (typeof steps)[number]["id"];

function currentStep(value: string | undefined, connected: boolean): StepId {
  if (value === "accounts") return connected ? "accounts" : "token";
  if (value === "bridge" || value === "token" || value === "start") return value;
  return connected ? "accounts" : "start";
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; notice?: string }>;
}) {
  if (!needsOnboarding()) redirect("/");
  const query = await searchParams;
  const status = connectionStatus();
  const step = currentStep(query.step, status.connected);
  const stepIndex = steps.findIndex((item) => item.id === step);
  const accounts = status.connected ? listAccounts() : [];

  return (
    <div className="wizard">
      <ReadFlash notice={query.notice} />
      <p className="kicker">Step {stepIndex + 1} of {steps.length}</p>
      <ol className="steps">
        {steps.map((item, index) => {
          const locked = item.id === "accounts" && !status.connected;
          const href = item.id === "start" ? "/onboarding" : `/onboarding?step=${item.id}`;
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

      {step === "start" ? (
        <>
          <h1 className="question">Copy the bank before the answer.</h1>
          <p className="page-intro">
            SimpleFIN copies your balances. Your bank password stays there. This screen stays until a token is claimed and an account comes back.
          </p>
          <a className="button" href="/onboarding?step=bridge">
            Set up SimpleFIN
          </a>
        </>
      ) : null}

      {step === "bridge" ? (
        <>
          <h1 className="question">Create a one-time setup token.</h1>
          <ol className="bridge">
            <li>
              Create an account at{" "}
              <a href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">
                SimpleFIN Bridge
              </a>
              . Choose Get Started and enter your email.
            </li>
            <li>Open the login link in that email. It can take a few minutes to arrive.</li>
            <li>Accept the terms on the first login. You land on My Account.</li>
            <li>
              Link the banks you want under Financial Institutions, then New Connection. SimpleFIN requires a subscription before the first bank. Their current rate is $1.50 a month, or $15 a year.
            </li>
            <li>
              On My Account, under Apps, choose New Connection. The name is only so you can recognize this app in SimpleFIN. Then choose Create Setup Token.
            </li>
            <li>Copy the token. It can be claimed once. If this app refuses it, disable that connection and create another token.</li>
          </ol>
          <p className="page-intro">
            SimpleFIN refreshes each bank about once a day, and a copy here asks for at most 90 days of transactions. To try a fake bank first, the{" "}
            <a href="https://beta-bridge.simplefin.org/info/developers" target="_blank" rel="noreferrer">
              developer page
            </a>{" "}
            prints a demo token.
          </p>
          <a className="button" href="/onboarding?step=token">
            I have a token
          </a>
        </>
      ) : null}

      {step === "token" ? (
        <>
          <h1 className="question">Paste the token.</h1>
          <p className="page-intro">
            Save and continue claims this token with SimpleFIN and copies the accounts. You will not be asked for it again. If the claim is refused, the access URL is not saved.
          </p>
          <form action={connectFromOnboarding} className="stack">
            <SetupTokenField />
            <PendingNote>Claiming the token and copying accounts.</PendingNote>
            <SubmitButton pending="Claiming the token…">Save and continue</SubmitButton>
          </form>
        </>
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
