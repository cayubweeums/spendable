import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";
import { SpendableError } from "./errors";

export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
const FILE_NAME = "spendable.db";

function fail(message: string): never {
  throw new SpendableError(message, "bad_backup");
}

function storedZip(name: string, method: 0 | 8, payload: Buffer, plain: Buffer): Buffer {
  const fileName = Buffer.from(name);
  const checksum = crc32(plain) >>> 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(plain.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(plain.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(local.length + fileName.length + payload.length, 16);
  return Buffer.concat([local, fileName, payload, central, fileName, end]);
}

export function zipDatabase(bytes: Buffer, compress = false): Buffer {
  if (bytes.length > MAX_BACKUP_BYTES) fail("The database is too large to zip.");
  const payload = compress ? deflateRawSync(bytes) : bytes;
  return storedZip(FILE_NAME, compress ? 8 : 0, payload, bytes);
}

function findEnd(bytes: Buffer): number {
  const start = Math.max(0, bytes.length - (22 + 65535));
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  fail("That file is not a zip.");
}

export function unzipDatabase(bytes: Buffer): Buffer {
  if (bytes.length < 22 || bytes.length > MAX_BACKUP_BYTES) fail("That file is not a zip.");
  const end = findEnd(bytes);
  const count = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (offset + directorySize > bytes.length) fail("That zip is damaged.");
  let match: { method: number; compressed: number; uncompressed: number; checksum: number; local: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) fail("That zip is damaged.");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const checksum = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || name === ".DS_Store" || name.endsWith("/.DS_Store")) continue;
    if (name !== FILE_NAME || match) fail("The zip must contain spendable.db.");
    if ((flags & 0x1) !== 0 || (flags & 0x8) !== 0) fail("That zip is not a spendable backup.");
    if (method !== 0 && method !== 8) fail("That zip is not a spendable backup.");
    if (uncompressed > MAX_BACKUP_BYTES || compressed > MAX_BACKUP_BYTES) fail("That zip is too large.");
    match = { method, compressed, uncompressed, checksum, local };
  }
  if (!match) fail("The zip must contain spendable.db.");
  if (match.local + 30 > bytes.length || bytes.readUInt32LE(match.local) !== 0x04034b50) fail("That zip is damaged.");
  const dataStart = match.local + 30 + bytes.readUInt16LE(match.local + 26) + bytes.readUInt16LE(match.local + 28);
  const payload = bytes.subarray(dataStart, dataStart + match.compressed);
  if (payload.length !== match.compressed) fail("That zip is damaged.");
  let plain: Buffer;
  try {
    plain = match.method === 0 ? Buffer.from(payload) : inflateRawSync(payload, { maxOutputLength: MAX_BACKUP_BYTES });
  } catch {
    fail("That zip is damaged.");
  }
  if (plain.length !== match.uncompressed || (crc32(plain) >>> 0) !== match.checksum) fail("That zip is damaged.");
  return plain;
}

export function unzipEntries(bytes: Buffer): { name: string; data: Buffer }[] {
  if (bytes.length < 22 || bytes.length > MAX_BACKUP_BYTES) {
    throw new SpendableError("That file is not a zip.", "bad_import");
  }
  const start = Math.max(0, bytes.length - (22 + 65535));
  let end = -1;
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw new SpendableError("That file is not a zip.", "bad_import");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const files: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new SpendableError("That zip is damaged.", "bad_import");
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const checksum = bytes.readUInt32LE(offset + 16);
    const compressed = bytes.readUInt32LE(offset + 20);
    const uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || name.endsWith(".DS_Store")) continue;
    if ((flags & 0x1) !== 0 || (method !== 0 && method !== 8)) {
      throw new SpendableError("That zip is damaged.", "bad_import");
    }
    if (uncompressed > MAX_BACKUP_BYTES || compressed > MAX_BACKUP_BYTES) {
      throw new SpendableError("That file is too big.", "bad_import");
    }
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50) {
      throw new SpendableError("That zip is damaged.", "bad_import");
    }
    const dataStart = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    const payload = bytes.subarray(dataStart, dataStart + compressed);
    if (payload.length !== compressed) throw new SpendableError("That zip is damaged.", "bad_import");
    let plain: Buffer;
    try {
      plain = method === 0 ? Buffer.from(payload) : inflateRawSync(payload, { maxOutputLength: MAX_BACKUP_BYTES });
    } catch {
      throw new SpendableError("That zip is damaged.", "bad_import");
    }
    if (plain.length !== uncompressed || (crc32(plain) >>> 0) !== checksum) {
      throw new SpendableError("That zip is damaged.", "bad_import");
    }
    files.push({ name, data: plain });
  }
  return files;
}
