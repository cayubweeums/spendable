import { guard, readJson } from "@/core/http";
import { getSnapshot, listAccounts, updateAccount } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return guard(request, async () => {
    const body = await readJson(request);
    updateAccount(id, {
      role: typeof body.role === "string" ? body.role : undefined,
      dueDay: body.dueDay === null ? null : typeof body.dueDay === "number" ? body.dueDay : undefined,
      payMode: typeof body.payMode === "string" ? body.payMode : undefined,
      minimumCents: typeof body.minimumCents === "number" ? body.minimumCents : undefined,
      label: typeof body.label === "string" ? body.label : undefined,
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return { account: listAccounts().find((account) => account.id === id) ?? null, snapshot: getSnapshot() };
  });
}
