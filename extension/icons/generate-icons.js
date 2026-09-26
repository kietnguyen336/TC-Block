/**
 * Generate Extension Icons (16x16, 48x48, 128x128) in pure Node.js using zlib.
 * Material Design Red & White shield badge for TC-Block (No emojis).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hàm tính CRC32 cho các chunk PNG chuẩn
function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(width, height, pixelFn) {
  const rawBytes = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawBytes[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawBytes[offset++] = r;
      rawBytes[offset++] = g;
      rawBytes[offset++] = b;
      rawBytes[offset++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression: 0
  ihdr[11] = 0; // Filter: 0
  ihdr[12] = 0; // Interlace: 0

  const compressedData = zlib.deflateSync(rawBytes);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // PNG Signature
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressedData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Vẽ biểu tượng khiên bảo vệ Material Design màu đỏ YouTube trên nền bo góc
function drawShieldIcon(x, y, w, h) {
  const nx = (x / (w - 1)) * 2 - 1; // -1 to 1
  const ny = (y / (h - 1)) * 2 - 1; // -1 to 1
  const dist = Math.sqrt(nx * nx + ny * ny);

  // Vòng ngoài / bo tròn
  if (dist > 0.95) {
    return [0, 0, 0, 0]; // Trong suốt
  }

  // Nền đỏ YouTube: #CC0000 (204, 0, 0)
  const red = 204;
  const green = 0;
  const blue = 0;

  // Vẽ hình chữ T và C hoặc dấu gạch chéo bảo vệ màu trắng ở giữa
  const inCenterBox = Math.abs(nx) < 0.6 && Math.abs(ny) < 0.6;
  
  // Dấu gạch chéo cấm/chặn (Block symbol)
  const angle = Math.atan2(ny, nx);
  const ringDist = Math.abs(dist - 0.45);
  const isRing = ringDist < 0.12 && dist < 0.6;
  const isSlash = Math.abs(nx + ny) < 0.15 && dist < 0.52;

  if (isRing || isSlash) {
    return [255, 255, 255, 255]; // Trắng tinh
  }

  // Viền ngoài nhẹ và nền đỏ chính
  if (dist > 0.88) {
    return [255, 240, 242, 240]; // Viền hồng nhạt
  }

  return [red, green, blue, 255];
}

const sizes = [16, 48, 128];
sizes.forEach(size => {
  const png = createPng(size, size, drawShieldIcon);
  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Đã tạo: icon${size}.png (${size}x${size})`);
});
