export function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function gateDecision(input: {
  pathname: string;
  method: string;
  signedIn: boolean;
  passwordSet: boolean;
  mustChange?: boolean;
}): "next" | "login" | "onboarding" | "password" | "unauthorized" {
  if (input.pathname === "/icon") return "next";
  if (input.pathname === "/api/v1/session" && input.method === "POST") return "next";
  if (input.pathname === "/api/mcp" && input.method === "POST" && !(input.signedIn && input.mustChange)) return "next";
  if (input.pathname === "/api/v1/flash" && input.method === "DELETE") return "next";
  if (!input.signedIn && input.pathname === "/api/v1/users" && input.method === "POST") return "next";
  if (input.signedIn && input.mustChange) {
    if (input.pathname === "/password") return "next";
    if (input.pathname === "/api/v1/password" && input.method === "POST") return "next";
    if (input.pathname === "/api/v1/session" && input.method === "DELETE") return "next";
    if (input.pathname.startsWith("/api/")) return "unauthorized";
    return "password";
  }
  if (input.signedIn) return "next";
  if (!input.passwordSet) {
    if (input.pathname === "/onboarding" || input.pathname === "/login") return "next";
    if (input.pathname.startsWith("/api/")) return "unauthorized";
    return "onboarding";
  }
  if (input.pathname === "/login") return "next";
  if (input.pathname.startsWith("/api/")) return "unauthorized";
  return "login";
}
