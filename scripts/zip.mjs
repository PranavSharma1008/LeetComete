/**
 * Minimal ZIP writer used by `scripts/package.mjs`.
 *
 * The extension is small, so a dependency-free writer keeps packaging
 * reproducible and avoids adding a build-only package just to create one file.
 * Supports stored and deflate entries; no ZIP64, encryption, or directories.
 */
import { deflateRawSync } from "node:zlib";

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);
  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  };
}

function validateName(name) {
  if (!name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new Error(`Unsafe ZIP entry name: ${JSON.stringify(name)}`);
  }
  if (Buffer.byteLength(name, "utf8") > 0xffff) {
    throw new Error(`ZIP entry name is too long: ${name}`);
  }
}

/**
 * @param {Array<{ name: string, data: Buffer }>} entries
 * @returns {Buffer} Complete ZIP archive.
 */
export function createZip(entries, { date = new Date() } = {}) {
  // Collect directories implicitly referenced by file paths
  const dirNames = new Set();
  for (const entry of entries) {
    const parts = entry.name.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirNames.add(parts.slice(0, i).join("/") + "/");
    }
  }

  const allEntries = [];
  for (const dirName of dirNames) {
    allEntries.push({ name: dirName, data: Buffer.alloc(0), isDirectory: true });
  }
  for (const entry of entries) {
    allEntries.push({ ...entry, isDirectory: false });
  }

  // Ensure manifest.json is strictly the first entry in the archive root
  const sorted = allEntries.sort((left, right) => {
    if (left.name === "manifest.json") return -1;
    if (right.name === "manifest.json") return 1;
    return left.name.localeCompare(right.name);
  });

  const seen = new Set();
  for (const entry of sorted) {
    validateName(entry.name);
    if (seen.has(entry.name)) throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    seen.add(entry.name);
  }

  const { date: dosDate, time: dosTime } = dosDateTime(date);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of sorted) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = entry.data;
    const isDir = Boolean(entry.isDirectory);
    const deflated = isDir ? raw : deflateRawSync(raw, { level: 9 });
    const useDeflate = !isDir && deflated.length < raw.length;
    const payload = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const checksum = isDir ? 0 : crc32(raw);
    const externalAttributes = isDir
      ? ((0o040755 << 16) | 0x10) >>> 0
      : (0o100644 << 16) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(0x0314, 4); // version made by: Unix (0x03), PKZIP 2.0 (0x14)
    central.writeUInt16LE(20, 6); // version needed: 2.0
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(externalAttributes, 38); // external attributes (Unix permissions + directory bit)
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // central directory disk
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, end]);
}
