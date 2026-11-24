import { IMAGE_BASE_URL, CUSTOM_IMAGE_BASE_URL, MYTHIC_ITEMS, INSANE_ITEMS, EXOTIC_ITEMS, RELIC_ITEMS, TEAM_MEMBERS, COLORS } from '../config/constants.js';
import { getRarityColor } from './rarityHelpers.jsx';
import { serverNow } from './serverClock.js';

export function formatChance(chance) {
    if (!chance || chance === 0) return '0';

    const percent = chance * 100;

    let formatted;
    if (percent >= 1) {
        formatted = percent.toFixed(1);
    } else if (percent >= 0.1) {
        formatted = percent.toFixed(2);
    } else if (percent >= 0.01) {
        formatted = percent.toFixed(3);
    } else {
        formatted = percent.toFixed(4);
    }

    return formatted.replace(/\.?0+$/, '');
}

// SQLite timestamps are UTC with no zone; browsers read a bare one as local time. Values already zoned are left alone.
export function parseServerDate(dateString) {
    if (!dateString) return null;

    let dateStr = dateString;
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
        // `T`, not a space: `YYYY-MM-DD HH:MM:SSZ` is implementation-defined and some engines return Invalid Date.
        dateStr = dateStr.replace(' ', 'T') + 'Z';
    }

    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

// Measured on the server's clock from `created_at`, so a drop never shows before the reel (SPIN_DURATION 4000) lands.
// The 200ms cushion covers ~400ms RTT; to shorten the wait, shorten SPIN_DURATION rather than this.
export const SPIN_REVEAL_MS = 4200;

export function spinRevealDelay(dateString, now = serverNow()) {
    const date = parseServerDate(dateString);
    if (!date) return SPIN_REVEAL_MS;

    const age = Math.max(0, now - date.getTime());
    return Math.max(0, SPIN_REVEAL_MS - age);
}

// Unparseable dates count as 0 ("just happened"): NaN would silently fail every comparison.
export function pullAge(dateString, now = serverNow()) {
    const date = parseServerDate(dateString);
    if (!date) return 0;
    return Math.max(0, now - date.getTime());
}

export const CELEBRATION_BEAT_MS = 300;

// Catch-up fetches (mount, refocus, SSE reconnect) replay old drops; past this age a pull gets no takeover.
export const STALE_PULL_GRACE_MS = 60_000;

// Must use spinRevealDelay's skew-corrected server clock, never Date.now().
export function celebrationDelay(dateString) {
    return spinRevealDelay(dateString) + CELEBRATION_BEAT_MS;
}

export function formatTimeAgo(dateString) {
    const date = parseServerDate(dateString);
    if (!date) return 'Unknown';

    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 0) return 'Just now';

    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    try {
        return date.toLocaleDateString();
    } catch {
        return 'Unknown';
    }
}

// SQLite gives "YYYY-MM-DD HH:MM:SS" with no zone (Safari rejects it); normalise to UTC. Returns 0 if unparseable.
export function parseActivityDate(createdAt) {
    if (!createdAt) return 0;
    const hasZone = createdAt.includes('Z') || createdAt.includes('+');
    const time = new Date(hasZone ? createdAt : createdAt.replace(' ', 'T') + 'Z').getTime();
    return Number.isFinite(time) ? time : 0;
}

// minotar, not mc-heads (cached default skins as 200s) or mineatar (uuid only); it takes names and 404s unknown ones.
export function getMinecraftHeadUrl(username) {
    return `https://minotar.net/helm/${username}/64`;
}

export function getDiscordAvatarUrl(discordId, avatarHash, size = 64) {
    if (avatarHash) {
        const format = avatarHash.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${format}?size=${size}`;
    }
    try {
        if (!discordId || !/^\d+$/.test(String(discordId))) {
            return `https://cdn.discordapp.com/embed/avatars/0.png`;
        }
        const defaultIndex = (BigInt(discordId) >> 22n) % 6n;
        return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
}

export function sanitizeString(str) {
    if (!str) return '';
    return String(str)
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 100);
}

export function isValidId(id) {
    return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

// Platinum fallback only: insane has no flat colour. Prefer getRarityColor/getRarityStops from utils/rarityHelpers.jsx.
export const INSANE_COLOR = '#F2ECFF';

export function isInsaneItem(item) {
    return item?.isInsane || item?.type === 'insane' || item?.texture?.startsWith('insane_');
}

export function isSpecialItem(item) {
    return item?.isSpecial || item?.type === 'legendary' || item?.texture?.startsWith('special_');
}

// Prefix is `exotic_`; legendary's prefix is `special_`.
export function isExoticItem(item) {
    return item?.isExotic || item?.type === 'exotic' || item?.texture?.startsWith('exotic_');
}

export function isRelicItem(item) {
    return item?.isRelic || item?.type === 'relic' || item?.texture?.startsWith('relic_');
}

export function isRareItem(item) {
    return item?.isRare || item?.type === 'rare' || item?.texture?.startsWith('rare_');
}

export function isMythicItem(item) {
    return item?.isMythic || item?.type === 'mythic' || item?.texture?.startsWith('mythic_');
}

export function isEventItem(item) {
    return item?.isEvent || item?.type === 'event' || item?.texture?.startsWith('event_');
}

export function isRecursionItem(item) {
    return item?.isRecursion || item?.type === 'recursion' || item?.texture === 'recursion';
}

export function getItemImageUrl(item) {
    if (!item) return `${IMAGE_BASE_URL}/barrier.png`;

    const texture = item.texture || item.item_texture;
    const type = item.type || item.item_type || item.item_rarity;
    const username = item.username || (texture?.includes('_') ? texture.split('_').slice(1).join('_') : null);

    // Before the username split below, which would render a player head for a whole-name texture.
    if (type === 'exotic' || texture?.startsWith('exotic_')) {
        if (item.imageUrl) return item.imageUrl;
        // Raw /api/items rows keep `image_url`; the backend is the authoritative roster.
        if (item.image_url) return item.image_url;
        const exotic = EXOTIC_ITEMS?.find(e => e.texture === texture);
        if (exotic?.imageUrl) return exotic.imageUrl;
        return `${IMAGE_BASE_URL}/barrier.png`;
    }

    // Same early exit as exotics: whole-name textures would otherwise hit the player-head branch.
    if (type === 'relic' || texture?.startsWith('relic_')) {
        if (item.imageUrl) return item.imageUrl;
        if (item.image_url) return item.image_url;
        const relic = RELIC_ITEMS?.find(r => r.texture === texture);
        if (relic?.imageUrl) return relic.imageUrl;
        return `${IMAGE_BASE_URL}/barrier.png`;
    }

    if (type === 'insane' || texture?.startsWith('insane_')) {
        if (item.imageUrl) return item.imageUrl;
        const insane = INSANE_ITEMS?.find(i => i.texture === texture);
        if (insane?.imageUrl) return insane.imageUrl;
        if (texture === 'insane_cavendish') {
            return `${CUSTOM_IMAGE_BASE_URL}/cavendish.png`;
        }
    }

    if (type === 'mythic' || texture?.startsWith('mythic_')) {
        if (item.imageUrl) return item.imageUrl;
        const mythic = MYTHIC_ITEMS?.find(m => m.texture === texture);
        if (mythic?.imageUrl) return mythic.imageUrl;
        if (texture === 'mythic_jimbo') return '/jimbo.png';
        if (texture === 'mythic_gros_michel') {
            return `${CUSTOM_IMAGE_BASE_URL}/gros_michel.png`;
        }
    }

    if (type === 'legendary' || texture?.startsWith('special_')) {
        const memberName = item.name || (texture?.includes('_') ? texture.split('_').slice(1).join('_') : null);
        if (memberName) {
            const member = TEAM_MEMBERS?.find(m =>
                m.name?.toLowerCase() === memberName.toLowerCase() ||
                (m.username && m.username.toLowerCase() === memberName.toLowerCase())
            );
            if (member?.imageUrl) return member.imageUrl;
        }
    }

    if (texture === 'wandering_trader' || texture === 'special_wandering_trader' || texture === 'legendary_wandering_trader') {
        return '/wandering_trader.png';
    }
    // The recolour is baked into the PNG (scripts/repixel-special-trader.py) so canvas and DOM agree.
    if (texture === 'special_trader' || texture === 'mythic_special_trader') {
        return '/special_trader.png';
    }
    if (texture === 'chromargbdirt' || texture === 'special_chromargbdirt' || texture === 'legendary_chromargbdirt') {
        return '/chromargbdirt.gif';
    }
    if (texture === 'jimbo' || texture === 'mythic_jimbo') {
        return '/jimbo.png';
    }
    if (texture === 'recursion' || texture === 'wheel') {
        return `${CUSTOM_IMAGE_BASE_URL}/wheel.png`;
    }

    if (item.image_url) {
        return item.image_url;
    }

    if (item.username) {
        return getMinecraftHeadUrl(item.username);
    }

    if ((type === 'legendary' || type === 'rare' || type === 'mythic' || texture?.startsWith('special_') || texture?.startsWith('rare_') || texture?.startsWith('mythic_')) && texture?.includes('_')) {
        const extractedUsername = texture.split('_').slice(1).join('_');
        if (extractedUsername && !['cavendish', 'jimbo', 'gros_michel'].includes(extractedUsername.toLowerCase())) {
            const member = TEAM_MEMBERS?.find(m =>
                m.name?.toLowerCase() === extractedUsername.toLowerCase() && m.username === null
            );
            if (member?.imageUrl) return member.imageUrl;

            return getMinecraftHeadUrl(extractedUsername);
        }
    }

    if (type === 'event' || texture?.startsWith('event_')) {
        return '/event.png';
    }

    if (type === 'recursion' || texture === 'recursion') {
        return `${CUSTOM_IMAGE_BASE_URL}/wheel.png`;
    }

    if (texture) {
        return `${IMAGE_BASE_URL}/${texture}.png`;
    }

    return `${IMAGE_BASE_URL}/barrier.png`;
}

// Rarest-first: an item can match several predicates and must never be demoted. Recursion is a spin mode, not a tier.
export function getItemRarity(item) {
    if (isInsaneItem(item)) return 'insane';
    if (isMythicItem(item)) return 'mythic';
    if (isSpecialItem(item)) return 'legendary';
    if (isRelicItem(item)) return 'relic';
    if (isExoticItem(item)) return 'exotic';
    if (isRareItem(item)) return 'rare';
    if (isEventItem(item)) return 'event';
    return 'common';
}

// Recursion is special-cased because it is a spin mode with no RARITY entry.
export function getItemColor(item) {
    if (isRecursionItem(item)) return COLORS.recursion;
    return getRarityColor(getItemRarity(item));
}