// Synthesised rather than sampled mainly for the parlour tick, which must slow with the wheel; a loop would drift out of phase.
// The context and compressor live in audioBus.js; `master` is this module's input and playSynth sets its gain per call.

import { audioBus } from './audioBus.js';

let master = null;
let noiseBuffer = null;

function audio() {
    const b = audioBus();
    if (!b) return null;
    master = b.master;
    return b.ctx;
}

function noise(c) {
    if (!noiseBuffer) {
        noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    return src;
}

function envelope(c, at, peak, attack, decay) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(master);
    return g;
}

function tone(c, at, freq, peak, attack, decay, type = 'sine') {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    const g = envelope(c, at, peak, attack, decay);
    osc.connect(g);
    osc.start(at);
    osc.stop(at + attack + decay + 0.02);
    return osc;
}

function noiseHit(c, at, { freq, q = 1, peak = 0.4, attack = 0.001, decay = 0.04, type = 'bandpass' }) {
    const src = noise(c);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, at);
    filter.Q.value = q;
    const g = envelope(c, at, peak, attack, decay);
    src.connect(filter);
    filter.connect(g);
    src.start(at);
    src.stop(at + attack + decay + 0.02);
}

// Each voice takes a start time: `ctx.currentTime` read twice is two different numbers.
const VOICES = {
    // Brightness and level ride on `speed` (px/s): the reason this sound is synthesised.
    parlour_tick(c, at, { speed = 0 } = {}) {
        const drive = Math.max(0, Math.min(1, speed / 3000));
        // Level peaks then eases back: at full speed the ticks blur and full level becomes a buzz.
        noiseHit(c, at, {
            freq: 1500 + drive * 2600,
            q: 1.6 + drive * 1.4,
            peak: 0.05 + 0.30 * drive * (1 - 0.55 * drive),
            attack: 0.0008,
            decay: 0.018 + (1 - drive) * 0.02,
        });
    },

    parlour_chip(c, at) {
        noiseHit(c, at, { freq: 1250, q: 1.1, peak: 0.30, attack: 0.001, decay: 0.035 });
        tone(c, at, 190, 0.22, 0.002, 0.075);
        tone(c, at + 0.012, 320, 0.10, 0.002, 0.05, 'triangle');
    },

    parlour_call(c, at) {
        for (const off of [0, 0.11]) {
            noiseHit(c, at + off, { freq: 700, q: 0.9, peak: 0.26, attack: 0.001, decay: 0.05 });
            tone(c, at + off, 132, 0.30, 0.003, 0.10);
        }
    },

    parlour_reveal(c, at) {
        tone(c, at, 784, 0.30, 0.004, 1.30);
        tone(c, at, 1568, 0.16, 0.003, 0.70);
        tone(c, at, 2163, 0.09, 0.003, 0.34);
        noiseHit(c, at, { freq: 5200, q: 0.8, peak: 0.10, attack: 0.001, decay: 0.05 });
    },

    event_start(c, at) {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, at);
        osc.frequency.exponentialRampToValueAtTime(660, at + 0.34);
        const g = envelope(c, at, 0.26, 0.06, 0.34);
        osc.connect(g);
        osc.start(at);
        osc.stop(at + 0.45);

        const src = noise(c);
        const filter = c.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, at);
        filter.frequency.exponentialRampToValueAtTime(4200, at + 0.32);
        filter.Q.value = 1.2;
        const ng = envelope(c, at, 0.13, 0.10, 0.26);
        src.connect(filter);
        filter.connect(ng);
        src.start(at);
        src.stop(at + 0.42);
    },

    hr_card(c, at) {
        noiseHit(c, at, { freq: 5200, q: 0.7, peak: 0.12, attack: 0.012, decay: 0.09, type: 'highpass' });
        noiseHit(c, at + 0.10, { freq: 900, q: 0.8, peak: 0.16, attack: 0.001, decay: 0.03 });
        tone(c, at + 0.10, 150, 0.12, 0.002, 0.05);
    },

    hr_shuffle(c, at) {
        let t = at;
        for (let i = 0; i < 18; i++) {
            noiseHit(c, t, { freq: 2600 + (i % 3) * 500, q: 1.2, peak: 0.06 + 0.05 * Math.sin((i / 17) * Math.PI), attack: 0.0006, decay: 0.012 });
            t += 0.028 - i * 0.0009;
        }
        noiseHit(c, t + 0.05, { freq: 900, q: 0.7, peak: 0.12, attack: 0.004, decay: 0.08 });
    },

    hr_flip(c, at) {
        noiseHit(c, at, { freq: 3200, q: 1.4, peak: 0.24, attack: 0.001, decay: 0.022 });
        noiseHit(c, at + 0.035, { freq: 1800, q: 1.0, peak: 0.12, attack: 0.001, decay: 0.03 });
    },

    hr_bust(c, at) {
        noiseHit(c, at, { freq: 420, q: 0.7, peak: 0.20, attack: 0.002, decay: 0.07, type: 'lowpass' });
        [[262, 0], [220, 0.14]].forEach(([f, off]) => {
            const osc = c.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, at + off);
            osc.frequency.exponentialRampToValueAtTime(f * 0.94, at + off + 0.3);
            const g = envelope(c, at + off, 0.2, 0.01, 0.3);
            osc.connect(g);
            osc.start(at + off);
            osc.stop(at + off + 0.34);
        });
    },

    hr_blackjack(c, at) {
        const notes = [784, 988, 1175, 1568];
        notes.forEach((f, i) => {
            const when = at + i * 0.075;
            tone(c, when, f, 0.24, 0.004, 0.22, 'triangle');
            tone(c, when, f * 2, 0.08, 0.004, 0.14);
        });
        const bell = at + notes.length * 0.075;
        tone(c, bell, 2093, 0.20, 0.004, 1.4);
        tone(c, bell, 4186, 0.07, 0.003, 0.6);
        tone(c, bell, 2637, 0.10, 0.004, 0.9);
    },

    event_win(c, at) {
        const notes = [784, 988, 1319];
        notes.forEach((f, i) => {
            const when = at + i * 0.085;
            tone(c, when, f, 0.26, 0.004, 0.24, 'triangle');
            tone(c, when, f * 2, 0.09, 0.004, 0.16);
        });
        tone(c, at + notes.length * 0.085, 1568, 0.20, 0.005, 0.85);
    },
};

export const SYNTH_SOUNDS = Object.keys(VOICES);

export function playSynth(name, volume = 1, opts) {
    const voice = VOICES[name];
    if (!voice || volume <= 0) return false;

    const c = audio();
    if (!c) return false;

    try {
        master.gain.value = Math.max(0, Math.min(1, volume));
        voice(c, c.currentTime + 0.001, opts);
        return true;
    } catch {
        return false;
    }
}
