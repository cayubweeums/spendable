import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { gateDecision } from "@/core/gate";
import { SESSION_COOKIE, sessionIsOpen } from "@/core/service";

export function proxy(request: NextRequest) {
  const decision = gateDecision({
    pathname: request.nextUrl.pathname,
    method: request.method,
    signedIn: sessionIsOpen(request.cookies.get(SESSION_COOKIE)?.value),
  });
  if (decision === "next") return NextResponse.next();
  if (decision === "unauthorized") {
    return NextResponse.json({ error: { code: "unauthorized", message: "Sign in first." } }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
