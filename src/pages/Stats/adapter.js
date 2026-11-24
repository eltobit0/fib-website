import {
  playerName, playerAvatar, idUuid, idName, idLabel,
  itemKey, itemLabel, itemSearchText, itemTexture, ITEM_POOL, ITEM_STATE,
  LEADERBOARD_SCOPES, LEADERBOARD_CATEGORIES,
  matchStandings, matchDuration, raceEntries, standingsAt, leadChanges, leadChangeTimes, itemSegments,
  winRate, itemsPerGame, secondsPerItem, timeAgo,
} from './data.js';
import { RARITY_KEYS, RARITY_FIELDS } from './tokens.js';

export {
  playerName, playerAvatar, idUuid, idName, idLabel,
  itemKey, itemLabel, itemSearchText, itemTexture, ITEM_POOL, ITEM_STATE,
  LEADERBOARD_SCOPES, LEADERBOARD_CATEGORIES,
  matchStandings, matchDuration, raceEntries, standingsAt, leadChanges, leadChangeTimes, itemSegments,
  winRate, itemsPerGame, secondsPerItem, timeAgo,
};

/* Shared by the item index and the collection so a sprite reads the same phase colour in both. */
export const itemPhase = (itemName) => ITEM_STATE[itemKey(itemName).toUpperCase()] || null;

/** Order-independent pair key, matching FibTeamKey. */
export const teamKey = (a, b) => [a, b].slice().sort().join('~');

export const rarityCounts = (rarities) =>
    Object.fromEntries(RARITY_KEYS.map((k) => [k, rarities?.[RARITY_FIELDS[k]] ?? 0]));

/* Snapped to three steps: every distinct size is a separate third-party request and cache entry. */
const AVATAR_STEPS = [32, 64, 128];

export const avatarAt = (uuid, size = 32) => {
  const step = AVATAR_STEPS.find((s) => s >= size) ?? 128;
  return playerAvatar(uuid, step);
};

/* Isometric so it stands on the podium's block sprites. mineatar's head is 16 px per unit of scale, so 128 is scale 8. */
export const headAt = (uuid, size = 128) => {
  if (!uuid) return HEAD_FALLBACK;
  const step = AVATAR_STEPS.find((s) => s >= size) ?? 128;
  return `https://api.mineatar.io/head/${uuid}?scale=${step / 16}`;
};

/* Each branch states only what the match record can prove; the overview and the match page share it so their headlines agree. */
export const matchHeadline = (match, lastChange = null) => {
  const standings = matchStandings(match);
  const [first, second] = standings;
  if (!first) return { winner: null, text: 'Match result' };
  const winner = first.members.map(idLabel).join(' & ');
  if (!second) return { winner, text: `${winner} won uncontested` };

  const loser = second.members.map(idLabel).join(' & ');
  const margin = (first.score ?? 0) - (second.score ?? 0);
  const duration = matchDuration(match);
  const lateTurn = lastChange != null && duration > 0 && lastChange >= duration * 0.8;

  let text;
  if (margin === 0) text = `${winner} edged ${loser} level on score`;
  else if (lateTurn) text = `${winner} came through late against ${loser}`;
  else if ((match.leadChanges ?? 0) === 0 && lastChange == null) text = `${winner} led ${loser} from start to finish`;
  else if (margin <= 3) text = `${winner} held off ${loser} by ${margin}`;
  else text = `${winner} beat ${loser} by ${margin}`;
  return { winner, text };
};

/* Fallbacks stay on mc-heads while heads come from mineatar: a fallback on the failing host would fail with it. */
export const AVATAR_FALLBACK = 'https://mc-heads.net/avatar/MHF_Steve/64';
export const HEAD_FALLBACK = 'https://mc-heads.net/head/MHF_Steve/128';
