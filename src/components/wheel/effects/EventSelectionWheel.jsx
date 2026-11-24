// Which global event the milestone just picked, rolled in the banner slot between the ticker and the reel.
// The shell is the milestone meter's (DESIGN.md §8, THE NOCTURNE); only the event identities may signal colour.

import React, { useState, useEffect, useRef, memo } from 'react';
import { Zap } from 'lucide-react';
import { COLORS, EVENT_IDENTITY, SPACE, Z } from '../config/constants';
import { EVENT_ICONS } from '../config/eventIcons.js';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { useSound } from '../../../context/SoundContext.jsx';
import { prefetchArrivalScene } from './arrivalScene.js';

// Name, icon and colour per event. Name and colour come from `EVENT_IDENTITY` in config/constants.js; the four
// banners still keep their own copies. The icon is in config/eventIcons.js (a constants module that imports
// components stops being one), which lets this strip carry THE PARLOUR's green and the Community Goal's teal two cells apart.
const EVENT_CONFIG = Object.fromEntries(
    Object.entries(EVENT_IDENTITY).map(([key, id]) => [key, { ...id, icon: EVENT_ICONS[key] }]),
);

/**
* The cell pitch, in one place: the animation computes travel as `RUN_UP * cellWidth` and the strip renders cells of
* `cellWidth`; if they disagree the reel lands on the wrong event silently. Both call this once, and the value is
* captured into `pitch` when the roll starts, since `isMobile` can flip mid-roll on a resize.
*/
function cellWidth(isMobile) {
    return isMobile ? 108 : 132;
}

/**
* The strip's sections, which must keep the window full: `RUN_UP` is the travel in cells, `RUN_OUT` what remains right
* of the winner (the window is at most 460px), `LEAD_IN` the cells left of the pointer at offset 0 (three, because a
* cell arriving exactly on the edge fade is not one arriving behind it).
*/
const LEAD_IN = 3;
const RUN_UP = 29;
const RUN_OUT = 10;

/** The strip and the index the winner sits at; returned so the caller never re-derives it from different assumptions. */
function buildEventStrip(availableEvents, selectedEvent) {
    // `availableEvents` is the server's list, so a backend shipping a fifth event first sends a type EVENT_CONFIG has no
    // row for. An undrawn cell has width zero and slides every later cell one pitch left, un-aligning the landing, so
    // fillers are filtered here; the render path's placeholder covers `selectedEvent`, which may not be dropped.
    const known = availableEvents.filter((type) => EVENT_CONFIG[type]);
    const pool = known.length ? known : Object.keys(EVENT_CONFIG);
    const filler = () => pool[Math.floor(Math.random() * pool.length)];

    const strip = [];
    for (let i = 0; i < LEAD_IN + RUN_UP; i++) strip.push(filler());
    strip.push(selectedEvent);
    for (let i = 0; i < RUN_OUT; i++) strip.push(filler());

    return { strip, finalIndex: LEAD_IN + RUN_UP };
}

function EventSelectionWheel({ isMobile = false }) {
    const { eventSelection } = useActivity();
    const { playSfx, primeEventSound } = useSound();

    const [isVisible, setIsVisible] = useState(false);
    const [strip, setStrip] = useState([]);
    const [offset, setOffset] = useState(0);
    const [phase, setPhase] = useState('idle'); // 'idle', 'spinning', 'landing', 'result'
    const [resultEvent, setResultEvent] = useState(null);

    const animationRef = useRef(null);
    const startTimeRef = useRef(null);

    // Facts about the roll on screen, fixed when it starts. State, not refs: both are read while rendering, and a ref read
    // during render is not tracked by React and would not repaint when it changed.
    const [pitch, setPitch] = useState(cellWidth(isMobile));
    const [finalIndex, setFinalIndex] = useState(LEAD_IN + RUN_UP);

    // Start animation when eventSelection is received
    useEffect(() => {
        if (eventSelection && eventSelection.selectedEvent) {
            // Capture the pitch at animation start, so a resize mid-roll cannot
            // move the cells out from under the distance already committed to.
            const itemWidth = cellWidth(isMobile);
            setPitch(itemWidth);

            const built = buildEventStrip(
                eventSelection.availableEvents || ['arrival', 'king_of_wheel'],
                eventSelection.selectedEvent,
            );
            setStrip(built.strip);
            setFinalIndex(built.finalIndex);
            setIsVisible(true);
            setPhase('spinning');
            setOffset(0);
            // Cleared before this roll starts: this component is emptied between events, never unmounted, so `resultEvent` would
            // otherwise name the previous event in the header while the new roll has not landed.
            setResultEvent(null);
            startTimeRef.current = Date.now();

            /*
            * Start fetching the event's music now: this roll is the only four seconds of warning (the server broadcasts
            * `event_selection`, waits out this animation, then triggers the event), and soundtracks are `preload = 'none'`
            * (see the init effect in SoundContext), so a first play would fetch in front of the listener.
            */
            primeEventSound?.(eventSelection.selectedEvent);

            // Likewise the arrival's scene, a 551KB chunk otherwise requested when the theatre mounts.
            if (eventSelection.selectedEvent === 'arrival') prefetchArrivalScene();

            playSfx?.('spin_start');

            // The strip starts with the cell at LEAD_IN under the pointer, so the roll moves RUN_UP cells to bring the winner there.
            const totalDistance = RUN_UP * itemWidth;
            const duration = eventSelection.selectionDuration || 4000;

            const animate = () => {
                const elapsed = Date.now() - startTimeRef.current;
                const progress = Math.min(elapsed / duration, 1);

                // Easing function - slow down at end
                const eased = 1 - Math.pow(1 - progress, 4);

                setOffset(eased * totalDistance);

                if (progress < 1) {
                    animationRef.current = requestAnimationFrame(animate);
                } else {
                    // Animation complete
                    setPhase('result');
                    setResultEvent(eventSelection.selectedEvent);
                    playSfx?.('event_start');
                }
            };

            animationRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [eventSelection, playSfx, primeEventSound]);

    // Exit fades rather than pops: the context clears eventSelection about a second after landing, as the event's banner
    // slides into this slot. A fresh selection mid-fade snaps it back (a render-phase state correction).
    const [isGone, setIsGone] = useState(false);
    const isClosing = isVisible && !eventSelection && !isGone;
    if (eventSelection && isGone) setIsGone(false);
    useEffect(() => {
        if (!isClosing) return undefined;
        const id = setTimeout(() => setIsGone(true), 320);
        return () => clearTimeout(id);
    }, [isClosing]);

    if (isGone || !isVisible || strip.length === 0) return null;

    // 132, down from 180. The slot is one row, not a screen. Read from the pitch
    // the roll was launched against, never re-derived — see cellWidth().
    const ITEM_WIDTH = pitch;
    // 50 on a phone, not 46, and load-bearing: at 108px wide "KING OF THE WHEEL" wraps to two lines, which needs 48px at
    // the 10px the type ramp calls for (45.8px at the old 9px against a 46px strip clipped). Owner-approved 2026-08-20.
    const STRIP_HEIGHT = isMobile ? 50 : 52;
    const config = resultEvent ? EVENT_CONFIG[resultEvent] : null;

    // The roll must always resolve, even for an event this build cannot draw: fall back to the id ("AURORA HOUR") so the
    // header does not say "Selecting..." on a finished roll. `landed` drives the resolved treatment, not `config`.
    const landed = Boolean(resultEvent);
    const resultLabel = config
        ? config.name
        : landed
            ? String(resultEvent).replace(/_/g, ' ').toUpperCase()
            : 'Selecting…';

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: `${SPACE.sm}px`,
            zIndex: Z.content,
        }}>
            <style>{`
                @keyframes eventRollIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div style={{
                // The milestone meter's plinth exactly: square, no ring, deck material, lit rail on top, a signal from the floor.
                // The signal is amber while rolling and becomes the event's own colour on landing.
                width: isMobile ? 'min(340px, 92vw)' : '460px',
                padding: isMobile ? '9px 14px 11px' : '10px 18px 12px',
                borderRadius: 0,
                background: 'linear-gradient(180deg, #0d1322 0%, #0a0d18 100%)',
                boxShadow: [
                    'inset 0 1px 0 rgba(206,214,236,0.10)',
                    `inset 0 -1px 0 ${config ? config.color : COLORS.gold}88`,
                ].join(', '),
                animation: isClosing ? 'none' : 'eventRollIn 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
                opacity: isClosing ? 0 : 1,
                transition: 'opacity 0.32s ease-in',
            }}>
                {/* The header line in the meter's format; on landing it becomes the event's name in its colour, which is the result. */}
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: `${SPACE.md}px`,
                    marginBottom: '7px',
                }}>
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.09em',
                        textTransform: 'uppercase',
                        color: COLORS.gold,
                    }}>
                        <Zap size={12} />
                        Global event
                    </span>

                    <span style={{
                        fontSize: isMobile ? '12px' : '13px',
                        // Keyed on `landed`, not `config`; an unknown event has no hue to claim, so it resolves in the deck's own amber.
                        fontWeight: landed ? 700 : 400,
                        color: config ? config.color : (landed ? COLORS.gold : COLORS.textMuted),
                        textShadow: config ? `0 0 14px ${config.color}66` : 'none',
                        whiteSpace: 'nowrap',
                        transition: 'color 0.3s ease-out',
                    }}>
                        {resultLabel}
                    </span>
                </div>

            {/* Spinning Strip Container */}
            <div style={{
                position: 'relative',
                width: '100%',
                height: `${STRIP_HEIGHT}px`,
                // A lit window in the plinth, not a recessed box: no radius, depth is the deck's darker ground.
                background: 'linear-gradient(180deg, #090c15 0%, #05070d 100%)',
                borderRadius: 0,
                boxShadow: 'inset 0 1px 0 rgba(206,214,236,0.06)',
                overflow: 'hidden',
            }}>
                {/* The indicator, built like the reel's detent: a mark seated in each edge so nothing is drawn through the event it points at. */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '1px',
                    background: `linear-gradient(180deg, ${COLORS.gold} 0%, ${COLORS.gold}22 32%, ${COLORS.gold}22 68%, ${COLORS.gold} 100%)`,
                    boxShadow: `0 0 8px ${COLORS.gold}66`,
                    zIndex: 10,
                }} />

                {/* Strip */}
                <div style={{
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    height: '100%',
                    // Backed off by the lead-in so the cell under the pointer at offset 0 is index LEAD_IN with cells to its left.
                    left: `calc(50% - ${ITEM_WIDTH / 2 + LEAD_IN * ITEM_WIDTH}px)`,
                    transform: `translateX(-${offset}px)`,
                    transition: phase === 'result' ? 'none' : undefined,
                }}>
                    {strip.map((eventType, index) => {
                        const eventConfig = EVENT_CONFIG[eventType];

                        // An unknown type still occupies its slot: returning null drops a pitch and slides the winner one cell toward the pointer.
                        if (!eventConfig) {
                            return <div key={index} style={{ width: `${ITEM_WIDTH}px`, flexShrink: 0, height: '100%' }} />;
                        }

                        const Icon = eventConfig.icon;
                        const isLanding = phase === 'result' && index === finalIndex;

                        return (
                            <div
                                key={index}
                                style={{
                                    width: `${ITEM_WIDTH}px`,
                                    // Without this the cells collapse: the strip is absolutely positioned with `left` but no width, so shrink-to-fit
                                    // flex items (`flex-shrink` 1) divide 424px instead of taking 132 each.
                                    flexShrink: 0,
                                    height: '100%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    // The reel's own language: light from the floor rather than a boxed tile (§8).
                                    background: isLanding
                                        ? `linear-gradient(180deg, transparent 30%, ${eventConfig.color}18 76%, ${eventConfig.color}44 100%)`
                                        : 'transparent',
                                    boxShadow: isLanding
                                        ? `inset 0 -2px 0 ${eventConfig.color}, 0 0 18px -6px ${eventConfig.color}`
                                        : 'none',
                                    transition: isLanding ? 'background 0.3s ease-out, box-shadow 0.3s ease-out' : 'none',
                                    position: 'relative',
                                }}
                            >
                                {/* The seam between cells is bottom-weighted like the reel's; a full-height rule at the pitch is a grid. */}
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: '1px',
                                    background: 'linear-gradient(180deg, transparent 45%, rgba(206,214,236,0.10) 100%)',
                                }} />
                                <Icon
                                    size={isMobile ? 18 : 20}
                                    color={eventConfig.color}
                                    style={{
                                        filter: `drop-shadow(0 0 ${isLanding ? 10 : 6}px ${eventConfig.color}${isLanding ? 'AA' : '66'})`,
                                        transition: 'filter 0.3s ease-out',
                                    }}
                                />
                                <span style={{
                                    // 10px, one size at both breakpoints (DESIGN.md: the 9px floor breach is gone; 10px is allowed for an uppercase
                                    // letter-spaced badge). Desktop needs 39px of its 52px strip; mobile wraps the two longest names and needs 48px,
                                    // hence STRIP_HEIGHT 50 above. Change either and re-measure both.
                                    fontSize: '10px',
                                    fontWeight: 700,
                                    color: eventConfig.color,
                                    textAlign: 'center',
                                    letterSpacing: '0.06em',
                                    lineHeight: 1.1,
                                    padding: '0 6px',
                                }}>
                                    {eventConfig.name}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Edge fades */}
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '52px',
                    background: 'linear-gradient(90deg, #05070d 0%, transparent 100%)',
                    pointerEvents: 'none',
                    zIndex: 5,
                }} />
                <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '52px',
                    background: 'linear-gradient(270deg, #05070d 0%, transparent 100%)',
                    pointerEvents: 'none',
                    zIndex: 5,
                }} />
            </div>
            </div>

            {/* No separate result panel: the header row says "Selecting..." while it turns and becomes the event's name in its colour on landing. */}
        </div>
    );
}

export default memo(EventSelectionWheel);