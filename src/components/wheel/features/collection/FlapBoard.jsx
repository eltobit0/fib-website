// FlapBoard: the split-flap primitives THE CONCOURSE is built from. The accessible name is the finished string, rendered on first paint; the shuffling cells are `aria-hidden` decoration, and under `prefers-reduced-motion` they show the final glyph at once. One timer per string (cells derive their glyph from a shared frame counter), and it clears itself once the last cell settles.
// Anything with a state belongs in the stylesheet; `style` carries layout only. `Plinth` once emitted background and shadow inline, and an inline declaration beats the class selectors, so every hover and focus ring silently did nothing.

import React, { useEffect, useRef, useState } from 'react';
import { DECK } from '../../config/constants';
import { usePrefersReducedMotion } from '../../../../utils/motion.js';

// The drum's alphabet (A-Z, 0-9 and a little punctuation), which is why the board is uppercase everywhere. Glyphs outside it are printed straight: a drum cannot land on a glyph it does not carry.
const DRUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DIGIT_DRUM = '0123456789';

const STEP_MS = 52;
const LEAD_FRAMES = 2;

/** The frame at which cell `i` stops shuffling. */
function settleFrame(i) {
    // Capped so a long string finishes in the same beat as a short one.
    return LEAD_FRAMES + Math.min(i, 12);
}

// One line of flap cells. `plate` gives each cell the drum's face (a lit hinge); opt-in for the figures meant to read as flaps, since at label sizes the hinge is texture rather than material.
export function FlapText({
    text = '',
    size = 13,
    tone = DECK.ink,
    weight = 700,
    track = '0.06em',
    plate = false,
    delay = 0,
    digits = false,
    title,
    style,
}) {
    const value = String(text);
    // Subscribes to media query changes. When the user enables reduced motion
    // mid-session, the component re-renders and stops the animation.
    const motionOff = usePrefersReducedMotion();
    const [frame, setFrame] = useState(-1);
    const timerRef = useRef(null);

    // Restarting the cascade on a value change is a render-phase reset, not an effect: it keeps the interval the only async writer of `frame` and avoids a cascading render.
    const [shown, setShown] = useState(value);
    if (shown !== value) {
        setShown(value);
        setFrame(-1);
    }

    useEffect(() => {
        if (motionOff) return undefined;

        const last = settleFrame(value.length - 1);
        let f = -1;

        const start = window.setTimeout(() => {
            timerRef.current = window.setInterval(() => {
                f += 1;
                setFrame(f);
                if (f > last) {
                    window.clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            }, STEP_MS);
        }, delay);

        return () => {
            window.clearTimeout(start);
            if (timerRef.current) window.clearInterval(timerRef.current);
        };
    }, [value, delay, motionOff]);

    const drum = digits ? DIGIT_DRUM : DRUM;
    const cellW = Math.round(size * (digits ? 0.60 : 0.62));
    const cellH = Math.round(size * 1.32);

    return (
        <span
            title={title}
            style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                gap: plate ? '2px' : '0px',
                fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                fontWeight: weight,
                letterSpacing: plate ? 0 : track,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                ...style,
            }}
        >
            <span className="fib-sr-only">{value}</span>
            {value.split('').map((ch, i) => {
                const upper = ch.toUpperCase();
                const settled = motionOff || frame >= settleFrame(i);
                const onDrum = drum.includes(upper);
                // A glyph the drum does not carry is printed straight, like a real board's fixed separators.
                const glyph = settled || !onDrum
                    ? upper
                    : drum[Math.abs(frame * 7 + i * 13) % drum.length];
                const blank = upper === ' ';

                return (
                    <span
                        key={`${i}-${upper}`}
                        aria-hidden="true"
                        // The drum's face is a class, not an inline gradient, so one place decides a plate's material.
                        className={plate && !blank ? 'fib-flap-cell' : undefined}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: plate ? `${cellW}px` : undefined,
                            height: plate ? `${cellH}px` : undefined,
                            minWidth: plate ? undefined : (blank ? `${cellW * 0.5}px` : undefined),
                            fontSize: `${size}px`,
                            color: tone,
                            // Mid-shuffle the cell loses a little edge, which sells the movement as mechanical rather than a fade.
                            opacity: settled || !onDrum ? 1 : 0.72,
                            transition: 'opacity 60ms linear',
                        }}
                    >
                        {blank ? ' ' : glyph}
                    </span>
                );
            })}
        </span>
    );
}

// A board label: tracked caps, no drum, no motion. 10px is the floor (the badge case DESIGN.md permits); at 9px it matched the STATUS value and the decision-bearing word read like a column heading.
export function BoardLabel({ children, size = 'var(--fib-board-label-size, 10px)', tone = 'var(--fib-board-label-ink, #7C859C)', weight = 700, style, title }) {
    return (
        <span title={title} style={{
            fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            fontSize: typeof size === 'number' ? `${size}px` : size,
            fontWeight: weight,
            letterSpacing: 'var(--fib-board-label-track, 0.14em)',
            textTransform: 'uppercase',
            color: tone,
            lineHeight: 1,
            whiteSpace: 'nowrap',
            ...style,
        }}>{children}</span>
    );
}

// The row lamp: square, since a dot would be the one circle on the board. `due` differs in FORM, a split lamp (two bars with a gap), not just colour: station amber #FFAA00 is two hundredths from legendary's #FFD700, and the tier hues cannot move. The shape survives greyscale and colour blindness.
export function RowLamp({ state, tone }) {
    if (state === 'due') {
        return (
            <span aria-hidden="true" className="fib-lamp fib-lamp--due">
                <span /><span />
            </span>
        );
    }

    return (
        <span
            aria-hidden="true"
            className="fib-lamp"
            style={state === 'lit'
                ? { background: tone, boxShadow: `0 0 9px ${tone}, inset 0 1px 0 rgba(255,255,255,0.45)` }
                : undefined}
        />
    );
}

// The register's fill meter: a ruled track with a flush fill and a lit top edge, no radius or end cap. `spent` recedes the bar once its row has nothing left to say, so it is loudest where the ratio is still in play.
export function BoardMeter({ value = 0, tone, height = 4, spent = false }) {
    const fill = Math.max(0, Math.min(1, value));

    return (
        <span style={{
            display: 'block',
            position: 'relative',
            width: '100%',
            height: `${height}px`,
            background: 'rgba(0,0,0,0.45)',
            boxShadow: 'inset 0 1px 0 rgba(206,214,236,0.07)',
            overflow: 'hidden',
        }}>
            {/* The start tick: a real 2px mark so an unstarted tier shows something (an empty rail reads as no data). A fixed length, not a floor on scaleX: 0.005 is under half a pixel on this column and survives only by antialiasing. */}
            <span style={{
                position: 'absolute',
                left: 0, top: 0, bottom: 0, width: '2px',
                background: tone,
                opacity: spent ? 0.32 : 0.8,
            }} />
            {/* scaleX, not width: the fill animates on the compositor, and the 1px lit top edge keeps its thickness under a one-axis transform. */}
            <span style={{
                position: 'absolute',
                inset: 0,
                background: tone,
                opacity: spent ? 0.32 : 0.8,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                transformOrigin: 'left center',
                transform: `scaleX(${fill})`,
                transition: 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out',
            }} />
        </span>
    );
}

// A plinth: a square section of the deck's material, shared by the stage flanks, milestone meter and status console. Every visual property is a class (`.fib-plinth` in index.css) because each has a state.
export function Plinth({ children, live, onClick, title, style, className = '', as = 'div', ...rest }) {
    const Tag = as;
    const interactive = typeof onClick === 'function';

    return (
        <Tag
            onClick={onClick}
            title={title}
            className={[
                'fib-plinth',
                live ? 'is-live' : '',
                interactive ? 'fib-board-hit' : '',
                className,
            ].filter(Boolean).join(' ')}
            style={style}
            {...rest}
        >
            {/* Hover is light rising through the plinth, never a repaint: a sibling overlay, so the lift composites over the grain instead of replacing it. */}
            <span aria-hidden="true" className="fib-plinth-lift" />
            {children}
        </Tag>
    );
}

// One control for "pick one of N", in the board's material: a radiogroup, not tabs (no panel is switched). Shared by the collection board and the leaderboard so two controls never end up doing one job with different shapes and keyboard behaviour (DESIGN.md §7).
export function Segmented({ value, onChange, options, label, tone = DECK.amber }) {
    const groupRef = useRef(null);
    const index = options.findIndex(([id]) => id === value);

    // ARIA radiogroup: arrows move the selection and focus, wrapping at both ends, with a single tab stop on the selected option (DESIGN.md §7); other keys are left alone.
    const onKeyDown = (e) => {
        const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1
            : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1
            : 0;
        if (!delta || options.length === 0) return;

        e.preventDefault();
        const from = index < 0 ? 0 : index;
        const next = (from + delta + options.length) % options.length;
        onChange(options[next][0]);
        groupRef.current?.querySelectorAll('[role="radio"]')[next]?.focus();
    };

    return (
        <div ref={groupRef} role="radiogroup" aria-label={label} style={{ display: 'flex' }}>
            {options.map(([id, text], i) => {
                const active = value === id;
                return (
                    <Plinth
                        key={id}
                        as="button"
                        role="radio"
                        aria-checked={active}
                        // One tab stop for the group: the selected option, or the first when nothing matches, so it is never unreachable.
                        tabIndex={active || (index < 0 && i === 0) ? 0 : -1}
                        onKeyDown={onKeyDown}
                        className="fib-board-hit"
                        onClick={() => onChange(id)}
                        live={active}
                        tone={tone}
                        style={{
                            padding: '0 11px', height: '30px',
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                        <BoardLabel tone={active ? tone : 'var(--fib-board-label-ink, #7C859C)'}>{text}</BoardLabel>
                    </Plinth>
                );
            })}
        </div>
    );
}
