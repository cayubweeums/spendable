"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { hideAmounts } from "@/app/actions";

export function HideToggle({ hidden }: { hidden: boolean }) {
  const path = usePathname();
  const search = useSearchParams().toString();
  const next = search ? `${path}?${search}` : path;
  return (
    <form action={hideAmounts}>
      <input type="hidden" name="next" value={next} />
      <label className="check">
        <input
          type="checkbox"
          name="hide"
          value="1"
          defaultChecked={hidden}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        />
        Hide
      </label>
    </form>
  );
}
