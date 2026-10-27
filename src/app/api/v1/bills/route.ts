import { handle, readJson } from "@/core/http";
import { SpendableError } from "@/core/errors";
import { createBill, listBills } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return handle(() => ({ bills: listBills() }));
}

export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    if (typeof body.name !== "string" || typeof body.amountCents !== "number" || typeof body.dueDay !== "number") {
      throw new SpendableError("A bill needs name, amountCents, and dueDay.", "bad_bill");
    }
    const created = createBill({ name: body.name, amountCents: body.amountCents, dueDay: body.dueDay });
    return { ...created, bills: listBills() };
  });
}
