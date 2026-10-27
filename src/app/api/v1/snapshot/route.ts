import { handle } from "@/core/http";
import { getSnapshot } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return handle(() => getSnapshot());
}
