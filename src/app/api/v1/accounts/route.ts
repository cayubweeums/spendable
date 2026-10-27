import { handle } from "@/core/http";
import { listAccounts } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return handle(() => ({ accounts: listAccounts() }));
}
