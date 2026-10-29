"use client";

import { useEffect, useId, useRef, useState } from "react";

export type MenuChoice = { value: string; label: string; group?: string };

export function menuRows(choices: readonly MenuChoice[], query: string, creatable: boolean): MenuChoice[] {
  if (!creatable) return [...choices];
  const typed = query.trim().slice(0, 40);
  const named = choices.filter((choice) => choice.value !== "" && choice.label !== "" && choice.label !== "—");
  if (!typed) return [...choices];
  const exact = named.some(
    (choice) => choice.label.toLowerCase() === typed.toLowerCase() || choice.value.toLowerCase() === typed.toLowerCase(),
  );
  const found = named.filter(
    (choice) => choice.label.toLowerCase().includes(typed.toLowerCase()) || choice.value.toLowerCase().includes(typed.toLowerCase()),
  );
  return [...(exact ? [] : [{ value: typed, label: `Create ${typed}` }]), ...found];
}

export function MenuSelect({
  name,
  defaultValue = "",
  value,
  onValue,
  options,
  label,
  required,
  creatable = false,
}: {
  name: string;
  defaultValue?: string;
  value?: string;
  onValue?: (value: string) => void;
  options: readonly (readonly [string, string])[] | readonly MenuChoice[];
  label: string;
  required?: boolean;
  creatable?: boolean;
}) {
  const choices = normalizeChoices(options);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [inner, setInner] = useState(defaultValue);
  const [cursor, setCursor] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = value ?? inner;
  const listed = choices.find((choice) => choice.value === current)?.label;
  const currentLabel = listed || current;
  const rows = menuRows(choices, query, creatable);

  useEffect(() => {
    if (!open) return;
    function place() {
      const node = buttonRef.current ?? rootRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const height = Math.min(176, rows.length * 32 + 12);
      const below = window.innerHeight - rect.bottom;
      const top = below < height && rect.top > below ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
      setBox({ top, left: rect.left, width: Math.max(rect.width, 256) });
    }
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
    }
    place();
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, rows.length]);

  function pick(next: string) {
    if (value == null) setInner(next);
    onValue?.(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKey(event: React.KeyboardEvent) {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setCursor(Math.max(0, choices.findIndex((choice) => choice.value === current)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setCursor((index) => Math.min(rows.length - 1, Math.max(0, index + step)));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = rows[Math.min(cursor, Math.max(rows.length - 1, 0))];
      if (choice) pick(choice.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="cat-field" ref={rootRef} onKeyDown={onKey}>
      {open && creatable ? (
        <input
          aria-label={label}
          autoFocus
          className="menu-face"
          maxLength={40}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            onKey(event);
            event.stopPropagation();
          }}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          className="menu-face"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setQuery("");
            setCursor(Math.max(0, choices.findIndex((choice) => choice.value === current)));
            setOpen((shown) => !shown);
          }}
        >
          {currentLabel || "\u00a0"}
        </button>
      )}
      <input className="menu-value" name={name} value={current} required={required} tabIndex={-1} onChange={() => undefined} />
      {open && box ? (
        <div
          className="cat-menu dock"
          id={listId}
          role="listbox"
          style={{ top: box.top, left: box.left, width: box.width }}
        >
          {rows.map((choice, index) => {
            const previous = rows[index - 1];
            const header = choice.group && choice.group !== previous?.group;
            return (
              <div key={`${choice.group ?? ""}-${choice.value}-${index}`}>
                {header ? <p className="cat-group">{choice.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  data-on={index === cursor ? "1" : undefined}
                  aria-selected={index === cursor}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => pick(choice.value)}
                >
                  {choice.label || "—"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function normalizeChoices(options: readonly (readonly [string, string])[] | readonly MenuChoice[]): MenuChoice[] {
  const first = options[0];
  if (!first || Array.isArray(first)) {
    return (options as readonly (readonly [string, string])[]).map(([value, label]) => ({ value, label }));
  }
  return [...(options as readonly MenuChoice[])];
}
