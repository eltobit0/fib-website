/*
* THE ARRIVAL - the spins leaving the crates: one mote per lucky spin, flying from a crate's lip (a world
* position in the 3D scene) to a manifest row (a DOM element with no world position), hence a separate 2D layer.
* The scene projects each crate's lip through its camera every frame into `emitRef`, so both ends are pixels in one box.
*
* There is no particle array: every mote is a pure function of `t`, the SCENE's clock read from `emitRef`
* (two clocks would drift by the lazy chunk's load time). Two sprites are rendered once and blitted, since a
* radial gradient per mote per frame is ~120 a frame at the peak of a crowded arrival.
*/

import React, { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '../../../utils/motion.js';
import {
    STREAM_DELAY_S, STREAM_SPREAD_S, STREAM_FLIGHT_S, T_LIFT,
} from './arrivalTimeline.js';

/** Station amber, and the white it goes to at the core of a moving light. */
const AMBER = '255,170,0';
const HOT = '255,236,196';

/** Stable per-mote randomness: same spin, same arc, every frame. */
const hash = i => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };
const clamp01 = t => Math.max(0, Math.min(1, t));

/** One radial sprite, drawn once. `stops` is [offset, 'r,g,b', alpha][]. */
function sprite(stops, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, rgb, a] of stops) g.addColorStop(at, `rgba(${rgb},${a})`);
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
}

export function ArrivalMotes({ emitRef, rows, rowElsRef, frameRef }) {
    const canvasRef = useRef(null);
    // Read through a ref so a re-render never restarts the loop; written in an effect, not in render.
    const rowsRef = useRef(rows);
    useEffect(() => { rowsRef.current = rows; }, [rows]);

    useEffect(() => {
        if (prefersReducedMotion()) return undefined;
        const canvas = canvasRef.current;
        const frame = frameRef?.current;
        if (!canvas || !frame) return undefined;

        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        let W = 0, H = 0, raf = 0;

        // Hot core with a wide amber falloff; the trail is wider and cooler. Drawn additively, so a crowd of motes brightens the row.
        const head = sprite([[0, HOT, 1], [0.28, AMBER, 0.85], [1, AMBER, 0]]);
        const tail = sprite([[0, AMBER, 0.5], [1, AMBER, 0]]);

        const size = () => {
            const r = frame.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height);
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            canvas.style.width = `${W}px`;
            canvas.style.height = `${H}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };
        size();
        const ro = new ResizeObserver(size);
        ro.observe(frame);

        // Row positions are re-measured each frame (the board descends on its own animation), once per frame into an
        // array and never inside the mote loop: a layout read per mote is a forced reflow per mote.
        const targets = [];
        const measure = (n) => {
            targets.length = 0;
            const f = frame.getBoundingClientRect();
            for (let i = 0; i < n; i++) {
                const el = rowElsRef.current?.[i];
                if (!el) { targets.push(null); continue; }
                const r = el.getBoundingClientRect();
                targets.push({
                    x: r.left - f.left + r.width * 0.72,
                    y: r.top - f.top + r.height / 2,
                    left: r.left - f.left, top: r.top - f.top, w: r.width, h: r.height,
                });
            }
        };

        const draw = (img, x, y, s, alpha) => {
            if (alpha <= 0.002) return;
            ctx.globalAlpha = alpha;
            ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
        };

        const tick = () => {
            raf = requestAnimationFrame(tick);
            const st = emitRef.current;
            ctx.clearRect(0, 0, W, H);
            if (!st || !st.crates?.length) return;

            const t = st.t;
            if (t > T_LIFT) return;   // the station is going; nothing is in the air
            const list = rowsRef.current || [];
            measure(list.length);
            ctx.globalCompositeOperation = 'lighter';

            for (let i = 0; i < list.length; i++) {
                const c = st.crates[i];
                const target = targets[i];
                if (!c || !c.onScreen || c.openAt == null || !target) continue;

                // The crate's pixel is in the scene canvas's coordinates and the row's in the frame's; they differ for a frame or
                // two after a resize until the scene's observer fires, so scale rather than assume.
                const sx = st.w ? W / st.w : 1;
                const sy = st.h ? H / st.h : 1;
                const ox = c.x * sx, oy = c.y * sy;

                const count = Math.max(1, list[i].crate);
                let hit = -1;   // the most recent arrival on this row

                for (let m = 0; m < count; m++) {
                    const seed = i * 31.7 + m;
                    const born = c.openAt + STREAM_DELAY_S + (m / count) * STREAM_SPREAD_S;
                    const age = t - born;
                    if (age < 0) continue;
                    if (age >= STREAM_FLIGHT_S) { hit = Math.max(hit, born + STREAM_FLIGHT_S); continue; }

                    // A quadratic bezier with the control point thrown high and wide, so motes read as lifted out of the box
                    // and falling onto the board, not as tracer fire; lateral scatter keeps fifteen of them a handful, not a beam.
                    const u = age / STREAM_FLIGHT_S;
                    const lift = 0.42 + hash(seed) * 0.5;
                    const cx = ox + (target.x - ox) * (0.3 + hash(seed * 3.1) * 0.35)
                        + (hash(seed * 7.7) - 0.5) * W * 0.10;
                    const cy = Math.min(oy, target.y) - Math.abs(target.y - oy) * lift
                        - 40 - hash(seed * 5.3) * 60;

                    const iu = 1 - u;
                    const x = iu * iu * ox + 2 * iu * u * cx + u * u * target.x;
                    const y = iu * iu * oy + 2 * iu * u * cy + u * u * target.y;

                    // Brightens leaving, pinches out landing, so the mote reads as absorbed by the row.
                    const glow = Math.sin(Math.PI * Math.min(1, u * 1.35)) * 0.85 + 0.15;
                    const s = 16 + 26 * Math.sin(Math.PI * u) - 7 * u;

                    // Five samples back along the arc give a trail without storing one; wide and additive so it reads as motion, not noise.
                    for (let k = 1; k <= 5; k++) {
                        const uk = u - k * 0.032;
                        if (uk <= 0) break;
                        const ik = 1 - uk;
                        draw(tail,
                            ik * ik * ox + 2 * ik * uk * cx + uk * uk * target.x,
                            ik * ik * oy + 2 * ik * uk * cy + uk * uk * target.y,
                            s * (1.15 - k * 0.13), glow * (0.42 - k * 0.07));
                    }
                    draw(head, x, y, s, glow);
                }

                // The row takes the light: a bloom connects the flight to the number that changes because of it.
                if (hit > 0) {
                    const since = t - hit;
                    if (since < 0.5) {
                        const a = clamp01(1 - since / 0.5) ** 2;
                        draw(tail, target.x, target.y, Math.max(target.w, 90) * 1.1, a * 0.5);
                        ctx.globalAlpha = a * 0.22;
                        ctx.fillStyle = `rgba(${AMBER},1)`;
                        ctx.fillRect(target.left, target.top, target.w, target.h);
                    }
                }
            }

            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        };
        raf = requestAnimationFrame(tick);

        return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    }, [emitRef, rowElsRef, frameRef]);

    if (prefersReducedMotion()) return null;
    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none', display: 'block' }}
        />
    );
}
