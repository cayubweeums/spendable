"use client";

import { useState } from "react";
import { ACCOUNT_KINDS } from "@/core/bank";
import type { AccountKind, PayMode } from "@/core/types";

export function KindFields({
  id,
  kind,
  dueDay,
  payMode,
  minimumCents,
}: {
  id: string;
  kind: AccountKind;
  dueDay: number | null;
  payMode: PayMode;
  minimumCents: number;
}) {
  const [value, setValue] = useState(kind);
  return (
    <>
      <label>
        Type
        <select name={`kind:${id}`} value={value} onChange={(event) => setValue(event.target.value as AccountKind)}>
          {ACCOUNT_KINDS.map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {value === "credit" ? (
        <div className="row">
          <label>
            Due day
            <input name={`due:${id}`} type="number" min={1} max={31} defaultValue={dueDay ?? ""} />
          </label>
          <label>
            Before payday
            <select name={`pay:${id}`} defaultValue={payMode}>
              <option value="none">Don&apos;t hold a payment</option>
              <option value="full">Hold the full balance</option>
              <option value="minimum">Hold a minimum</option>
            </select>
          </label>
          <label>
            Minimum
            <input name={`minimum:${id}`} inputMode="decimal" defaultValue={(minimumCents / 100).toFixed(2)} />
          </label>
        </div>
      ) : null}
    </>
  );
}
