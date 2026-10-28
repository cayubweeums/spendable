import { guard } from "@/core/http";
import { decodeFilter, listTransactions } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const since = url.searchParams.get("since") ?? undefined;
  const conditions = url.searchParams.getAll("c").flatMap((item) => {
    const filter = decodeFilter(item);
    return filter ? [filter] : [];
  });
  return guard(request, () => ({ transactions: listTransactions(since, conditions) }));
}
