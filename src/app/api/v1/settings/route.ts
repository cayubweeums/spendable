import { guard, readJson } from "@/core/http";
import { getDisplay, getSettings, saveDisplay, updateSettings } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => getSettings());
}

export function PATCH(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (
      typeof body.date === "string" ||
      typeof body.number === "string" ||
      typeof body.weekStart === "string" ||
      typeof body.hideCents === "boolean"
    ) {
      const current = getDisplay();
      saveDisplay({
        date: typeof body.date === "string" ? body.date : current.date,
        number: typeof body.number === "string" ? body.number : current.number,
        weekStart: typeof body.weekStart === "string" ? body.weekStart : String(current.weekStart),
        hideCents: typeof body.hideCents === "boolean" ? body.hideCents : current.hideCents,
      });
    }
    updateSettings({
      paydayFrequency: typeof body.paydayFrequency === "string" ? body.paydayFrequency : undefined,
      paydayAnchor: typeof body.paydayAnchor === "string" ? body.paydayAnchor : undefined,
      paydayDays: typeof body.paydayDays === "string" ? body.paydayDays : undefined,
      bufferCents: typeof body.bufferCents === "number" ? body.bufferCents : undefined,
    });
    return getSettings();
  });
}
