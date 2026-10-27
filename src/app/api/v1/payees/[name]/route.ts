import { guard, readJson } from "@/core/http";
import { listPayees, mergePayee, updatePayee } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ name: string }> };

export async function PATCH(request: Request, context: Context) {
  const { name } = await context.params;
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.mergeInto === "string" && body.mergeInto !== "") {
      mergePayee(name, body.mergeInto);
    } else {
      updatePayee(name, {
        name: typeof body.name === "string" ? body.name : undefined,
        favorite: typeof body.favorite === "boolean" ? body.favorite : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
      });
    }
    return { payees: listPayees() };
  });
}
