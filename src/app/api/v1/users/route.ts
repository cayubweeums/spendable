import { cookies } from "next/headers";
import { handle, readJson, requestIsOpen } from "@/core/http";
import { SESSION_COOKIE, addUser, registerUser, sessionCookie } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (requestIsOpen(request)) {
      addUser(name, password);
      return { ok: true };
    }
    const token = registerUser(name, password);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, sessionCookie);
    return { ok: true };
  });
}
