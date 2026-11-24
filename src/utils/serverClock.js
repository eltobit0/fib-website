// The server's clock, so reveal delays don't depend on the visitor's clock being right.
// Module state, not context: a re-render per SSE frame would be worse. Timed samples remove half the RTT; SSE frames can't.

// serverNow() - Date.now(); zero until the first sample.
let offsetMs = 0;
let synced = false;
let quality = null;
// Keep one unlucky request from owning the session; see MAX_CREDIBLE_RTT_MS and SAMPLE_TTL_MS.
let bestRttMs = Infinity;
let measuredAt = 0;

// An unmeasured sample replaces a measured one only past this (clock steps: NTP, DST, wake from sleep).
const RESYNC_THRESHOLD_MS = 5000;

// Longer trips are stalls, not symmetric, so half-RTT would be a bogus forward correction that 'measured' then locks in.
// Such samples are demoted to 'seeded', which errs late (the safe direction).
const MAX_CREDIBLE_RTT_MS = 1000;

// Without a TTL the first good sample would lock out every later measurement.
const SAMPLE_TTL_MS = 5 * 60 * 1000;

// Unparseable values are ignored rather than defaulted. Omit roundTripMs for anything the server sent unprompted.
export function noteServerTime(serverTime, roundTripMs) {
    if (serverTime == null) return;

    const ms = typeof serverTime === 'number'
        ? serverTime
        : new Date(serverTime).getTime();

    if (!Number.isFinite(ms)) return;

    const timed = Number.isFinite(roundTripMs)
        && roundTripMs >= 0
        && roundTripMs <= MAX_CREDIBLE_RTT_MS;

    // The body was stamped roughly halfway through the trip.
    const candidate = ms + (timed ? roundTripMs / 2 : 0) - Date.now();

    if (timed) {
        // Keep the QUICKEST sample (as NTP does), unless none yet, it has aged out, or the clock has plainly stepped.
        const stale = Date.now() - measuredAt > SAMPLE_TTL_MS;
        const stepped = Math.abs(candidate - offsetMs) > RESYNC_THRESHOLD_MS;

        if (quality !== 'measured' || roundTripMs <= bestRttMs || stale || stepped) {
            offsetMs = candidate;
            quality = 'measured';
            synced = true;
            bestRttMs = roundTripMs;
            measuredAt = Date.now();
        }
        return;
    }

    // Otherwise every SSE frame would drag a measured sample back by one one-way latency.
    if (quality !== 'measured' || Math.abs(candidate - offsetMs) > RESYNC_THRESHOLD_MS) {
        offsetMs = candidate;
        quality = 'seeded';
        synced = true;
    }
}

export function serverNow() {
    return Date.now() + offsetMs;
}

// Positive means the browser is slow. For diagnostics from the console.
export function clockOffset() {
    return offsetMs;
}

export function isClockSynced() {
    return synced;
}

export function clockQuality() {
    return quality;
}
