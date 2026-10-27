import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { editCharge, listTransactions } from "@/core/service";

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
    const note = typeof body.note === "string" ? body.note : undefined;
    const tags = typeof body.tags === "string" ? body.tags : undefined;
    if (Array.isArray(body.splits)) {
      editCharge(id, {
        note,
        tags,
        splits: body.splits.map((item) => {
          if (!item || typeof item !== "object") throw new SpendableError("A split needs a category.", "bad_split");
          const row = item as { category?: unknown; amount?: unknown };
          if (typeof row.category !== "string" || (typeof row.amount !== "string" && typeof row.amount !== "number")) {
            throw new SpendableError("A split needs a category.", "bad_split");
          }
          return { category: row.category, amount: String(row.amount) };
        }),
      });
    } else {
      editCharge(id, { category: typeof body.category === "string" ? body.category : null, note, tags });
    }
    return { transaction: listTransactions().find((txn) => txn.id === id) ?? null };
  });
}
