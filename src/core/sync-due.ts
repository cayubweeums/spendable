export const SYNC_HOUR_CHOICES = [1, 6, 12, 24, 168] as const;

export type SyncSchedule = {
  on: boolean;
  everyHours: number;
  at: string;
};

// shortcut: the next open decides, after the gap and this clock. A closed app does not copy at that minute.
export function syncIsDue(syncedAt: string | null, schedule: SyncSchedule, now = Date.now()): boolean {
  if (!schedule.on) return false;
  if (schedule.at) {
    const date = new Date(now);
    const [hour, minute] = schedule.at.split(":").map(Number);
    if (date.getHours() * 60 + date.getMinutes() < hour * 60 + minute) return false;
  }
  if (!syncedAt) return true;
  const then = Date.parse(syncedAt);
  if (!Number.isFinite(then)) return true;
  return now - then >= schedule.everyHours * 60 * 60 * 1000;
}
