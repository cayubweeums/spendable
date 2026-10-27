import { handle } from "@/core/http";
import { listTransactions } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const since = new URL(request.url).searchParams.get("since") ?? undefined;
  return handle(() => ({ transactions: listTransactions(since) }));
}
