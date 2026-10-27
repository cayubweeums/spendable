import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { connect, connectionStatus, disconnect, saveSyncSchedule } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => connectionStatus());
}

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.setupToken !== "string") {
      throw new SpendableError("setupToken is required.", "bad_token");
    }
    const synced = await connect(body.setupToken);
    return { ...synced, connection: connectionStatus() };
  });
}

export function PATCH(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    const patch: { on?: boolean; everyHours?: number; at?: string } = {};
    if (typeof body.syncOn === "boolean") patch.on = body.syncOn;
    if (typeof body.syncEveryHours === "number") patch.everyHours = body.syncEveryHours;
    if (typeof body.syncAt === "string") patch.at = body.syncAt;
    if (patch.on == null && patch.everyHours == null && patch.at == null) {
      throw new SpendableError("Nothing to save.", "bad_sync");
    }
    saveSyncSchedule(patch);
    return connectionStatus();
  });
}

export function DELETE(request: Request) {
  return guard(request, () => {
    disconnect();
    return connectionStatus();
  });
}
