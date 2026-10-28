import { SpendableError } from "@/core/errors";
import { guard, readJson } from "@/core/http";
import { createProjection, listProjections } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  return guard(request, () => ({ projections: listProjections() }));
}

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.name !== "string" || typeof body.amountCents !== "number" || typeof body.dueDay !== "number" || typeof body.kind !== "string") {
      throw new SpendableError("A plan needs a name.", "bad_plan");
    }
    const created = createProjection({
      name: body.name,
      amountCents: body.amountCents,
      dueDay: body.dueDay,
      kind: body.kind,
      matchText: typeof body.matchText === "string" ? body.matchText : "",
    });
    return { ...created, projections: listProjections() };
  });
}
