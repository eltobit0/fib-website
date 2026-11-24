/*
* HIGH ROLLER's pacing; all milliseconds. Deal times run from `dealAt`, reveal times from the
* result's arrival. WheelPage holds the lucky-spin balance until the reveal is over, because
* the balance IS the result.
*
* Limits:
* - The deal must land inside the server's HIGH_ROLLER_DEAL_MS (3s): last card lands at 2.8s.
* - The reveal must end inside ActivityContext's HIGH_ROLLER_TEARDOWN_MS (13s); seven house
*   draws end at 9.9s.
* - CARD_TRAVEL_MS (1.3s) must stay well under the server's HIGH_ROLLER_ALL_DONE_GRACE_MS (2.5s,
*   wheel-backend highRollerTuning.js), the wait before the result that lets a player's last
*   card land and be read. Nothing enforces this across repos; retime them together.
*/

/** The deal alternates player, house, player, house, one card this far apart. */
export const DEAL_STEP_MS = 500;

/** A card's flight from the deck to the felt. */
export const CARD_TRAVEL_MS = 1300;

/** Jimbo says it is his turn, then the hole card turns. */
export const HOLE_FLIP_DELAY_MS = 600;
export const HOLE_FLIP_MS = 1100;

/** The first card the house draws leaves the deck after the flip has settled. */
export const DRAW_START_MS = HOLE_FLIP_DELAY_MS + HOLE_FLIP_MS + 300;

/** Between one drawn card and the next: long enough to read the new total. */
export const DRAW_GAP_MS = 1100;

/** The intro's shuffle: three riffles, then the deck slides to its deal position. Measured back from `dealAt`. */
export const SHUFFLE_RIFFLES = 3;
export const SHUFFLE_RIFFLE_MS = 1000;
export const SHUFFLE_TO_DECK_MS = 650;
/** Room after the last riffle for the slide to the deck, and a breath before the first card. */
export const SHUFFLE_ENDS_BEFORE_DEAL_MS = SHUFFLE_TO_DECK_MS + 200;

/** When the n-th card the house DRAWS (0-based, after the dealt two) leaves the deck. */
export function drawDelay(n) {
    return DRAW_START_MS + n * DRAW_GAP_MS;
}

/** Dealer's turn duration for the final hand; two cards means the flip is the whole reveal. */
export function revealDuration(dealerCardCount) {
    const drawn = Math.max(0, (dealerCardCount ?? 2) - 2);
    if (drawn === 0) return HOLE_FLIP_DELAY_MS + HOLE_FLIP_MS;
    return drawDelay(drawn - 1) + CARD_TRAVEL_MS;
}
