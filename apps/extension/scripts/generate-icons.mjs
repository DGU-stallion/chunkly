import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "icons");
mkdirSync(iconsDir, { recursive: true });

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, "ascii");
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodeRGBAtoPNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk("IHDR", ihdr);

  // Scanlines with filter byte 0
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter None
    const srcStart = y * width * 4;
    const dstStart = y * (width * 4 + 1) + 1;
    rgbaBuffer.copy(scanlines, dstStart, srcStart, srcStart + width * 4);
  }

  const idatData = deflateSync(scanlines);
  const idatChunk = makeChunk("IDAT", idatData);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/** 距离判断与绘制 */
function renderIcon(size) {
  const buffer = Buffer.alloc(size * size * 4);

  // 坐标归一化到 [0, 1]
  for (let y = 0; y < size; y++) {
    const ny = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const nx = x / (size - 1);
      const offset = (y * size + x) * 4;

      // 1. 背景圆角矩形 (居中，padding ~ 0.04)
      const pad = 0.05;
      const cornerR = 0.22;
      const inX = Math.max(0, Math.abs(nx - 0.5) - (0.5 - pad - cornerR));
      const inY = Math.max(0, Math.abs(ny - 0.5) - (0.5 - pad - cornerR));
      const distBg = Math.hypot(inX, inY);

      if (distBg > cornerR) {
        // 背景外部透明
        continue;
      }

      // 背景渐变色（深靛蓝到深紫）：#4338CA -> #312E81
      let r = Math.round(67 + (49 - 67) * ny);
      let g = Math.round(56 + (46 - 56) * ny);
      let b = Math.round(202 + (129 - 202) * ny);
      let a = 255;

      // 2. 内部切分色块（意群图形）：
      // Row 1: 左侧琥珀黄块，右侧青蓝块
      // Row 2: 左侧薄荷绿块，右侧淡紫块
      const row1Y = [0.28, 0.44];
      const row2Y = [0.56, 0.72];
      const pillRadius = 0.07;

      function inPill(x0, x1, y0, y1) {
        const cx = Math.max(x0 + pillRadius, Math.min(x1 - pillRadius, nx));
        const cy = Math.max(y0 + pillRadius, Math.min(y1 - pillRadius, ny));
        return Math.hypot(nx - cx, ny - cy) <= pillRadius;
      }

      // 第一行左块 (琥珀黄 #FBBF24)
      if (inPill(0.18, 0.52, row1Y[0], row1Y[1])) {
        r = 251; g = 191; b = 36;
      }
      // 第一行右块 (天空蓝 #38BDF8)
      else if (inPill(0.58, 0.82, row1Y[0], row1Y[1])) {
        r = 56; g = 189; b = 248;
      }
      // 第二行左块 (鼠尾草绿 #34D399)
      else if (inPill(0.18, 0.42, row2Y[0], row2Y[1])) {
        r = 52; g = 211; b = 153;
      }
      // 第二行右块 (淡紫 #C084FC)
      else if (inPill(0.48, 0.82, row2Y[0], row2Y[1])) {
        r = 192; g = 132; b = 252;
      }

      buffer[offset] = r;
      buffer[offset + 1] = g;
      buffer[offset + 2] = b;
      buffer[offset + 3] = a;
    }
  }

  return encodeRGBAtoPNG(size, size, buffer);
}

for (const size of [16, 48, 128]) {
  const png = renderIcon(size);
  const path = join(iconsDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Generated ${path} (${size}x${size}, ${png.length} bytes)`);
}
