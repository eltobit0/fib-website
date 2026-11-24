// One AudioContext and one compressor for the site (sixteen overlapping ticks clip without it).
// `master` is the synth's input with a per-call gain; samples connect to `bus` with their own gain. Lazy: may never open.

let ctx = null;
let master = null;
let bus = null;

export function audioBus() {
    if (typeof window === 'undefined') return null;

    if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
            ctx = new AC();
        } catch {
            return null;
        }

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.12;
        comp.connect(ctx.destination);
        bus = comp;

        master = ctx.createGain();
        master.gain.value = 1;
        master.connect(bus);
    }

    if (ctx.state === 'suspended') {
        // Fire and forget: without a gesture this rejects and the sound is lost, which is correct.
        ctx.resume().catch(() => {});
    }

    return { ctx, master, bus };
}

export function busIsRunning() {
    return !!ctx && ctx.state === 'running';
}

// Called from a real user gesture, so the first sound of a session isn't lost to a suspended context.
export function unlockAudioBus() {
    audioBus();
}
