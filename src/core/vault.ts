import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = Buffer.from("SPEN1");
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER = MAGIC.length + SALT_LEN + IV_LEN + TAG_LEN;

export function isSeal(bytes: Uint8Array): boolean {
  return bytes.byteLength >= MAGIC.length && Buffer.compare(Buffer.from(bytes.subarray(0, MAGIC.length)), MAGIC) === 0;
}

function pack(salt: Buffer, iv: Buffer, tag: Buffer, body: Buffer): Buffer {
  return Buffer.concat([MAGIC, salt, iv, tag, body]);
}

export function sealWithKey(plain: Uint8Array, key: Buffer, salt: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return pack(salt, iv, cipher.getAuthTag(), body);
}

export function sealPlaintext(plain: Uint8Array, password: string): { packed: Buffer; key: Buffer; salt: Buffer } {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(password, salt, 32);
  return { packed: sealWithKey(plain, key, salt), key, salt };
}

export function openSeal(packed: Uint8Array, password: string): { plain: Buffer; key: Buffer; salt: Buffer } {
  if (packed.byteLength < HEADER || !isSeal(packed)) throw new Error("not sealed");
  let offset = MAGIC.length;
  const salt = Buffer.from(packed.subarray(offset, offset + SALT_LEN));
  offset += SALT_LEN;
  const iv = Buffer.from(packed.subarray(offset, offset + IV_LEN));
  offset += IV_LEN;
  const tag = Buffer.from(packed.subarray(offset, offset + TAG_LEN));
  offset += TAG_LEN;
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(packed.subarray(offset)), decipher.final()]);
  return { plain, key, salt };
}
