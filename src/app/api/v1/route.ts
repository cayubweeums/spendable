import { apiContract } from "@/core/contract";
import { guard } from "@/core/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => apiContract);
}
