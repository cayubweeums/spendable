export function sanitizeBankMessage(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

export function sanitizeLabel(input: string, max = 80): string {
  return input.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
