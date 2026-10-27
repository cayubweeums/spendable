import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { createCategory, listCategories } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => ({ categories: listCategories() }));
}

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.name !== "string") throw new SpendableError("A category needs a name.", "bad_category");
    createCategory(body.name);
    return { categories: listCategories() };
  });
}
