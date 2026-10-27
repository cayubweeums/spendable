"use client";

import { useFormStatus } from "react-dom";

export function PendingNote({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="syncing" role="status">
      {children}
    </p>
  );
}
