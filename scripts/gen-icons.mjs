// Genera los iconos PNG de la PWA (pixel art original de MiniBox) sin dependencias externas.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'public', 'icons');

// Isla con un sol-ojo encima, 16×16. Cada letra es un color de la paleta.
const ART = [
  'kkkkkkkkkkkkkkkk',
  'kbbbbbbbbbbbbbbk',
  'kbbbbbyyyybbbbbk',
  'kbbbbyyyyyybbbbk',
  'kbbbbyywwyybbbbk',
  'kbbbbyywkyybbbbk',
  'kbbbbyyyyyybbbbk',
  'kbbbbbyyyybbbbbk',
  'kbbbbbbbbbbbbbbk',
  'ksssssssggsssssk',
  'kssssssggggssssk',
  'kssssgggTgggsssk',
  'ksssgggggggggssk',
  'kssddddddddddssk',
  'kssssssssssssssk',
  'kkkkkkkkkkkkkkkk',
];

const COLORS = {
  k: [26, 20, 16],
  b: [43, 33, 24],
  y: [242, 193, 78],
  w: [255, 255, 255],
  s: [54, 120, 189],
  g: [98, 171, 59],
  T: [45, 106, 38],
  d: [139, 107, 63],
};

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** PNG RGB de `size` px; `pad` = margen (en celdas del arte) para iconos «maskable». */
function png(size, pad = 0) {
  const cells = ART.length + pad * 2;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const cx = Math.floor((x * cells) / size) - pad;
      const cy = Math.floor((y * cells) / size) - pad;
      const ch = cy >= 0 && cy < ART.length && cx >= 0 && cx < 16 ? ART[cy][cx] : 'b';
      const [r, g, b] = COLORS[ch] ?? COLORS.b;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
const targets = [
  ['favicon-32.png', 32, 0],
  ['apple-touch-icon.png', 180, 0],
  ['icon-192.png', 192, 0],
  ['icon-512.png', 512, 0],
  ['icon-maskable-512.png', 512, 4],
];
for (const [name, size, pad] of targets) {
  writeFileSync(join(outDir, name), png(size, pad));
  console.log(`icons/${name} (${size}px)`);
}
