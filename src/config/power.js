import { useEffect, useState } from 'react';

// Saver mode: one per-device flag that removes ambient cost and nothing else; not a separate "lite site".
// prefersCalm() = saver OR reduced motion ("should this move?"); isSaverOn() = saver only ("may this cost?").
// Never merge the two: reduced motion keeps the reel loop warm, saver parks it dead.

const STORAGE_KEY = 'fib:saver';

const OFFER_KEY = 'fib:saver-offered';

// Only for callers passing `stretch: true`; the hidden-tab gate in visibleInterval is the bigger saving.
const SAVER_POLL_FACTOR = 4;

// Module state read through functions, not context: the canvas loop reads it per frame from an effect that never re-subscribes.

const listeners = new Set();

function readStored() {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
        // Private mode or storage disabled: losing the preference is fine, throwing is not.
        return false;
    }
}

let saverOn = readStored();

// Runs at import time, before React mounts: setting it in an effect paints one full animated frame first.
function applyAttribute() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (saverOn) root.setAttribute('data-saver', 'on');
    else root.removeAttribute('data-saver');
}

applyAttribute();

export function isSaverOn() {
    return saverOn;
}

// Read live, not cached: both inputs can change while the page is open.
export function prefersCalm() {
    if (saverOn) return true;
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function setSaverMode(on) {
    const next = Boolean(on);
    if (next === saverOn) return;
    saverOn = next;
    try {
        window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch { /* see readStored */ }
    applyAttribute();
    for (const fn of listeners) fn(next);
}

export function toggleSaverMode() {
    setSaverMode(!saverOn);
    return saverOn;
}

function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function useSaverMode() {
    const [on, setOn] = useState(saverOn);
    useEffect(() => subscribe(setOn), []);
    return on;
}

export function useCalm() {
    const read = () => prefersCalm();
    const [calm, setCalm] = useState(read);

    useEffect(() => {
        const update = () => setCalm(read());
        const unsubscribe = subscribe(update);
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        mq?.addEventListener('change', update);
        update();
        return () => {
            unsubscribe();
            mq?.removeEventListener('change', update);
        };
    }, []);

    return calm;
}

// Every recurring fetch should use this: nothing fires while hidden (one catch-up on show), and `stretch: true`
// opts into SAVER_POLL_FACTOR, re-read live. Returns a stop function so the visibility listener can't leak.
export function visibleInterval(fn, baseMs, { stretch = false } = {}) {
    let id = null;
    let period = stretch && saverOn ? baseMs * SAVER_POLL_FACTOR : baseMs;

    const stop = () => { if (id !== null) { clearInterval(id); id = null; } };
    const start = () => { stop(); id = setInterval(fn, period); };

    const onVisibility = () => {
        if (document.hidden) {
            stop();
        } else {
            fn();
            start();
        }
    };

    // Restart rather than waiting for the next tick, which at a long poll looks like the setting did nothing.
    const onSaverChange = (on) => {
        if (!stretch) return;
        const next = on ? baseMs * SAVER_POLL_FACTOR : baseMs;
        if (next === period) return;
        period = next;
        if (!document.hidden) start();
    };

    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    const unsubscribe = subscribe(onSaverChange);

    return () => {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
        unsubscribe();
    };
}

export function countdownTick(fine = 100) {
    return saverOn ? 1000 : fine;
}

// Reschedules a setTimeout each tick so the cadence is re-read live; visibility-gated. Returns its stop function.
export function countdownInterval(fn) {
    let timer = null;
    let stopped = false;

    const tick = () => {
        fn();
        if (!stopped && !document.hidden) timer = setTimeout(tick, countdownTick());
    };

    const onVisibility = () => {
        clearTimeout(timer);
        timer = null;
        if (!stopped && !document.hidden) tick();
    };

    if (!document.hidden) timer = setTimeout(tick, countdownTick());
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
        stopped = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibility);
    };
}

// Offered once, never imposed; the signals are weak, so they only decide whether to ask.
export async function shouldOfferSaver() {
    if (typeof window === 'undefined') return false;
    if (saverOn) return false;

    try {
        if (window.localStorage.getItem(OFFER_KEY)) return false;
    } catch {
        // No storage means no memory of having asked; a prompt every session is worse than none.
        return false;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;

    const lowEnd = (navigator.deviceMemory !== undefined && navigator.deviceMemory <= 4)
        || (navigator.hardwareConcurrency !== undefined && navigator.hardwareConcurrency <= 4);

    if (lowEnd) return true;

    if (typeof navigator.getBattery === 'function') {
        try {
            const battery = await navigator.getBattery();
            if (!battery.charging && battery.level <= 0.2) return true;
        } catch { /* Permissions-Policy may block it; not worth reporting */ }
    }

    return false;
}

/** Record that the offer was answered, whichever way it went. */
export function markSaverOffered() {
    try {
        window.localStorage.setItem(OFFER_KEY, '1');
    } catch { /* see readStored */ }
}
