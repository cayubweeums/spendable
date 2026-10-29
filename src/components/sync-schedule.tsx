"use client";

import { useState } from "react";
import { saveSync } from "@/app/actions";
import { MenuSelect } from "@/components/menu-select";
import { SubmitButton } from "./submit-button";

const choices = [
  ["1", "1 hour"],
  ["6", "6 hours"],
  ["12", "12 hours"],
  ["24", "1 day"],
  ["168", "7 days"],
] as const;

export function SyncScheduleForm({ on, everyHours, at }: { on: boolean; everyHours: number; at: string }) {
  const [enabled, setEnabled] = useState(on);
  return (
    <form action={saveSync} className="row">
      <label className="check">
        <input
          type="checkbox"
          name="on"
          value="1"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        On
      </label>
      {enabled ? (
        <>
          <label>
            Every
            <MenuSelect name="every" defaultValue={String(everyHours)} label="Every" options={choices} />
          </label>
          <label>
            At
            <input type="time" name="at" defaultValue={at} />
          </label>
        </>
      ) : null}
      <SubmitButton pending="Saving…">Save</SubmitButton>
    </form>
  );
}
