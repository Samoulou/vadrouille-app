/**
 * Icônes provisoires du manifeste (spécification F10, F10b ; F10-TL-9, F10-Q5 : à remplacer par celles d'UX/UI).
 * Motif de Ligne : un tracé et trois arrêts, couleurs lues dans `docs/design-system/tokens.json` (`line`, `on-line`).
 * Sans dépendance : PNG écrit avec `node:zlib`, bords lissés par suréchantillonnage.
 * Usage : `node scripts/icones-provisoires.mjs` ; écrit `public/icons/icone-192.png` et `public/icons/icone-512.png`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const root = join(import.meta.dirname, "..");
const tokens = JSON.parse(readFileSync(join(root, "docs/design-system/tokens.json"), "utf8"));
const rgb = (name) => {
  const hex = tokens.color.tokens.find((token) => token.name === name).value.slice(1);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const background = rgb("line");
const foreground = rgb("on-line");

/** Le point (x, y), en unités d'une grille de 64, est-il sur le motif ? Zone sûre centrale pour les masques. */
function inside(x, y) {
  const rail = x >= 14 && x <= 50 && y >= 30.5 && y <= 33.5;
  const stop = [20, 32, 44].some((cx) => (x - cx) ** 2 + (y - 32) ** 2 <= 25);
  return rail || stop;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = ((px + (sx + 0.5) / samples) / size) * 64;
          const y = ((py + (sy + 0.5) / samples) / size) * 64;
          if (inside(x, y)) hits += 1;
        }
      }
      const a = hits / (samples * samples);
      for (let i = 0; i < 3; i += 1) row[1 + px * 3 + i] = Math.round(background[i] * (1 - a) + foreground[i] * a);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // profondeur
  header[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(join(root, "public", "icons", `icone-${size}.png`), png(size));
