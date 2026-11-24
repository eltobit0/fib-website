// For sounds with a deadline: a decoded AudioBuffer started on the audio clock, not <audio> + setTimeout,
// which were late on a session's first arrival. Every failure returns false so the caller falls back to its element.

import { audioBus, busIsRunning } from './audioBus.js';

const buffers = new Map();
const pending = new Map();
// Kept so an unmounted scene can take back impacts already handed to the audio thread.
const scheduled = new Set();
const failed = new Set();

// Idempotent per name, whether the first call finished, is running or failed.
export function primeSample(name, url) {
    if (!name || !url) return Promise.resolve(false);
    if (buffers.has(name)) return Promise.resolve(true);
    if (failed.has(name)) return Promise.resolve(false);
    if (pending.has(name)) return pending.get(name);

    const b = audioBus();
    if (!b) return Promise.resolve(false);

    const work = (async () => {
        try {
            const res = await fetch(url, { credentials: 'omit' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bytes = await res.arrayBuffer();
            // Callback form too: older Safari lacks the promise-returning overload.
            const buffer = await new Promise((resolve, reject) => {
                const out = b.ctx.decodeAudioData(bytes, resolve, reject);
                if (out && typeof out.then === 'function') out.then(resolve, reject);
            });
            buffers.set(name, buffer);
            return true;
        } catch (e) {
            // Marked failed so a missing file costs one request per session.
            failed.add(name);
            console.warn(`[Sound] Could not prepare ${name} for precise playback:`, e?.message || e);
            return false;
        } finally {
            pending.delete(name);
        }
    })();

    pending.set(name, work);
    return work;
}

export function hasSample(name) {
    return buffers.has(name) && busIsRunning();
}

// `delay` is on the audio clock. Returns false when the caller should fall back.
export function playSample(name, { delay = 0, volume = 1 } = {}) {
    const buffer = buffers.get(name);
    if (!buffer || volume <= 0) return false;

    const b = audioBus();
    // A suspended context accepts start() but holds the clock, so the sound would land off its beat.
    if (!b || b.ctx.state !== 'running') return false;

    try {
        const src = b.ctx.createBufferSource();
        src.buffer = buffer;

        // Connected to the bus, not the synth's master; see audioBus.js.
        const gain = b.ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, volume));

        src.connect(gain);
        gain.connect(b.bus);
        src.start(b.ctx.currentTime + Math.max(0, delay));

        scheduled.add(src);
        src.onended = () => scheduled.delete(src);
        return true;
    } catch {
        return false;
    }
}

export function stopScheduledSamples() {
    for (const src of scheduled) {
        try {
            src.stop();
        } catch {
            // Already stopped or already finished. Nothing to do.
        }
    }
    scheduled.clear();
}
