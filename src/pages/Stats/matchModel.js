import { idLabel, itemSegments, itemPhase } from './adapter.js';
import { RARITY_KEYS } from './tokens.js';

export const labelFor = (row) => row.members.map(idLabel).join(' & ');

/* Mirrors the plugin's UnlockSchedule.java: rounds of 50+ minutes open MID at minute 5 and LATE at 15,
   shorter ones at 11.11% / 28.88%. The configured length is not recorded, so the recorded duration stands in. */
const FIXED_MIN_MINUTES = 50;

export function phaseSchedule(duration, settings = {}) {
  const minutes = Math.round(duration / 60);
  const minuteOf = (pct) => Math.round((duration * pct) / 60) * 60;
  const fixed = minutes >= FIXED_MIN_MINUTES;
  const midAt = fixed ? 5 * 60 : minuteOf(0.1111);
  const lateAt = fixed ? 15 * 60 : minuteOf(0.2888);

  const quickie = Number(settings.QUICKIE ?? 0);
  const midOpen = quickie !== 1;
  const lateOpen = quickie === 0 && String(settings.HARD ?? 'true') !== 'false';

  const phases = [{ id: 'EARLY', label: 'Early pool', from: 0, to: midOpen ? midAt : duration }];
  if (midOpen) phases.push({ id: 'MID', label: 'Mid pool opens', from: midAt, to: lateOpen ? lateAt : duration });
  if (lateOpen) phases.push({ id: 'LATE', label: 'Late pool opens', from: lateAt, to: duration });
  return phases.filter((p) => p.from < duration);
}

export const TIER_RANK = Object.fromEntries(RARITY_KEYS.map((k, i) => [k, i]));

/* Back-to-backs land in 0s, so they are skipped: the fastest find should be an item someone went and got. */
export const huntedFind = (s) => !s.skipped && !s.b2b && s.took > 0;

export function runOf(entry) {
  const segments = itemSegments(entry);
  const finds = segments.filter((s) => !s.skipped);
  const pulls = segments.filter((s) => s.b2b);
  const tiers = Object.fromEntries(RARITY_KEYS.map((k) => [k, pulls.filter((s) => s.b2b === k).length]));
  const phases = { EARLY: 0, MID: 0, LATE: 0, NONE: 0 };
  for (const s of segments) phases[itemPhase(s.itemName) ?? 'NONE'] += 1;
  const fastest = finds.filter(huntedFind).reduce((a, b) => (a == null || b.took < a.took ? b : a), null);
  const longest = segments.reduce((a, b) => (a == null || b.took > a.took ? b : a), null);
  const last = segments[segments.length - 1];
  return {
    segments,
    found: finds.length,
    skipped: segments.length - finds.length,
    pulls,
    tiers,
    phases,
    fastest,
    longest,
    /* Average over everything the run moved through, skips included: a skip
       still spent the time before it. */
    perItem: segments.length && last ? last.t / segments.length : null,
  };
}

