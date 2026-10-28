import { guard, readJson } from "@/core/http";
import { changePassword } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    changePassword(typeof body.password === "string" ? body.password : "", typeof body.confirm === "string" ? body.confirm : "");
    return { ok: true };
  });
}
