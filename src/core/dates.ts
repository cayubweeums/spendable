export type PaydayFrequency = "weekly" | "biweekly" | "monthly";

export function localISODate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function diffDays(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function formatLong(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimestamp(unix: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(unix * 1000));
}

export function isoToLocalNoonUnix(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.floor(new Date(year, month - 1, day, 12, 0, 0).getTime() / 1000);
}

export function postedToISO(unix: number): string | null {
  if (!Number.isFinite(unix) || unix <= 0) return null;
  const date = new Date(unix * 1000);
  const midnightUtc =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0;
  if (midnightUtc) return date.toISOString().slice(0, 10);
  return localISODate(date);
}

function clampDay(year: number, monthIndex: number, day: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const clamped = Math.min(Math.max(day, 1), last);
  return new Date(Date.UTC(year, monthIndex, clamped)).toISOString().slice(0, 10);
}

function stepFor(frequency: PaydayFrequency): number {
  return frequency === "weekly" ? 7 : 14;
}

export function nextPayday(today: string, frequency: PaydayFrequency, anchor: string): string {
  if (frequency === "monthly") return adjacentMonth(today, anchor, "next");
  const step = stepFor(frequency);
  const diff = diffDays(anchor, today);
  if (diff < 0) return anchor;
  return addDays(anchor, (Math.floor(diff / step) + 1) * step);
}

export function previousPayday(today: string, frequency: PaydayFrequency, anchor: string): string {
  if (frequency === "monthly") return adjacentMonth(today, anchor, "previous");
  const step = stepFor(frequency);
  const diff = diffDays(anchor, today);
  if (diff < 0) return addDays(anchor, -step);
  return addDays(anchor, Math.floor(diff / step) * step);
}

function adjacentMonth(today: string, anchor: string, which: "next" | "previous"): string {
  const anchorDay = Number(anchor.slice(8, 10));
  const [year, month] = today.split("-").map(Number);
  const thisMonth = clampDay(year, month - 1, anchorDay);
  if (which === "next") {
    if (thisMonth > today) return thisMonth;
    return clampDay(year, month, anchorDay);
  }
  if (thisMonth <= today) return thisMonth;
  return clampDay(year, month - 2, anchorDay);
}

export function dueDatesInWindow(dueDay: number, today: string, next: string): string[] {
  const [year, month] = today.split("-").map(Number);
  const found: string[] = [];
  for (let offset = -1; offset <= 2; offset += 1) {
    const iso = clampDay(year, month - 1 + offset, dueDay);
    if (iso >= today && iso < next) found.push(iso);
  }
  return found;
}

export function eachDate(start: string, endInclusive: string): string[] {
  const dates: string[] = [];
  const count = diffDays(start, endInclusive);
  for (let i = 0; i <= count; i += 1) dates.push(addDays(start, i));
  return dates;
}
