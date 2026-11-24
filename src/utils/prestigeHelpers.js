// The level -> rarity mapping lives here only; a prestige level wears its tier's colours from the shared ladder.

import { RARITY, getRarityColor, getRarityInk, getRarityIcon, isIridescentRarity } from './rarityHelpers.jsx';

// Level 1 is the first index. Mirrors PRESTIGE_LEVELS in the wheel backend.
export const PRESTIGE_LEVELS = ['rare', 'exotic', 'relic', 'legendary', 'mythic', 'insane'];
export const MAX_PRESTIGE_LEVEL = PRESTIGE_LEVELS.length;

export function prestigeKey(level) {
    return PRESTIGE_LEVELS[level - 1] || null;
}

export function prestigeLabel(level) {
    const key = prestigeKey(level);
    return key ? `${RARITY[key].label} Prestige` : null;
}

// For places that already say "prestige" in their own furniture.
export function prestigeName(level) {
    const key = prestigeKey(level);
    return key ? RARITY[key].label : null;
}

export function prestigeColor(level) {
    const key = prestigeKey(level);
    return key ? getRarityColor(key) : null;
}

// Icons count as text.
export function prestigeInk(level) {
    const key = prestigeKey(level);
    return key ? getRarityInk(key) : null;
}

// The highest level touched, with `earned` saying whether it was won or is in progress.
// Accepts a leaderboard row (`prestige_level`/`prestige_active_level`) or /api/prestige's state (`level`/`activeRun`).
export function prestigeStanding(source) {
    if (!source) return { level: 0, earned: false, inProgress: false };

    const done = source.prestige_level ?? source.level ?? 0;
    const active = source.prestige_active_level ?? source.activeRun?.level ?? 0;
    const level = Math.max(done, active);

    return {
        level,
        earned: level > 0 && level <= done,
        inProgress: level > 0 && level > done,
    };
}

// `colored` defaults to false: the container sets the ink, and insane's gradient <defs> only exists inside the wheel tree.
export function prestigeIcon(level, size = 12, colored = false) {
    const key = prestigeKey(level);
    return key ? getRarityIcon(key, size, colored) : null;
}

// Insane must be painted with the whole gradient, never one sampled point (DESIGN.md §8).
export function isIridescentPrestige(level) {
    const key = prestigeKey(level);
    return Boolean(key && isIridescentRarity(key));
}
