import { SpendableError } from "@/core/errors";
import { guard, readJson } from "@/core/http";
import { importCharges, importYnab } from "@/core/service";
import { ynabName } from "@/core/ynab";
import { MAX_BACKUP_BYTES } from "@/core/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function POST(request: Request) {
  return guard(request, async () => {
    const body = await readJson(request);
    if (typeof body.name !== "string") throw new SpendableError("Choose a file.", "bad_import");
    if (ynabName(body.name)) {
      const bytes = typeof body.data === "string" ? Buffer.from(body.data, "base64") : typeof body.text === "string" ? Buffer.from(body.text) : null;
      if (!bytes || bytes.length === 0) throw new SpendableError("Choose a file.", "bad_import");
      if (bytes.length > MAX_BACKUP_BYTES) throw new SpendableError("That file is too big.", "bad_import");
      return importYnab(bytes, body.name);
    }
    if (typeof body.text !== "string" || typeof body.accountId !== "string") {
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
