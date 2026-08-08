// PWA 아이콘 생성 스크립트 (외부 의존성 없음)
// 사용법: node tools/gen-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

// ---- 최소 PNG 인코더 ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // 필터 없음
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 아이콘 그리기 ----

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

const BG = hex('#7c4520');   // 진한 월넛
const PANEL = hex('#ecd9ae'); // 합판 색

function draw(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  const u = size / 512;
  const radius = maskable ? 0 : 96 * u;
  // maskable은 안전 영역(중앙 80%)에 콘텐츠가 들어가도록 여백을 넓힘
  const inset = (maskable ? 120 : 80) * u;
  const cut = Math.max(2, 14 * u);

  const panel = { x0: inset, y0: inset * 1.18, x1: size - inset, y1: size - inset * 1.18 };
  const pw = panel.x1 - panel.x0;
  const ph = panel.y1 - panel.y0;
  // 재단 배치도 모양의 컷 라인
  const vx = panel.x0 + pw * 0.58;
  const hy1 = panel.y0 + ph * 0.42;
  const hy2 = panel.y0 + ph * 0.68;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;
      let alpha = 255;

      if (radius > 0) {
        const dx = Math.max(radius - x, x - (size - 1 - radius), 0);
        const dy = Math.max(radius - y, y - (size - 1 - radius), 0);
        if (dx * dx + dy * dy > radius * radius) alpha = 0;
      }

      if (alpha > 0 && x >= panel.x0 && x < panel.x1 && y >= panel.y0 && y < panel.y1) {
        color = PANEL;
        const onV = Math.abs(x - vx) < cut / 2;
        const onH1 = x < vx && Math.abs(y - hy1) < cut / 2;
        const onH2 = x >= vx && Math.abs(y - hy2) < cut / 2;
        if (onV || onH1 || onH2) color = BG;
      }

      const i = (y * size + x) * 4;
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = alpha;
    }
  }
  return encodePNG(size, size, px);
}

mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-192.png', 192, { maskable: true }],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of jobs) {
  const buf = draw(size, opts);
  writeFileSync(join(OUT, name), buf);
  console.log(`${name} (${buf.length} bytes)`);
}
