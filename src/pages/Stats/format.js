/* `winRate` and `skipRate` are 0-100 percentages, not fractions. */

export {
  formatNumber as num,
  formatTime as duration,
  formatDistance as distance,
  formatDate as date,
  formatClock as timeOfDay,
  formatByKind as byKind,
  mmss as clock,
  totalRarities,
  timeAgo,
  calendarDaysAgo,
  winRate,
  itemsPerGame,
  secondsPerItem,
  itemLabel,
  itemSearchText,
} from './data.js';

/* Grouped, never abbreviated: `num` shortens past ten thousand, which is wrong where the number is the statement. */
export const full = (n) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—';

/* Absolute: `date` is relative inside a week, so pairing it with `timeAgo` would repeat the phrase. */
export function stamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  return `${day}, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/** 0–100 in, "38%" out. */
export const pct = (n, places = 0) =>
  Number.isFinite(n) ? `${n.toFixed(places)}%` : '—';

export const dec = (n, places = 1) =>
  Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places }) : '—';

export function hours(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/* Spelled out for accessible names: a screen reader reads "15m 17s" as "fifteen m seventeen s". */
export function durationWords(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s > 0 || m === 0) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export const signed = (n) =>
  !Number.isFinite(n) || n === 0
    ? '±0'
    : n > 0
      ? `+${n.toLocaleString('en-US')}`
      : `−${Math.abs(n).toLocaleString('en-US')}`;

export const deltaDir = (n) => (!Number.isFinite(n) || n === 0 ? 'flat' : n > 0 ? 'up' : 'down');

export function movement(n) {
  if (!Number.isFinite(n) || n === 0) return { dir: 'flat', label: 'no change', text: '—' };
  return n > 0
    ? { dir: 'up', label: `up ${n} place${n === 1 ? '' : 's'}`, text: `▲ ${n}` }
    : { dir: 'down', label: `down ${-n} place${n === -1 ? '' : 's'}`, text: `▼ ${-n}` };
}

/** Player names are 3–16 user-generated characters; duo labels join two. */
export const truncate = (s, max = 16) =>
  String(s ?? '').length > max ? `${String(s).slice(0, max - 1)}…` : String(s ?? '');

export const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
