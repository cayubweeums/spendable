import { SpendableError, scrubSecrets } from "./errors";
import { cookieValue } from "./gate";
import { SESSION_COOKIE, sessionIsOpen } from "./service";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new SpendableError("Expected a JSON object.", "bad_json");
  }
  return body as Record<string, unknown>;
}

export function guard(request: Request, fn: () => Promise<unknown> | unknown): Promise<Response> {
  return handle(() => {
    if (!sessionIsOpen(cookieValue(request.headers.get("cookie"), SESSION_COOKIE))) {
      throw new SpendableError("Sign in first.", "unauthorized", 401);
    }
    return fn();
  });
}

export async function handle(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (error) {
    if (error instanceof SpendableError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    console.error(scrubSecrets(error instanceof Error ? error.message : "request failed"));
    return Response.json({ error: { code: "internal", message: "Something went wrong." } }, { status: 500 });
  }
}
