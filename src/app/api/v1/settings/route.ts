import { handle, readJson } from "@/core/http";
import { getSettings, updateSettings } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return handle(() => getSettings());
}

export function PATCH(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    return updateSettings({
      paydayFrequency: typeof body.paydayFrequency === "string" ? body.paydayFrequency : undefined,
      paydayAnchor: typeof body.paydayAnchor === "string" ? body.paydayAnchor : undefined,
      bufferCents: typeof body.bufferCents === "number" ? body.bufferCents : undefined,
    });
  });
}
