import { guard, readJson } from "@/core/http";
import { patchBill, removeBill } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return guard(request, () => {
    removeBill(id);
    return { deleted: true };
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return guard(request, async () => {
    const body = await readJson(request);
    if (body.active !== undefined && typeof body.active !== "boolean") {
      throw new Error("active must be a boolean.");
    }
    patchBill(id, { active: body.active });
    return { patched: true };
  });
}
