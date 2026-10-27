import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, closeSession, sessionCookie, sessionIsOpen } from "@/core/service";

export async function signedIn(): Promise<boolean> {
  const jar = await cookies();
  return sessionIsOpen(jar.get(SESSION_COOKIE)?.value);
}

export async function requirePage(): Promise<void> {
  if (!(await signedIn())) redirect("/login");
}

export async function writeSession(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookie);
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  closeSession(jar.get(SESSION_COOKIE)?.value);
  jar.set(SESSION_COOKIE, "", { ...sessionCookie, maxAge: 0 });
}
