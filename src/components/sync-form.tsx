"use client";

import { syncBank } from "@/app/actions";
import { SubmitButton } from "./submit-button";

export function SyncForm() {
  return (
    <form action={syncBank}>
      <SubmitButton pending="Syncing…">Sync</SubmitButton>
    </form>
  );
}
