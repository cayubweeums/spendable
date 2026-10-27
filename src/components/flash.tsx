const notices: Record<string, string> = {
  connected: "Bank connected. The balances below are the ones SimpleFIN just returned.",
  synced: "Balances copied from the bank.",
  saved: "Saved.",
  sample: "Sample numbers are loaded.",
  disconnected: "The access URL is forgotten. The last copied balances are still here.",
};

export function cleanQuery(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 280);
  return cleaned || null;
}

export function Flash({ error, notice }: { error?: string; notice?: string }) {
  const message = cleanQuery(error) ?? (notice ? notices[notice] : undefined);
  if (!message) return null;
  return (
    <p className={error ? "flash bad" : "flash"} role={error ? "alert" : "status"}>
      {message}
    </p>
  );
}
