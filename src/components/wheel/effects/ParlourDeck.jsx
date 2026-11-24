/** Floating card stock and clay chips. Motion is sampled from the server clock,
 * with local-axis tumbling, visible thickness, and offscreen recycling. */
import React, { memo, useEffect, useRef } from 'react';
import { prefersCalm } from '../../../config/power.js';
import { serverNow } from '../../../utils/serverClock.js';
// The shaft's row pitch, so the detent's clearance is one POCKET wide; CanvasRouletteStrip imports it from here.
import { MOBILE_ROW_PITCH } from '../canvas/CanvasSpinningStrip.jsx';
import {
    T_CALL, T_SPIN, T_REVEAL, T_FALL, T_END,
    CARD_IVORY, COLOURS,
} from './rouletteTimeline.js';

const TAU = Math.PI * 2;
const clamp01 = v => Math.max(0, Math.min(1, v));
const frac = v => v - Math.floor(v);
/** A bell of width `w` centred on `c`. The envelope's only shape. */
const bell = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));

/** The two card colours. Table red, and the pocket black that is nearly the page. */
const SUIT_INK = ['#B4111F', '#14171F', '#B4111F', '#14171F'];

/**
* How busy the air is at time `t`, 0 to 1: thrown 0-2s, a bed to 16s, the hush 16-18s,
* the winning-colour shower 21.4-24s, clearing 28.2-29.6s.
*/
function density(t) {
    if (t < -0.4 || t >= T_END) return 0;
    const surge = bell(t, 0.6, 1.5);
    // The envelope is sampled at a piece's BIRTH (top of screen) and a card takes ~10s to fall, so the refill
    // starts with the wheel (T_SPIN), not the pocket lighting, or the reveal comes out thinner than the betting window.
    const refill = bell(t, T_SPIN + 1.0, 3.4);
    // Density is set against what is VISIBLE: the canvas sits under the interface, which hides over half the
    // screen (3 pieces seen at 0.44 on a 1568x733 capture), so the bed is 0.58 to sit just under the reveal shower.
    const bed = 0.58 * (1 - 0.58 * bell(t, T_CALL + 0.4, 1.6));
    const clearing = clamp01((T_END - t) / (T_END - T_FALL));
    return clamp01(Math.max(bed, surge, refill)) * clearing;
}

/**
* Whether the room wears the winning colour at `t`. Asked of the clock, not a piece's birth, so the whole
* field turns at once. Cannot spoil anything: `pocketColour` is null until the server has broadcast the result.
*/
const showering = t => t >= T_REVEAL - 0.15 && t < T_REVEAL + 4.5;

/** Seeded once from the index, so nothing teleports when the room re-renders. */
const rnd = (i, n) => { const s = Math.sin((i + 1) * n) * 43758.5453; return s - Math.floor(s); };

function buildPieces(n) {
    return Array.from({ length: n }, (_, i) => {
        // Three depths, dealt round-robin so the thinnest beats still show one
        // of each rather than three of the far layer.
        const layer = i % 3;
        return {
            chip: rnd(i, 12.9898) < 0.42,
            // The near layer is twice the far one; parallax needs obviously different sizes.
            scale: [1.05, 1.65, 2.35][layer],
            // Most of the deck lives in the room's shadows. Larger foreground
            // pieces catch more light, without becoming bright UI elements.
            alpha: [0.60, 0.80, 0.94][layer],
            x: rnd(i, 78.233),
            // Near pieces fall faster, which is the parallax.
            period: (16 + rnd(i, 39.425) * 9) - layer * 2.2,
            phase: rnd(i, 93.989),
            sway: 0.4 + rnd(i, 27.135) * 0.4,
            swayAmp: 0.008 + rnd(i, 15.117) * 0.016,
            // One full local-axis turn every 18–28 seconds, in either direction.
            tumble: (rnd(i, 51.703) < 0.5 ? -1 : 1) / (18 + rnd(i, 61.319) * 10),
            suit: Math.floor(rnd(i, 22.517) * 4),
            faceUp: rnd(i, 33.311) < 0.82,
            tone: Math.floor(rnd(i, 44.909) * 3),
            threshold: (i + 0.5) / n,
        };
    });
}

/* ── the shapes ─────────────────────────────────────────────────────────── */

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/** The four pips, at radius `r` about the origin. Drawn, not typeset. */
function pip(g, suit, r) {
    g.beginPath();
    if (suit === 0) {                                   // ♥
        g.moveTo(0, r * 0.80);
        g.bezierCurveTo(-r * 1.10, r * 0.02, -r * 0.62, -r * 1.00, 0, -r * 0.32);
        g.bezierCurveTo(r * 0.62, -r * 1.00, r * 1.10, r * 0.02, 0, r * 0.80);
    } else if (suit === 1) {                            // ♠
        g.moveTo(0, -r);
        g.bezierCurveTo(r * 0.98, -r * 0.22, r * 0.60, r * 0.44, r * 0.13, r * 0.20);
        g.lineTo(r * 0.32, r * 0.78);
        g.lineTo(-r * 0.32, r * 0.78);
        g.lineTo(-r * 0.13, r * 0.20);
        g.bezierCurveTo(-r * 0.60, r * 0.44, -r * 0.98, -r * 0.22, 0, -r);
    } else if (suit === 2) {                            // ♦
        g.moveTo(0, -r);
        g.lineTo(r * 0.66, 0);
        g.lineTo(0, r);
        g.lineTo(-r * 0.66, 0);
    } else {                                            // ♣
        g.arc(0, -r * 0.40, r * 0.40, 0, TAU);
        g.closePath();
        g.moveTo(-r * 0.10, r * 0.16);
        g.arc(-r * 0.44, r * 0.16, r * 0.40, 0, TAU);
        g.closePath();
        g.moveTo(r * 0.78, r * 0.16);
        g.arc(r * 0.44, r * 0.16, r * 0.40, 0, TAU);
        g.closePath();
        g.moveTo(-r * 0.16, r * 0.82);
        g.lineTo(-r * 0.05, r * 0.12);
        g.lineTo(r * 0.05, r * 0.12);
        g.lineTo(r * 0.16, r * 0.82);
    }
    g.closePath();
    g.fill();
}

/** Ivory stock with a fine cut edge and correctly opposed corner indices. */
function drawCard(g, p, s, ink, faceUp = p.faceUp) {
    const w = 36 * s, h = 50.4 * s, r = 2.2 * s;
    g.fillStyle = '#09020444';
    roundRect(g, -w / 2 + s, -h / 2 + 2 * s, w, h, r);
    g.fill();
    g.fillStyle = '#32171A';
    roundRect(g, -w / 2 + 0.35 * s, -h / 2 + 0.9 * s, w, h, r);
    g.fill();
    const stock = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    stock.addColorStop(0, '#A47760');
    stock.addColorStop(0.30, '#95674F');
    stock.addColorStop(1, '#694034');
    g.fillStyle = stock;
    roundRect(g, -w / 2, -h / 2, w, h, r);
    g.fill();
    const cut = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    cut.addColorStop(0, '#C69B7988');
    cut.addColorStop(0.4, '#8F604A44');
    cut.addColorStop(1, '#30131BD0');
    g.strokeStyle = cut;
    g.lineWidth = 0.6 * s;
    g.stroke();

    // Sparse, seeded paper fibres stay attached to the stock as it tumbles.
    for (let k = 0; k < 36; k++) {
        g.fillStyle = k % 3 === 0 ? '#D1AD7F16' : '#30121A12';
        g.fillRect((rnd(k, 17.71) - 0.5) * (w - 4 * s),
            (rnd(k, 31.19) - 0.5) * (h - 4 * s), 0.5 * s, 0.22 * s);
    }

    if (faceUp) {
        g.fillStyle = ink;
        pip(g, p.suit, w * 0.23);
        for (const angle of [0, Math.PI]) {
            g.save();
            g.rotate(angle);
            g.translate(-w * 0.34, -h * 0.31);
            g.font = '600 ' + (7.5 * s) + 'px Georgia, serif';
            g.textAlign = 'center';
            g.fillText('A', 0, 0);
            g.translate(0, 5 * s);
            pip(g, p.suit, 2.4 * s);
            g.restore();
        }
    } else {
        g.fillStyle = '#45121E';
        roundRect(g, -w / 2 + 2.4 * s, -h / 2 + 2.4 * s, w - 4.8 * s, h - 4.8 * s, s);
        g.fill();
        g.strokeStyle = '#A67B5C';
        g.lineWidth = 0.35 * s;
        roundRect(g, -w / 2 + 3.7 * s, -h / 2 + 3.7 * s, w - 7.4 * s, h - 7.4 * s, s);
        g.stroke();
        for (const y of [-h * 0.17, h * 0.17]) {
            for (let k = 0; k < 12; k++) {
                g.beginPath();
                g.ellipse(0, y, w * 0.25, w * 0.10, k * Math.PI / 12, 0, TAU);
                g.stroke();
            }
        }
    }
}

const CHIP_TONES = [
    { body: '#701925', edge: '#B99B76', hi: '#A54140' },
    { body: '#261C22', edge: '#AA9177', hi: '#514047' },
    { body: '#83212B', edge: '#C0A180', hi: '#AE5146' },
];

/** A shallow cylinder: the same eight inlays continue over the face and rim. */
function drawChip(g, p, s, angle, tone) {
    const r = 19 * s, halfDepth = 2.25 * s;
    const tilt = Math.cos(angle), sine = Math.sin(angle);
    const offset = p.phase * TAU;
    const point = (a, z) => [Math.cos(a) * r, Math.sin(a) * r * tilt - z * sine];

    // Project the actual cylinder wall around its horizontal diameter. The
    // edge keeps its thickness at every angle, including exactly edge-on.
    const segments = 96;
    for (let k = 0; k < segments; k++) {
        const a = k * TAU / segments, b = (k + 1) * TAU / segments;
        const mid = (a + b) / 2;
        if (Math.sin(mid) * sine <= 0) continue;
        const phase = frac((mid - offset) / (TAU / 8));
        g.fillStyle = phase < 0.36 ? tone.edge : tone.body;
        g.beginPath();
        const corners = [point(a, halfDepth), point(b, halfDepth), point(b, -halfDepth), point(a, -halfDepth)];
        corners.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath();
        g.fill();
        // A rounded clay edge catches light at the upper left and falls into
        // shadow underneath. Keep the inlays visible through that shading.
        const shade = 0.22 + 0.38 * (0.5 + 0.5 * Math.cos(mid - Math.PI / 4));
        g.fillStyle = `rgba(18, 3, 8, ${shade})`;
        g.fill();
        const top = point(a, halfDepth * (tilt >= 0 ? 1 : -1));
        const topEnd = point(b, halfDepth * (tilt >= 0 ? 1 : -1));
        g.beginPath();
        g.moveTo(...top);
        g.lineTo(...topEnd);
        g.strokeStyle = '#F5DCCB66';
        g.lineWidth = 0.55 * s;
        g.stroke();
    }

    // The visible end cap swaps sides only when its projected area is zero.
    // Its texture uses the same angles as the wall's inlays.
    g.save();
    g.translate(0, -(tilt >= 0 ? halfDepth : -halfDepth) * sine);
    g.scale(1, Math.abs(tilt));
    const faceOffset = tilt >= 0 ? offset : -offset - TAU / 8 * 0.36;
    const clay = g.createLinearGradient(-r, -r, r, r);
    clay.addColorStop(0, tone.hi);
    clay.addColorStop(0.5, tone.body);
    clay.addColorStop(1, tone.body);
    g.fillStyle = clay;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.fillStyle = tone.edge;
    for (let k = 0; k < 8; k++) {
        const a = faceOffset + k * TAU / 8;
        const b = a + TAU / 8 * 0.36;
        g.beginPath();
        g.arc(0, 0, r, a, b);
        g.arc(0, 0, r * 0.70, b, a, true);
        g.closePath();
        g.fill();
    }
    // A simple clay centre leaves the broad ivory edge blocks dominant.
    const bevel = g.createLinearGradient(-r, -r, r, r);
    bevel.addColorStop(0, '#D6B18B90');
    bevel.addColorStop(0.45, '#EBC7BD22');
    bevel.addColorStop(1, '#21050BD0');
    g.strokeStyle = bevel;
    g.lineWidth = 0.85 * s;
    for (const radius of [0.975, 0.67]) {
        g.beginPath();
        g.arc(0, 0, r * radius, 0, TAU);
        g.stroke();
    }
    g.fillStyle = '#260B12';
    g.beginPath();
    g.arc(0, 0, r * 0.59, 0, TAU);
    g.fill();
    const label = g.createLinearGradient(-r * 0.55, -r * 0.55, r * 0.55, r * 0.55);
    label.addColorStop(0, tone.body);
    label.addColorStop(1, tone.hi);
    g.fillStyle = label;
    g.beginPath();
    g.arc(0, 0.35 * s, r * 0.555, 0, TAU);
    g.fill();
    g.restore();
}

function ParlourDeck({ openedAt, pocketColour = null, isMobile = false }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const propsRef = useRef({ openedAt, pocketColour });
    useEffect(() => { propsRef.current = { openedAt, pocketColour }; });

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return undefined;

        const calm = prefersCalm();
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        // The phone needs fewer because none of them is hidden — see the
        // portal below. The desktop needs more because most of them are.
        const pieces = buildPieces(isMobile ? 20 : 46).sort((a, b) => a.scale - b.scale);
        let W = 0, H = 0, raf = 0, parked = false;

        // The field is the WRAPPER, not the window: in the shaft's band, measuring the window would put every card off screen.
        const size = () => {
            const r = wrap.getBoundingClientRect();
            W = Math.max(1, r.width);
            H = Math.max(1, r.height);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = `${W}px`;
            canvas.style.height = `${H}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        size();

        const draw = (t) => {
            ctx.clearRect(0, 0, W, H);
            const winner = propsRef.current.pocketColour;
            const winnerStyle = Object.hasOwn(COLOURS, winner) ? COLOURS[winner] : null;
            // Keep falling and tumbling at a steady speed through every event beat.
            const motionT = t;

            for (const p of pieces) {
                const u = frac(motionT / p.period + p.phase);
                // When the piece left the top of the screen. The envelope is
                // sampled THERE, not now — see the header.
                const born = motionT - u * p.period;
                // Pre-deal the room: long-lived props must already be visible
                // when the event opens, rather than taking a full fall to arrive.
                if (density(Math.max(0, born)) < p.threshold) continue;

                const margin = 140;
                const y = -margin + u * (H + margin * 2);
                const x = (p.x + Math.sin(motionT * 0.16 * p.sway + p.phase * TAU) * p.swayAmp) * W;
                const s = p.scale * (isMobile ? 0.52 : 1);

                const showered = Boolean(winnerStyle) && showering(t);

                // Shaft only: the deck paints over the pockets, so from the moment the wheel runs the detent's column stays
                // clear (one pocket wide, from the band's own pitch) so no card lies over the winning pocket. Pieces fade.
                let clearance = 1;
                if (isMobile && t >= T_SPIN) {
                    const half = MOBILE_ROW_PITCH * 0.60;
                    const off = Math.abs(y - H / 2);
                    if (off < half) clearance = clamp01((off / half - 0.35) / 0.65);
                }
                if (clearance <= 0.01) continue;

                ctx.save();
                const edgeFade = Math.min(clamp01(u / 0.08), clamp01((1 - u) / 0.08));
                // The same soft light across the room, sampled continuously as
                // objects drift through it. The margins stay quieter.
                const roomLight = 0.72 + 0.28 * Math.sin(clamp01(x / W) * Math.PI);
                ctx.globalAlpha = p.alpha * clearance * edgeFade * roomLight * (isMobile ? 0.65 : 1);
                ctx.translate(x, y);
                ctx.rotate((p.phase - 0.5) * 1.2 + 0.12 * Math.sin(motionT * 0.22 + p.phase * TAU));
                // Continuous local-axis rotation exposes the face, cut edge,
                // and reverse in turn as each piece falls through the room.
                const angle = (motionT * p.tumble + p.phase) * TAU;

                if (p.chip) {
                    const tone = showered
                        ? { body: winnerStyle.hex, edge: CARD_IVORY, hi: winnerStyle.ink }
                        : CHIP_TONES[p.tone];
                    drawChip(ctx, p, s, angle, tone);
                } else {
                    const tum = Math.cos(angle);
                    const sine = Math.sin(angle);
                    const ink = showered
                        ? (winner === 'black' ? '#14171F' : winnerStyle.hex)
                        : SUIT_INK[p.suit];
                    // A thin card rotating around its long axis. Paint the
                    // cut edge first, then the visible face at its physical offset.
                    const halfThickness = 0.32 * s;
                    const edgeX = -Math.sign(sine) * 18 * s * tum;
                    ctx.fillStyle = '#3D2020';
                    ctx.fillRect(edgeX - Math.abs(sine) * halfThickness, -25.2 * s,
                        Math.abs(sine) * halfThickness * 2, 50.4 * s);
                    ctx.translate((tum >= 0 ? halfThickness : -halfThickness) * sine, 0);
                    ctx.scale(Math.abs(tum), 1);
                    drawCard(ctx, p, s, ink, tum >= 0 ? p.faceUp : !p.faceUp);
                }
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        };

        const clock = () => (propsRef.current.openedAt
            ? (serverNow() - propsRef.current.openedAt) / 1000
            : 0);

        if (calm) {
            // Calm keeps one still frame of the busiest beat (§10); a cleared canvas would delete the idea.
            const paint = () => draw(0.6);
            paint();
            const ro = new ResizeObserver(() => { size(); paint(); });
            ro.observe(wrap);
            return () => ro.disconnect();
        }

        const ro = new ResizeObserver(size);
        ro.observe(wrap);

        const frame = () => {
            const t = clock();
            draw(Math.max(0, t));
            if (t > T_END + 1) { parked = true; return; }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => { if (!parked) cancelAnimationFrame(raf); ro.disconnect(); };
    }, [isMobile]);

    // Mounted in two places: on desktop inside `.fib-parlour-air` under the interface; on a phone inside the reel's
    // band beside `CanvasRouletteStrip`. Do not portal it to `document.body`: the room must never rise above `Z.content`.
    return (
        <div
            ref={wrapRef}
            aria-hidden="true"
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                // Above the pockets inside the band's stacking context; only meaningful in the shaft.
                ...(isMobile ? { zIndex: 7 } : null),
            }}
        >
            <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
        </div>
    );
}

export default memo(ParlourDeck);
