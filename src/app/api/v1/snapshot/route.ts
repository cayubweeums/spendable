import { guard } from "@/core/http";
import { getSnapshot } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => getSnapshot());
}
