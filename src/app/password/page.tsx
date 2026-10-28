import { redirect } from "next/navigation";
import { changePassword } from "../actions";
import { signedIn } from "../auth";
import { ReadFlash } from "@/components/read-flash";
import { SubmitButton } from "@/components/submit-button";
import { mustChangePassword, needsOnboarding } from "@/core/service";

export default async function PasswordPage() {
  if (!(await signedIn())) redirect("/login");
  if (!mustChangePassword()) redirect(needsOnboarding() ? "/onboarding" : "/");

  return (
    <div className="wizard">
      <ReadFlash />
      <h1 className="question">New password</h1>
      <form action={changePassword}>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} autoFocus />
        </label>
        <label>
          Confirm
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={128} />
        </label>
        <div className="actions">
          <SubmitButton pending="Saving…">Save</SubmitButton>
        </div>
      </form>
    </div>
  );
}
