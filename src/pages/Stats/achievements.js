/* The catalogue's `scope` is a free string the plugin owns; groups follow whatever comes back, ordered by SCOPE_ORDER.
   Rarity ("held by N of M") is left out until a per-achievement count endpoint exists. */

import { RARITY_KEYS, RARITY_FIELDS } from './tokens.js';
/* Titles are MiniMessage: compare and search the flattened text, or `<gold>` sorts before `<green>`. */
import { stripMiniMessage } from './MiniMessage.jsx';

/* Flattens solo, duo and combined into one vocabulary; a field absent from a scope is null, never 0. */
export function unifyStats(payload, scope = 'solo') {
  if (!payload) return null;
  const combined = scope === 'combined';

  return {
    scope,
    gamesPlayed: combined ? payload.totalGamesPlayed : payload.gamesPlayed,
    gamesWon: combined ? payload.totalGamesWon : payload.gamesWon,
    highestScore: combined ? payload.highestTeamScore : payload.highestScore,
    longestItemStreak: combined ? payload.longestTeamItemStreak : payload.longestItemStreak,
    highestB2BStreak: payload.highestB2BStreak,
    totalItemsFound: payload.totalItemsFound,
    rarities: payload.rarities ?? {},
    blocksTravelled: payload.blocksTravelled,
    deaths: payload.deaths,
    wheelOfFortuneUses: payload.wheelOfFortuneUses,
    enteredAntimatterTeleporter: payload.enteredAntimatterTeleporter,
    // The service reports this in milliseconds while every consumer reads seconds. Absent stays null.
    totalTimeSpentOnItems: Number.isFinite(payload.totalTimeSpentOnItems)
      ? payload.totalTimeSpentOnItems / 1000
      : null,
    topThreeItems: payload.topThreeItems ?? [],
    teamsCount: payload.teamsCount ?? null,
  };
}

/* Solo and team ADDED: FIBService's "combined" aggregates team rows only and never reads the solo table.
   Counters add; the "highest" and "longest" fields take the better of the two. */
export function lifetimeStats(soloPayload, teamPayload) {
  const solo = unifyStats(soloPayload, 'solo');
  const team = unifyStats(teamPayload, 'combined');
  if (!solo && !team) return null;

  /* Absent in both stays null; absent in one counts as zero (no team games is no team deaths). */
  const sum = (key) => {
    const a = solo?.[key];
    const b = team?.[key];
    if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
    return (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
  };

  const best = (key) => {
    const values = [solo?.[key], team?.[key]].filter(Number.isFinite);
    return values.length ? Math.max(...values) : null;
  };

  return {
    scope: 'lifetime',

    gamesPlayed: sum('gamesPlayed'),
    gamesWon: sum('gamesWon'),
    totalItemsFound: sum('totalItemsFound'),
    blocksTravelled: sum('blocksTravelled'),
    deaths: sum('deaths'),
    wheelOfFortuneUses: sum('wheelOfFortuneUses'),
    enteredAntimatterTeleporter: sum('enteredAntimatterTeleporter'),
    totalTimeSpentOnItems: sum('totalTimeSpentOnItems'),

    rarities: Object.fromEntries(
      RARITY_KEYS.map((tier) => {
        const field = RARITY_FIELDS[tier];
        return [field, (solo?.rarities?.[field] ?? 0) + (team?.rarities?.[field] ?? 0)];
      }),
    ),

    highestScore: best('highestScore'),
    highestB2BStreak: best('highestB2BStreak'),
    longestItemStreak: best('longestItemStreak'),
  };
}

const rarityCount = (s, tier) => s.rarities?.[RARITY_FIELDS[tier]] ?? 0;

export const totalPulls = (s) =>
    RARITY_KEYS.reduce((a, tier) => a + rarityCount(s, tier), 0);

/* Progress is keyed by achievementId, not parsed from descriptions the plugin may reword. ROUND achievements
   have no bar on purpose: no career total measures a single-round event. */

const rarity = (tier) => (ctx) => ctx.career?.rarities?.[tier];
const stat = (key) => (ctx) => ctx.career?.[key];
const streak = (ctx) => ctx.streaks?.highestWinStreak;

const distinct = (ctx) => ctx.collection?.distinctItems;
const poolSize = (ctx) => ctx.collection?.totalItems;

export const ACHIEVEMENT_PROGRESS = {
  /* GLOBAL: off `lifetimeStats` (solo + team), not the team-only "combined" block. */
  LEARNING_EXPERIENCE: [stat('deaths'), 50],
  BETTER_LUCK_NEXT_TIME: [stat('deaths'), 250],
  ARE_YOU_EVEN_TRYING: [stat('deaths'), 500],

  FORTUNE_FAVOURS: [totalPulls, 100],
  PROBABILITY_BROKEN: [totalPulls, 250],
  BACK_TO_BACK_TO_BACK_TO_BACK: [totalPulls, 1000],

  NOTHING_SPECIAL: [rarity('rare'), 250],
  PURPLE_REIGN: [rarity('epic'), 100],
  STUFF_OF_LEGENDS: [rarity('legendary'), 50],
  BLESSED_BY_RNGESUS: [rarity('rngesus'), 2],
  FEELS_FAMILIAR: [rarity('extraordinary'), 5],

  FIRST_OF_MANY: [stat('gamesPlayed'), 10],
  SEASONED_VETERAN: [stat('gamesPlayed'), 50],

  TASTE_OF_VICTORY: [stat('gamesWon'), 5],
  HALL_OF_FAME: [stat('gamesWon'), 25],

  HAT_TRICK: [streak, 3],
  UNSTOPPABLE: [streak, 5],

  STOCKPILE: [stat('totalItemsFound'), 1000],
  WAREHOUSE: [stat('totalItemsFound'), 5000],

  GLOBETROTTER: [stat('blocksTravelled'), 50000],
  MARATHON_RUNNER: [stat('blocksTravelled'), 250000],

  FREQUENT_FLYER: [stat('enteredAntimatterTeleporter'), 100],
  QUANTUM_COMMUTER: [stat('enteredAntimatterTeleporter'), 250],

  WHEEL_ENTHUSIAST: [stat('wheelOfFortuneUses'), 250],
  WHEEL_ADDICT: [stat('wheelOfFortuneUses'), 500],
  GAMBA_GAMBA_GAMA: [stat('wheelOfFortuneUses'), 1000],

  /* A fraction of the pool, not a fixed count, so it tracks the pool growing. */
  COLLECTOR_I: [distinct, (ctx) => poolSize(ctx) * 0.25],
  COLLECTOR_II: [distinct, (ctx) => poolSize(ctx) * 0.5],
  COLLECTOR_III: [distinct, (ctx) => poolSize(ctx) * 0.75],
  FORCEITEMBATTLE: [distinct, poolSize],

  /* META — measured against the other achievements, so the numerator comes from
     the rows themselves rather than from a stat. */
  COMPLETIONIST: [(ctx) => ctx.scopeEarned?.ROUND, (ctx) => ctx.scopeTotal?.ROUND],
  COMPLETIONIST_PLUS_PLUS: [
    (ctx) => ['ROUND', 'GLOBAL', 'COLLECTION'].reduce((a, s) => a + (ctx.scopeEarned?.[s] ?? 0), 0),
    (ctx) => ['ROUND', 'GLOBAL', 'COLLECTION'].reduce((a, s) => a + (ctx.scopeTotal?.[s] ?? 0), 0),
  ],
};

/* Clamped to `target`: the plugin awards on the next event, so a player can be past a threshold unawarded. */
export function achievementProgress(id, ctx) {
  const entry = ACHIEVEMENT_PROGRESS[id];
  if (!entry || !ctx) return null;

  const [pick, rawTarget] = entry;
  const current = pick(ctx);
  const target = typeof rawTarget === 'function' ? rawTarget(ctx) : rawTarget;

  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return null;

  return {
    current: Math.min(current, target),
    target,
    ratio: Math.max(0, Math.min(1, current / target)),
  };
}

/* Unknown scopes sort after these, alphabetically, so a new plugin scope is appended, never hidden. */
const SCOPE_ORDER = ['SOLO', 'TEAM', 'GLOBAL', 'COLLECTION', 'META', 'ROUND'];

const SCOPE_LABELS = {
  SOLO: 'Solo',
  TEAM: 'Team',
  GLOBAL: 'Global',
  COLLECTION: 'Collection',
  META: 'Meta',
  ROUND: 'In a round',
};

export function scopeLabel(scope) {
  if (SCOPE_LABELS[scope]) return SCOPE_LABELS[scope];
  const s = String(scope || '').toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Other';
}

/* Every catalogue entry becomes a row, locked or not; one earned solo and in a team appears once with both `unlocks`. */
export function achievementGroups(catalogue, player, ctx = null) {
  const catalogueList = catalogue?.achievements ?? [];
  const unlocks = player?.achievements ?? [];

  // An achievement may have a solo and a team unlock, so this is id -> [record].
  const unlocksById = new Map();
  for (const u of unlocks) {
    const list = unlocksById.get(u.achievementId) ?? [];
    list.push(u);
    unlocksById.set(u.achievementId, list);
  }

  const rows = catalogueList.map((entry) => {
    const records = unlocksById.get(entry.achievementId) ?? [];
    const unlocked = records.length > 0;

    // The earliest unlock is the earned date; a re-earn in the other mode does not reset it.
    const earnedAt = unlocked
        ? Math.min(...records.map((r) => r.unlockedAt))
        : null;

    const teammates = records
        .filter((r) => r.mode === 'TEAM' && r.teammate)
        .map((r) => r.teammate);

    return {
      id: entry.achievementId,
      title: entry.title,             // MiniMessage — rendered by the component, not here
      description: entry.description, // MiniMessage
      /* The same two strings flattened, for sorting and for the search filter.
         Computed once here rather than per keystroke in the view. */
      plainTitle: stripMiniMessage(entry.title),
      plainDescription: stripMiniMessage(entry.description),
      scope: entry.scope,
      unlocked,
      earnedAt,
      modes: [...new Set(records.map((r) => r.mode))], // ['SOLO'], ['TEAM'], or both
      teammates,
      // Undefined until a per-achievement count endpoint exists; the UI shows "held by N of M" only when both are set.
      heldBy: undefined,
      population: undefined,
      // Filled in the second pass below, once the scope tallies META needs exist.
      progress: null,
    };
  });

  /* Second pass: META achievements are measured against the other rows, which exist only after the first. */
  if (ctx) {
    const scopeTotal = {};
    const scopeEarned = {};
    for (const row of rows) {
      scopeTotal[row.scope] = (scopeTotal[row.scope] ?? 0) + 1;
      if (row.unlocked) scopeEarned[row.scope] = (scopeEarned[row.scope] ?? 0) + 1;
    }
    const full = { ...ctx, scopeTotal, scopeEarned };
    for (const row of rows) row.progress = achievementProgress(row.id, full);
  }

  const byScope = new Map();
  for (const row of rows) {
    const list = byScope.get(row.scope) ?? [];
    list.push(row);
    byScope.set(row.scope, list);
  }

  const orderedScopes = [...byScope.keys()].sort(compareScopes);

  return orderedScopes.map((scope) => ({
    scope,
    label: scopeLabel(scope),
    achievements: byScope.get(scope).sort(compareRows),
  }));
}

/* `earned` is newest first; `chase` is closest first, with unmeasurable rows trailing alphabetically. */
export function splitAchievements(groups) {
  const all = groups.flatMap((g) =>
      g.achievements.map((a) => ({ ...a, scopeLabel: g.label })));

  const earned = all
      .filter((a) => a.unlocked)
      .sort((a, b) => (b.earnedAt ?? 0) - (a.earnedAt ?? 0));

  const chase = all
      .filter((a) => !a.unlocked)
      .sort((a, b) => {
        const ra = a.progress?.ratio;
        const rb = b.progress?.ratio;
        if (Number.isFinite(ra) && Number.isFinite(rb)) {
          if (rb !== ra) return rb - ra;
        } else if (Number.isFinite(ra) !== Number.isFinite(rb)) {
          return Number.isFinite(ra) ? -1 : 1;
        }
        return a.plainTitle.localeCompare(b.plainTitle);
      });

  return { earned, chase };
}

function compareScopes(a, b) {
  const ia = SCOPE_ORDER.indexOf(a);
  const ib = SCOPE_ORDER.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return String(a || '').localeCompare(String(b || ''));
}

function compareRows(a, b) {
  if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
  if (a.unlocked && b.unlocked) return a.earnedAt - b.earnedAt;
  return 0;
}

/* From the payload's `count`, not the rendered rows: the server's count is authoritative. */
export function achievementSummary(catalogue, player) {
  return {
    earned: player?.count ?? 0,
    total: catalogue?.achievements?.length ?? 0,
  };
}
