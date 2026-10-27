import { guard, readJson } from "@/core/http";
import { listCategories, mergeCategory, removeCategory, updateCategory } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ name: string }> };

export async function PATCH(request: Request, context: Context) {
  const { name } = await context.params;
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.mergeInto === "string" && body.mergeInto !== "") {
      mergeCategory(name, body.mergeInto);
    } else {
      updateCategory(name, {
        name: typeof body.name === "string" ? body.name : undefined,
        group: typeof body.group === "string" ? body.group : undefined,
        note: typeof body.note === "string" ? body.note : undefined,
        hidden: typeof body.hidden === "boolean" ? body.hidden : undefined,
      });
    }
    return { categories: listCategories() };
  });
}

export async function DELETE(request: Request, context: Context) {
  const { name } = await context.params;
  return guard(request, () => {
    removeCategory(name);
    return { categories: listCategories() };
  });
}
