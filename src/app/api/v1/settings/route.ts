import { guard, readJson } from "@/core/http";
import { getSettings, updateSettings } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => getSettings());
}

export function PATCH(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    return updateSettings({
      paydayFrequency: typeof body.paydayFrequency === "string" ? body.paydayFrequency : undefined,
      paydayAnchor: typeof body.paydayAnchor === "string" ? body.paydayAnchor : undefined,
      bufferCents: typeof body.bufferCents === "number" ? body.bufferCents : undefined,
    });
  });
}
