/* The stats backend already unwraps the public API's envelope; a stale response carries an X-Stale-Age header. */

/* Same path in dev and prod: Vite and Apache both proxy /stats-api. */
import { idUuid, idName } from './data.js';

const BASE = '/stats-api';

export class ApiError extends Error {
    constructor(status, message, stale = false) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.stale = stale;
    }
}

async function apiGet(path, params) {
    const url = new URL(BASE + path, window.location.origin);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v != null && v !== '') url.searchParams.set(k, String(v));
        }
    }

    let response;
    try {
        response = await fetch(url, { headers: { Accept: 'application/json' } });
    } catch {
        // DNS, connection refused, offline: no status to speak of.
        throw new ApiError(0, 'The stats service could not be reached.');
    }

    if (!response.ok) {
        // The backend's error body is { error, message }; fall back to the status text if absent.
        let message = response.statusText;
        try {
            const body = await response.json();
            message = body?.message ?? message;
        } catch { /* non-JSON error body; keep statusText */ }
        throw new ApiError(response.status, message);
    }

    const stale = response.headers.get('X-Stale-Age') != null;

    // A 204 or empty body is a legitimate "nothing here" for some endpoints.
    const text = await response.text();
    if (!text) return { data: null, stale };

    try {
        return { data: JSON.parse(text), stale };
    } catch {
        throw new ApiError(response.status, 'The stats service returned an unreadable response.');
    }
}

/** The overview: the composed dashboard, one call. Shape: { globals, podiums, featured, activity, moments }. */
export const loadOverview = () => apiGet('/dashboard');

export const loadMatch = (matchId) => apiGet(`/matches/${encodeURIComponent(matchId)}`);

export const loadMatches = (page = 0, size = 20) => apiGet('/matches', { page, size });

/** One player's profile: { profile, partners, rank }, each section independently present-or-null. */
export const loadPlayer = (player) => apiGet(`/players/${encodeURIComponent(player)}`);

export const loadPlayerMatches = (player, size = 14) =>
    apiGet(`/matches/player/${encodeURIComponent(player)}`, { size });

/* The backend's roster is solo-only for now; `scope` is passed through and the backend decides. */
export const loadRoster = ({ page = 0, size = 25, query, sort = 'games_won' } = {}) =>
    apiGet('/players', { page, size, query, sort });

export const loadLeaderboard = (scope, category, limit = 100) =>
    apiGet('/leaderboards', { scope, category, limit });

/* TODO(backend): `/players` is solo-only, so team-only players are recovered from the combined and duo boards;
   read the roster alone once it returns every player. Sources fail individually; only a total failure throws. */
export async function loadPlayerIndex() {
    const settled = await Promise.allSettled([
        loadRoster({ size: 500 }),
        loadLeaderboard('combined', 'TOTAL_ITEMS', 500),
        loadLeaderboard('duo', 'TOTAL_ITEMS', 500),
        // The recent feed, for "last seen". Its own failure costs the directory a
        // column, never the directory.
        loadMatches(0, 100),
    ]);

    if (!settled.slice(0, 3).some((s) => s.status === 'fulfilled')) {
        const firstError = settled.find((s) => s.status === 'rejected');
        throw firstError?.reason ?? new ApiError(0, 'The player directory could not be loaded.');
    }

    const [roster, combined, duo, feed] =
        settled.map((s) => (s.status === 'fulfilled' ? s.value.data : null));

    /* itemsFound adds the solo roster total to the combined TOTAL_ITEMS board: "combined" is team rows only,
       so neither half is the whole career. lastSeen is the newest match in the recent feed. */
    const byUuid = new Map();
    const add = (identity) => {
        const uuid = idUuid(identity);
        if (!uuid) return null;
        if (!byUuid.has(uuid)) {
            byUuid.set(uuid, {
                uuid,
                name: idName(identity) ?? uuid,
                itemsFound: null,
                lastSeen: null,
            });
        }
        return byUuid.get(uuid);
    };

    /* Accumulates rather than assigns, so the two halves of a career add up. Stays null until one
       of them reports something — a player nobody has a count for shows no count. */
    const addItems = (entry, value) => {
        if (!entry || !Number.isFinite(value)) return;
        entry.itemsFound = (entry.itemsFound ?? 0) + value;
    };

    (roster?.players ?? []).forEach((p) => addItems(add(p.player), p.totalItemsFound));
    (Array.isArray(combined) ? combined : []).forEach((row) => addItems(add(row.player), row.value));
    (Array.isArray(duo) ? duo : []).forEach((row) => { add(row.player1); add(row.player2); });

    /* played/wins come from the 100-row feed; where that is not the whole history, the view says "in the last N matches". */
    for (const match of feed?.matches ?? []) {
        const at = new Date(match.endedAt).getTime();
        if (!Number.isFinite(at)) continue;
        const participants = match.participants ?? [];
        for (const p of participants) {
            const entry = add(p.player);
            if (!entry) continue;
            if (entry.lastSeen == null || at > entry.lastSeen) entry.lastSeen = at;
            entry.played = (entry.played ?? 0) + 1;
            entry.wins = (entry.wins ?? 0) + (p.won ? 1 : 0);
            (entry.results ??= []).push({ at, won: !!p.won, matchId: match.matchId });

            if (match.mode !== 'SOLO' && p.teamIndex != null) {
                for (const mate of participants) {
                    const mateUuid = idUuid(mate.player);
                    if (mate === p || mate.teamIndex !== p.teamIndex || !mateUuid) continue;
                    entry.mates ??= new Map();
                    const prev = entry.mates.get(mateUuid);
                    entry.mates.set(mateUuid, {
                        uuid: mateUuid,
                        name: idName(mate.player) ?? mateUuid,
                        count: (prev?.count ?? 0) + 1,
                    });
                }
            }
        }
    }

    const players = [...byUuid.values()]
        .map(({ mates, results, ...p }) => ({
            ...p,
            results: (results ?? []).sort((a, b) => a.at - b.at),
            partner: mates
                ? [...mates.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0]
                : null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    const stale = settled.some((s) => s.status === 'fulfilled' && s.value.stale);
    return {
        data: {
            players,
            feedWindow: feed?.matches?.length ?? 0,
            feedTotal: feed?.totalCount ?? 0,
        },
        stale,
    };
}

/* Reads `/leaderboards`, one call per metric, rather than every profile: per-player fetches hit the rate limit.
   TODO(backend): a single `/players/stats` would cover all fourteen figures. */

/* Keys match `unifyStats`'s vocabulary so a figure can name the stat it compares. */
const FIELD_BOARDS = [
    ['gamesWon', 'GAMES_WON'],
    ['highestScore', 'HIGHEST_SCORE'],
    ['totalItemsFound', 'TOTAL_ITEMS'],
    ['highestB2BStreak', 'BACK_TO_BACK_STREAK'],
    ['blocksTravelled', 'BLOCKS_TRAVELLED'],
    ['deaths', 'DEATHS'],
];

/* Cached per scope along with the in-flight promise, so profiles share one fetch; the TTL keeps a long-open tab current. */
const FIELD_TTL_MS = 5 * 60 * 1000;
const fieldCache = new Map(); // scope -> { at, promise }

/* Exposed for tests and for a hard-refresh path. */
export function clearStatFieldCache() {
    fieldCache.clear();
}

export function loadStatField(scope = 'solo') {
    const now = Date.now();
    const hit = fieldCache.get(scope);
    if (hit && now - hit.at < FIELD_TTL_MS) return hit.promise;

    const promise = fetchStatField(scope).catch((err) => {
        // Never cache a failure as the answer for the next five minutes.
        if (fieldCache.get(scope)?.promise === promise) fieldCache.delete(scope);
        throw err;
    });

    fieldCache.set(scope, { at: now, promise });
    return promise;
}

async function fetchStatField(scope) {
    const settled = await Promise.allSettled([
        ...FIELD_BOARDS.map(([, category]) => loadLeaderboard(scope, category, 500)),
        // Solo-only upstream, so it supplies gamesPlayed for the solo field and
        // nothing for combined — where those two figures simply carry no note.
        scope === 'solo' ? loadRoster({ size: 500 }) : Promise.resolve({ data: null, stale: false }),
    ]);

    const values = {};
    FIELD_BOARDS.forEach(([key], i) => {
        const s = settled[i];
        if (s.status !== 'fulfilled' || !Array.isArray(s.value.data)) return;
        const column = s.value.data.map((row) => row.value).filter(Number.isFinite);
        // A board that came back with fewer than three entrants is not a field;
        // `Record` suppresses the note rather than printing "1st of 2".
        if (column.length >= 3) values[key] = column;
    });

    const rosterResult = settled[settled.length - 1];
    const rosterRows = rosterResult.status === 'fulfilled'
        ? (rosterResult.value.data?.players ?? [])
        : [];
    if (rosterRows.length >= 3) {
        const played = rosterRows.map((r) => r.gamesPlayed).filter(Number.isFinite);
        if (played.length >= 3) values.gamesPlayed = played;

        // Derived, not fetched: the same ratio the figure itself shows.
        const perMatch = rosterRows
            .map((r) => (r.gamesPlayed > 0 ? r.totalItemsFound / r.gamesPlayed : null))
            .filter(Number.isFinite);
        if (perMatch.length >= 3) values.itemsPerMatch = perMatch;
    }

    const stale = settled.some((s) => s.status === 'fulfilled' && s.value.stale);
    if (Object.keys(values).length === 0) return { data: null, stale };
    return { data: { values }, stale };
}

export const loadItems = () => apiGet('/items');

export const loadCatalogue = () => apiGet('/catalogue');

export const loadPlayerAchievements = (player) =>
    apiGet(`/achievements/${encodeURIComponent(player)}`);

/* distinctItems is the "X collected" figure; totalItems is the pool size for "X of Y". */
export const loadCollection = (player) =>
    apiGet(`/collection/${encodeURIComponent(player)}`);

export const loadItem = (itemName, limit = 50) =>
    apiGet(`/items/${encodeURIComponent(itemName)}`, { limit });
