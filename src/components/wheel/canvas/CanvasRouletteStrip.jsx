/*
 * THE PARLOUR's reel as a ring: the pocket under any slot is POCKETS[index mod 12], so there is no strip to keep in step.
 * The offset is a function of the clock, not integrated per frame, so a backgrounded tab resumes on the right pocket.
 */

import React, { useEffect, useRef } from 'react';
import { ITEM_WIDTH, STRIP_HEIGHT } from '../../../config/constants.js';
import { MOBILE_ROW_PITCH } from './CanvasSpinningStrip.jsx';
import { prefersReducedMotion } from '../../../utils/motion.js';
import {
    T_TURN, T_SPIN, T_LAND, T_REVEAL, T_FALL, T_END, TURN_FLIP_S,
    CRIMSON_DEEP, spinPhase,
} from '../effects/rouletteTimeline.js';

const IDLE_SPEED = 26;
const MIN_REVS = 5;

/** Half the visible arc, in radians (~64°): larger reads as a fish-eye, smaller as a flat list. */
const ARC = 1.12;
const SIN_ARC = Math.sin(ARC);

const clamp01 = t => Math.max(0, Math.min(1, t));
const easeInQuad = t => t * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

/** Linear band position (-1..1) to rim position. Fixes 0 and ±1, so it is safe to apply after the landing is solved. */
const project = u => Math.sin(u * ARC) / SIN_ARC;

/** Keeps `u * ARC` inside a quarter turn, where `project` stays monotonic and slots cannot fold back. */
const U_MAX = Math.PI / 2 / ARC;
const clampU = u => Math.max(-U_MAX, Math.min(U_MAX, u));

/*
 * These two must stay exact inverses: the landing is solved with one and the indicator drawn with the other.
 * The `+ 0.5` is because a slot is drawn from its left edge; without it half the results point at a neighbour.
 */

/** The slot whose centre is under the detent at this offset. */
const slotUnderDetent = (offset, pitch) => Math.round(offset / pitch - 0.5);

/** The offset that puts `slot` under the detent, resting `rest` pitches off centre. */
const offsetForSlot = (slot, pitch, rest = 0) => (slot + 0.5 + rest) * pitch;

/** Max rest off dead centre, in pitches. Well inside half a pitch so slotUnderDetent still rounds to the winner. */
const REST_SPREAD = 0.16;

/** Where the ring must rest for `winner` to sit under the detent, at least MIN_REVS past the idle drift. Solved, never simulated. */
function landingOffset(idleAt, winner, ringLength, pitch) {
    const minimum = idleAt + MIN_REVS * ringLength * pitch;
    const slot = Math.ceil(minimum / pitch);
    const ahead = ((winner - slot) % ringLength + ringLength) % ringLength;
    const landingSlot = slot + ahead;
    // Deterministic per pocket, so one result never jitters between renders.
    const rest = (((winner * 2654435761) % 1000) / 1000 - 0.5) * 2 * REST_SPREAD;
    return offsetForSlot(landingSlot, pitch, rest);
}

function ringOffset(t, winner, ringLength, pitch) {
    const idle = t * IDLE_SPEED;
    if (winner === null || winner === undefined || t < T_SPIN) return idle;

    const from = T_SPIN * IDLE_SPEED;
    const to = landingOffset(from, winner, ringLength, pitch);
    if (t >= T_LAND) return to;

    // Shared with the corner wheel via the timeline's `spinPhase` so the room and the reel land as one; do not fork the curve.
    return from + (to - from) * spinPhase(t);
}

/** How far slot `i` has turned over, 0 (an item) to 1 (a pocket), staggered across the band. */
function turnAmount(t, i, slots) {
    if (t >= T_FALL) {
        const lead = ((slots - 1 - i) / Math.max(1, slots)) * (T_END - T_FALL - TURN_FLIP_S);
        return 1 - easeOutCubic(clamp01((t - T_FALL - lead) / TURN_FLIP_S));
    }
    const lead = (i / Math.max(1, slots)) * (T_TURN - TURN_FLIP_S);
    return easeInQuad(clamp01((t - lead) / TURN_FLIP_S));
}

export function CanvasRouletteStrip({ pockets, pocketIndex, clock, isMobile = false, onTick }) {
    const wrapRef = useRef(null);
    const canvasRef = useRef(null);
    const lastTickSlotRef = useRef(null);

    const propsRef = useRef({ pockets, pocketIndex, clock, isMobile, onTick });
    useEffect(() => {
        propsRef.current = { pockets, pocketIndex, clock, isMobile, onTick };
    });

    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return undefined;

        const motionOff = prefersReducedMotion();
        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0, H = 0, raf = 0;
        let previousTime = null;

        const size = () => {
            const r = wrap.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = `${W}px`;
            canvas.style.height = `${H}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        size();
        const ro = new ResizeObserver(size);
        ro.observe(wrap);

        const draw = (t) => {
            const { pockets: RING, pocketIndex: winner, isMobile: phone } = propsRef.current;
            const n = RING?.length || 0;
            if (!n) return;

            // One landing click; do not replay it on a late join or after a suspended tab skips the landing.
            if (!motionOff && winner != null && previousTime != null
                && previousTime < T_LAND && t >= T_LAND && t - previousTime < 0.2) {
                propsRef.current.onTick?.(120);
            }
            previousTime = t;

            ctx.clearRect(0, 0, W, H);

            // Vertical on phones like the reel; drawn in ALONG / ACROSS terms rather than rotating the context, which would mirror glyphs.
            const pitch = phone ? MOBILE_ROW_PITCH : ITEM_WIDTH;
            const along = phone ? H : W;
            const across = phone ? W : H;
            const centre = along / 2;
            const half = along / 2;

            const box = (a0, a1, c0, c1) => (phone
                ? ctx.fillRect(c0, a0, c1 - c0, a1 - a0)
                : ctx.fillRect(a0, c0, a1 - a0, c1 - c0));
            const acrossGrad = (c0, c1) => (phone
                ? ctx.createLinearGradient(c0, 0, c1, 0)
                : ctx.createLinearGradient(0, c0, 0, c1));
            const alongGrad = (a0, a1) => (phone
                ? ctx.createLinearGradient(0, a0, 0, a1)
                : ctx.createLinearGradient(a0, 0, a1, 0));
            const at = (a, c) => (phone ? [c, a] : [a, c]);

            const offset = motionOff
                ? (winner != null ? landingOffset(0, winner, n, pitch) : 0)
                : ringOffset(t, winner, n, pitch);

            // Speed is the derivative of the closed-form offset, so it is correct even on the first frame after a backgrounded tab.
            const speed = motionOff ? 0 : Math.abs(
                ringOffset(t + 0.02, winner, n, pitch) - ringOffset(t - 0.02, winner, n, pitch)
            ) / 0.04;
            const fast = clamp01((speed - 260) / 2400);

            const rim = acrossGrad(0, across);
            rim.addColorStop(0, '#0B0206');
            rim.addColorStop(0.5, CRIMSON_DEEP);
            rim.addColorStop(1, '#080104');
            ctx.fillStyle = rim;
            box(0, along, 0, across);

            const slots = Math.ceil(along / pitch) + 3;
            const firstSlot = Math.floor((offset - centre) / pitch) - 1;
            const landed = winner != null && t >= T_REVEAL;
            let winnerCentre = null;

            // Read through the detent pair above, the same question the landing was solved against.
            const selected = slotUnderDetent(offset, pitch);
            let selectedEdges = null;

            // Ticks on a change of selected slot, locked to the picture. Skipped on the first frame and on a jump of more than one (a seek).
            const prevSlot = lastTickSlotRef.current;
            if (prevSlot !== null && selected !== prevSlot && propsRef.current.onTick) {
                if (Math.abs(selected - prevSlot) === 1) propsRef.current.onTick(speed);
            }
            lastTickSlotRef.current = selected;

            for (let s = 0; s < slots; s++) {
                const slot = firstSlot + s;
                const linL = centre + slot * pitch - offset;
                const linR = linL + pitch;
                // Cull on the linear position: projection only pulls things inward.
                if (linR < -pitch || linL > along + pitch) continue;

                // -1 at the band's left end, 0 at the detent, +1 at the right. Do not clamp01 the shifted value: that maps the detent to +1.
                const uL = clampU((linL - centre) / half);
                const uR = clampU((linR - centre) / half);
                const xL = centre + half * project(uL);
                const xR = centre + half * project(uR);
                const w = xR - xL;
                if (w <= 0.5) continue;

                const idx = ((slot % n) + n) % n;
                const pocket = RING[idx];

                const turn = motionOff ? 1 : turnAmount(t, s, slots);
                if (turn <= 0.004) continue;

                const c0 = across / 2 - (across / 2) * turn;
                const c1 = across / 2 + (across / 2) * turn;
                const depth = c1 - c0;

                const isWinner = landed && idx === winner;
                if (isWinner && slot === selected) winnerCentre = (xL + xR) / 2;
                if (slot === selected) selectedEdges = [xL, xR, c0, c1];

                const face = acrossGrad(c0, c1);
                if (pocket.colour === 'green') {
                    face.addColorStop(0, '#0B211A');
                    face.addColorStop(0.32, '#245540');
                    face.addColorStop(0.70, '#1A4231');
                    face.addColorStop(1, '#0B231C');
                } else if (pocket.colour === 'red') {
                    face.addColorStop(0, '#36101A');
                    face.addColorStop(0.32, '#842B37');
                    face.addColorStop(0.70, '#69202D');
                    face.addColorStop(1, '#38121C');
                } else {
                    face.addColorStop(0, '#151215');
                    face.addColorStop(0.32, '#383034');
                    face.addColorStop(0.70, '#292327');
                    face.addColorStop(1, '#171317');
                }
                ctx.fillStyle = face;
                box(xL, xR, c0, c1);

                const shade = acrossGrad(c0, c0 + depth * 0.30);
                shade.addColorStop(0, 'rgba(0,0,0,0.62)');
                shade.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = shade;
                box(xL, xR, c0, c0 + depth * 0.30);

                const floor = acrossGrad(c1 - depth * 0.22, c1);
                floor.addColorStop(0, 'rgba(0,0,0,0)');
                floor.addColorStop(1, 'rgba(0,0,0,0.55)');
                ctx.fillStyle = floor;
                box(xL, xR, c1 - depth * 0.22, c1);

                const u = (xL + xR) / 2 / along * 2 - 1;
                const gloss = alongGrad(xL, xR);
                const peak = clamp01(0.5 - u * 0.42);
                gloss.addColorStop(0, 'rgba(255,255,255,0)');
                gloss.addColorStop(Math.max(0.02, Math.min(0.98, peak)), `rgba(222,190,146,${0.055 * (1 - Math.abs(u) * 0.6)})`);
                gloss.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gloss;
                box(xL, xR, c0, c1);

                const fw = Math.max(2, Math.min(5, w * 0.045));
                ctx.fillStyle = `rgba(0,0,0,0.72)`;
                box(xL - fw, xL, c0, c1);
                const fret = alongGrad(xL, xL + fw);
                fret.addColorStop(0, '#3B291D');
                fret.addColorStop(0.30, '#B19769');
                fret.addColorStop(0.55, '#7C6240');
                fret.addColorStop(1, '#38271C');
                ctx.fillStyle = fret;
                box(xL, xL + fw, c0, c1);

                if (isWinner && slot === selected) {
                    const age = t - T_REVEAL;
                    const pulse = 0.5 + 0.5 * Math.exp(-age * 1.1);
                    const lift = acrossGrad(c0, c1);
                    lift.addColorStop(0, `rgba(236,205,154,${0.18 * pulse})`);
                    lift.addColorStop(0.5, `rgba(236,205,154,${0.06 * pulse})`);
                    lift.addColorStop(1, `rgba(236,205,154,${0.10 * pulse})`);
                    ctx.fillStyle = lift;
                    box(xL, xR, c0, c1);

                    ctx.strokeStyle = '#BEA06D';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(...(phone
                        ? [c0 + 1.25, xL + 1.25, depth - 2.5, w - 2.5]
                        : [xL + 1.25, c0 + 1.25, w - 2.5, depth - 2.5]));
                }

                const legible = clamp01((turn - 0.5) / 0.5);
                if (legible > 0.03 && w > 14) {
                    const fontPx = Math.round(Math.min(pitch, across) * 0.38 * Math.min(1, w / pitch + 0.35));
                    ctx.font = `bold ${fontPx}px Georgia, 'Times New Roman', serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.globalAlpha = legible * (1 - Math.abs(u) * 0.45);
                    ctx.fillStyle = '#100B0D';
                    ctx.fillText(pocket.n, ...at((xL + xR) / 2, across * 0.52 + 1.5));
                    ctx.fillStyle = isWinner && slot === selected ? '#F6E6C9' : '#DECCAC';
                    ctx.fillText(pocket.n, ...at((xL + xR) / 2, across * 0.52));
                    ctx.globalAlpha = 1;
                }
            }

            if (winnerCentre != null && !motionOff) {
                const age = t - T_REVEAL;
                const pulse = 0.42 + 0.34 * Math.exp(-age * 1.1);
                const spill = alongGrad(winnerCentre - pitch * 2.2, winnerCentre + pitch * 2.2);
                spill.addColorStop(0, 'rgba(255,255,255,0)');
                spill.addColorStop(0.5, `rgba(229,190,127,${0.05 * pulse})`);
                spill.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = spill;
                box(winnerCentre - pitch * 2.2, winnerCentre + pitch * 2.2, 0, across);
            }

            if (fast > 0.02) {
                ctx.globalAlpha = fast * 0.5;
                for (let k = 0; k < 5; k++) {
                    const c = across * (0.14 + k * 0.18);
                    ctx.fillStyle = 'rgba(255,255,255,0.05)';
                    box(0, along, c, c + 1.2);
                }
                ctx.globalAlpha = 1;
            }

            const lip = Math.min(12, across * 0.075);
            const housing = acrossGrad(0, lip);
            housing.addColorStop(0, '#493029');
            housing.addColorStop(0.25, '#2D1C1B');
            housing.addColorStop(0.82, '#190D11');
            housing.addColorStop(1, '#826647');
            ctx.fillStyle = housing;
            box(0, along, 0, lip);
            const cast = acrossGrad(lip, lip + 17);
            cast.addColorStop(0, '#080306B0');
            cast.addColorStop(1, '#08030600');
            ctx.fillStyle = cast;
            box(0, along, lip, lip + 17);
            const sill = acrossGrad(across - lip, across);
            sill.addColorStop(0, '#B2986B');
            sill.addColorStop(0.12, '#5D4632');
            sill.addColorStop(0.45, '#291A18');
            sill.addColorStop(1, '#130A0E');
            ctx.fillStyle = sill;
            box(0, along, across - lip, across);

            const vign = alongGrad(0, along);
            vign.addColorStop(0, 'rgba(11,2,6,0.95)');
            vign.addColorStop(0.17, 'rgba(11,2,6,0)');
            vign.addColorStop(0.83, 'rgba(11,2,6,0)');
            vign.addColorStop(1, 'rgba(11,2,6,0.95)');
            ctx.fillStyle = vign;
            box(0, along, 0, across);

            // A bracket around the whole pocket rather than a line, so the selection cannot be misread; fades in as the ring slows.
            const bracket = (motionOff ? 1 : (1 - fast)) * (landed ? 1 : 0.45);
            if (selectedEdges && bracket > 0.02) {
                const [sxL, sxR, sc0, sc1] = selectedEdges;
                ctx.save();
                ctx.globalAlpha = bracket;

                ctx.fillStyle = '#AF9060';
                box(sxL, sxL + 1, sc0 + lip, sc1 - lip);
                box(sxR - 1, sxR, sc0 + lip, sc1 - lip);

                const claw = Math.min(18, (sxR - sxL) * 0.28);
                ctx.fillStyle = '#D1B580';
                box(sxL, sxL + claw, sc0 + lip, sc0 + lip + 2);
                box(sxR - claw, sxR, sc0 + lip, sc0 + lip + 2);
                box(sxL, sxL + claw, sc1 - lip - 2, sc1 - lip);
                box(sxR - claw, sxR, sc1 - lip - 2, sc1 - lip);
                ctx.restore();
            }

            const impactAge = t - T_LAND;
            const kick = !motionOff && winner != null && impactAge >= 0 && impactAge < 0.55
                ? Math.sin(impactAge * 30) * Math.exp(-impactAge * 9) * 3.5 : 0;
            const tip = 7;
            ctx.save();
            ctx.translate(...at(kick, 0));
            const pin = alongGrad(centre - tip, centre + tip);
            pin.addColorStop(0, '#6D4E30');
            pin.addColorStop(0.45, '#E0C494');
            pin.addColorStop(1, '#8F7047');
            ctx.fillStyle = pin;
            ctx.shadowColor = '#080206CC';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetY = 2;
            ctx.beginPath();
            ctx.moveTo(...at(centre - tip, 2));
            ctx.lineTo(...at(centre + tip, 2));
            ctx.lineTo(...at(centre + tip, lip - 1));
            ctx.lineTo(...at(centre, lip + 10));
            ctx.lineTo(...at(centre - tip, lip - 1));
            ctx.closePath();
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.restore();

            // Follows the fixed pin, never a neighbour.
            if (!motionOff && winner != null && impactAge >= 0 && impactAge < 0.7) {
                const catchLight = alongGrad(centre - 26, centre + 26);
                catchLight.addColorStop(0, '#E8C78F00');
                catchLight.addColorStop(0.5, `rgba(232,199,143,${0.28 * Math.exp(-impactAge * 6)})`);
                catchLight.addColorStop(1, '#E8C78F00');
                ctx.fillStyle = catchLight;
                box(centre - 26, centre + 26, 0, lip + 2);
            }
        };

        if (motionOff) {
            const paint = () => draw(propsRef.current.clock ? propsRef.current.clock() : T_TURN);
            paint();
            const roStatic = new ResizeObserver(paint);
            roStatic.observe(wrap);
            const poll = setInterval(paint, 400);
            return () => { roStatic.disconnect(); ro.disconnect(); clearInterval(poll); };
        }

        const frame = () => {
            draw(Math.max(0, propsRef.current.clock ? propsRef.current.clock() : 0));
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
        };
    }, []);

    return (
        <div
            ref={wrapRef}
            aria-hidden="true"
            style={{
                position: 'absolute',
                inset: 0,
                zIndex: 6,
                pointerEvents: 'none',
                height: isMobile ? '100%' : STRIP_HEIGHT,
            }}
        >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
        </div>
    );
}

export default CanvasRouletteStrip;
