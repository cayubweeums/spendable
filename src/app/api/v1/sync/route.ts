import { guard } from "@/core/http";
import { sync } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return guard(request, () => sync());
}
