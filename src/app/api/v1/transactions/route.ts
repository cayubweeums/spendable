import { SpendableError } from "@/core/errors";
import { guard, handle, readJson, requestIsOpen } from "@/core/http";
import { copyCharges, decodeFilter, editCharges, listTransactions, mergeCharges, transactionsCsv } from "@/core/service";

// POST /api/v1/transactions — batch operations on charges.
// Operations are mutually exclusive in a single request: category, copy, or merge.
// All operations are atomic (inside a db transaction). Account balances stay unchanged.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    if (!requestIsOpen(request)) {
      return handle(() => {
        throw new SpendableError("Sign in first.", "unauthorized", 401);
      });
    }
    try {
      return new Response(transactionsCsv(), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="charges.csv"',
        },
      });
    } catch (error) {
      return handle(() => {
        throw error;
      });
    }
  }
  const since = url.searchParams.get("since") ?? undefined;
  const conditions = url.searchParams.getAll("c").flatMap((item) => {
    const filter = decodeFilter(item);
    return filter ? [filter] : [];
  });
  return guard(request, () => ({ transactions: listTransactions(since, conditions) }));
}

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    
    // Validate that ids is a non-empty array of strings
    if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
      throw new SpendableError("ids must be an array of transaction ID strings.", "bad_ids");
    }

    // Operation 1: Merge two charges into one
    if (body.merge === true) return { id: mergeCharges(body.ids) };

    // Operation 2: Copy/duplicate multiple charges  
    if (body.copy === true) return { ids: copyCharges(body.ids) };

    // Operation 3: Batch set category on multiple transactions
    // For clearing a category, pass body.category = null
    if (body.category != null && typeof body.category !== "string") {
      throw new SpendableError("category must be a string or null.", "bad_category");
    }
    editCharges(body.ids, typeof body.category === "string" ? body.category : null);
    return { updated: body.ids.length };
  });
}
