import { apiContract } from "@/core/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(apiContract);
}
