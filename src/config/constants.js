const isDev = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL = isDev ? 'http://localhost:3001' : '';

export const COLORS = {
    bg:          'oklch(17% 0.025 255)',
    bgLight:     'oklch(21% 0.023 255)',
    bgLighter:   'oklch(25% 0.021 255)',
    bgHover:     'oklch(28% 0.019 255)',
    text:        'oklch(94% 0.007 255)',
    textMid:     'oklch(74% 0.012 255)',
    textMuted:   'oklch(58% 0.012 255)',
    textDim:     'oklch(42% 0.013 255)',
    border:      'oklch(30% 0.019 255)',
    borderF:     'oklch(24% 0.022 255)',
    accent:      'oklch(76% 0.16 68)',   // amber — the primary accent throughout
    green:       'oklch(64% 0.20 142)',
    red:         'oklch(62% 0.22 25)',
    yellow:      'oklch(82% 0.16 90)',
    cyan:        'oklch(68% 0.12 200)',
    blue:        'oklch(65% 0.16 255)',
    purple:      'oklch(62% 0.18 300)',
    orange:      'oklch(72% 0.18 55)',
    early:       'oklch(64% 0.20 142)',
    mid:         'oklch(76% 0.16 68)',
    late:        'oklch(62% 0.22 25)',
    nether:      'oklch(60% 0.20 15)',
    end:         'oklch(65% 0.15 290)',
    extreme:     'oklch(66% 0.20 45)',
    description: 'oklch(68% 0.12 200)',
    // Legacy aliases
    gold:        'oklch(76% 0.16 68)',
    aqua:        'oklch(68% 0.12 200)',
    insane:      'oklch(82% 0.20 90)',
    recursion:   'oklch(70% 0.22 150)',
    recursionDark:'oklch(12% 0.025 155)',
};

// Vendored into public/fib-items/ by scripts/vendor-textures.mjs: raw.githubusercontent throttles and the wheel preloads the
// whole pool. Re-run `npm run vendor:textures` after pool changes and check its missing-texture warning; nothing enforces it.
export const IMAGE_BASE_URL     = '/fib-items';

// Pack custom items live in `item/`, not `fib/`, so they are vendored separately and keyed by name.
export const CUSTOM_IMAGE_BASE_URL = '/fib-custom';

// Committed renders, not pack textures; nothing vendors them.
export const RELIC_IMAGE_BASE_URL = '/fib-relics';

// Not a runtime fallback for the pool.
export const REMOTE_IMAGE_BASE_URL = 'https://raw.githubusercontent.com/eltobit0/fib-resources/main/ForceItemBattle/assets/minecraft/textures/fib';
export const WHEEL_TEXTURE_URL  = '/wheel.png';
// Coupled with STRIP_HEIGHT: drawItem centres ITEM_WIDTH * 0.70 in the band, and the overlays size from STRIP_HEIGHT.
// MOBILE_ITEM_WIDTH (CanvasSpinningStrip) is deliberately independent.
export const ITEM_WIDTH         = 120;
export const STRIP_HEIGHT       = 170;
export const SPIN_DURATION      = 4000;
// The winner's slot is pinned and the tail is the constant: 16 tiles covers half a 3840px viewport.
// MUST match spin.js's copies; the server builds the authoritative strip that achievements are verified against.
export const FINAL_INDEX        = 72;
export const TAIL_LENGTH        = 16;
export const STRIP_LENGTH       = FINAL_INDEX + 1 + TAIL_LENGTH;

// Mirrors SEED_SPECIAL_ITEMS in wheel-backend; offline fallback and strip filler only (live odds come from /api/items).
// Move chances here when seed.js moves them. Consumers must prefer an explicit `texture`: `special_${username}` collides for username-less members.
export const TEAM_MEMBERS = [
    { name: 'apppaa',          username: 'apppaa',          chance: 0.0001,   rarity: 'legendary' },
    { name: 'threeseconds',    username: 'threeseconds',    chance: 0.00022,  rarity: 'legendary' },
    { name: 'CH0RD',           username: 'CH0RD',           chance: 0.00024,  rarity: 'legendary' },
    { name: 'stupxd',          username: 'stupxd',          chance: 0.00025,  rarity: 'legendary' },
    { name: 'ChromaRGBDirt',   username: null,              chance: 0.00019,  rarity: 'legendary',
        texture: 'legendary_chromargbdirt', imageUrl: '/chromargbdirt.gif' },
    { name: 'Wandering Trader', username: null,             chance: 0.00015,  rarity: 'legendary',
        texture: 'legendary_wandering_trader', imageUrl: '/wandering_trader.png' },
];

// Mirrors SEED_SPECIAL_ITEMS in wheel-backend (the plugin's eight CustomMaterials); filler and offline fallback only.
// Textures must match the backend's exactly or the collection book can't file a pull.
export const EXOTIC_ITEMS = [
    { name: 'Wheel of Fortune', texture: 'exotic_wheel_of_fortune', chance: 0.00055, type: 'exotic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/wheel.png` },
    { name: 'Eye of Antimatter', texture: 'exotic_eye_of_antimatter', chance: 0.00055, type: 'exotic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/eye_of_antimatter.png` },
    // The locators' /fib-custom textures are animated vertical sprite strips; use the static single-frame
    // renders in IMAGE_BASE_URL, keyed by material name. See scripts/vendor-textures.mjs.
    { name: 'Antimatter Locator', texture: 'exotic_antimatter_locator', chance: 0.00055, type: 'exotic',
        imageUrl: `${IMAGE_BASE_URL}/knowledge_book.png` },
    { name: 'Trial Locator', texture: 'exotic_trial_locator', chance: 0.00055, type: 'exotic',
        imageUrl: `${IMAGE_BASE_URL}/wither_rose.png` },
    { name: 'Sulfur Locator', texture: 'exotic_sulfur_locator', chance: 0.00055, type: 'exotic',
        imageUrl: `${IMAGE_BASE_URL}/music_disc_chirp.png` },
    // A TORCHFLOWER wearing the pack's old_book model, hence the texture name.
    { name: "Weathered Captain's Journal", texture: 'exotic_weathered_captains_journal', chance: 0.00055, type: 'exotic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/old_book.png` },
    { name: 'Totem of Antimatter', texture: 'exotic_totem_of_antimatter', chance: 0.00055, type: 'exotic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/totem_of_antimatter.png` },
    // The plugin's own name for it.
    { name: 'Kiln-Fired Brush', texture: 'exotic_kiln_fired_brush', chance: 0.00055, type: 'exotic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/kiln_fired_brush.png` },
];

// Mirrors SEED_SPECIAL_ITEMS in wheel-backend; filler and offline fallback only. Textures must match the backend's exactly.
export const RELIC_ITEMS = [
    { name: 'Trial Chambers', texture: 'relic_trial_chambers', chance: 0.00026, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/trial_chambers.png` },
    { name: 'End Ship', texture: 'relic_end_ship', chance: 0.00028, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/end_ship.png` },
    { name: 'Antimatter Depths', texture: 'relic_antimatter_depths', chance: 0.0003, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/antimatter_depths.png` },
    { name: 'Antimatter Portal', texture: 'relic_antimatter_portal', chance: 0.00033, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/antimatter_portal.png` },
    { name: 'Antimatter Teleporter', texture: 'relic_antimatter_teleporter', chance: 0.00036, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/antimatter_teleporter.png` },
    { name: 'Cleric', texture: 'relic_cleric', chance: 0.00037, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/cleric.png` },
    { name: 'Abandoned Camp', texture: 'relic_abandoned_camp', chance: 0.00038, type: 'relic',
        imageUrl: `${RELIC_IMAGE_BASE_URL}/abandoned_camp.png` },
];

export const RARE_MEMBERS = [
    { name: 'shabana02',    username: 'shabana02',    chance: 0.0007,  rarity: 'rare' },
    { name: 'McPlayHD',     username: 'McPlayHD',     chance: 0.00067, rarity: 'rare' },
    { name: 'Owen1212055',  username: 'Owen1212055',  chance: 0.0006,  rarity: 'rare' },
    { name: '170yt',        username: '170yt',        chance: 0.00069, rarity: 'rare' },
    { name: 'BastiGHG',     username: 'BastiGHG',     chance: 0.00061, rarity: 'rare' },
    { name: 'LennraZ',      username: 'LennraZ',      chance: 0.00072, rarity: 'rare' },
    { name: 'NubPanda',     username: 'NubPanda',     chance: 0.00071, rarity: 'rare' },
    { name: 'Johnlongears', username: 'Johnlongears', chance: 0.00068, rarity: 'rare' },
    { name: 'steez',        username: 'steez',        chance: 0.00062, rarity: 'rare' },
    { name: 'lacios',       username: 'lacios',       chance: 0.00065, rarity: 'rare' },
    { name: 'rzem',         username: 'rzem',         chance: 0.00064, rarity: 'rare' },
];

export const INSANE_ITEMS = [
    { name: 'Cavendish', texture: 'insane_cavendish', chance: 0.000001, type: 'insane',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/cavendish.png` },
];
export const INSANE_ITEM = INSANE_ITEMS[0];

export const MYTHIC_ITEMS = [
    { name: 'Jimbo',        texture: 'mythic_jimbo',        chance: 0.00002, type: 'mythic', imageUrl: '/jimbo.png' },
    { name: 'eltobito',     texture: 'mythic_eltobito',     chance: 0.00003, type: 'mythic', username: 'eltobito' },
    { name: 'Gros Michel',  texture: 'mythic_gros_michel',  chance: 0.00004, type: 'mythic',
        imageUrl: `${CUSTOM_IMAGE_BASE_URL}/gros_michel.png` },
    // One entity with the Wandering Trader in the plugin, so the same head recoloured (scripts/repixel-special-trader.py).
    { name: 'Special Trader', texture: 'mythic_special_trader', chance: 0.00005, type: 'mythic',
        imageUrl: '/special_trader.png' },
];
export const MYTHIC_ITEM = MYTHIC_ITEMS[0];

export const EVENT_ITEM = {
    name: 'BONUS EVENT', texture: 'event_bonus', chance: 0.9, type: 'event', imageUrl: '/event.png',
};

export const RECURSION_ITEM = {
    name: 'RECURSION', texture: 'recursion', chance: 0.0025, type: 'recursion', imageUrl: WHEEL_TEXTURE_URL,
};

export const BONUS_EVENTS = [
    { id: 'triple_spin',        name: '5x Spin',             description: '5 bonus spins!',           color: COLORS.orange, weight: 40 },
    { id: 'lucky_spin',         name: 'Lucky Spin',          description: 'Equal chance for all items!', color: COLORS.green, weight: 40 },
    { id: 'triple_lucky_spin',  name: 'Triple Lucky Spin',   description: '3 lucky spins!',            color: COLORS.gold,  weight: 20 },
];