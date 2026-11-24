// THE ODDS BOARD (DESIGN.md §9): the drop table as a head, three registers and a foot, the collection board's shape. Percentages, counts and odds use the display face (flap drum), never monospace (§3's Mono Rule).
// The ladder has no lamp (every tier is equally true); the events do (THE PARLOUR asks a question). Each event carries an icon from config/eventIcons.js because the Parlour's green and the Community Goal's teal are indistinguishable by hue alone.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { DECK, EVENT_IDENTITY, Z, rail } from '../config/constants';
import { EVENT_ICONS } from '../config/eventIcons.js';
import { RARITY, RARITY_KEYS, getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { FlapText, BoardLabel, RowLamp, BoardMeter, Plinth } from '../features/collection/FlapBoard.jsx';
import { useWheelViewport } from '../config/breakpoints.js';

// The weight pool every drop rate is a fraction of. Mirrors seed.js.
const TOTAL_WEIGHT = 10000000;

// Tiers derived from the shared ladder, not hand-listed. `common` is the remainder, not a weighted tier; `event` drops on a schedule, so a per-spin probability for it would have nothing behind it.
const ODDS_TIERS = RARITY_KEYS.filter(key => key !== 'common' && key !== 'event');

// What the server does, restated for the reader; every value mirrors wheel-backend/src/server/services/globalEvents.js.

const RECURSION = { chance: 0.25, min: 3, max: 8, seconds: 60 };

const BONUS = {
    chance: 0.5,
    outcomes: [
        ['Lucky spin', 40, 'One spin with an equal chance at every item on the wheel.'],
        ['5x spin', 40, 'Five spins, at the normal odds.'],
        ['Triple lucky spin', 20, 'Three lucky spins, back to back.'],
    ],
};

const GLOBAL = {
    minSpins: 300,          // MIN_SPINS_BETWEEN_EVENTS
    maxSpins: 450,          // MAX_SPINS_BETWEEN_EVENTS
    selectSeconds: 4,       // EVENT_SELECTION_DURATION_MS
    countdownSeconds: 5,    // ACTIVATION_DELAY_MS — the three timed events only
};

// The rotation in room order, newest last. `share` is DERIVED from the length (every weight is 1 in `pickEventType`), not typed. `acts` marks the events with a decision in them and drives the lamp; `actsLabel` is read to screen readers in its place.
const EVENTS = [
    {
        key: 'arrival',
        tagline: 'One crate each, then it leaves',
        pays: '5–15',
        runs: '0:20',
        acts: false,
        body: 'A train pulls into the concourse, unloads one crate per player on the platform, and pulls out again. There is no countdown and nothing to do: everyone who has spun in the last ten minutes is on the platform, and every crate pays something. An unlucky crate is 5 or 6; the best a crate pays is 15.',
        figures: [['5–15', 'Per crate'], ['~7', 'Average crate'], ['10 min', 'Platform window']],
        figureLabel: 'Lucky spins',
    },
    {
        key: 'roulette',
        tagline: 'One bet, one wheel, everybody watching',
        pays: '0–30',
        runs: '0:31',
        acts: true,
        actsLabel: 'asks you to place a bet',
        body: 'Roulette, and the only event that asks you a question. Everyone in the room is handed 5 lucky spins as chips and fifteen seconds to place them. Fold and the 5 are yours. Put them on red or black to double them, or on green for six times. Twelve pockets: five red, five black, and two green sitting opposite each other.',
        figures: [['5', 'Fold, certain'], ['10', 'Red or black hits'], ['30', 'Green hits']],
        figureLabel: 'Lucky spins',
        // The one thing about this table a player genuinely cannot work out
        // from the payouts, and the reason the event is worth explaining at all.
        note: 'The stake is house money — you bring nothing to the table, so nobody can lose here, only win less. Green is the only bet the house takes no cut on: it is worth 5.00 lucky spins on average, exactly what folding pays with certainty, while red or black is worth 4.17.',
    },
    {
        key: 'high_roller',
        tagline: 'One hand against the dealer',
        pays: '0–50',
        runs: '0:45',
        acts: true,
        actsLabel: 'asks you to play a hand',
        body: 'Blackjack. Jimbo welcomes the table and shuffles, then everyone in the room is dealt one hand against the same dealer and has twenty seconds to hit or stand. Beat the dealer for 30 lucky spins, tie for 10, and a blackjack - an ace and a ten-card as your first two - pays 50. The dealer draws to 17 and stands on every 17, soft or hard.',
        figures: [['30', 'Win'], ['50', 'Blackjack'], ['10', 'Push']],
        figureLabel: 'Lucky spins',
        note: 'The stake is house money here too: you bring nothing, so a loss costs nothing. Played sensibly a hand is worth about 14.75 lucky spins on average - the most generous event in the rotation. Once every seat has stood the dealer plays straight away, so the table can finish early.',
    },
    {
        key: 'king_of_wheel',
        tagline: 'Highest score wins',
        pays: '6–24',
        runs: '5:00',
        acts: false,
        body: 'Every spin scores. A common is worth 1 point and anything rarer is worth far more — roughly 1,000,000 divided by the item’s weight, so a mythic is worth thousands. Whoever is top when the five minutes are up takes the prize alone.',
        figures: [['1', 'Per common'], ['6–24', 'To the winner'], ['5:00', 'Runs for']],
    },
    {
        key: 'first_blood',
        tagline: 'A race to one drop',
        pays: '9–25',
        runs: '5:00',
        acts: false,
        body: 'The first player to land rare or better wins outright and ends the event on the spot — it does not run its five minutes unless nobody manages it. The rarer the pull, the bigger the reward.',
        figures: [['9–12', 'Rare'], ['13–16', 'Legendary'], ['20–25', 'Insane']],
        figureLabel: 'Lucky spins by what won it',
    },
    {
        key: 'community_goal',
        tagline: 'Everyone against the target',
        pays: '2–14',
        runs: '5:00',
        acts: false,
        body: 'Every spin adds to one shared score, and rarer items add far more. The server climbs three stages together and the target grows with the number of players — but so does what they bring. Iron is pure effort; Gold also needs the server to actually find a special, and Diamond needs two, so no amount of spinning alone takes the top stage. Turning up pays, clearing stages pays more, and nobody competes.',
        figures: [['5', 'Iron'], ['8', 'Gold'], ['14', 'Diamond']],
        figureLabel: 'Lucky spins to every participant',
    },
];

const EVENT_SHARE = `${Math.round(100 / EVENTS.length)}%`;

// What the four ladder figures mean, as a register; `is-static` because a readout row refuses the hover a door earns (§9).
const READING = [
    ['1 in N', 'The average, and nothing more. Over a great many spins you land one every N; it is not a promise about your next N.'],
    ['50%', 'Half of all players have one within this many spins. The other half do not.'],
    ['90%', 'Nine players in ten have one within this many spins.'],
    ['99%', 'Only one player in a hundred needs more spins than this.'],
];

const fmt = n => (n == null ? '—' : n.toLocaleString());

/** "1 in 11,111", or a compacted form once the figure stops being readable. */
function fmtOdds(weight) {
    if (!weight || weight <= 0) return '—';
    const odds = Math.round(TOTAL_WEIGHT / weight);
    if (odds >= 1000000) return `1 in ${(odds / 1000000).toFixed(0)}M`;
    if (odds >= 10000) return `1 in ${Math.round(odds / 1000).toLocaleString()}K`;
    return `1 in ${odds.toLocaleString()}`;
}

// A weight as a percentage at whatever precision keeps it a number: the tiers span five orders of magnitude.
function fmtPercent(weight) {
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0) return '0%';
    const chance = (w / TOTAL_WEIGHT) * 100;
    let str;
    if (chance >= 1) str = chance.toFixed(2);
    else if (chance >= 0.1) str = chance.toFixed(3);
    else if (chance >= 0.01) str = chance.toFixed(4);
    else if (chance >= 0.001) str = chance.toFixed(5);
    else if (chance >= 0.0001) str = chance.toFixed(6);
    else str = chance.toFixed(7);
    return `${str.replace(/\.?0+$/, '')}%`;
}

// Spins needed to be `confidence` sure of one pull (geometric distribution).
function confidenceSpins(weight, confidence) {
    if (!Number.isFinite(weight) || weight <= 0) return null;
    let p = weight / TOTAL_WEIGHT;
    if (p >= 1) return 1;
    if (p <= 0) return null;
    p = Math.min(Math.max(p, Number.EPSILON), 1 - Number.EPSILON);
    const result = Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
    return Number.isFinite(result) ? result : null;
}

// A section heading: more space above than below, so it belongs to what follows (§9).
function Section({ title, children, first = false }) {
    return (
        <section style={{ paddingTop: first ? 0 : '30px' }}>
            <div style={{ paddingBottom: '10px' }}>
                <BoardLabel size={11}>{title}</BoardLabel>
            </div>
            {children}
        </section>
    );
}

// Prose in the inherited UI stack, not the flap face (a caps paragraph goes unread); 13px since these are sentences.
function Prose({ children, tone = DECK.inkMid, style }) {
    return (
        <p style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: 1.65,
            color: tone,
            ...style,
        }}>{children}</p>
    );
}

// The strip of figures in an opened row: divided by a rule, never boxed (§4).
function FigureStrip({ figures, label, tone, size = 18 }) {
    return (
        <div style={{ marginTop: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${figures.length}, 1fr)` }}>
                {figures.map(([value, caption], i) => (
                    <div key={caption} style={{
                        padding: '0 14px',
                        boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                        ...(i === 0 ? { paddingLeft: 0 } : null),
                    }}>
                        <FlapText text={value} size={size} tone={tone} weight={700} />
                        <div style={{ marginTop: '6px' }}>
                            <BoardLabel>{caption}</BoardLabel>
                        </div>
                    </div>
                ))}
            </div>
            {label && (
                <div style={{ marginTop: '9px' }}>
                    <BoardLabel tone={DECK.inkDim}>{label}</BoardLabel>
                </div>
            )}
        </div>
    );
}

// The recess an opened row drops into: one step deeper than the board, with the board's edge as its top seam.
function Drawer({ children, phone }) {
    return (
        <div style={{
            background: 'rgba(0,0,0,0.30)',
            boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
            padding: phone ? '14px 14px 16px' : '16px 18px 18px',
        }}>{children}</div>
    );
}

/** The disclosure mark. One shape for every row on the board that opens. */
function Caret({ open }) {
    return (
        <ChevronDown
            size={13}
            aria-hidden="true"
            style={{
                color: DECK.inkDim,
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 180ms ease-out',
            }}
        />
    );
}

export function OddsInfoModal({ onClose, dynamicItems, allItems }) {
    const { isPhone } = useWheelViewport();
    const scrollRef = useRef(null);
    const [openTier, setOpenTier] = useState(null);
    const [openEvent, setOpenEvent] = useState(null);
    const [openSpin, setOpenSpin] = useState(null);

    // Closes on Escape, as the three sibling boards do.
    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const pool = useMemo(() => {
        const tierWeights = Object.fromEntries(ODDS_TIERS.map(key => [key, 0]));
        let special = 0;

        (dynamicItems || []).forEach(item => {
            const weight = item.weight || 0;
            special += weight;
            if (item.rarity && Object.prototype.hasOwnProperty.call(tierWeights, item.rarity)) {
                tierWeights[item.rarity] += weight;
            }
        });

        const specialCount = dynamicItems?.length || 0;
        const regularCount = allItems?.length || 0;

        return {
            tierWeights,
            special,
            specialCount,
            regularCount,
            totalCount: specialCount + regularCount,
            // The share of the pool that is not a common; the baseline fills to it, and the figure above the line makes a 5% bar read as a fact.
            specialShare: special / TOTAL_WEIGHT,
        };
    }, [dynamicItems, allItems]);

    const ladder = useMemo(() => ODDS_TIERS.map(key => {
        const weight = pool.tierWeights[key];
        const items = (dynamicItems || [])
            .filter(i => i.rarity === key)
            .sort((a, b) => (a.weight || 0) - (b.weight || 0));

        return {
            key,
            label: RARITY[key].label,
            ink: getRarityInk(key),
            tone: RARITY[key].color,
            weight,
            items,
            oneIn: fmtOdds(weight),
            chance: fmtPercent(weight),
            p50: confidenceSpins(weight, 0.5),
            p90: confidenceSpins(weight, 0.9),
            p99: confidenceSpins(weight, 0.99),
            // Against the special pool, not all ten million: as a share of everything every tier rounds to nothing.
            share: pool.special > 0 ? weight / pool.special : 0,
        };
    }).filter(row => row.weight > 0), [pool, dynamicItems]);

    // Opening a row inserts a drawer that moves everything; the scroll position is taken before the change and restored next frame so the clicked row stays under the cursor.
    const toggle = (setter, key) => {
        const top = scrollRef.current?.scrollTop || 0;
        setter(prev => (prev === key ? null : key));
        requestAnimationFrame(() => {
            if (scrollRef.current) scrollRef.current.scrollTop = top;
        });
    };

    // The phone drops CHANCE, 50% and 99% (§9: CHANCE is the reciprocal of a column still shown, 50/99 are the same question at other confidences); all three return in the drawer.
    // Fixed columns are sized on INSANE, not rare: its 99% is 4,605,168 and a flap cell is a fixed 0.60em wide (84px = nine digit cells at 15px; ODDS 96/88 for "1 IN 999K", CHANCE 92px for "0.0001%").
    const ladderTrack = isPhone
        ? 'minmax(0, 1fr) 88px 84px 14px'
        : 'minmax(84px, 1fr) 92px 96px minmax(56px, 0.6fr) 84px 84px 84px 16px';

    const eventTrack = isPhone
        ? '10px 15px minmax(0, 1fr) 62px 14px'
        : '10px 16px minmax(0, 1fr) 54px 74px 60px 16px';

    const head = [
        { value: fmt(pool.totalCount), label: 'Items', tone: DECK.amber },
        { value: fmt(pool.specialCount), label: 'Special', tone: DECK.ink },
        { value: fmt(pool.regularCount), label: 'Common', tone: DECK.ink },
    ];

    return (
        <div
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Drop rates"
            style={{
                position: 'fixed', inset: 0,
                // Scrim ladder's middle step, as on the collection board.
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: Z.modal, padding: isPhone ? '0' : '24px',
                animation: 'fadeIn 0.2s ease-out',
            }}
        >
            <div style={{
                position: 'relative',
                width: '100%', maxWidth: '940px',
                height: isPhone ? '100%' : 'min(88vh, 840px)',
                display: 'flex', flexDirection: 'column',
                backgroundImage: DECK.face,
                // Three edges: a lit top rail and a front lip at the bottom, so the board reads as a thing in the room rather than a region.
                boxShadow: [
                    `inset 0 1px 0 ${rail(0.12)}`,
                    'inset 0 -2px 0 rgba(0,0,0,0.55)',
                    `inset 0 -3px 0 ${rail(0.09)}`,
                    '0 32px 80px rgba(0,0,0,0.65)',
                ].join(', '),
                animation: 'slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                overflow: 'hidden',
            }}>

                <div style={{
                    position: 'relative', flex: '0 0 auto',
                    padding: isPhone ? '16px 16px 0' : '24px 26px 0',
                    backgroundImage: `linear-gradient(180deg, ${DECK.sky} 0%, transparent 78%)`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <FlapText
                            text="Drop Rates"
                            size={isPhone ? 28 : 36}
                            tone={DECK.ink}
                            weight={800}
                            plate
                        />
                        <Plinth
                            as="button"
                            className="fib-board-hit"
                            onClick={onClose}
                            aria-label="Close the drop rates board"
                            style={{
                                width: '36px', height: '36px', flex: '0 0 auto',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: DECK.inkMid,
                            }}
                        ><X size={16} /></Plinth>
                    </div>

                    {/* Two registers at the documented 1.35 ratio: the pool's three counts on drums, the weight figures one step down. */}
                    <div style={{
                        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                        gap: '24px', margin: isPhone ? '14px 0 8px' : '20px 0 8px',
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isPhone ? 'repeat(3, 1fr)' : 'repeat(3, auto)',
                            justifyContent: 'start',
                            flex: isPhone ? '1 1 auto' : '0 0 auto',
                        }}>
                            {head.map((f, i) => (
                                <div key={f.label} style={{
                                    padding: isPhone ? '0 12px' : '0 26px',
                                    boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                                    ...(i === 0 ? { paddingLeft: 0 } : null),
                                }}>
                                    <FlapText
                                        text={f.value}
                                        size={isPhone ? 22 : 27}
                                        tone={f.tone}
                                        weight={700}
                                        plate
                                        delay={60 + i * 40}
                                    />
                                    <div style={{ marginTop: '7px' }}>
                                        <BoardLabel>{f.label}</BoardLabel>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {!isPhone && (
                            <div style={{ display: 'flex', gap: '26px', flex: '0 0 auto' }}>
                                <div style={{ textAlign: 'right' }}>
                                    <FlapText
                                        text="10,000,000" size={20} tone={DECK.inkMid} weight={700}
                                        delay={200} style={{ justifyContent: 'flex-end' }}
                                    />
                                    <div style={{ marginTop: '6px' }}>
                                        <BoardLabel style={{ display: 'block', textAlign: 'right' }}>Weight pool</BoardLabel>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <FlapText
                                        text={fmtPercent(pool.special)} size={20} tone={DECK.amber} weight={700}
                                        delay={240} style={{ justifyContent: 'flex-end' }}
                                    />
                                    <div style={{ marginTop: '6px' }}>
                                        <BoardLabel style={{ display: 'block', textAlign: 'right' }}>Is special</BoardLabel>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* The platform line: baseline filled to the non-common share; the figure above it labels it, and on a phone the caption below does. */}
                    <BoardMeter value={pool.specialShare} tone={DECK.amber} height={3} />

                    <div style={{ padding: isPhone ? '12px 0 2px' : '14px 0 2px' }}>
                        {/* The phone has no room for the weight figures, so the one the line fills to is said in words. */}
                        <Prose tone={DECK.inkDim} style={{ fontSize: '12px' }}>
                            Every item carries a weight, and its drop rate is that weight over the
                            pool of 10,000,000.{' '}
                            {isPhone
                                ? `Special items hold ${fmtPercent(pool.special)} of the pool between them; the commons share what is left.`
                                : 'Everything that is not a special item is a common, and the commons share what is left.'}
                        </Prose>
                    </div>
                </div>

                {/* ── THE REGISTERS ───────────────────────────────────────────── */}
                <div
                    ref={scrollRef}
                    className="fib-board-scroll"
                    style={{
                        flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                        padding: isPhone ? '18px 16px 24px' : '22px 26px 28px',
                    }}
                >
                    {/* ── THE LADDER ──────────────────────────────────────────── */}
                    <Section title="Drop rates by rarity" first>
                        <div style={{
                            display: 'grid', gridTemplateColumns: ladderTrack,
                            alignItems: 'center', gap: '0 12px', padding: '0 0 8px',
                        }}>
                            <BoardLabel>Tier</BoardLabel>
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Chance</BoardLabel>}
                            <BoardLabel style={{ textAlign: 'right' }}>Odds</BoardLabel>
                            {!isPhone && <BoardLabel>Of specials</BoardLabel>}
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>50%</BoardLabel>}
                            <BoardLabel style={{ textAlign: 'right' }}>90%</BoardLabel>
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>99%</BoardLabel>}
                            <span />
                        </div>

                        {ladder.map((row, i) => {
                            const open = openTier === row.key;
                            const hasItems = row.items.length > 0;

                            return (
                                <React.Fragment key={row.key}>
                                    <button
                                        type="button"
                                        className={[
                                            'fib-register-row',
                                            i > 0 ? 'has-seam' : '',
                                            hasItems ? 'fib-board-hit' : 'is-static',
                                            open ? 'is-active' : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => hasItems && toggle(setOpenTier, row.key)}
                                        aria-expanded={hasItems ? open : undefined}
                                        disabled={!hasItems}
                                        aria-label={[
                                            row.label,
                                            `${row.chance} per spin, ${row.oneIn}`,
                                            `half of players within ${fmt(row.p50)} spins`,
                                            `nine in ten within ${fmt(row.p90)}`,
                                            `ninety-nine in a hundred within ${fmt(row.p99)}`,
                                            hasItems ? `${row.items.length} items` : null,
                                        ].filter(Boolean).join('. ')}
                                        style={{
                                            display: 'grid', gridTemplateColumns: ladderTrack,
                                            alignItems: 'center', gap: '0 12px',
                                            width: '100%', padding: isPhone ? '9px 0' : '12px 0',
                                            border: 'none', textAlign: 'left', font: 'inherit',
                                            // Only the tier's wash and base bar are per-tier values; the states are in index.css (§9).
                                            '--fib-row-wash': `${row.tone}14`,
                                            '--fib-row-tone': row.tone,
                                        }}
                                    >
                                        <FlapText
                                            text={row.label} size={isPhone ? 15 : 16}
                                            tone={row.ink} weight={700}
                                            delay={280 + i * 55}
                                        />
                                        {!isPhone && (
                                            <FlapText
                                                text={row.chance} size={15} tone={DECK.inkMid}
                                                delay={295 + i * 55}
                                                style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        <FlapText
                                            text={row.oneIn} size={isPhone ? 14 : 15} tone={DECK.ink} weight={700}
                                            delay={310 + i * 55}
                                            style={{ justifyContent: 'flex-end' }}
                                        />
                                        {!isPhone && <BoardMeter value={row.share} tone={row.tone} />}
                                        {!isPhone && (
                                            <FlapText
                                                text={fmt(row.p50)} digits size={15} tone={DECK.inkMid}
                                                delay={325 + i * 55}
                                                style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        <FlapText
                                            text={fmt(row.p90)} digits size={15} tone={DECK.inkMid}
                                            delay={340 + i * 55}
                                            style={{ justifyContent: 'flex-end' }}
                                        />
                                        {!isPhone && (
                                            <FlapText
                                                text={fmt(row.p99)} digits size={15} tone={DECK.inkMid}
                                                delay={355 + i * 55}
                                                style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        {hasItems ? <Caret open={open} /> : <span />}
                                    </button>

                                    {open && (
                                        <Drawer phone={isPhone}>
                                            {/* The three columns the phone dropped, given back
                                                where there is room for them. */}
                                            {isPhone && (
                                                <div style={{ marginBottom: '14px' }}>
                                                    {/* 15px, not 18: seven-figure numbers in a third of a phone's width (18px makes a nine-digit figure 99px against a 96px column). */}
                                                    <FigureStrip
                                                        figures={[[row.chance, 'Chance'], [fmt(row.p50), '50%'], [fmt(row.p99), '99%']]}
                                                        tone={row.ink}
                                                        size={15}
                                                    />
                                                </div>
                                            )}
                                            <div style={{ paddingBottom: '8px' }}>
                                                <BoardLabel>{`${row.items.length} ${row.label} item${row.items.length === 1 ? '' : 's'}`}</BoardLabel>
                                            </div>
                                            {row.items.map((item, idx) => (
                                                <div
                                                    key={item.id || item.name || idx}
                                                    className={`fib-register-row is-static${idx > 0 ? ' has-seam' : ''}`}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        gap: '12px', padding: '7px 0',
                                                    }}
                                                >
                                                    {/* The item's name in the display face, not on a drum: a cascade on a list of forty is the board shouting (§9). */}
                                                    <span style={{
                                                        fontSize: '13px', color: DECK.inkMid,
                                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }}>{item.name}</span>
                                                    <span style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flex: '0 0 auto' }}>
                                                        <BoardLabel tone={DECK.inkDim}>{fmt(item.weight)}</BoardLabel>
                                                        <BoardLabel tone={row.ink} size={11}>{fmtPercent(item.weight)}</BoardLabel>
                                                    </span>
                                                </div>
                                            ))}
                                        </Drawer>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        <div style={{ paddingTop: '12px' }}>
                            <Prose tone={DECK.inkDim} style={{ fontSize: '12px' }}>
                                Event items are not on this ladder. They arrive on a schedule rather
                                than against the weight pool, so a per-spin chance for one would be a
                                number with nothing behind it.
                            </Prose>
                        </div>
                    </Section>

                    {/* ── READING THE NUMBERS ─────────────────────────────────── */}
                    <Section title="Reading the numbers">
                        {READING.map(([term, meaning], i) => (
                            <div
                                key={term}
                                className={`fib-register-row is-static${i > 0 ? ' has-seam' : ''}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: isPhone ? '58px minmax(0, 1fr)' : '92px minmax(0, 1fr)',
                                    alignItems: 'baseline', gap: '0 14px',
                                    padding: '11px 0',
                                }}
                            >
                                <BoardLabel size={11} tone={DECK.ink}>{term}</BoardLabel>
                                <Prose>{meaning}</Prose>
                            </div>
                        ))}

                        {/* The one warning on the board takes the board's one signal colour; no tier is here to confuse it with. */}
                        <div style={{ marginTop: '18px' }}>
                            <BoardLabel tone={DECK.amber}>The gambler’s fallacy</BoardLabel>
                            <Prose style={{ marginTop: '7px' }}>
                                Every spin is independent. Past spins do not change future ones, and
                                being “due” for a drop is a myth — the odds reset every single spin.
                                The figures above describe a great many players, never your next
                                pull.
                            </Prose>
                        </div>
                    </Section>

                    {/* ── PER-SPIN EVENTS ─────────────────────────────────────── */}
                    <Section title="On your own spins">
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: isPhone ? 'minmax(0, 1fr) 56px 14px' : 'minmax(0, 1fr) 66px 80px 16px',
                            alignItems: 'center', gap: '0 12px', padding: '0 0 8px',
                        }}>
                            <BoardLabel>What</BoardLabel>
                            <BoardLabel style={{ textAlign: 'right' }}>Chance</BoardLabel>
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Pays</BoardLabel>}
                            <span />
                        </div>

                        {[
                            {
                                key: 'bonus',
                                name: 'Bonus wheel',
                                chance: `${BONUS.chance}%`,
                                pays: '1–5 spins',
                                body: 'A second wheel opens on top of the first, carrying three outcomes rather than items.',
                                rows: BONUS.outcomes,
                            },
                            {
                                key: 'recursion',
                                name: 'Recursion',
                                chance: `${RECURSION.chance}%`,
                                pays: `${RECURSION.min}–${RECURSION.max} spins`,
                                body: `The wheel within the wheel, and it fires for everyone online at once rather than for the player who triggered it. Every active player is handed ${RECURSION.min}–${RECURSION.max} lucky spins and ${RECURSION.seconds} seconds to use them.`,
                                figures: [[`${RECURSION.min}–${RECURSION.max}`, 'Lucky spins'], [`${RECURSION.seconds}s`, 'To use them']],
                            },
                        ].map((row, i) => {
                            const open = openSpin === row.key;
                            return (
                                <React.Fragment key={row.key}>
                                    <button
                                        type="button"
                                        className={`fib-register-row fib-board-hit${i > 0 ? ' has-seam' : ''}${open ? ' is-active' : ''}`}
                                        onClick={() => toggle(setOpenSpin, row.key)}
                                        aria-expanded={open}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: isPhone ? 'minmax(0, 1fr) 56px 14px' : 'minmax(0, 1fr) 66px 80px 16px',
                                            alignItems: 'center', gap: '0 12px',
                                            width: '100%', padding: isPhone ? '9px 0' : '12px 0',
                                            border: 'none', textAlign: 'left', font: 'inherit',
                                            '--fib-row-wash': `${DECK.amber}12`,
                                            '--fib-row-tone': DECK.amber,
                                        }}
                                    >
                                        <FlapText text={row.name} size={isPhone ? 15 : 16} tone={DECK.ink} weight={700} delay={120 + i * 55} />
                                        <FlapText
                                            text={row.chance} size={15} tone={DECK.amber} weight={700}
                                            delay={140 + i * 55} style={{ justifyContent: 'flex-end' }}
                                        />
                                        {!isPhone && (
                                            <FlapText
                                                text={row.pays} size={15} tone={DECK.inkMid}
                                                delay={160 + i * 55} style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        <Caret open={open} />
                                    </button>

                                    {open && (
                                        <Drawer phone={isPhone}>
                                            <Prose>{row.body}</Prose>
                                            {row.rows && (
                                                <div style={{ marginTop: '12px' }}>
                                                    {row.rows.map(([name, pct, what], idx) => (
                                                        <div
                                                            key={name}
                                                            className={`fib-register-row is-static${idx > 0 ? ' has-seam' : ''}`}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: isPhone ? 'minmax(0, 1fr) 46px' : '140px minmax(0, 1fr) 46px',
                                                                alignItems: 'baseline', gap: '0 12px', padding: '9px 0',
                                                            }}
                                                        >
                                                            <BoardLabel size={11} tone={DECK.ink}>{name}</BoardLabel>
                                                            {!isPhone && <Prose style={{ fontSize: '12px' }}>{what}</Prose>}
                                                            <BoardLabel tone={DECK.amber} style={{ display: 'block', textAlign: 'right' }}>{`${pct}%`}</BoardLabel>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {row.figures && <FigureStrip figures={row.figures} tone={DECK.amber} />}
                                            <div style={{ marginTop: '12px' }}>
                                                <Prose tone={DECK.inkDim} style={{ fontSize: '12px' }}>
                                                    A lucky spin is an equal chance at every item on the wheel —
                                                    including insane. A 5x spin is five ordinary spins.
                                                </Prose>
                                            </div>
                                        </Drawer>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </Section>

                    {/* ── GLOBAL EVENTS ───────────────────────────────────────── */}
                    <Section title="Global events">
                        <Prose style={{ marginBottom: '16px' }}>
                            Every {GLOBAL.minSpins}–{GLOBAL.maxSpins} spins across the whole server, a
                            wheel spins for {GLOBAL.selectSeconds} seconds and lands on one of these
                            six. It is not tied to your spins or to your luck — everyone online gets
                            the same event at the same moment. The three five-minute events open after
                            a {GLOBAL.countdownSeconds} second countdown; The Arrival, The Parlour and
                            High Roller start on the spot.
                        </Prose>

                        <div style={{
                            display: 'grid', gridTemplateColumns: eventTrack,
                            alignItems: 'center', gap: '0 12px', padding: '0 0 8px',
                        }}>
                            <span />
                            <span />
                            <BoardLabel>Event</BoardLabel>
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Share</BoardLabel>}
                            <BoardLabel style={{ textAlign: 'right' }}>Pays</BoardLabel>
                            {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Runs</BoardLabel>}
                            <span />
                        </div>

                        {EVENTS.map((event, i) => {
                            const id = EVENT_IDENTITY[event.key];
                            const open = openEvent === event.key;
                            const Icon = EVENT_ICONS[event.key];

                            return (
                                <React.Fragment key={event.key}>
                                    <button
                                        type="button"
                                        className={`fib-register-row fib-board-hit${i > 0 ? ' has-seam' : ''}${open ? ' is-active' : ''}`}
                                        onClick={() => toggle(setOpenEvent, event.key)}
                                        aria-expanded={open}
                                        aria-label={[
                                            id.name,
                                            event.tagline,
                                            `${EVENT_SHARE} of triggers`,
                                            `pays ${event.pays} lucky spins`,
                                            `runs ${event.runs}`,
                                            event.acts ? event.actsLabel : null,
                                        ].filter(Boolean).join('. ')}
                                        style={{
                                            display: 'grid', gridTemplateColumns: eventTrack,
                                            alignItems: 'center', gap: '0 12px',
                                            width: '100%', padding: isPhone ? '9px 0' : '12px 0',
                                            border: 'none', textAlign: 'left', font: 'inherit',
                                            '--fib-row-wash': `${id.color}14`,
                                            '--fib-row-tone': id.color,
                                        }}
                                    >
                                        {/* Lit on the events with a decision in them. See
                                            the header for why the ladder above has none. */}
                                        <RowLamp state={event.acts ? 'lit' : 'dark'} tone={id.color} />
                                        <Icon size={15} color={id.color} aria-hidden="true" />
                                        <FlapText
                                            text={id.name} size={isPhone ? 14 : 16}
                                            tone={id.color} weight={700}
                                            delay={140 + i * 55}
                                            style={{ minWidth: 0, overflow: 'hidden' }}
                                        />
                                        {!isPhone && (
                                            <FlapText
                                                text={EVENT_SHARE} size={15} tone={DECK.inkMid}
                                                delay={160 + i * 55} style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        <FlapText
                                            text={event.pays} size={15} tone={DECK.ink} weight={700}
                                            delay={175 + i * 55} style={{ justifyContent: 'flex-end' }}
                                        />
                                        {!isPhone && (
                                            <FlapText
                                                text={event.runs} size={15} tone={DECK.inkMid}
                                                delay={190 + i * 55} style={{ justifyContent: 'flex-end' }}
                                            />
                                        )}
                                        <Caret open={open} />
                                    </button>

                                    {open && (
                                        <Drawer phone={isPhone}>
                                            <BoardLabel tone={id.color}>{event.tagline}</BoardLabel>
                                            <Prose style={{ marginTop: '9px' }}>{event.body}</Prose>
                                            <FigureStrip
                                                figures={event.figures}
                                                label={event.figureLabel}
                                                tone={id.color}
                                            />
                                            {event.note && (
                                                <div style={{ marginTop: '14px', paddingTop: '12px', boxShadow: `inset 0 1px 0 ${rail(0.07)}` }}>
                                                    <Prose tone={DECK.inkDim} style={{ fontSize: '12px' }}>{event.note}</Prose>
                                                </div>
                                            )}
                                            {isPhone && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <BoardLabel tone={DECK.inkDim}>{`${EVENT_SHARE} of triggers · runs ${event.runs}`}</BoardLabel>
                                                </div>
                                            )}
                                        </Drawer>
                                    )}
                                </React.Fragment>
                            );
                        })}

                        <div style={{ paddingTop: '12px' }}>
                            <Prose tone={DECK.inkDim} style={{ fontSize: '12px' }}>
                                Lucky spins won from any event give an equal chance at every item on
                                the wheel — including insane.
                            </Prose>
                        </div>
                    </Section>
                </div>

                {/* ── THE FOOT ────────────────────────────────────────────────── */}
                <div style={{
                    flex: '0 0 auto',
                    padding: isPhone ? '11px 16px' : '12px 26px',
                    boxShadow: `inset 0 1px 0 ${rail(0.07)}`,
                    background: 'rgba(0,0,0,0.22)',
                }}>
                    <BoardLabel tone={DECK.inkDim}>
                        Every spin is rolled server-side · Provably fair
                    </BoardLabel>
                </div>
            </div>
        </div>
    );
}

export default OddsInfoModal;
