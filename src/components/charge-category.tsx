"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { decimalToCents, formatMoney, type NumberFormat } from "@/core/money";
import { distributeSplit } from "@/core/split-edit";
import { SubmitButton } from "./submit-button";

type Choice = { name: string; group: string };
type Row = { category: string; amount: string };

// shortcut: substring match, not Actual's fzf rank. Upgrade when a category list is long enough that a fragment should fuzzy-match.
function matching(categories: Choice[], query: string): Choice[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return categories;
  const byName = categories.filter((category) => category.name.toLowerCase().includes(needle));
  const seen = new Set(byName.map((category) => category.name));
  const byGroup = categories.filter(
    (category) => !seen.has(category.name) && category.group.toLowerCase().includes(needle),
  );
  return [...byName, ...byGroup];
}

function centsOf(value: string): number {
  try {
    return Math.abs(decimalToCents(value.trim() || "0"));
  } catch {
    return 0;
  }
}

function dollars(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2);
}

type MenuItem = { kind: "split" | "create" | "category"; name: string; group: string };

export function categoryMenu(categories: Choice[], query: string, allowSplit: boolean): MenuItem[] {
  const typed = query.trim().slice(0, 40);
  const exact = typed ? categories.find((category) => category.name.toLowerCase() === typed.toLowerCase()) : undefined;
  const found = matching(categories, query);
  return [
    ...(allowSplit ? [{ kind: "split" as const, name: "Split Transaction", group: "" }] : []),
    ...(typed && !exact ? [{ kind: "create" as const, name: typed, group: "" }] : []),
    ...found.map((category) => ({ kind: "category" as const, name: category.name, group: category.group })),
  ];
}

export function categoryMenuCursor(items: MenuItem[], query: string): number {
  const typed = query.trim().toLowerCase();
  const exact = items.findIndex((item) => item.kind === "category" && item.name.toLowerCase() === typed);
  if (exact >= 0) return exact;
  const create = items.findIndex((item) => item.kind === "create");
  if (create >= 0) return create;
  const category = items.findIndex((item) => item.kind === "category");
  return category >= 0 ? category : 0;
}

export function ChargeCategory({
  categories,
  category,
  splits,
  amountCents,
  currency,
  hidden,
  numberFormat,
  hideCents,
}: {
  categories: Choice[];
  category: string | null;
  splits: { category: string; amountCents: number }[];
  amountCents: number;
  currency: string;
  hidden: boolean;
  numberFormat: NumberFormat;
  hideCents: boolean;
}) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const parentAbs = Math.abs(amountCents);
  const alreadySplit = splits.length >= 2;
  const [splitting, setSplitting] = useState(alreadySplit);
  const [expanded, setExpanded] = useState(alreadySplit);
  const [chosen, setChosen] = useState(alreadySplit ? "" : (category ?? ""));
  const [rows, setRows] = useState<Row[]>(
    alreadySplit
      ? splits.map((part) => ({ category: part.category, amount: dollars(part.amountCents) }))
      : [
          { category: "", amount: "" },
          { category: "", amount: "" },
        ],
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const choices = useMemo(() => {
    const names = new Set(categories.map((item) => item.name));
    const extra = [chosen, ...rows.map((row) => row.category)].filter((name) => name && !names.has(name));
    return [...extra.map((name) => ({ name, group: "" })), ...categories];
  }, [categories, chosen, rows]);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const items = useMemo(() => categoryMenu(choices, query, !splitting), [choices, query, splitting]);

  function openMenu(nextQuery = "") {
    setQuery(nextQuery);
    setCursor(categoryMenuCursor(categoryMenu(choices, nextQuery, true), nextQuery));
    setOpen(true);
  }

  function pickCategory(name: string, form: HTMLFormElement) {
    flushSync(() => {
      setSplitting(false);
      setChosen(name);
      setOpen(false);
    });
    form.requestSubmit();
  }

  function startSplit() {
    setSplitting(true);
    setExpanded(true);
    setChosen("");
    setOpen(false);
    if (!alreadySplit && rows.every((row) => !row.category && !row.amount)) {
      setRows([
        { category: "", amount: "" },
        { category: "", amount: "" },
      ]);
    }
  }

  function unsplit() {
    setSplitting(false);
    setExpanded(false);
    setChosen("");
    setOpen(false);
  }

  const entered = rows.map((row) => centsOf(row.amount));
  const left = parentAbs - entered.reduce((sum, amount) => sum + amount, 0);
  const money = (cents: number) => formatMoney(cents, currency, hidden, { number: numberFormat, hideCents });

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((current) => {
        const step = event.key === "ArrowDown" ? 1 : -1;
        return Math.min(items.length - 1, Math.max(0, current + step));
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = items[Math.min(cursor, Math.max(items.length - 1, 0))];
      if (!item || !event.currentTarget.form) return;
      if (item.kind === "split") startSplit();
      else pickCategory(item.name, event.currentTarget.form);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="cat-field" ref={root}>
      <input type="hidden" name="category" value={splitting ? "__split" : chosen} />
      {splitting ? (
        <button type="button" className="cat-face split" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? "▾" : "▸"} Split
        </button>
      ) : open ? (
        <input
          aria-controls={listId}
          aria-expanded="true"
          aria-label="Category"
          autoFocus
          value={query}
          maxLength={40}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setCursor(categoryMenuCursor(categoryMenu(choices, next, true), next));
          }}
          onKeyDown={onKey}
        />
      ) : (
        <button type="button" className={chosen ? "cat-face" : "cat-face empty"} aria-expanded="false" onClick={() => openMenu()}>
          {chosen || "Categorize"}
        </button>
      )}
      {open && !splitting ? (
        <div className="cat-menu" id={listId} role="listbox">
          {items.map((item, index) => {
            const previous = items[index - 1];
            const header = item.kind === "category" && item.group && item.group !== previous?.group;
            const on = index === Math.min(cursor, items.length - 1);
            return (
              <div key={`${item.kind}-${item.name}`}>
                {header ? <p className="cat-group">{item.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  className={item.kind === "category" ? undefined : "split-option"}
                  data-on={on ? "1" : undefined}
                  aria-selected={on}
                  onMouseEnter={() => setCursor(index)}
                  onClick={(event) => {
                    if (item.kind === "split") startSplit();
                    else if (event.currentTarget.form) pickCategory(item.name, event.currentTarget.form);
                  }}
                >
                  {item.kind === "create" ? `Create ${item.name}` : item.name}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      {splitting ? (
        <div className="splits" hidden={!expanded}>
          {rows.map((row, index) => (
            <SplitRow
              key={index}
              index={index}
              row={row}
              categories={choices}
              onAmount={(amount) => setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, amount } : item)))}
              onCategory={(name) => setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, category: name } : item)))}
            />
          ))}
          <div className="split-bar">
            {left !== 0 ? (
              <>
                <span>
                  Amount left <strong className={left < 0 ? "out" : undefined}>{money(left)}</strong>
                </span>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    const next = distributeSplit(parentAbs, entered);
                    setRows((current) => current.map((row, index) => ({ ...row, amount: dollars(next[index] ?? 0) })));
                  }}
                >
                  Distribute
                </button>
                <button type="button" onClick={() => setRows((current) => [...current, { category: "", amount: "" }])}>
                  Add Split
                </button>
              </>
            ) : (
              <SubmitButton pending="Saving…">Save</SubmitButton>
            )}
            <button type="button" className="quiet" onClick={unsplit}>
              Unsplit
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SplitRow({
  index,
  row,
  categories,
  onAmount,
  onCategory,
}: {
  index: number;
  row: Row;
  categories: Choice[];
  onAmount: (amount: string) => void;
  onCategory: (name: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const items = categoryMenu(categories, query, false);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="split" ref={root}>
      <input type="hidden" name="split-category" value={row.category} />
      {open ? (
        <input
          aria-controls={listId}
          aria-label={`Split ${index + 1} category`}
          autoFocus
          value={query}
          maxLength={40}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setCursor(categoryMenuCursor(categoryMenu(categories, next, false), next));
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setCursor((current) => Math.min(items.length - 1, Math.max(0, current + step)));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const item = items[Math.min(cursor, Math.max(items.length - 1, 0))];
              if (!item || item.kind === "split") return;
              onCategory(item.name);
              setOpen(false);
            } else if (event.key === "Escape") setOpen(false);
          }}
        />
      ) : (
        <button type="button" className={row.category ? "cat-face" : "cat-face empty"} onClick={() => setOpen(true)}>
          {row.category || "Categorize"}
        </button>
      )}
      {open ? (
        <div className="cat-menu" id={listId} role="listbox">
          {items.map((item, itemIndex) => {
            const previous = items[itemIndex - 1];
            return (
              <div key={item.name}>
                {item.group && item.group !== previous?.group ? <p className="cat-group">{item.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  className={item.kind === "create" ? "split-option" : undefined}
                  data-on={itemIndex === cursor ? "1" : undefined}
                  aria-selected={itemIndex === cursor}
                  onMouseEnter={() => setCursor(itemIndex)}
                  onClick={() => {
                    onCategory(item.name);
                    setOpen(false);
                  }}
                >
                  {item.kind === "create" ? `Create ${item.name}` : item.name}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <input
        name="split-amount"
        inputMode="decimal"
        maxLength={20}
        aria-label={`Split ${index + 1} amount`}
        value={row.amount}
        onChange={(event) => onAmount(event.target.value)}
      />
    </div>
  );
}
