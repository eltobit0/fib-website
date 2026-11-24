// A leaf module with no imports, so App.jsx (the entry chunk) can preload the atlas without pulling in atlas.js.
// loadAtlas() appends `?v=<version>` to ATLAS_IMAGE; preloads and ATLAS_URL_PATTERN in public/sw.js must allow for it.
export const ATLAS_IMAGE = '/fib-atlas.webp';
export const ATLAS_JSON = '/fib-atlas.json';
