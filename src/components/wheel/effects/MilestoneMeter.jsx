import React, { useEffect } from 'react';
import { COLORS, SPACE, Z, SURFACE_NOISE } from '../config/constants';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { visibleInterval } from '../../../config/power.js';
import { useEventSlotBusy } from './useEventSlotBusy.js';

/**
* How close the server is to its next global event, filling the banner slot between the ticker and the reel when no event runs.
*
* It counts spins, not seconds: events trigger on `nextEventTriggerSpin`, a server-wide counter with a random 300-600
* interval (`globalEvents.js`), so a clock would estimate a spin rate ("counted, never asserted", PRODUCT.md).
* The copy says the count is server-wide, or it reads as a personal target. Clicking opens the event log at THE RUN-UP,
* whose head shows the same figure.
*/

/** Fallback re-read interval: the server pushes `global_event_milestone` after every spin, so this only covers a silent stream (reconnecting SSE, busy server). */
const REFRESH_MS = 20_000;

export function MilestoneMeter({ isMobile, onOpen }) {
    const { globalEventStatus, refreshMilestone } = useActivity();
    const effectiveActive = useEventSlotBusy();
    const milestone = globalEventStatus?.milestone;

    // The number arrives pushed (ActivityContext writes `globalEventStatus.milestone`); this effect only keeps asking
    // slowly in case the stream went quiet, and only while visible.
    useEffect(() => {
        if (effectiveActive) return undefined;

        // `visibleInterval` tears the timer down while hidden and refreshes once on return; `stretch` slows it further in saver mode.
        refreshMilestone();
        return visibleInterval(refreshMilestone, REFRESH_MS, { stretch: true });
    }, [effectiveActive, refreshMilestone]);

    // Nothing rather than a placeholder: an event is running with its own banner, or the server has not told us yet.
    if (effectiveActive || !milestone || typeof milestone.remaining !== 'number') return null;

    const remaining = Math.max(0, milestone.remaining);
    const progress = Math.min(100, Math.max(0, milestone.progress || 0));

    // The last stretch runs hotter: anticipation the data supports, the one moment this component may raise its voice.
    const imminent = remaining <= 25;

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: `${SPACE.sm}px`,
            zIndex: Z.content,
        }}>
            {/* Keyframes live here because the wheel's effects each own their animation vocabulary; both are frozen by the media
            query below (light and motion may breathe, geometry and data may not). `fibMeterTick` pops once per update because
            the <strong> remounts on `key={remaining}`; `fibMeterBreath` is the imminent fill's glow swell. */}
            <style>{`
                @keyframes fibMeterTick {
                    0% { transform: scale(1); }
                    40% { transform: scale(1.06); }
                    100% { transform: scale(1); }
                }
                @keyframes fibMeterBreath {
                    0%, 100% { box-shadow: 0 0 6px ${COLORS.gold}55; }
                    50% { box-shadow: 0 0 16px ${COLORS.gold}AA; }
                }
                .fib-meter-tick { animation: fibMeterTick 220ms ease-out; }
                .fib-meter-breath { animation: fibMeterBreath 1.8s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .fib-meter-tick, .fib-meter-breath { animation: none; }
                }
            `}</style>
            <button
                type="button"
                className={onOpen ? 'fib-board-hit' : undefined}
                onClick={onOpen}
                // Not a button when nothing is listening, or it would take focus, announce itself and do nothing.
                disabled={!onOpen}
                aria-label={onOpen
                    ? `${remaining.toLocaleString('en-US')} spins to the next global event, server-wide. Open the event log to see who has been spinning.`
                    : undefined}
                // The full sentence lives in the tooltip; the visible copy carries "server-wide" in three words.
                title={`Global events trigger on a server-wide spin count. Every player's spins count toward it — ${remaining.toLocaleString('en-US')} to go.${onOpen ? ' Open the log to see who has been spinning.' : ''}`}
                style={{
                    // Button reset: these lines only stop the user agent painting a control over the plinth's own look.
                    border: 0,
                    font: 'inherit',
                    color: 'inherit',
                    textAlign: 'left',
                    cursor: onOpen ? 'pointer' : 'default',
                    // The phone's version is one line (~32px, from 84px): the label folds into the sentence, and the progress bar becomes
                    // the plinth's own lit floor edge growing left to right.
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    alignItems: isMobile ? 'baseline' : 'stretch',
                    gap: isMobile ? '6px' : '5px',
                    width: isMobile ? '100%' : '460px',
                    padding: isMobile ? '7px 16px 9px' : '10px 18px 12px',
                    // A detached section of the band's viaduct deck (the Nocturne): square plinth, lit rail on top, amber from the floor,
                    // quieter than the event banners sharing the slot (this is status, they are news). Grain is SURFACE_NOISE.
                    backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #0a0d18 100%)`,
                    boxShadow: [
                        'inset 0 1px 0 rgba(206,214,236,0.10)',
                        `inset 0 -1px 0 ${COLORS.gold}${imminent ? '55' : '2A'}`,
                    ].join(', '),
                }}
            >
                {/* The number is the product (an instrument readout); the label is the margin note. */}
                <div style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'row' : 'column',
                    alignItems: isMobile ? 'baseline' : 'stretch',
                    gap: isMobile ? '6px' : '1px',
                    minWidth: 0,
                }}>
                    {/* The standalone label is desktop-only; on a phone it folds into the sentence after the number. */}
                    {!isMobile && (
                        <span style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            justifyContent: 'space-between',
                            gap: '12px',
                        }}>
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.09em',
                                textTransform: 'uppercase',
                                color: imminent ? COLORS.gold : COLORS.textMuted,
                                whiteSpace: 'nowrap',
                            }}>
                                Next global event
                            </span>
                            {/* The affordance says what the click is FOR. Desktop only: the phone's row has no eyebrow to sit in. */}
                            {onOpen && (
                                <span style={{
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    letterSpacing: '0.08em',
                                    textTransform: 'uppercase',
                                    color: COLORS.textMuted,
                                    opacity: 0.75,
                                    whiteSpace: 'nowrap',
                                }}>
                                    The run-up →
                                </span>
                            )}
                        </span>
                    )}

                    <div style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: isMobile ? '6px' : '7px',
                        flexWrap: isMobile ? 'nowrap' : 'wrap',
                        minWidth: 0,
                    }}>
                        <strong
                            key={remaining}
                            className="fib-meter-tick"
                            style={{
                                fontSize: isMobile ? '17px' : '26px',
                                fontWeight: 800,
                                lineHeight: 1.1,
                                fontVariantNumeric: 'tabular-nums',
                                color: imminent ? COLORS.gold : COLORS.text,
                                textShadow: imminent ? `0 0 14px ${COLORS.gold}44` : 'none',
                            }}
                        >
                            {remaining.toLocaleString('en-US')}
                        </strong>
                        <span style={{
                            fontSize: isMobile ? '11px' : '13px',
                            color: COLORS.textMuted,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                        }}>
                            {/* The phone's copy carries the label; "server-wide" stops the figure reading as a personal target (DESIGN.md §8), so it is cut last. */}
                            {isMobile ? 'spins to the next event, server-wide' : 'spins to go, server-wide'}
                        </span>
                    </div>
                </div>

                {/* A pill track with the fill scaled rather than widened (`width` relays out on every update; see the spin control's
                loading bar). 7px: the fill's glide is the card's only motion and was invisible at 4px. */}
                <div
                    role="progressbar"
                    aria-valuenow={Math.round(progress)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progress to the next global event"
                    style={isMobile
                        // On a phone the track is the plinth's floor edge, pinned across the bottom and growing left to right; square because it is an edge.
                        ? {
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: '3px',
                            borderRadius: 0,
                            background: 'rgba(206,214,236,0.08)',
                            overflow: 'hidden',
                        }
                        : {
                            height: '7px',
                            marginTop: '4px',
                            borderRadius: '999px',
                            background: 'rgba(206,214,236,0.08)',
                            overflow: 'hidden',
                        }}
                >
                    <div
                        className={imminent ? 'fib-meter-breath' : undefined}
                        style={{
                            height: '100%',
                            width: '100%',
                            transformOrigin: 'left center',
                            transform: `scaleX(${progress / 100})`,
                            borderRadius: '999px',
                            background: `linear-gradient(90deg, ${COLORS.gold}77, ${COLORS.gold})`,
                            boxShadow: `0 0 8px ${COLORS.gold}${imminent ? '99' : '55'}`,
                            // Long, because the value moves every 20s in jumps: a slow glide reads as filling, a snap as the number having been wrong.
                            transition: 'transform 900ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                    />
                </div>

                {/* The hover/focus light shared with the board, so clickable things feel the same everywhere. LAST child so it lies over the copy; `pointer-events: none`. */}
                {onOpen && <span className="fib-plinth-lift" aria-hidden="true" />}
            </button>
        </div>
    );
}

export default MilestoneMeter;
