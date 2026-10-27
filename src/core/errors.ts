export class SpendableError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SpendableError";
  }
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof SpendableError) return error.message.slice(0, 280);
  return "Could not reach the bank connection.";
}

export function scrubSecrets(text: string): string {
  return text.replace(/https?:\/\/(?:[^/\s]+)@/gi, "https://").slice(0, 500);
}
