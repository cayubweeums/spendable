import { guard, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { listSavedFilters, saveNamedFilter } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => ({ filters: listSavedFilters() }));
}

export function PUT(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.name !== "string" || !Array.isArray(body.conditions)) {
      throw new SpendableError("A filter needs a name.", "bad_filter");
    }
    const conditions = body.conditions.map((item) => {
      if (!item || typeof item !== "object") throw new SpendableError("Add a condition.", "bad_filter");
      const row = item as { field?: unknown; op?: unknown; value?: unknown };
      if (typeof row.field !== "string" || typeof row.op !== "string" || typeof row.value !== "string") {
        throw new SpendableError("Add a condition.", "bad_filter");
      }
      return { field: row.field, op: row.op, value: row.value };
    });
    const name = saveNamedFilter(body.name, conditions);
    return { filter: listSavedFilters().find((filter) => filter.name === name) ?? null };
  });
}
