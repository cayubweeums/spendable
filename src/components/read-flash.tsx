import { cookies } from "next/headers";
import { FlashBanner } from "./flash-banner";

const notices: Record<string, string> = {
  connected: "Bank connected. Balances below are the ones just copied.",
  synced: "Balances copied.",
  saved: "Saved.",
  undone: "Undone.",
  sample: "Sample numbers are loaded.",
  disconnected: "The connection is forgotten. The last copied balances are still here.",
};

function cleanQuery(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
  return cleaned || null;
}

export async function ReadFlash({ notice }: { notice?: string }) {
  const jar = await cookies();
  const raw = jar.get("spendable_flash")?.value;
  let error: string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { error?: unknown };
      if (typeof parsed.error === "string") error = cleanQuery(parsed.error) ?? undefined;
    } catch {
      error = undefined;
    }
  }
  const noticeText = !error && notice ? notices[notice] : undefined;
  if (!error && !noticeText) return null;
  return <FlashBanner error={error} notice={noticeText} />;
}
