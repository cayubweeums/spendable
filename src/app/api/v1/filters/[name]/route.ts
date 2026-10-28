import { guard } from "@/core/http";
import { removeNamedFilter } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ name: string }> };

export async function DELETE(request: Request, context: Context) {
  const { name } = await context.params;
  return guard(request, () => {
    removeNamedFilter(name);
    return { deleted: true };
  });
}
