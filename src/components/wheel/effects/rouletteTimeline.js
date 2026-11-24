/*
* THE PARLOUR's timeline, in seconds.
*
*   TURN     0.00-1.20   the reel's slots turn into roulette pockets
*   TABLE    1.20        table live, betting opens
*   BETS    1.20-16.20   fifteen seconds, the only interactive window on the site
*   CALL     16.20       "no more bets"
*   SPIN     16.90       the ring runs, on the reel's own easing
*   LAND     20.90       the winning pocket comes to rest under the detent
*   REVEAL   21.35       it lights, the payout board opens
*   FALL     28.20       the room cools; pockets turn back into items
*   END      29.60       the reel is the reel again
*
* The reel is turned INTO the roulette in place (as CanvasBonusStrip does), not replaced by a second
* wheel. The atmosphere is site-wide (ParlourAtmosphere.jsx).
*
* Every beat is `(serverNow() - openedAt) / 1000`, so a late join renders the table it walked in on,
* a backgrounded tab returns to the right beat, and the countdown cannot disagree with the server.
*
* The backend's ROULETTE_TABLE_OPENS_MS / _BET_WINDOW_MS / _SETTLE_MS restate T_TABLE, the window and
* (T_END - T_CALL). The server owns the deadline; its total need only OUTLAST T_END, never match it.
*/

import { SPIN_DURATION } from '../../../config/constants.js';
import { COLORS } from '../config/constants';

/** The slots have finished turning over. Betting opens here, not at zero. */
export const T_TURN = 1.20;
/** Fifteen seconds, the owner's call. Must equal the server's window. */
export const BET_WINDOW_S = 15;
export const T_CALL = T_TURN + BET_WINDOW_S;

/** A beat of a locked, still table before it runs. The croupier's pause. */
export const T_SPIN = T_CALL + 0.70;
/** The reel's own spin length, imported so the roulette lands as long as a spin and follows SPIN_DURATION tuning. */
export const T_LAND = T_SPIN + SPIN_DURATION / 1000;
export const T_REVEAL = T_LAND + 0.45;
export const T_PAYOUT = T_REVEAL + 0.70;

/** The room cools and the pockets turn back into items. */
export const T_FALL = T_CALL + 12.0;
export const T_END = T_FALL + 1.40;

/** How long one slot takes to turn over, at either end of the event. */
export const TURN_FLIP_S = 0.42;

const smoothBeat = x => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
/** The room holds its breath at the call and releases after the reveal. */
export const roomHush = t => smoothBeat((t - T_CALL + 0.45) / 0.65)
    * (1 - smoothBeat((t - T_REVEAL) / 0.9));

/**
* The identity: one green, the table's own (the green pocket is the house). It is the closest event
* colour to the Community Goal's #2DD4BF; if a surface stacks them without icons, move this one.
*/
export const PARLOUR_GREEN = '#19B36B';
/** Green as TEXT. The baize fails badly as a word. */
export const PARLOUR_GREEN_INK = '#3DDC97';

/**
* The room's materials (DESIGN.md §9b). The room is crimson because it is the one ground the
* Nocturne's blue is opposite to, so the city stays visible; green stays the house pocket and the
* selection wheel cell. FELT / FELT_LIGHT keep their names because they are still the cloth under the carpet.
*/
export const FELT = '#0B3D2E';
export const FELT_LIGHT = '#12563F';
export const BRASS = '#C9A227';
/**
* Brass as a WORD (§8 ink rule): `BRASS` (#C9A227) is for fills, frets, rails and glows; this lifted
* step is for any numeral or label, since BRASS is 3.4:1 on the crimson floor.
*/
export const BRASS_INK = '#E0C766';

/** The carpet under the lamp, where the light actually falls. */
export const CRIMSON_LIT = '#8E1622';
/** The room's ground, between the lamp and the walls. */
export const CRIMSON = '#5A0C15';
/** The walls. Almost the page, and the reason the room has corners. */
export const CRIMSON_DEEP = '#1C0407';
/** Card stock. The only warm light-value in the room, so it carries the deck. */
export const CARD_IVORY = '#EFE2C6';

/** The spin, 0 -> 1, shared by the corner wheel and the reel's ring. Pure in `t`: a tab can receive no frames for thirty seconds. */
export function spinPhase(t) {
    if (t <= T_SPIN) return 0;
    if (t >= T_LAND) return 1;
    const p = (t - T_SPIN) / (T_LAND - T_SPIN);
    return 1 - Math.pow(1 - p, 4);
}

/**
* The three pocket colours. §8's ink rule: fills, wedges, chips and glows take `hex`; anything that
* is a WORD takes `ink`. Two inks are the rarity ladder's own steps so "lost" and "rare" red cannot
* drift; black borrows the body text step; only green is new.
*/
export const COLOURS = {
    red:   { hex: '#B01B28', ink: COLORS.redInk,     label: 'RED'   },
    black: { hex: '#14171F', ink: COLORS.text,       label: 'BLACK' },
    green: { hex: '#12855A', ink: PARLOUR_GREEN_INK, label: 'GREEN' },
};

/**
* A pocket colour lifted toward white (`amount > 0`) or dropped toward black. One ramp for all three
* colours so the plaques read as one material. Lives here, not as CSS `color-mix()`, so the palette owns it.
*/
export function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const target = amount > 0 ? 255 : 0;
    const k = Math.min(1, Math.abs(amount));
    const ch = (shift) => Math.round(((n >> shift) & 255) * (1 - k) + target * k);
    return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** The same colour as a cast light. For shadows a plaque throws, never for text. */
export function glow(hex, alpha) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
* When seat `i` of `n` resolves on the payout board: shortest odds first so the board climbs to the
* biggest number. Capped so a full room still finishes before T_FALL; beyond the cap rows resolve faster.
*/
export function seatResolvesAt(i, n) {
    const span = Math.min(3.4, Math.max(1.0, n * 0.26));
    return T_PAYOUT + (n <= 1 ? 0 : (i / (n - 1)) * span);
}

/** The total, a beat after the last seat — it is the sum, so it lands last. */
export function totalResolvesAt(n) {
    return seatResolvesAt(Math.max(0, n - 1), n) + 0.40;
}
