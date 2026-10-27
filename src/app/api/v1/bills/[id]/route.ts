import { guard } from "@/core/http";
import { removeBill } from "@/core/service";

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
