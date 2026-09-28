/**
 * Reproducible TC-Block extension icons with no third-party dependencies.
 * The mark combines a protective shield with a clear block/minus symbol.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    table[i] = value;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buffer) {
  let value = 0xFFFFFFFF;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xFF] ^ (value >>> 8);
  return (value ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function createPng(width, height, pixels) {
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const color = pixels(x, y);
      for (const channel of color) raw[offset++] = Math.max(0, Math.min(255, Math.round(channel)));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    makeChunk('IHDR', header), makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function cubic(from, control1, control2, to, steps = 18) {
  const points = [];
  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    const u = 1 - t;
    points.push([
      u ** 3 * from[0] + 3 * u ** 2 * t * control1[0] + 3 * u * t ** 2 * control2[0] + t ** 3 * to[0],
      u ** 3 * from[1] + 3 * u ** 2 * t * control1[1] + 3 * u * t ** 2 * control2[1] + t ** 3 * to[1],
    ]);
  }
  return points;
}

const shield = [[64, 25]];
shield.push(...cubic([64, 25], [75, 31], [84, 34], [95, 37]));
shield.push([95, 58]);
shield.push(...cubic([95, 58], [95, 80], [82, 97], [64, 104]));
shield.push(...cubic([64, 104], [46, 97], [33, 80], [33, 58]));
shield.push([33, 37]);
shield.push(...cubic([33, 37], [44, 34], [53, 31], [64, 25]));

function inPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, left, top, width, height, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, left + width - radius));
  const nearestY = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - nearestX; const dy = y - nearestY;
  return x >= left && x <= left + width && y >= top && y <= top + height && dx * dx + dy * dy <= radius * radius;
}

function mix(from, to, amount) { return from.map((value, index) => value + (to[index] - value) * amount); }

function sampleColor(x, y) {
  if (!inRoundedRect(x, y, 6, 6, 116, 116, 31)) return [0, 0, 0, 0];

  const diagonal = Math.max(0, Math.min(1, (x + y - 12) / 232));
  let color = mix([251, 49, 92], [190, 18, 60], diagonal);
  const highlight = Math.max(0, 1 - Math.hypot(x - 31, y - 23) / 92) * 0.13;
  color = mix(color, [255, 255, 255], highlight);
  if (!inRoundedRect(x, y, 8.2, 8.2, 111.6, 111.6, 28.8)) color = mix(color, [255, 255, 255], 0.18);

  const blockBar = inRoundedRect(x, y, 48, 59, 32, 11, 5.5);
  if (inPolygon(x, y, shield) && !blockBar) return [255, 255, 255, 255];
  return [...color, 255];
}

function render(size) {
  const samples = size <= 48 ? 6 : 4;
  return createPng(size, size, (pixelX, pixelY) => {
    const sum = [0, 0, 0, 0];
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const x = (pixelX + (sx + 0.5) / samples) * 128 / size;
        const y = (pixelY + (sy + 0.5) / samples) * 128 / size;
        const color = sampleColor(x, y);
        for (let channel = 0; channel < 4; channel++) sum[channel] += color[channel];
      }
    }
    return sum.map(value => value / (samples * samples));
  });
}

for (const size of [16, 48, 128]) {
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, render(size));
  console.log(`Generated ${path.basename(file)}`);
}
