import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { listTransactions, setCategory, setNote, setSplits, setTags } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return guard(request, async () => {
    const body = await readJson(request);
    if (body.category != null && typeof body.category !== "string") {
      throw new SpendableError("category should be a string or null.", "bad_category");
    }
    if (Array.isArray(body.splits)) {
      setSplits(
        id,
        body.splits.map((item) => {
          if (!item || typeof item !== "object") throw new SpendableError("A split needs a category.", "bad_split");
          const row = item as { category?: unknown; amount?: unknown };
          if (typeof row.category !== "string" || (typeof row.amount !== "string" && typeof row.amount !== "number")) {
            throw new SpendableError("A split needs a category.", "bad_split");
          }
          return { category: row.category, amount: String(row.amount) };
        }),
      );
    } else {
      setCategory(id, typeof body.category === "string" ? body.category : null);
    }
    if (typeof body.note === "string") setNote(id, body.note);
    if (typeof body.tags === "string") setTags(id, body.tags);
    return { transaction: listTransactions().find((txn) => txn.id === id) ?? null };
  });
}
