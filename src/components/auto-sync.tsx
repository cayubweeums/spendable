"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoSync({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(stale ? "Copying the latest balances." : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!stale) return;
    let stop = false;
    fetch("/api/v1/sync", { method: "POST" })
      .then((response) => {
        if (stop) return;
        if (!response.ok) {
          setFailed(true);
          setMessage("The bank copy stopped. Use Copy from bank to try again.");
          return;
        }
        setMessage(null);
        router.refresh();
      })
      .catch(() => {
        if (stop) return;
        setFailed(true);
        setMessage("The bank copy stopped. Use Copy from bank to try again.");
      });
    return () => {
      stop = true;
    };
  }, [stale, router]);

  if (!message) return null;
  return (
    <p className={failed ? "flash bad" : "syncing"} role={failed ? "alert" : "status"}>
      {message}
    </p>
  );
}
