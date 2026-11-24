import { itemLabel, matchDuration } from './adapter.js';
import * as f from './format.js';

export const RARITY = {
  RARE: { label: 'Rare', color: 'var(--r-rare)', field: 'rare' },
  EPIC: { label: 'Epic', color: 'var(--r-epic)', field: 'epic' },
  LEGENDARY: { label: 'Legendary', color: 'var(--r-legendary)', field: 'legendary' },
  RNGESUS: { label: 'RNGesus', color: 'var(--r-rngesus)', field: 'rngesus' },
  EXTRAORDINARY: { label: 'Extraordinary', color: 'var(--r-extraordinary)', field: 'extraordinary' },
};

/* A round on its own clock. The record starts before the timer does, so the lead-in is taken off. */
export const roundClock = (match) => {
  const lead = Math.max(0, matchDuration(match) - (match.durationSeconds ?? 0));
  return (t) => f.clock(Math.max(0, t - lead));
};

export const itemTip = (event, clock) => {
  const r = event.b2b ? RARITY[event.b2b] : null;
  return `${clock(event.t)} ${itemLabel(event.itemName)}${event.skipped ? ', joker' : r ? `, ${r.label} back to back` : ''}`;
};

/* A newest-first feed of `total` rounds: the first row is round number `total`. */
export const numbered = (matches, total) => matches.map((match, i) => ({ match, no: total - i }));
