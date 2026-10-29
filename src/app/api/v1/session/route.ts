import { cookies } from "next/headers";
import { cookieValue } from "@/core/gate";
import { guard, handle, readJson } from "@/core/http";
import {
  SESSION_COOKIE,
  closeSession,
  establishPassword,
  passwordIsSet,
  sessionCookie,
  signIn,
} from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const password = typeof body.password === "string" ? body.password : "";
    const token = passwordIsSet()
      ? signIn(password, typeof body.name === "string" ? body.name : "")
      : establishPassword(password, typeof body.confirm === "string" ? body.confirm : "", typeof body.name === "string" ? body.name : "");
    const jar = await cookies();
    jar.set(SESSION_COOKIE, token, sessionCookie);
    return Response.json({ ok: true });
  } catch (error) {
    return handle(() => {
      throw error;
    });
  }
}

export function DELETE(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
  return guard(request, async () => {
    closeSession(token);
    const jar = await cookies();
    jar.set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 });
    return { ok: true };
  });
}
