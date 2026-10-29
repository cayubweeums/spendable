"use client";

import { useState } from "react";
import { MenuSelect } from "@/components/menu-select";
import { ACCOUNT_KINDS } from "@/core/bank";
import type { AccountKind, PayMode } from "@/core/types";

export function KindFields({
  id,
  kind,
  tracked,
  dueDay,
  payMode,
  minimumCents,
}: {
  id: string;
  kind: AccountKind;
  tracked: boolean;
  dueDay: number | null;
  payMode: PayMode;
  minimumCents: number;
}) {
  const [value, setValue] = useState(kind);
  const [follow, setFollow] = useState(tracked);
  return (
    <>
      <label>
        Type
        <MenuSelect
          name={`kind:${id}`}
          value={value}
          onValue={(next) => setValue(next as AccountKind)}
          label="Type"
          options={ACCOUNT_KINDS}
        />
      </label>
      {value === "checking" ? (
        <label className="check">
          <input
            type="checkbox"
            name={`track:${id}`}
            value="1"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          Follow this account
        </label>
      ) : (
        // An omitted checkbox means unfollow. Other types stay followed.
        <input type="hidden" name={`track:${id}`} value="1" />
      )}
      {value === "credit" ? (
        <div className="row">
          <label>
            Due day
            <input name={`due:${id}`} type="number" min={1} max={31} defaultValue={dueDay ?? ""} />
          </label>
          <label>
            Before payday
            <MenuSelect
              name={`pay:${id}`}
              defaultValue={payMode}
              label="Before payday"
              options={[
                ["none", "Don't hold a payment"],
                ["full", "Hold the full balance"],
                ["minimum", "Hold a minimum"],
              ]}
            />
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
