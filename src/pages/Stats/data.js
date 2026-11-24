/* Player identities in the DTOs are nested ({ uuid, name }), not flat uuids. */

import { ITEM_TEXTURE_BASE, RARITY_KEYS, RARITY_FIELDS } from './tokens.js';

export { RARITY_KEYS, RARITY_FIELDS };

/* Re-exported here for its consumers (the collection book, and vendor-textures.mjs' reachable set). */
import { ITEM_POOL, ITEM_STATE } from './itemPool.js';
/* Its own module so the main bundle can read the names without pulling the pool into the lazy Stats chunk. */
import { CUSTOM_ITEM_NAMES } from '../../config/customItems.js';

export { ITEM_POOL, ITEM_STATE, CUSTOM_ITEM_NAMES };

// Fallbacks for places that hold only a uuid; prefer the name the DTO carries.

export const playerName = (uuid) => (uuid ? String(uuid).slice(0, 8) : 'Unknown');

/* The public API serialises FibPlayer as { uuid, name }; the generated client's playerUuid/playerName is the fallback. */
export const idUuid = (identity) => identity?.uuid ?? identity?.playerUuid ?? null;
export const idName = (identity) => identity?.name ?? identity?.playerName ?? null;

export const idLabel = (identity) => {
    const name = idName(identity);
    if (name) return name;
    const uuid = idUuid(identity);
    return uuid ? String(uuid).slice(0, 8) : 'Unknown';
};

/* mineatar, not mc-heads: mc-heads served cached default-skin renders as 200s for some accounts. Face is 8 px per unit of scale. */
export const playerAvatar = (uuid, size = 48) => (uuid
    ? `https://api.mineatar.io/face/${uuid}?scale=${Math.max(1, Math.round(size / 8))}`
    : 'https://mc-heads.net/avatar/MHF_Question/48');

// Namespace stripped and lower-cased: the API returns SCREAMING_ENUMS, and case-sensitive static servers 404 uppercase texture paths.
export const itemKey = (itemName) => (itemName || '').split(':').pop().toLowerCase();

const titleCase = (key) =>
    key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/* A material owned by a custom item shows the custom item's name. The map is vendored from the plugin's
   CustomMaterials.java by vendor-pool.mjs (it honours SHARES_MATERIAL_WITH_POOL_ITEM); never add entries by hand. */
export const itemLabel = (itemName) => {
    const key = itemKey(itemName);
    return CUSTOM_ITEM_NAMES[key.toUpperCase()] ?? titleCase(key);
};

/* Label plus raw material name, so a custom item stays findable by the material it rides on. */
export const itemSearchText = (itemName) => `${itemLabel(itemName)} ${titleCase(itemKey(itemName))}`;
export const itemTexture = (itemName) => `${ITEM_TEXTURE_BASE}/${itemKey(itemName)}.png`;

// Presentation only: the valid category set lives server-side and is deliberately not mirrored as a fetch gate.

export const LEADERBOARD_SCOPES = [
    { id: 'solo', label: 'Solo' },
    { id: 'duo', label: 'Duo' },
    { id: 'combined', label: 'Teams' },
];

export const LEADERBOARD_CATEGORIES = [
    { id: 'GAMES_WON', label: 'Wins', format: 'number', sense: 'high' },
    { id: 'HIGHEST_SCORE', label: 'Top score', format: 'number', sense: 'high' },
    { id: 'TOTAL_ITEMS', label: 'Items', format: 'number', sense: 'high' },
    /* Spelled out to match the profile's "Back-to-back best". */
    { id: 'BACK_TO_BACK_STREAK', label: 'Back to back streak', format: 'number', sense: 'high' },
    { id: 'BLOCKS_TRAVELLED', label: 'Distance', format: 'distance', sense: 'high' },
    { id: 'DEATHS', label: 'Deaths', format: 'number', sense: 'low' },
];

export const categorySense = (category) =>
    LEADERBOARD_CATEGORIES.find((c) => c.id === category)?.sense ?? 'high';

const uuidOf = (p) => idUuid(p?.player) ?? idUuid(p) ?? null;

const identityOf = (p) => {
    const id = p?.player ?? p;
    return { uuid: idUuid(id), name: idName(id) };
};

/* From the start/end timestamps: durationSeconds is the configured round length, even when the match ran longer. */
export const matchDuration = (match) => {
    const start = new Date(match.startedAt).getTime();
    const end = new Date(match.endedAt).getTime();
    const span = (end - start) / 1000;
    // Fall back to the stored field only if the timestamps are missing or nonsensical.
    return Number.isFinite(span) && span > 0 ? span : (match.durationSeconds ?? 0);
};

export const matchStandings = (match) => {
    if (match.mode === 'SOLO') {
        return match.participants
            .slice()
            .sort((a, b) => a.placement - b.placement)
            .map((p) => ({
                key: uuidOf(p),
                owner: { playerUuid: uuidOf(p), teamIndex: null },
                members: [identityOf(p)],
                placement: p.placement,
                score: p.finalScore,
                won: p.won,
            }));
    }
    return match.teams
        .map((team) => {
            const members = match.participants.filter((p) => p.teamIndex === team.teamIndex);
            const first = members[0];
            return {
                key: `t${team.teamIndex}`,
                owner: { playerUuid: null, teamIndex: team.teamIndex },
                members: members.map(identityOf),
                placement: first?.placement ?? 0,
                score: first?.finalScore ?? 0,
                won: first?.won ?? false,
            };
        })
        .sort((a, b) => a.placement - b.placement);
};

export const itemsForOwner = (match, owner) =>
    (match?.items ?? [])
        .filter((it) =>
            owner.teamIndex != null ? it.teamIndex === owner.teamIndex : uuidOf(it) === owner.playerUuid,
        )
        .sort((a, b) => a.orderIndex - b.orderIndex);

export const raceEntries = (match) => {
    const start = new Date(match.startedAt).getTime();
    return matchStandings(match).map((row, i) => ({
        ...row,
        index: i,
        events: itemsForOwner(match, row.owner).map((it) => ({
            t: Math.max(0, (new Date(it.collectedAt).getTime() - start) / 1000),
            skipped: it.skipped,
            b2b: it.b2bRarity,
            itemName: it.itemName,
        })),
    }));
};

/* Skips score, which is why they count. */
export const scoreAt = (entry, t) => entry.events.filter((e) => e.t <= t).length;

export const eventTimes = (entries) =>
    [...new Set(entries.flatMap((e) => e.events.map((ev) => ev.t)))].sort((a, b) => a - b);

export const standingsAt = (entries, t) => {
    const rows = entries
        .map((entry) => {
            const seen = entry.events.filter((e) => e.t <= t);
            return {
                entry,
                score: seen.length,
                found: seen.filter((e) => !e.skipped).length,
                skipped: seen.filter((e) => e.skipped).length,
                b2b: seen.filter((e) => e.b2b).length,
            };
        })
        .sort((a, b) => b.score - a.score || a.entry.index - b.entry.index);
    const lead = rows[0]?.score ?? 0;

    /* Dense rank, as the plugin resolves `placement`: tied scores share a place. */
    let pos = 0;
    let prevScore = null;
    return rows.map((r) => {
        if (r.score !== prevScore) {
            pos += 1;
            prevScore = r.score;
        }
        return { ...r, pos, gap: r.score - lead };
    });
};

/* The plugin's LeadTracker rule: only a sole leader holds the lead, and a tie leaves it with the incumbent. */
export const leadChangeTimes = (entries) => {
    const times = [];
    let lead = null;
    for (const t of eventTimes(entries)) {
        const [top, next] = standingsAt(entries, t);
        if (!top || (next && next.score === top.score)) continue;
        if (lead != null && top.entry.index !== lead) times.push(t);
        lead = top.entry.index;
    }
    return times;
};

export const leadChanges = (entries) => leadChangeTimes(entries).length;

export const itemSegments = (entry) =>
    entry.events.map((e, i) => ({
        ...e,
        order: i + 1,
        took: e.t - (i ? entry.events[i - 1].t : 0),
    }));

export const formatNumber = (n) => {
    if (n == null) return '—';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 10000) return `${(n / 1000).toFixed(1)}K`;
    // Locale pinned: left to the browser, a German client renders "1.216.896" while every other
    // formatter says "1,216,896".
    return n.toLocaleString('en-US');
};

export const formatDistance = (b) => {
    if (b == null) return '—';
    if (b >= 1000000) return `${(b / 1000000).toFixed(2)}M`;
    if (b >= 1000) return `${(b / 1000).toFixed(1)}K`;
    return b.toLocaleString('en-US');
};

export const mmss = (s) => {
    const total = Math.max(0, Math.round(s));
    if (total >= 3600) return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const formatTime = (s) => {
    if (s == null || Number.isNaN(s)) return '—';
    const total = Math.round(s);
    if (total >= 60) return `${Math.floor(total / 60)}m ${total % 60}s`;
    return `${total}s`;
};

/* Calendar days, not 24-hour periods: both ends floored to local midnight and rounded, so DST cannot slip a day. */
const midnight = (t) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

export const calendarDaysAgo = (v) => {
    const then = new Date(v).getTime();
    if (Number.isNaN(then)) return NaN;
    return Math.round((midnight(Date.now()) - midnight(then)) / 86400000);
};

export const formatDate = (v) => {
    const d = new Date(v);
    const days = calendarDaysAgo(v);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* 24-hour, pinned, to agree with `formatStamp`. */
export const formatClock = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const formatByKind = (value, kind) => {
    if (kind === 'compact') return formatNumber(value);
    if (kind === 'distance') return `${formatDistance(value)} blocks`;
    return (value ?? 0).toLocaleString('en-US');
};

export const totalRarities = (r) =>
    RARITY_KEYS.reduce((a, k) => a + (r?.[RARITY_FIELDS[k]] ?? 0), 0);

export const winRate = (won, played) => (played > 0 ? (won / played) * 100 : 0);
export const itemsPerGame = (items, games) => (games > 0 ? items / games : 0);
export const secondsPerItem = (time, items) => (items > 0 ? time / items : 0);

export const timeAgo = (value) => {
    const then = new Date(value).getTime();
    const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
};
