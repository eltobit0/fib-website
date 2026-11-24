import React, { useEffect, useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { COLORS, SURFACE_NOISE, Z } from '../config/constants';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { getDiscordAvatarUrl, getItemImageUrl } from '../../../utils/helpers.js';
import { RARITY, getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { serverNow } from '../../../utils/serverClock.js';
import { visibleInterval, useCalm } from '../../../config/power.js';
import { useEventSlotBusy } from './useEventSlotBusy.js';
import './DailyBounty.css';
import './BountyRoom.css';

/*
* THE DAILY BOUNTIES - the plaque naming what is hunted (or when the next hunt opens) and the moment somebody pulls one.
*
* The rules live in wheel-backend services/dailyBounty.js; this file only says so and holds no state.
* ActivityContext owns it, and owns WHEN a claim becomes visible: after the winning reel has landed.
* The identity is a sight (four corners in `COLORS.bounty`, the same mark the reel draws on the tile), not a hue.
*/

const bountyVar = {
    '--bounty': COLORS.bounty,
    '--gilt-pale': COLORS.mysteryGilt[0],
    '--gilt-mid': COLORS.mysteryGilt[1],
    '--gilt-deep': COLORS.mysteryGilt[2],
};

/** "4h 12m", "38m", "under a minute". */
function formatLeft(ms) {
    if (ms <= 60_000) return 'under a minute';
    const mins = Math.floor(ms / 60_000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Re-renders once a minute while visible, for the countdowns. */
function useMinuteTick() {
    const [, setTick] = useState(0);
    useEffect(() => visibleInterval(() => setTick(t => t + 1), 60_000), []);
}

/** The last stretch before a sealed bounty opens, when the plaque says so. */
const IMMINENT_MS = 10 * 60_000;

function Sight({ texture, name, rarity = 'regular', imageUrl = null, size, claimed = false, locking = false, sealed = false }) {
    return (
        <span
            className={`fib-bounty-sight${claimed ? ' is-claimed' : ''}${locking ? ' is-locking' : ''}${sealed ? ' is-sealed' : ''}`}
            style={{ ...bountyVar, width: size, height: size, fontSize: size }}
            title={sealed ? undefined : name}
        >
            {sealed
                ? <b aria-hidden="true">?</b>
                : (
                    <img
                        src={getItemImageUrl({ texture, type: rarity, imageUrl })}
                        alt={name}
                        width={Math.round(size * 0.66)}
                        height={Math.round(size * 0.66)}
                    />
                )}
            <i /><i /><i /><i />
        </span>
    );
}

/** The box, closed: a gilt block with the gift mark. The gilt is the ramp, drifting (fib-mystery-box in DailyBounty.css); see COLORS.mysteryGilt. */
function MysteryBoxGlyph({ size }) {
    return (
        <span className="fib-mystery-box" style={{ width: size, height: size, borderRadius: Math.round(size * 0.18) }} aria-hidden="true">
            <Gift size={Math.round(size * 0.5)} strokeWidth={1.6} color="#3A2708" />
        </span>
    );
}

/**
* Where the day stands: `hunting` (a bounty is open), `waiting` (the next is sealed, the plaque counts down) or
* `done` (every slot has opened). "Next" is the next OPENING until none are left, then the reset.
*/
function readBoard(board, winsToday) {
    const bounties = board.bounties || [];
    const lead = board.bounty || null;
    // A bounty closes when the next one opens (wheel-backend services/dailyBounty.js), so an expired one is out of the
    // hunt; `others` is empty in practice and kept for an older server that could have several open.
    const hunting = bounties.filter(b => !b.winner && !b.expired);
    const state = lead && !lead.winner && !lead.expired ? 'hunting' : board.next ? 'waiting' : 'done';
    const now = serverNow();
    const nextIn = board.next ? Date.parse(board.next.opensAt) - now : null;
    // When the live one stops being claimable: the next opening, or midnight for the last.
    const closesIn = state === 'hunting' && lead.endsAt ? Date.parse(lead.endsAt) - now : null;
    const lastClaimed = [...bounties].reverse().find(b => b.winner) || null;

    return {
        state,
        lead,
        others: state === 'hunting' ? hunting.filter(b => b.id !== lead.id) : [],
        next: board.next,
        nextIn,
        closesIn,
        imminent: state === 'waiting' && nextIn !== null && nextIn <= IMMINENT_MS,
        dayLeft: Date.parse(board.dayEndsAt) - now,
        slots: board.slots || 5,
        winsPerDay: board.winsPerDay || 2,
        capped: winsToday >= (board.winsPerDay || 2),
        claimedCount: bounties.filter(b => b.winner).length,
        expiredCount: bounties.filter(b => b.expired).length,
        lastClaimed,
    };
}

/** The top-right line: when the next one opens, or the day turns over, in the viewer's own zone. */
function whenLabel(view, compact = false) {
    // While one is live, the clock that matters is ITS: it goes when the next opens.
    if (view.state === 'hunting' && view.closesIn !== null) {
        if (view.closesIn <= 60_000) return compact ? 'closing' : 'closing now';
        return `${compact ? '' : 'closes in '}${formatLeft(view.closesIn)}${compact ? ' left' : ''}`;
    }
    if (view.state === 'waiting' && !compact) {
        const at = new Date(Date.parse(view.next.opensAt));
        return `at ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    if (view.next) {
        if (view.nextIn <= 60_000) return compact ? 'any moment' : 'next any moment';
        return `${compact ? '' : 'next in '}${formatLeft(view.nextIn)}`;
    }
    return compact ? `new ${formatLeft(view.dayLeft)}` : `new day in ${formatLeft(view.dayLeft)}`;
}

function plaqueTitle(view) {
    const rules = `${view.slots} bounties a day, each opening at a random time - the next one is announced here, but not what it is until it opens. `
        + `The first player to pull one wins a mystery box: one special item, every special at equal odds. `
        + `Each player can take ${view.winsPerDay} a day. A bounty is only open until the next one opens - then it is gone, claimed or not - and the last one of the day runs to 00:00 UTC.`;

    if (view.state === 'hunting') {
        const { lead } = view;
        const special = lead.rarity && lead.rarity !== 'regular';
        const tier = special ? (RARITY[lead.rarity]?.label || lead.rarity) : null;
        const odds = special
            ? ` It is a ${tier}, so it drops at its own odds - and a lucky spin, which draws every item equally, is the way to chase it.`
            : ' It is a common, so every spin has the same chance at it.';
        const others = view.others.length ? ` Also open: ${view.others.map(b => b.name).join(', ')}.` : '';
        const cap = view.capped ? ` You have taken your ${view.winsPerDay} for today.` : '';
        return `Bounty ${lead.slot + 1} of ${view.slots}: ${lead.name}.${odds}${others}${cap} ${rules}`;
    }
    if (view.state === 'waiting') {
        return `Bounty ${view.next.slot + 1} of ${view.slots} opens in ${formatLeft(view.nextIn)}. ${rules}`;
    }
    const got = view.expiredCount > 0
        ? `${view.claimedCount} of today's bounties were claimed and ${view.expiredCount} got away.`
        : `All of today's bounties have been claimed.`;
    return `${got} New ones from 00:00 UTC, in ${formatLeft(view.dayLeft)}. ${rules}`;
}

/**
* The plaque, in the banner slot beside the milestone meter. When an event owns the slot it steps aside with the
* meter (`useEventSlotBusy`); the bounties stay live underneath. Not a control: the full rules sit in the tooltip.
*/
export function DailyBountyPlaque({ isMobile }) {
    const { bountyBoard, bountyWinsToday } = useActivity();
    const busy = useEventSlotBusy();
    useMinuteTick();

    if (busy || !bountyBoard) return null;

    const view = readBoard(bountyBoard, bountyWinsToday);
    const { state, lead } = view;
    const hunting = state === 'hunting';
    const dim = state === 'done';
    // A special bounty says so in the tier's own ink - it changes how the hunt plays.
    const special = hunting && !!lead.rarity && lead.rarity !== 'regular';
    const tierLabel = special ? (RARITY[lead.rarity]?.label || lead.rarity) : null;
    const tierInk = special ? getRarityInk(lead.rarity) : null;
    const title = plaqueTitle(view);

    const plinth = {
        ...bountyVar,
        backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #0a0d18 100%)`,
    };
    const className = `fib-bounty-plaque${dim ? ' is-claimed' : ''}${view.imminent ? ' is-imminent' : ''}`;

    // The item in the sight: the hunted one, a sealed one, or the day's last claim.
    const shown = hunting ? lead : state === 'done' ? (view.lastClaimed || lead) : null;
    const sight = (size) => (shown
        ? <Sight texture={shown.texture} name={shown.name} rarity={shown.rarity} imageUrl={shown.imageUrl} size={size} claimed={dim} />
        : <Sight size={size} sealed />);

    const eyebrow = hunting
        ? (special ? `${tierLabel} bounty` : `Bounty ${lead.slot + 1}/${view.slots}`)
        : state === 'waiting'
            ? `Bounty ${view.next.slot + 1}/${view.slots}`
            // Some may have closed unclaimed now, so "all claimed" is not a given.
            : view.expiredCount > 0 ? `${view.claimedCount}/${view.slots} claimed` : `All ${view.claimedCount} claimed`;
    const eyebrowInk = dim ? COLORS.textMuted : special ? tierInk : COLORS.bounty;

    // ── The phone: one line, the meter's own compaction ──────────────────
    if (isMobile) {
        const main = hunting
            ? lead.name
            : state === 'waiting'
                ? (view.nextIn <= 60_000 ? 'opening now' : `opens in ${formatLeft(view.nextIn)}`)
                : (view.lastClaimed?.winner?.username || '');
        const side = hunting
            ? (view.others.length ? `+${view.others.length} open` : view.capped ? `got your ${view.winsPerDay}` : whenLabel(view, true))
            : state === 'waiting' ? 'box' : whenLabel(view, true);
        return (
            <div
                className={className}
                title={title}
                style={{ ...plinth, width: '100%', gap: '8px', padding: '6px 16px', zIndex: Z.content }}
            >
                {sight(26)}
                <span className="fib-bounty-eyebrow" style={{ color: eyebrowInk }}>{eyebrow}</span>
                <span style={{
                    flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 700,
                    color: dim ? COLORS.textMuted : COLORS.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {main}
                </span>
                <span style={{ fontSize: '11px', color: COLORS.textMuted, whiteSpace: 'nowrap' }}>
                    {side}
                </span>
            </div>
        );
    }

    // The big line: what is hunted, or how long until the next is.
    const headline = hunting
        ? lead.name
        : state === 'waiting'
            ? (view.nextIn <= 60_000 ? 'Opening now' : `Opens in ${formatLeft(view.nextIn)}`)
            : (view.lastClaimed?.name || '');

    // The small line under it.
    let detail;
    if (hunting && view.capped) {
        detail = <>you have taken your <span style={{ color: COLORS.text, fontWeight: 700 }}>{view.winsPerDay}</span> today</>;
    } else if (hunting && view.others.length > 0) {
        // The others still open, small, in place of the prize line; a fourth line would outgrow the plinth the meter sets.
        detail = (
            <span className="fib-bounty-others">
                <span>also open</span>
                {view.others.map(b => (
                    <Sight key={b.id} texture={b.texture} name={b.name} rarity={b.rarity} imageUrl={b.imageUrl} size={18} />
                ))}
                <span>· <span style={{ color: COLORS.mystery, fontWeight: 700 }}>a box</span> each</span>
            </span>
        );
    } else if (hunting) {
        detail = <>first to pull it wins <span style={{ color: COLORS.mystery, fontWeight: 700 }}>a mystery box</span></>;
    } else if (state === 'waiting' && view.capped) {
        // Worth saying before it opens, not after: the countdown is for the room,
        // and this player would otherwise wait up for one they cannot take.
        detail = <>you have taken your <span style={{ color: COLORS.text, fontWeight: 700 }}>{view.winsPerDay}</span> today</>;
    } else if (state === 'waiting' && view.lastClaimed) {
        detail = <>last: {view.lastClaimed.name}, by <span style={{ color: COLORS.text, fontWeight: 700 }}>{view.lastClaimed.winner.username}</span></>;
    } else if (state === 'waiting') {
        detail = <>what it is stays secret until it opens</>;
    } else {
        const last = view.lastClaimed;
        detail = last
            ? <>by <span style={{ color: COLORS.text, fontWeight: 700 }}>{last.winner.username}</span>{last.box && <> · box held <span style={{ color: COLORS.text }}>{last.box.name}</span></>}</>
            : null;
    }

    return (
        <div
            className={className}
            title={title}
            style={{ ...plinth, width: '300px', padding: '10px 18px 12px', zIndex: Z.content }}
        >
            {sight(54)}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <span className="fib-bounty-eyebrow" style={{ color: eyebrowInk }}>
                        {eyebrow}
                    </span>
                    <span style={{ fontSize: '11px', color: COLORS.textMuted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {whenLabel(view)}
                    </span>
                </span>

                <strong style={{
                    fontSize: '17px', fontWeight: 800, lineHeight: 1.2,
                    color: dim ? COLORS.textMuted : COLORS.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {headline}
                </strong>

                {detail && (
                    <span style={{
                        fontSize: '12px', color: COLORS.textMuted,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {detail}
                    </span>
                )}

            </div>
        </div>
    );
}

/** The motes for the room's celebration: small points of light that rise off the claimed item. Drawn once per claim. */
function makeMotes(count) {
    const colors = [COLORS.bounty, COLORS.bounty, ...COLORS.mysteryGilt.slice(0, 2)];
    return Array.from({ length: count }, (_, i) => {
        const angle = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 70;
        return {
            id: i,
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r * 0.6,
            rise: 120 + Math.random() * 220,
            drift: (Math.random() - 0.5) * 140,
            size: 2 + Math.random() * 4,
            delay: 500 + Math.random() * 2600,
            dur: 1800 + Math.random() * 1800,
            color: colors[i % colors.length],
        };
    });
}

/**
* The claim, for the room. Raised and cleared by ActivityContext once the winning reel has landed; this renders
* `bountyCelebration` and nothing else. No plate: a beam of light onto the item with the sight locking on, a ring,
* a scrim without an edge and rising motes. The sight's corners take no glow (see DailyBounty.css).
*
* Pointer-transparent throughout: this is news about somebody else's spin and must never cost the viewer theirs.
* The winner sees MysteryBoxOpening (mounted by WheelSpinner) instead. Reduced motion keeps the item, ground and words.
*/
export function BountyCelebration({ currentUserId }) {
    const { bountyCelebration } = useActivity();
    const calm = useCalm();

    const winner = bountyCelebration?.winner || null;
    const key = winner ? `${bountyCelebration.id ?? bountyCelebration.day}-${winner.userId}` : null;
    // New motes per claim, not per render.
    const motes = useMemo(() => (key && !calm ? makeMotes(46) : []), [key, calm]);

    if (!winner) return null;
    const mine = currentUserId != null && winner.userId === currentUserId;
    if (mine) return null;

    const special = bountyCelebration.rarity && bountyCelebration.rarity !== 'regular';
    const tierLabel = special ? (RARITY[bountyCelebration.rarity]?.label || bountyCelebration.rarity) : null;

    return (
        <div
            key={key}
            className="fib-bounty-room"
            role="status"
            aria-live="polite"
            style={{ ...bountyVar, zIndex: Z.modal }}
        >
            <span className="fib-bounty-room-dim" aria-hidden="true" />
            <span className="fib-bounty-room-beam" aria-hidden="true" />

            <div className="fib-bounty-room-center">
                <div className="fib-bounty-room-focus">
                    <span className="fib-bounty-room-halo" aria-hidden="true" />
                    <span className="fib-bounty-room-rays" aria-hidden="true" />
                    <span className="fib-bounty-room-ring" aria-hidden="true" />
                    <span className="fib-bounty-room-item">
                        <Sight
                            texture={bountyCelebration.texture}
                            name={bountyCelebration.name}
                            rarity={bountyCelebration.rarity}
                            imageUrl={bountyCelebration.imageUrl}
                            size={116}
                            locking
                        />
                    </span>
                    <span className="fib-bounty-room-motes" aria-hidden="true">
                        {motes.map(m => (
                            <i
                                key={m.id}
                                style={{
                                    left: m.x,
                                    top: m.y,
                                    width: m.size,
                                    height: m.size,
                                    background: m.color,
                                    color: m.color,
                                    '--rise': `${-m.rise}px`,
                                    '--drift': `${m.drift}px`,
                                    animationDelay: `${m.delay}ms`,
                                    animationDuration: `${m.dur}ms`,
                                }}
                            />
                        ))}
                    </span>
                </div>

                <div className="fib-bounty-room-words">
                    <span className="fib-bounty-room-kicker">
                        {special
                            ? <><span style={{ color: getRarityInk(bountyCelebration.rarity) }}>{tierLabel}</span> bounty claimed</>
                            : 'Bounty claimed'}
                    </span>
                    <span className="fib-bounty-room-who">
                        <img
                            src={getDiscordAvatarUrl(winner.discordId, winner.discordAvatar)}
                            alt=""
                            width={40}
                            height={40}
                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                        />
                        <strong data-text={winner.username}>{winner.username}</strong>
                    </span>
                    <span className="fib-bounty-room-what">
                        pulled <b>{bountyCelebration.name}</b> first
                    </span>
                    <span className="fib-bounty-room-prize">
                        <MysteryBoxGlyph size={22} />
                        <span className="fib-gilt-text">wins a mystery box</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
