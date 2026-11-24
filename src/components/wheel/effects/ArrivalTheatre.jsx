/*
* THE ARRIVAL - the theatre: one composition in which the whole event plays (shutters close, the page
* darkens, the band opens into a wide frame, three shots, then it collapses back).
*
* Nothing on the page moves: the frame is a FIXED element at its final size, revealed through an
* animated `clip-path` that starts as the reel mount's rectangle, so there is no reflow and no `setSize`
* on the WebGL renderer. The veils are two bars above and below the frame rather than a scrim with a hole.
*
* `pointer-events: none` throughout: it owns the screen visually, not the page. WheelSpinner refuses
* spinning for the duration on its own.
*
* It is a portal because the reel mount is `overflow: hidden` inside its own stacking context; what stays
* behind is the shutter and a probe div whose rectangle is measured every frame.
*/

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { ArrivalTrain3D } from './arrivalScene.js';
import { useSound } from '../../../context/SoundContext.jsx';
import { prefersReducedMotion } from '../../../utils/motion.js';
import { ArrivalShutter } from './ArrivalShutter.jsx';
import { ArrivalBoard } from './ArrivalBoard.jsx';
import { ArrivalMotes } from './ArrivalMotes.jsx';
import {
    T_SHUTTER, T_SCRIM, T_SCRIM_END, T_IRIS, T_IRIS_END, T_LIFT, SCENE_FADE_S,
    MAX_CRATES, crateCueAt,
    sortManifest,
} from './arrivalTimeline.js';

// three.js is fetched when a train arrives, not at page load: statically imported it nearly doubled the wheel
// chunk (140KB to 272KB gzipped) for an event that fires about twice a day. The 1.3s shutter buys the time.
// The lazy component lives in arrivalScene.js beside the prefetch the selection wheel calls, so both name one chunk.

/**
* Only the train may fail. A rejected `import()` (a deploy replacing the hashed file under an open tab) throws
* during render and would unmount the whole wheel; fenced off, the event degrades to ArrivalBoard on a lit,
* empty platform. `null`, not a placeholder: a spinner reads as loading forever.
*/
class TrainBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        console.error('[Arrival] Train scene failed to load; showing the platform without it.', error);
    }

    render() {
        return this.state.failed ? null : this.props.children;
    }
}

const clamp01 = t => Math.max(0, Math.min(1, t));
// The iris opens fast and settles and closes on the mirror of that, like the shutter's blades.
const easeOpen = t => 1 - Math.pow(1 - t, 3.4);
const easeShut = t => t * t;

/** The frame the whole event plays in, in viewport pixels: centred on the band, then clamped into the viewport. */
function cinemaRect(band) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = vw < 900;
    const inset = narrow ? 12 : 34;
    const h = Math.min(vh - inset * 2, Math.max(340, vh * (narrow ? 0.84 : 0.76)));
    const mid = band.top + band.height / 2;
    const top = Math.max(inset, Math.min(vh - h - inset, Math.round(mid - h / 2)));
    return { top, height: h, bottom: top + h, vh };
}

export function ArrivalTheatre() {
    const { arrival, arrivalCrate } = useActivity();
    const { startArrivalSoundtrack, stopArrivalSoundtrack, playArrivalCrate, stopArrivalCrates } = useSound();

    // Commit one epoch before mounting the scene or starting any event effects.
    // Lazy scene loading then catches up to this same clock.
    const [committedEpoch, setCommittedEpoch] = useState(null);
    useLayoutEffect(() => {
        setCommittedEpoch(arrival ? { event: arrival, at: performance.now() } : null);
    }, [arrival]);
    const epoch = committedEpoch?.event === arrival ? committedEpoch?.at : null;

    const probeRef = useRef(null);
    const frameRef = useRef(null);
    const topVeilRef = useRef(null);
    const botVeilRef = useRef(null);
    /** Written by the scene each frame, read by the overlay and the board. */
    const emitRef = useRef(null);
    const rowElsRef = useRef([]);

    // One sort, three consumers (board rows, the scene's wagon `i` crate, the overlay's spin flights): one array so they cannot disagree.
    const rows = useMemo(() => (arrival?.manifest ? sortManifest(arrival.manifest) : []), [arrival]);

    // Sound callbacks go through refs and the effect depends on the committed arrival epoch: `useSound`'s callbacks are
    // rebuilt on every settings change, and a volume change mid-arrival would restart the take. Seeded at construction
    // and refreshed in a bare effect (not assigned in render), as `playSfxRef` in WheelSpinner.
    const soundRef = useRef({ startArrivalSoundtrack, stopArrivalSoundtrack, playArrivalCrate, stopArrivalCrates });
    useEffect(() => {
        soundRef.current = { startArrivalSoundtrack, stopArrivalSoundtrack, playArrivalCrate, stopArrivalCrates };
    });

    // Crates are cued off the timeline, not the scene: the scene is a lazy chunk allowed to fail, and a failed one
    // would delete the sound. `crateCueAt(i, n)` is the same table the scene draws from. It is NOT the landing beat:
    // the takes are the whole arc, so they start at release (see `CRATE_IMPACT_OFFSET_S`). `n` is the PLAYER count
    // and the loop stops at `MAX_CRATES`, matching the scene.
    useEffect(() => {
        if (!arrival || epoch == null || rows.length === 0) return undefined;

        // The bed gets a function, not zero: the first arrival must fetch the file, and the take should join the picture
        // where it is (`joinTake` in SoundContext). `performance.now()`, not `serverNow()`: an arrival is a portal, so the
        // picture is the authority (THE PARLOUR is the opposite case).
        soundRef.current?.startArrivalSoundtrack?.(
            () => (performance.now() - epoch) / 1000,
        );

        // Under reduced motion every crate is already down, so the impacts go; the bed stays (motion is not a sound preference).
        // The cue sheet is handed to the sound layer at once, each cue with its offset, so the audio thread keeps them
        // while the main thread starts the 3D scene. A timer is only the fallback for cues the sound layer refused
        // (no Web Audio, a context awaiting a gesture, an unfinished decode).
        const timers = [];
        if (!prefersReducedMotion()) {
            // Measured against the epoch, not "now", so adding anything above this effect cannot skew it.
            const since = () => (performance.now() - epoch) / 1000;
            for (let i = 0; i < Math.min(rows.length, MAX_CRATES); i++) {
                const at = Math.max(0, crateCueAt(i, rows.length) - since());
                const scheduled = soundRef.current?.playArrivalCrate?.(i, at);
                if (!scheduled) {
                    timers.push(setTimeout(
                        () => soundRef.current?.playArrivalCrate?.(i),
                        at * 1000,
                    ));
                }
            }
        }

        return () => {
            timers.forEach(clearTimeout);
            // The audio thread holds impacts that have not sounded; a theatre closing early has to take them back.
            soundRef.current?.stopArrivalCrates?.();
            soundRef.current?.stopArrivalSoundtrack?.();
        };
    }, [arrival, rows.length, epoch]);

    useEffect(() => {
        const probe = probeRef.current;
        const frame = frameRef.current;
        const topVeil = topVeilRef.current;
        const botVeil = botVeilRef.current;
        if (epoch == null || !probe || !frame || !topVeil || !botVeil) return undefined;

        const motionOff = prefersReducedMotion();
        // The event's clock, not this effect's. See `epoch`.
        const start = epoch;
        let raf = 0;

        const paint = (t) => {
            // Re-measured every frame: the page is live (ticker grows, topbar changes height, the player scrolls).
            const band = probe.getBoundingClientRect();
            const cinema = cinemaRect(band);

            const iris = motionOff ? 1 : (
                t < T_LIFT
                    ? easeOpen(clamp01((t - T_IRIS) / (T_IRIS_END - T_IRIS)))
                    : 1 - easeShut(clamp01((t - T_LIFT) / SCENE_FADE_S))
            );

            const top = band.top + (cinema.top - band.top) * iris;
            const bottom = band.bottom + (cinema.bottom - band.bottom) * iris;

            // The frame is the cinema rectangle at full size from the first frame, so the lens is solved once for a 2.5:1
            // picture. Written every frame to almost always the same values, so the renderer's ResizeObserver only fires on real moves.
            frame.style.top = `${cinema.top}px`;
            frame.style.height = `${cinema.height}px`;

            // Clamped at zero: if the band sits above the frame (very short viewport) a negative inset would stop clipping altogether.
            const clipTop = Math.max(0, top - cinema.top);
            const clipBot = Math.max(0, cinema.bottom - bottom);
            frame.style.clipPath = `inset(${clipTop}px 0 ${clipBot}px 0)`;

            topVeil.style.height = `${Math.max(0, top)}px`;
            botVeil.style.top = `${bottom}px`;

            const veil = motionOff ? 1 : (
                t < T_LIFT
                    ? clamp01((t - T_SCRIM) / (T_SCRIM_END - T_SCRIM))
                    : 1 - clamp01((t - T_LIFT) / SCENE_FADE_S)
            );
            topVeil.style.opacity = String(veil);
            botVeil.style.opacity = String(veil);

            // The frame's own fade is on top of the scene's, a fraction later, so the last thing seen is the platform going dark.
            frame.style.opacity = motionOff ? '1' : String(
                t < T_LIFT ? 1 : 1 - clamp01((t - T_LIFT - 0.1) / (SCENE_FADE_S - 0.1))
            );
        };

        // One measured frame under reduced motion: the theatre open, the station
        // standing still inside it. The information never depends on the motion.
        if (motionOff) {
            paint(0);
            const ro = new ResizeObserver(() => paint(0));
            ro.observe(document.documentElement);
            return () => ro.disconnect();
        }

        const tick = (now) => {
            // Clamped at the source: a rAF timestamp can precede the
            // performance.now() captured just before it was scheduled.
            paint(Math.max(0, (now - start) / 1000));
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [arrival, epoch]);

    if (!arrival || epoch == null || rows.length === 0) return null;

    return (
        <>
            {/* Stays in the reel mount: the blades, and the rectangle the
                theatre opens out of. */}
            <div ref={probeRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <ArrivalShutter />
            </div>

            {createPortal(
                /* NOT aria-hidden: an aria-hidden ancestor silences ArrivalBoard's role="status" live region. The decorative layers hide themselves. */
                <div className="fib-arrival-theatre">
                    <div ref={topVeilRef} className="fib-arrival-veil is-top" aria-hidden="true" />
                    <div ref={botVeilRef} className="fib-arrival-veil is-bottom" aria-hidden="true" />

                    <div ref={frameRef} className="fib-arrival-frame">
                        <TrainBoundary>
                            <React.Suspense fallback={null}>
                                <ArrivalTrain3D
                                    crateCount={rows.length}
                                    epoch={epoch}
                                    emitRef={emitRef}
                                    style={{ animation: `fadeIn 0.5s ease-out ${T_SHUTTER * 0.75}s both` }}
                                />
                            </React.Suspense>
                        </TrainBoundary>

                        <ArrivalMotes
                            emitRef={emitRef}
                            rows={rows}
                            rowElsRef={rowElsRef}
                            frameRef={frameRef}
                        />

                        <ArrivalBoard
                            arrival={arrival}
                            arrivalCrate={arrivalCrate}
                            rows={rows}
                            emitRef={emitRef}
                            rowElsRef={rowElsRef}
                        />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
