import { redirect } from "next/navigation";
import { openApp } from "../actions";
import { signedIn } from "../auth";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { needsOnboarding, passwordIsSet } from "@/core/service";

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
          Password
          <input name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={128} autoFocus />
        </label>
        <div className="actions">
          <SubmitButton pending="Opening…">Open</SubmitButton>
        </div>
      </form>
    </div>
  );
}
