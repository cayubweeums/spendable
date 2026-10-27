import { redirect } from "next/navigation";
import { openApp } from "../actions";
import { signedIn } from "../auth";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { needsOnboarding, passwordIsSet } from "@/core/service";

export default async function LoginPage() {
  if (await signedIn()) redirect(needsOnboarding() ? "/onboarding" : "/");
  const first = !passwordIsSet();

  return (
    <div className="wizard">
      <ReadFlash />
      <h1 className="question">{first ? "Choose a password" : "Open spendable"}</h1>
      <p className="page-intro">
        {first
          ? "Choose a password for this app. It is not your bank password. The ledger stays closed until this is set."
          : "Enter the app password."}
      </p>
      <form action={openApp}>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={first ? "new-password" : "current-password"}
            required
            minLength={8}
            maxLength={128}
            autoFocus
          />
        </label>
        {first ? (
          <label>
            Confirm password
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
          </label>
        ) : null}
        <div className="actions">
          <SubmitButton pending={first ? "Setting…" : "Opening…"}>{first ? "Set password" : "Open"}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
