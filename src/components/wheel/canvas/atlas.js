// Item sprites are drawn from one packed atlas built by scripts/vendor-atlas.mjs; heads, avatars and event art are fetched individually.

import { getItemImageUrl } from '../../../utils/helpers.js';

// Re-exported from the leaf atlasUrls.js so there is one definition.
import { ATLAS_IMAGE, ATLAS_JSON } from './atlasUrls.js';

export { ATLAS_IMAGE, ATLAS_JSON };

/** Custom items key as `custom/<name>`: barrier.png and wheel.png exist in both directories. */
const POOL_SPRITE = /^\/fib-(items|custom)\/([^/]+)\.png$/;

/** The atlas key for a matched sprite URL: `name`, or `custom/name`. */
const atlasKey = (match) => (match[1] === 'custom' ? `custom/${match[2]}` : match[2]);

let atlasImage = null;
let atlasMeta = null;
let loadPromise = null;

// Never draw from the atlas directly: every drawImage off the huge bitmap re-extracts the rect (~0.6 ms each).
// Each cell (gutter included) is cut into its own small canvas on first use; LRU-bounded well above one frame's working set.
const CELL_CACHE_MAX = 512;
const cellCache = new Map();

/** The atlas cell at `index` as its own canvas, or null, in which case callers draw from the atlas. */
function getCell(index) {
    const hit = cellCache.get(index);
    if (hit !== undefined) {
        // Touch: delete + set moves the key to the end of the iteration order.
        cellCache.delete(index);
        cellCache.set(index, hit);
        return hit;
    }

    if (typeof document === 'undefined') return null;

    const { cols } = atlasMeta;
    const cell = atlasMeta.cell ?? atlasMeta.tile;

    const canvas = document.createElement('canvas');
    canvas.width = cell;
    canvas.height = cell;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        atlasImage,
        (index % cols) * cell, Math.floor(index / cols) * cell, cell, cell,
        0, 0, cell, cell,
    );

    if (cellCache.size >= CELL_CACHE_MAX) {
        cellCache.delete(cellCache.keys().next().value);
    }
    cellCache.set(index, canvas);
    return canvas;
}

/** Loads the atlas once per page. Never rejects: resolves to whether the atlas is usable. */
export function loadAtlas() {
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        if (typeof Image === 'undefined' || typeof fetch === 'undefined') return false;

        try {
            // The index first: the image is meaningless without the grid it was laid out on.
            const res = await fetch(ATLAS_JSON);
            if (!res.ok) throw new Error(`atlas index HTTP ${res.status}`);
            const meta = await res.json();

            if (!meta?.sprites || !meta.tile || !meta.cols) {
                throw new Error('atlas index is missing tile/cols/sprites');
            }

            // Request the image at the index's own version, so a cached image from another build can never pair with this index.
            const src = meta.version
                ? `${ATLAS_IMAGE}?v=${encodeURIComponent(meta.version)}`
                : ATLAS_IMAGE;

            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error('atlas image failed to load'));
                el.src = src;
            });

            // A grid mismatch shifts every sprite after the insertion point, so refuse the atlas.
            // Not sufficient alone (a shipped mismatch had identical dimensions), hence the version stamp.
            if (img.naturalWidth !== meta.width || img.naturalHeight !== meta.height) {
                throw new Error(
                    `atlas is ${img.naturalWidth}x${img.naturalHeight} but its index ` +
                    `describes ${meta.width}x${meta.height} — regenerate with ` +
                    '`npm run vendor:atlas`',
                );
            }

            atlasImage = img;
            atlasMeta = meta;
            return true;
        } catch (err) {
            console.error('[atlas] falling back to per-item sprites:', err);
            return false;
        }
    })();

    return loadPromise;
}

/** True once the atlas is loaded and addressable. */
export function isAtlasReady() {
    return atlasImage !== null && atlasMeta !== null;
}

/** The shared image plus source rect for the 9-argument drawImage, or null if the item is not packed. */
export function getAtlasSprite(item) {
    if (!isAtlasReady() || !item) return null;

    const match = POOL_SPRITE.exec(getItemImageUrl(item));
    if (!match) return null;

    const index = atlasMeta.sprites[atlasKey(match)];
    if (index === undefined) return null;

    // The pitch is the cell (tile plus PAD gutter, see scripts/vendor-atlas.mjs); the defaults keep a pre-gutter atlas correct.
    const { tile, cols } = atlasMeta;
    const pad = atlasMeta.pad ?? 0;
    const cell = atlasMeta.cell ?? tile;

    // From the cell cache (see CELL_CACHE_MAX); the whole atlas is the slow fallback.
    const cutCell = getCell(index);
    if (cutCell) {
        return { image: cutCell, sx: pad, sy: pad, size: tile };
    }

    return {
        image: atlasImage,
        sx: (index % cols) * cell + pad,
        sy: Math.floor(index / cols) * cell + pad,
        size: tile,
    };
}

/** Whether this item needs its own image. Answerable before the atlas loads, from the URL shape. */
export function needsOwnImage(item) {
    if (!item) return false;

    const match = POOL_SPRITE.exec(getItemImageUrl(item));
    if (!match) return true;

    // An older atlas without `custom/` keys reports true here, so those items fetch their own image.
    return atlasMeta ? atlasMeta.sprites[atlasKey(match)] === undefined : false;
}

/** drawImage against the atlas when possible, else the item's own image; centralised because the 9-argument order fails silently. Returns true if drawn. */
export function drawItemSprite(ctx, item, fallbackImage, dx, dy, dSize) {
    const sprite = getAtlasSprite(item);

    if (sprite) {
        ctx.drawImage(
            sprite.image,
            sprite.sx, sprite.sy, sprite.size, sprite.size,
            dx, dy, dSize, dSize,
        );
        return true;
    }

    if (fallbackImage) {
        ctx.drawImage(fallbackImage, dx, dy, dSize, dSize);
        return true;
    }

    return false;
}
