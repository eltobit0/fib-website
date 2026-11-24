/*
* THE ARRIVAL - the manifest board: signage inside the theatre frame, hung on two rods (see ArrivalTheatre.jsx),
* built from existing vocabulary (`FlapText` drums, the register row).
*
* Two orders, deliberately separate. REVEAL order is `rows`, sorted smallest first and owned by the theatre: which
* wagon carries whose crate, which row's spins are in the air, when each drum may turn. All four must agree, so one
* array feeds them. DISPLAY order is `printed`: the manifest as the server wrote it (`getPlatform()` is
* `ORDER BY updated_at DESC`), because printing the sorted order spoiled the result before any drum turned.
*
* Rows wait for their own spins: `rowLandsAt` comes from when the crate opens plus the spins' flight time, on the
* SCENE's clock (read from `emitRef`), because three.js loads late and the scene starts its own clock a second late.
*/

import React, { useEffect, useMemo, useState } from 'react';
import { DECK, rail, COLORS } from '../config/constants';
import { FlapText, BoardLabel, BoardMeter } from '../features/collection/FlapBoard.jsx';
import { getDiscordAvatarUrl } from '../../../utils/helpers.js';
import { prefersReducedMotion } from '../../../utils/motion.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useWheelViewport } from '../config/breakpoints.js';
import { Sparkles } from 'lucide-react';

import { rowLandsAt, totalLandsAt, T_IRIS } from './arrivalTimeline.js';

const GRID = '24px minmax(64px, 1fr) minmax(48px, 0.66fr) 44px';

export function ArrivalBoard({ arrival, arrivalCrate, rows, emitRef, rowElsRef }) {
    const { user } = useAuth();
    const { isPhone } = useWheelViewport();
    const [motionOff] = useState(prefersReducedMotion);
    const [landed, setLanded] = useState(() => (motionOff ? rows.length : 0));
    const [totalIn, setTotalIn] = useState(motionOff);

    // Resetting the cascade for a new arrival is a render-phase adjustment, as in `FlapText`; doing it in the effect cascades renders.
    const [shownFor, setShownFor] = useState(arrival);
    if (shownFor !== arrival) {
        setShownFor(arrival);
        setLanded(motionOff ? rows.length : 0);
        setTotalIn(motionOff);
    }

    const n = rows.length;
    useEffect(() => {
        if (motionOff || n === 0) return undefined;

        // The scene's clock when there is one (`emitRef.t` exists once three.js has drawn a frame); otherwise this component's,
        // since the board must still pay out if the chunk never arrives.
        const own = performance.now();
        const last = totalLandsAt(n);
        let raf = 0;
        let running = true;

        const tick = () => {
            if (!running) return;
            const t = emitRef?.current?.t ?? (performance.now() - own) / 1000;
            let count = 0;
            for (let i = 0; i < n; i++) if (t >= rowLandsAt(i, n)) count = i + 1;
            setLanded(v => (v >= count ? v : count));
            if (t >= last) setTotalIn(true);
            if (t > last + 0.2) { running = false; return; }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { running = false; cancelAnimationFrame(raf); };
    }, [arrival, n, motionOff, emitRef]);

    const best = arrival.bestCrate?.crate || 0;
    const maxCrate = arrival.maxCrate || 15;
    const gutter = isPhone ? '14px' : '22px';

    // When this player's own line may show numbers: the beat their row resolves (same beat WheelPage schedules the topbar
    // counter on). `totalIn` is the fallback for a player missing from the public manifest: wait for the whole board rather than leak.
    const myIndex = user ? rows.findIndex(row => row.userId === user.id) : -1;
    const myLineIn = myIndex >= 0 ? landed > myIndex : totalIn;

    // Rows in PRINT order, each carrying its reveal index. `reveal` decides when the drum turns (`landed` counts reveal
    // indices) and is the `rowElsRef` slot the scene's crate projects onto; writing `rowElsRef` by print position would
    // send every stream to the wrong name (the second sort `sortManifest` warns about). Matched on `userId`, not identity,
    // since `sortManifest` sharing entries is an implementation detail of another file.
    const printed = useMemo(() => {
        const byUser = new Map(rows.map((row, reveal) => [row.userId, { row, reveal }]));
        const out = [];
        for (const entry of (arrival.manifest || [])) {
            const hit = byUser.get(entry.userId);
            if (hit) { out.push(hit); byUser.delete(entry.userId); }
        }
        // Unreachable (`rows` is built from the manifest), but a row that exists and is not drawn is a payout with nowhere to land.
        for (const hit of byUser.values()) out.push(hit);
        return out;
    }, [arrival, rows]);

    // The rods are drawn from the frame's top edge, so the body hangs below its pivot and can swing about it.
    const swing = motionOff
        ? undefined
        : `fib-arrival-sign-drop 1.05s cubic-bezier(0.16, 0.9, 0.3, 1) ${T_IRIS + 0.3}s both`;

    return (
        <div
            className="fib-arrival-sign"
            style={{ width: isPhone ? 'min(94%, 400px)' : 'min(92%, 540px)' }}
        >
            <span className="fib-arrival-sign-rod" style={{ left: '19%' }} />
            <span className="fib-arrival-sign-rod" style={{ right: '19%' }} />

            <div
                role="status"
                aria-live="polite"
                aria-label={totalIn
                    ? `A delivery arrived. ${arrival.totalLuckySpins} lucky spins across ${n} ${n === 1 ? 'player' : 'players'}.`
                    : 'A delivery arrived.'}
                className="fib-arrival-sign-body"
                style={{ animation: swing }}
            >
                {/* ── THE HEAD ───────────────────────────────────────────── */}
                <div style={{
                    padding: isPhone ? `12px ${gutter} 0` : `15px ${gutter} 0`,
                    backgroundImage: `linear-gradient(180deg, ${DECK.sky} 0%, transparent 78%)`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ minWidth: 0 }}>
                            <FlapText
                                text="Delivery"
                                size={isPhone ? 19 : 23}
                                tone={DECK.ink}
                                weight={800}
                                plate
                            />
                            <div style={{ marginTop: '6px' }}>
                                <BoardLabel tone={DECK.inkDim}>
                                    {n} {n === 1 ? 'crate' : 'crates'} on the platform
                                </BoardLabel>
                            </div>
                        </div>

                        {/* The total is the SUM and resolves last, after the crates. */}
                        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
                            <FlapText
                                text={totalIn ? String(arrival.totalLuckySpins) : ''}
                                size={isPhone ? 21 : 26}
                                tone={DECK.amber}
                                weight={700}
                                plate
                                digits
                                style={{ justifyContent: 'flex-end', minHeight: isPhone ? 21 : 26 }}
                            />
                            <div style={{ marginTop: '6px' }}>
                                <BoardLabel>Lucky spins</BoardLabel>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '11px' }}>
                        <BoardMeter value={1} tone={DECK.amber} height={3} />
                    </div>
                </div>

                {/* ── THE MANIFEST ───────────────────────────────────────── */}
                <div style={{
                    padding: isPhone ? `2px ${gutter} 12px` : `4px ${gutter} 15px`,
                    background: 'rgba(0,0,0,0.30)',
                    boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
                }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: GRID,
                        alignItems: 'center', gap: '0 11px',
                        padding: '9px 0 5px',
                    }}>
                        <span />
                        <BoardLabel>Player</BoardLabel>
                        <span />
                        <BoardLabel style={{ textAlign: 'right' }}>Spins</BoardLabel>
                    </div>

                    <div role="list">
                        {printed.map(({ row, reveal }) => {
                            const shown = reveal < landed;
                            const isMe = user && user.id === row.userId;
                            const isBest = best > 0 && row.crate === best;

                            return (
                                <div
                                    key={row.userId}
                                    role="listitem"
                                    ref={el => { if (rowElsRef) rowElsRef.current[reveal] = el; }}
                                    className="fib-register-row is-static"
                                    // The label waits with the drum, or a screen reader is handed the whole result while the train is still braking.
                                    aria-label={shown
                                        ? `${row.username}: ${row.crate} lucky spins`
                                        : `${row.username}: waiting for their crate`}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: GRID,
                                        alignItems: 'center', gap: '0 11px',
                                        padding: isPhone ? '7px 0' : '9px 0',
                                    }}
                                >
                                    <img
                                        src={getDiscordAvatarUrl(row.discordId, row.discordAvatar)}
                                        alt=""
                                        width={21}
                                        height={21}
                                        style={{ display: 'block', borderRadius: '50%', background: DECK.faceDeep }}
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                                        }}
                                    />

                                    {/* Names are on the board from the first frame (who is here is known); only the amounts wait for the crates. */}
                                    <span style={{
                                        fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                                        fontSize: isPhone ? '13px' : '15px',
                                        fontWeight: isMe ? 800 : 600,
                                        letterSpacing: '0.04em',
                                        textTransform: 'uppercase',
                                        color: isMe ? DECK.amber : (shown ? DECK.ink : DECK.inkMid),
                                        transition: motionOff ? undefined : 'color 300ms ease-out',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                        {row.username}
                                    </span>

                                    {/* The crate against the biggest this arrival could hold, so a 12 reads as a 12. */}
                                    <BoardMeter
                                        value={shown ? row.crate / maxCrate : 0}
                                        tone={isBest ? DECK.amber : rail(0.35)}
                                        height={4}
                                    />

                                    <FlapText
                                        text={shown ? String(row.crate) : ''}
                                        size={isPhone ? 15 : 17}
                                        tone={isBest ? DECK.amber : DECK.ink}
                                        weight={700}
                                        digits
                                        plate
                                        style={{ justifyContent: 'flex-end', minHeight: isPhone ? 15 : 17 }}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {/* This player's own line: the only place a balance appears (the manifest is public, a running total is private).
                    Rendered from the start and faded in on `myLineIn` so mounting it does not grow the sign and shove the rows mid-cascade. */}
                    {arrivalCrate && (
                        <div
                            aria-hidden={!myLineIn}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '9px',
                                marginTop: '11px', paddingTop: '10px',
                                boxShadow: `inset 0 1px 0 ${rail(0.07)}`,
                                color: COLORS.gold,
                                opacity: myLineIn ? 1 : 0,
                                transition: motionOff ? undefined : 'opacity 420ms ease-out',
                            }}
                        >
                            <Sparkles size={13} />
                            <BoardLabel tone="currentColor">
                                +{arrivalCrate.luckySpinsAwarded} for you
                            </BoardLabel>
                            <BoardLabel tone={DECK.inkDim}>
                                {arrivalCrate.luckySpinsTotal} banked
                            </BoardLabel>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
