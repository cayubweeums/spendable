import { SpendableError } from "@/core/errors";
import { guard, readJson } from "@/core/http";
import { importCharges } from "@/core/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.text !== "string" || typeof body.name !== "string" || typeof body.accountId !== "string") {
      throw new SpendableError("Choose a file.", "bad_import");
    }
    if (body.text.length > 2_000_000) throw new SpendableError("That file is too big.", "bad_import");
    return importCharges({
      accountId: body.accountId,
      text: body.text,
      name: body.name,
      date: typeof body.date === "string" ? body.date : "",
      sign: typeof body.sign === "string" ? body.sign : "",
      dateColumn: typeof body.dateColumn === "string" ? body.dateColumn : "date",
      amountColumn: typeof body.amountColumn === "string" ? body.amountColumn : "amount",
      payeeColumn: typeof body.payeeColumn === "string" ? body.payeeColumn : "payee",
    });
  });
}
