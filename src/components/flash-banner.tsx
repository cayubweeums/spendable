"use client";

import { useEffect, useState } from "react";

export function FlashBanner({ error, notice }: { error?: string; notice?: string }) {
  const [latched] = useState({ error, notice });
  useEffect(() => {
    if (!latched.error) return;
    void fetch("/api/v1/flash", { method: "DELETE" });
  }, [latched.error]);
  const message = latched.error ?? latched.notice;
  if (!message) return null;
  return (
    <p className={latched.error ? "flash bad" : "flash"} role={latched.error ? "alert" : "status"}>
      {message}
    </p>
  );
}
