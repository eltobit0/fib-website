/*
* THE ARRIVAL's timeline, in seconds. The shutter, theatre frame, WebGL station and manifest board all read
* this one table, so their clocks cannot drift.
*
*   SHUTTER   0.00-1.30   the reel's slots close, the band goes dark
*   SCRIM     0.55-1.45   the page dims behind the band
*   IRIS      1.15-2.35   the band GROWS out of the reel into the cinema frame, letterbox bars sliding in
*   APPROACH  1.30-3.60   platform lamps up, a headlight grows, the train slides in   - SHOT ONE
*   SETTLE    3.60-4.20   it stops; the brakes let go a breath of steam
*   CUT       5.05        - SHOT TWO: down on the platform, level with the crates
*   UNLOAD    4.20-6.40   one crate per player arcs down onto the platform
*   LIDS      +0.30 each  the lid throws back and the crate's light gets out
*   STREAM    +0.55 each  lucky spins fountain out and fly to the board
*   MANIFEST  6.50-~8.9   each row's drums resolve as its own spins land, the head's total after the last
*   CUT       11.60       - SHOT THREE: wide, low, the whole platform
*   HOLD      ~9.9-12.5   the train waits with its lamps lit
*   DEPART    12.5-16.5   it pulls out and clears the frame completely
*   EMPTY     16.5-16.9   a beat of platform with nobody on it
*   FADE      16.9-17.5   the station goes dark and the frame collapses back onto the reel band
*   LIFT      17.5-18.6   the shutters roll up tile by tile, reel comes back
*
* Nothing fades until the train is off the end of the track, so the departure actually happens. The station
* must be gone and the frame back on the band before a blade lifts, or the gap shows the platform.
*
* Anything that changes here changes ARRIVAL_DURATION_MS in the wheel backend's globalEvents.js, which only
* has to outlast T_GONE. ActivityContext imports T_LIFT_END rather than carrying a copy.
*/

export const T_SHUTTER  = 1.30;
export const T_APPROACH = 3.60;
export const T_SETTLE   = 4.20;
export const T_UNLOAD   = 6.40;
export const T_DEPART   = 12.5;
/** The train is off the end of the track. Nothing has faded yet. */
export const T_GONE     = 16.5;
/** The station fades, the frame collapses home, the scrim goes. */
export const T_LIFT     = 16.9;
/** The blades start rolling up. Nothing may be painted over them by now. */
export const T_SHUTTER_LIFT = 17.5;
/** The reel is fully back and the event is over. */
export const T_LIFT_END = 18.6;

/** How long the exit takes: station fade, frame collapse and scrim lift run together and must finish before a blade moves. */
export const SCENE_FADE_S = 0.6;

// The frame grows out of the reel mount's own rectangle, so the shutter closing reads as continuous with it.
// The scrim leads by half a second: dimming first reads as lights down before the curtain; both at once reads as a modal.
export const T_SCRIM      = 0.55;
export const T_SCRIM_END  = 1.45;
export const T_IRIS       = 1.15;
export const T_IRIS_END   = 2.35;

// Three shots joined by CUTS, not camera moves (a fly-through spends seconds in framings that are not the shot);
// each carries its own slow push. SHOT_TWO lands 0.85s into the unload so the first crate falls in the wide;
// SHOT_THREE lands before the train moves so the departure is seen whole.
export const SHOT_TWO   = 5.05;
export const SHOT_THREE = 11.60;

/**
* The order everything reads the manifest in: smallest crate first, ties by name so it is stable against
* server enumeration. It lives here because it is a timing decision: wagon `i` carries row `i`'s crate and the
* biggest payout is last unloaded and last resolved. A second sort anywhere would pair a row with somebody
* else's crate. ArrivalBoard PRINTS in server order but keeps each row's index in this array (see its header).
*/
export function sortManifest(manifest) {
    return [...manifest].sort(
        (a, b) => a.crate - b.crate || String(a.username).localeCompare(String(b.username))
    );
}

// A crate's lid throws back 0.30s after landing (otherwise it reads as a crate that was never shut); the spins leave 0.25s after that.
export const LID_DELAY_S    = 0.30;
export const LID_OPEN_S     = 0.45;
export const STREAM_DELAY_S = 0.55;
/** How long one spin takes to fly from its crate to its row on the board. */
export const STREAM_FLIGHT_S = 1.15;
/** Spread of one crate's stream, so a 15 does not arrive as a single clump. */
export const STREAM_SPREAD_S = 0.70;
/** How long a crate takes to arc down onto the paving once its beat comes. */
export const CRATE_FALL_S = 0.60;

/**
* Where the impact is INSIDE `trainsfx_crate1..4`, in seconds from each take's start (measured 0.576, 0.581,
* 0.601, 0.601). The takes are the whole gesture (release, air, landing), cut to start when the crate STARTS
* falling, so they are cued at release, not at the landing. A separate number from `CRATE_FALL_S` because one is
* the animation length and the other a property of four audio files; retiming either must not move the other.
*/
export const CRATE_IMPACT_OFFSET_S = 0.59;

/**
* How many crates the train can carry: a cap on the consist, four, not a count. The close shot cannot hold more,
* and there are exactly four crate takes, so a fifth would reuse one and echo. The PAYOUT is untouched: every row
* is paid and appears on the board whether or not a wagon carried it, and the board needs this cap to know a row has no stream.
*/
export const MAX_CRATES = 4;

/** When crate `i` of `n` starts falling. One function: the scene's arc, the overlay's stream, the board's row and the reduced-motion path all read it. */
export function crateFallsAt(i, n) {
    return T_SETTLE + i * ((T_UNLOAD - T_SETTLE) / Math.max(1, n));
}

/** When crate `i` of `n`'s TAKE must start so its impact lands with the crate; see `CRATE_IMPACT_OFFSET_S`. */
export function crateCueAt(i, n) {
    return Math.max(0, crateFallsAt(i, n) + CRATE_FALL_S - CRATE_IMPACT_OFFSET_S);
}

/**
* When row `i` of `n` may resolve its number: once its spins have arrived (0.75 of the flight, so the drums
* settle as the light comes in). Derived from the crate and its flight, not a cascade, so a row never resolves
* before the spins that pay for it.
*/
export function rowLandsAt(i, n) {
    return crateFallsAt(i, n) + CRATE_FALL_S + LID_DELAY_S + STREAM_DELAY_S + STREAM_FLIGHT_S * 0.75;
}

/** The total resolves last, a beat after the final row: it is the sum, so it lands when it has something to sum. */
export function totalLandsAt(n) {
    return rowLandsAt(Math.max(0, n - 1), n) + 0.45;
}
