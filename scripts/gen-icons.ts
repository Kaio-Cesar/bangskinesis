/**
 * Generates the extension icons (a "!" on a rounded green square) as PNGs
 * without any image dependency: rasterise with 4x4 supersampling, then
 * encode via node:zlib. Run with `bun scripts/gen-icons.ts`.
 */
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Uint8Array) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(size: number, rgba: Uint8Array) {
  const raw = new Uint8Array(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, size);
  v.setUint32(4, size);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  return Buffer.concat(parts);
}

// Shapes in unit coordinates (0..1).
const inRoundRect = (x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number) => {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const BG = [0x2f, 0x7d, 0x4f];
const FG = [0xff, 0xff, 0xff];
function sample(x: number, y: number): [number[], number] {
  if (!inRoundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return [BG, 0];
  // Exclamation mark: tapered bar + dot.
  const barW = 0.075 + (0.62 - y) * 0.06;
  const bar = y >= 0.17 && y <= 0.62 && Math.abs(x - 0.5) <= barW && inRoundRect(x, y, 0.5 - barW, 0.17, 0.5 + barW, 0.62, 0.06);
  const dot = (x - 0.5) ** 2 + (y - 0.77) ** 2 <= 0.085 ** 2;
  return [bar || dot ? FG : BG, 1];
}

const SS = 4;
for (const size of [16, 32, 48, 128]) {
  const rgba = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const [c, alpha] = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          r += c[0]! * alpha; g += c[1]! * alpha; b += c[2]! * alpha; a += alpha;
        }
      const i = (py * size + px) * 4;
      if (a) rgba.set([r / a, g / a, b / a, (a / (SS * SS)) * 255], i);
    }
  await Bun.write(new URL(`../public/icon/${size}.png`, import.meta.url), png(size, rgba));
}
console.log('icons written to public/icon/');
