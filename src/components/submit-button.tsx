"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pending,
  quiet = false,
}: {
  children: React.ReactNode;
  pending: string;
  quiet?: boolean;
}) {
  const status = useFormStatus();
  return (
    <button type="submit" className={quiet ? "quiet" : undefined} disabled={status.pending} aria-busy={status.pending}>
      {status.pending ? pending : children}
    </button>
  );
}
