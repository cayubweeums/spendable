import { handle } from "@/core/http";
import { sync } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST() {
  return handle(() => sync());
}
