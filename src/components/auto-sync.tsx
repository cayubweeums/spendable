"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { syncIsDue } from "@/core/sync-due";

export function AutoSync({
  syncedAt,
  everyHours,
  at,
}: {
  syncedAt: string | null;
  everyHours: number;
  at: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!syncIsDue(syncedAt, { on: true, everyHours, at })) return;
    setMessage("Copying.");
    let stop = false;
    fetch("/api/v1/sync", { method: "POST" })
      .then((response) => {
        if (stop) return;
        if (!response.ok) {
          setFailed(true);
          setMessage("Sync failed.");
          return;
        }
        setMessage(null);
        router.refresh();
      })
      .catch(() => {
        if (stop) return;
        setFailed(true);
        setMessage("Sync failed.");
      });
    return () => {
      stop = true;
    };
  }, [syncedAt, everyHours, at, router]);

  if (!message) return null;
  return (
    <p className={failed ? "flash bad" : "syncing"} role={failed ? "alert" : "status"}>
      {message}
    </p>
  );
}
