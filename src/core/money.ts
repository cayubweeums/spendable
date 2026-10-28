export function decimalToCents(input: string): number {
  const raw = input.trim().replace(/^\+/, "");
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  if (!/^\d+(\.\d+)?$/.test(body)) {
    throw new Error(`Invalid amount: ${input}`);
  }
  const [whole, fraction = ""] = body.split(".");
  const padded = `${fraction}000`.slice(0, 3);
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2] ?? "0") >= 5) cents += 1;
  return negative ? -cents : cents;
}

export function isIsoCurrency(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

export type NumberFormat = "us" | "eu";

export function formatMoney(
  cents: number,
  currency = "USD",
  hidden = false,
  shape?: { number?: NumberFormat; hideCents?: boolean },
): string {
  if (hidden) return "••••";
  const negative = cents < 0;
  const absolute = Math.abs(cents) / 100;
  const hideCents = shape?.hideCents === true;
  const digits = hideCents ? 0 : 2;
  const body = isIsoCurrency(currency)
    ? new Intl.NumberFormat(shape?.number === "eu" ? "de-DE" : "en-US", {
        style: "currency",
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(absolute)
    : `${hideCents ? Math.round(absolute).toFixed(0) : absolute.toFixed(2)} units`;
  return negative ? `−${body}` : body;
}
