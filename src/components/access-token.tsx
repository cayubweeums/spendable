"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { issueToken, revokeToken } from "@/app/actions";
import { SubmitButton } from "./submit-button";

export function AccessToken({ tokens }: { tokens: { name: string; lastUsed: string }[] }) {
  const router = useRouter();
  const [fresh, action] = useActionState(issueToken, null);
  useEffect(() => {
    if (fresh) router.refresh();
  }, [fresh, router]);
  return (
    <section className="section stack">
      <h2>MCP</h2>
      {fresh ? (
        <label>
          {fresh.name}
          <input readOnly value={fresh.token} spellCheck={false} autoComplete="off" onFocus={(event) => event.currentTarget.select()} />
        </label>
      ) : null}
      {tokens.length > 0 ? (
        <ul className="rows">
          {tokens.map((token) => (
            <li key={token.name}>
              <span>
                {token.name}
                <small>Last used {token.lastUsed}</small>
              </span>
              <form action={revokeToken}>
                <input type="hidden" name="name" value={token.name} />
                <button className="quiet" type="submit">
                  Revoke
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
      <form action={action} className="stack">
        <label>
          Name
          <input name="name" required maxLength={40} />
        </label>
        <SubmitButton pending="Creating…">New</SubmitButton>
      </form>
    </section>
  );
}
