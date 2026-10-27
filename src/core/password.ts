import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function passwordMatches(password: string, stored: string): boolean {
  try {
    const [algo, salt, hash] = stored.split("$");
    if (algo !== "scrypt" || !salt || !hash) return false;
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), KEY_LEN);
    const expected = Buffer.from(hash, "base64url");
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
