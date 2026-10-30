#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [16, 32, 48, 128];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // no filter
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundedRectCoverage(x, y, radius) {
  // Signed distance to a rounded unit square.
  const dx = Math.max(radius - x, x - (1 - radius), 0);
  const dy = Math.max(radius - y, y - (1 - radius), 0);
  return Math.hypot(dx, dy) <= radius ? 1 : 0;
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function colorAt(x, y) {
  if (!roundedRectCoverage(x, y, 0.23)) return [0, 0, 0, 0];

  // Background gradient.
  const t = Math.max(0, Math.min(1, (x + y) * 0.55));
  let r = mix(15, 30, t);
  let g = mix(23, 58, t);
  let b = mix(42, 95, t);
  let a = 255;

  // Comet glow.
  const glowDistance = Math.hypot(x - 0.38, y - 0.35);
  if (glowDistance < 0.25) {
    const strength = Math.pow(1 - glowDistance / 0.25, 2) * 0.55;
    r = mix(r, 56, strength);
    g = mix(g, 189, strength);
    b = mix(b, 248, strength);
  }

  // Tail: tapered capsule from the head toward the lower right.
  const ax = 0.43;
  const ay = 0.4;
  const bx = 0.82;
  const by = 0.79;
  const vx = bx - ax;
  const vy = by - ay;
  const wx = x - ax;
  const wy = y - ay;
  const projection = (wx * vx + wy * vy) / (vx * vx + vy * vy);
  if (projection >= 0 && projection <= 1) {
    const px = ax + vx * projection;
    const py = ay + vy * projection;
    const distance = Math.hypot(x - px, y - py);
    const width = mix(0.085, 0.012, projection);
    if (distance <= width) {
      const edge = 1 - distance / Math.max(width, 0.001);
      const strength = Math.min(1, edge * 1.7);
      r = mix(r, 186, strength);
      g = mix(g, 230, strength);
      b = mix(b, 253, strength);
    }
  }

  // Comet head.
  const headDistance = Math.hypot(x - 0.37, y - 0.34);
  if (headDistance <= 0.135) {
    const edge = Math.min(1, (0.135 - headDistance) / 0.018);
    r = mix(r, 240, edge);
    g = mix(g, 249, edge);
    b = mix(b, 255, edge);
  }

  // Two small sparks.
  for (const [sx, sy, sr] of [
    [0.71, 0.2, 0.022],
    [0.82, 0.35, 0.014],
  ]) {
    if (Math.hypot(x - sx, y - sy) <= sr) {
      r = 224;
      g = 242;
      b = 254;
    }
  }

  return [r, g, b, a];
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = size <= 32 ? 3 : 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const px = (x + (sx + 0.5) / samples) / size;
          const py = (y + (sy + 0.5) / samples) / size;
          const [cr, cg, cb, ca] = colorAt(px, py);
          const alpha = ca / 255;
          r += cr * alpha;
          g += cg * alpha;
          b += cb * alpha;
          a += ca;
        }
      }
      const count = samples * samples;
      const alpha = a / count;
      const offset = (y * size + x) * 4;
      if (alpha > 0) {
        const alphaFraction = alpha / 255;
        pixels[offset] = Math.round(r / count / alphaFraction);
        pixels[offset + 1] = Math.round(g / count / alphaFraction);
        pixels[offset + 2] = Math.round(b / count / alphaFraction);
        pixels[offset + 3] = Math.round(alpha);
      }
    }
  }
  return png(size, pixels);
}

export function generateIcons(outDir = join(ROOT, "dist", "icons")) {
  mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    writeFileSync(join(outDir, `icon${size}.png`), drawIcon(size));
  }
  return outDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = generateIcons();
  console.log(`Generated ${SIZES.length} icons in ${outDir}`);
}
