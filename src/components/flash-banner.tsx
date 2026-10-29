"use client";

import { useEffect, useState } from "react";

const HOLD_MS = 8000;

export function bankNoteKey(stamp: string | null, warnings: string[]): string {
  return `${stamp ?? ""}\n${warnings.join("\n")}`;
}

type Item = { id: string; text: string; bad: boolean };

export function FlashBanner({
  error,
  notice,
  warnings = [],
  stamp = null,
}: {
  error?: string;
  notice?: string;
  warnings?: string[];
  stamp?: string | null;
}) {
  const [items, setItems] = useState<Item[]>(() => {
    const text = error ?? notice;
    return text ? [{ id: error ? "error" : "notice", text, bad: Boolean(error) }] : [];
  });

  useEffect(() => {
    if (!error) return;
    void fetch("/api/v1/flash", { method: "DELETE" });
  }, [error]);

  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("notice")) return;
    url.searchParams.delete("notice");
    const query = url.searchParams.toString();
    window.history.replaceState(null, "", query ? `${url.pathname}?${query}` : url.pathname);
  }, [notice]);

  useEffect(() => {
    if (warnings.length === 0) return;
    const key = bankNoteKey(stamp, warnings);
    // shortcut: once per sync in this tab. A log of old bank notes waits.
    if (sessionStorage.getItem("spendable-note") === key) return;
    let cancel = false;
    queueMicrotask(() => {
      if (!cancel) sessionStorage.setItem("spendable-note", key);
    });
    setItems((current) => {
      const ids = new Set(current.map((item) => item.text));
      const added = warnings
        .filter((text) => !ids.has(text))
        .map((text) => ({ id: `bank:${text}`, text, bad: true }));
      return added.length === 0 ? current : [...current, ...added];
    });
    return () => {
      cancel = true;
    };
  }, [warnings, stamp]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = window.setTimeout(() => setItems([]), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="toasts">
      {items.map((item) => (
        <p key={item.id} className={item.bad ? "toast bad" : "toast"} role={item.bad ? "alert" : "status"}>
          <span className="toast-kicker">{item.bad ? "Bank" : "Note"}</span>
          <span className="toast-text">{item.text}</span>
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))}
          >
            Dismiss
          </button>
        </p>
      ))}
    </div>
  );
}
