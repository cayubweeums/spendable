import { handle, requestIsOpen } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { downloadBackup, restoreBackup } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function signedIn(request: Request): boolean {
  return requestIsOpen(request);
}

export function GET(request: Request) {
  if (!signedIn(request)) {
    return handle(() => {
      throw new SpendableError("Sign in first.", "unauthorized", 401);
    });
  }
  try {
    return new Response(new Uint8Array(downloadBackup()), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="spendable.zip"',
      },
    });
  } catch (error) {
    return handle(() => {
      throw error;
    });
  }
}

export async function POST(request: Request) {
  if (!signedIn(request)) {
    return handle(() => {
      throw new SpendableError("Sign in first.", "unauthorized", 401);
    });
  }
  try {
    restoreBackup(Buffer.from(await request.arrayBuffer()));
    return Response.json({ ok: true });
  } catch (error) {
    return handle(() => {
      throw error;
    });
  }
}
