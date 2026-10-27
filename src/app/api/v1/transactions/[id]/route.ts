import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { listTransactions, setCategory, setNote } from "@/core/service";

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
    setCategory(id, typeof body.category === "string" ? body.category : null);
    if (typeof body.note === "string") setNote(id, body.note);
    return { transaction: listTransactions().find((txn) => txn.id === id) ?? null };
  });
}
