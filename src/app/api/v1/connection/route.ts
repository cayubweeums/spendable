import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { connect, connectionStatus, disconnect } from "@/core/service";

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

export function DELETE(request: Request) {
  return guard(request, () => {
    disconnect();
    return connectionStatus();
  });
}
