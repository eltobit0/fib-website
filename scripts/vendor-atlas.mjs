/**
 * Packs the vendored sprites into one atlas for the wheel's canvas: one request, so a half-loaded strip can't exist.
 * WebP lossless (a PNG atlas is bigger than the files); TILE 96 keeps it under mobile Safari's ~16.7 MP subsampling limit.
 * Canvas only: every <img> still uses public/fib-items/, built from the same source.
 *   node scripts/vendor-atlas.mjs               # TILE=96, WebP lossless
 *   node scripts/vendor-atlas.mjs --tile 128    # native resolution, 25.6 MP
 */

import { createHash } from 'node:crypto';
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'public/fib-items');

// Custom items are packed too, or the browser smooth-downscales them every frame and they look soft.
// Keys are prefixed `custom/` because barrier.png and wheel.png exist in both dirs; atlas.js maps /fib-custom/ onto it.
const CUSTOM_SRC = join(root, 'public/fib-custom');
const CUSTOM_PREFIX = 'custom/';
const OUT_IMAGE = join(root, 'public/fib-atlas.webp');
const OUT_JSON = join(root, 'public/fib-atlas.json');

/** Past roughly this area mobile Safari subsamples decoded images. */
const MAX_MEGAPIXELS = 16.7;

// Smoothing reads across tile edges, so the gutter is extruded from each sprite's own edge (transparency would leave dark fringes).
// Watch the megapixel warning when changing it.
const PAD = 2;

const tileArg = process.argv.indexOf('--tile');
const TILE = tileArg === -1 ? 96 : Number(process.argv[tileArg + 1]);

if (!Number.isInteger(TILE) || TILE < 8 || TILE > 128) {
  console.error(`--tile must be an integer between 8 and 128, got ${TILE}`);
  process.exit(1);
}

const bytes = (n) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;

async function main() {
  let files;
  try {
    files = (await readdir(SRC))
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ dir: SRC, file: f, key: f.slice(0, -4) }));
  } catch {
    console.error(
      `No vendored sprites at ${SRC}.\n` +
      'Run `npm run vendor:textures` first — the atlas is packed from that output, ' +
      'not from the resource pack, so the two can never disagree.',
    );
    process.exit(1);
  }

  // Optional: without custom items the pool still packs and the client falls back per item.
  try {
    const custom = (await readdir(CUSTOM_SRC))
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ dir: CUSTOM_SRC, file: f, key: CUSTOM_PREFIX + f.slice(0, -4) }));
    files = files.concat(custom);
  } catch {
    console.warn(`No custom sprites at ${CUSTOM_SRC} — packing the pool only.`);
  }

  if (files.length === 0) {
    console.error(`${SRC} has no PNGs to pack.`);
    process.exit(1);
  }

  // Deterministic, so a rerun is byte-identical. Pool first, custom items appended, never interleaved:
  // an insertion shifts every later index, and a stale image then draws each sprite's neighbour.
  const rank = (e) => (e.dir === SRC ? 0 : 1);
  files.sort((a, b) => rank(a) - rank(b) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const cols = Math.ceil(Math.sqrt(files.length));
  const rows = Math.ceil(files.length / cols);
  const CELL = TILE + PAD * 2;
  const width = cols * CELL;
  const height = rows * CELL;

  // Raw RGBA blits rather than 1,500 sharp composite() calls: far faster, and the nearest resize is the only resampling.
  const atlas = Buffer.alloc(width * height * 4);
  const sprites = {};

  for (const [i, entry] of files.entries()) {
    const name = entry.key;
    const { data } = await sharp(join(entry.dir, entry.file))
      // `nearest` is not optional: any smooth kernel turns pixel art into mush.
      .resize(TILE, TILE, { kernel: 'nearest', fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Clamped source coordinates draw the sprite and extrude its border in one pass. See PAD.
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = col * CELL;
    const cellY = row * CELL;

    for (let y = 0; y < CELL; y++) {
      const sy = Math.min(TILE - 1, Math.max(0, y - PAD));
      for (let x = 0; x < CELL; x++) {
        const sx = Math.min(TILE - 1, Math.max(0, x - PAD));
        const from = (sy * TILE + sx) * 4;
        const to = ((cellY + y) * width + cellX + x) * 4;
        atlas[to] = data[from];
        atlas[to + 1] = data[from + 1];
        atlas[to + 2] = data[from + 2];
        atlas[to + 3] = data[from + 3];
      }
    }

    // Meaningless without `cols`, which is why both live in this one file.
    sprites[name] = i;
  }

  await mkdir(dirname(OUT_IMAGE), { recursive: true });
  await sharp(atlas, { raw: { width, height, channels: 4 } })
    // Lossless: WebP's lossy mode rings around hard-edged sprites on transparency.
    .webp({ lossless: true, effort: 6 })
    .toFile(OUT_IMAGE);

  // Hash of the pixels, appended by atlas.js to the image URL, so a cached image can never pair with a different index.
  const version = createHash('sha256').update(atlas).digest('hex').slice(0, 12);

  // Written explicitly so a pre-gutter atlas (no `pad`) still reads; atlas.js defaults them to 0 and TILE.
  const meta = { version, tile: TILE, pad: PAD, cell: CELL, cols, rows, width, height, count: files.length, sprites };
  await writeFile(OUT_JSON, JSON.stringify(meta));

  const { size } = await stat(OUT_IMAGE);
  const jsonSize = Buffer.byteLength(JSON.stringify(meta));
  const megapixels = (width * height) / 1e6;

  console.log(
    `Packed ${files.length} sprites at ${TILE}px (+${PAD}px extruded gutter, ` +
    `${CELL}px cell) into ${cols}x${rows} ` +
    `(${width}x${height}, ${megapixels.toFixed(1)} MP) -> public/fib-atlas.webp ` +
    `(${bytes(size)}) + fib-atlas.json (${bytes(jsonSize)})`,
  );

  if (megapixels > MAX_MEGAPIXELS) {
    console.warn(
      `\nWARNING: ${megapixels.toFixed(1)} MP exceeds the ~${MAX_MEGAPIXELS} MP ` +
      'point where mobile Safari starts subsampling decoded images. It will not ' +
      'break — drawImage coordinates stay valid because the logical size is ' +
      'unchanged — but sprites will be softer on iOS than the tile size implies, ' +
      'which defeats the reason for raising it. Prefer --tile 96.',
    );
  }
}

main();
