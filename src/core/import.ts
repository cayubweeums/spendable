import { isISODate, type DateFormat } from "./dates";
import { SpendableError } from "./errors";
import { decimalToCents } from "./money";
import { sanitizeLabel } from "./sanitize";

export type ImportRow = { posted: string; amountCents: number; description: string };

// shortcut: one account. Commas are thousands separators. OFX dates stay year-first.
export function parseImport(
  text: string,
  input: {
    kind: "csv" | "qif" | "ofx" | "qfx";
    date: DateFormat;
    sign: "as" | "flip";
    dateColumn: string;
    amountColumn: string;
    payeeColumn: string;
  },
): ImportRow[] {
  const rows =
    input.kind === "csv"
      ? parseCsv(text, input.date, input.dateColumn, input.amountColumn, input.payeeColumn)
      : input.kind === "qif"
        ? parseQif(text, input.date)
        : parseOfx(text);
  const signed = input.sign === "flip" ? rows.map((row) => ({ ...row, amountCents: -row.amountCents })) : rows;
  const kept = signed.filter((row) => row.amountCents !== 0);
  if (kept.length === 0) throw new SpendableError("That file has no charges.", "bad_import");
  if (kept.length > 5000) throw new SpendableError("Five thousand charges.", "bad_import");
  return kept;
}

function readAmount(raw: string): number {
  try {
    return decimalToCents(raw.trim().replace(/,/g, "").replace(/^\+/, ""));
  } catch {
    throw new SpendableError("That amount could not be read.", "bad_amount");
  }
}

function readDate(raw: string, format: DateFormat): string {
  const value = raw.trim();
  if (format === "ymd") {
    const compact = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
    if (compact) {
      const iso = `${compact[1]}-${compact[2]}-${compact[3]}`;
      if (isISODate(iso)) return iso;
    }
  }
  const parts = value.split(/[^\d]+/).filter(Boolean);
  if (parts.length >= 3) {
    let year = parts[2];
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`;
    const month = (format === "dmy" ? parts[1] : parts[0]).padStart(2, "0");
    const day = (format === "dmy" ? parts[0] : parts[1]).padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    if (isISODate(iso)) return iso;
  }
  throw new SpendableError("That date could not be read.", "bad_date");
}

function payee(raw: string): string {
  return sanitizeLabel(raw, 180) || "Transaction";
}

function parseCsv(text: string, format: DateFormat, dateColumn: string, amountColumn: string, payeeColumn: string): ImportRow[] {
  const table = csvRows(text);
  const headers = table[0]?.map((cell) => cell.trim().toLowerCase()) ?? [];
  const at = (name: string) => headers.indexOf(name.trim().toLowerCase());
  const dateAt = at(dateColumn);
  const amountAt = at(amountColumn);
  const payeeAt = at(payeeColumn);
  if (!dateColumn.trim() || !amountColumn.trim() || !payeeColumn.trim() || dateAt < 0 || amountAt < 0 || payeeAt < 0) {
    throw new SpendableError("That column is not in the file.", "bad_import");
  }
  return table.slice(1).map((row) => ({
    posted: readDate(row[dateAt] ?? "", format),
    amountCents: readAmount(row[amountAt] ?? ""),
    description: payee(row[payeeAt] ?? ""),
  }));
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((item) => item.some((value) => value.trim() !== ""));
}

function parseQif(text: string, format: DateFormat): ImportRow[] {
  const rows: ImportRow[] = [];
  let posted = "";
  let amount = "";
  let name = "";
  const flush = () => {
    if (!posted && !amount && !name) return;
    rows.push({ posted: readDate(posted, format), amountCents: readAmount(amount), description: payee(name) });
    posted = "";
    amount = "";
    name = "";
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("^")) {
      flush();
      continue;
    }
    if (line.startsWith("!") || line.length < 2) continue;
    const rest = line.slice(1);
    if (line.startsWith("D")) posted = rest;
    else if (line.startsWith("T") || line.startsWith("U")) amount = rest;
    else if (line.startsWith("P") || (line.startsWith("M") && !name)) name = rest;
  }
  flush();
  return rows;
}

function parseOfx(text: string): ImportRow[] {
  return text
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((block) => {
      const body = block.split(/<\/STMTTRN>/i)[0];
      const field = (name: string) => body.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
      return {
        posted: readDate(field("DTPOSTED"), "ymd"),
        amountCents: readAmount(field("TRNAMT")),
        description: payee(field("NAME") || field("MEMO")),
      };
    });
}
