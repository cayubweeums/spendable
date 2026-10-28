import { redirect } from "next/navigation";
import { openApp, signUp } from "../actions";
import { signedIn } from "../auth";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { needsOnboarding, passwordIsSet, signupOpen } from "@/core/service";

export default async function LoginPage() {
  if (!passwordIsSet()) redirect("/onboarding");
  if (await signedIn()) redirect(needsOnboarding() ? "/onboarding" : "/");

  return (
    <div className="wizard">
      <ReadFlash />
      <h1 className="question">Open spendable</h1>
      <p className="page-intro">Enter the app password. It decrypts the data for this session.</p>
      <form action={openApp}>
        <label>
          Name
          <input name="name" autoComplete="username" maxLength={40} />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} autoFocus />
        </label>
        <div className="actions">
          <SubmitButton pending="Opening…">Open</SubmitButton>
        </div>
      </form>
      {signupOpen() ? (
        <form action={signUp} className="stack">
          <h2>Sign up</h2>
          <label>
            Name
            <input name="name" required maxLength={40} autoComplete="username" />
          </label>
          <label>
            Password
            <input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
          </label>
          <SubmitButton pending="Signing up…">Sign up</SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
