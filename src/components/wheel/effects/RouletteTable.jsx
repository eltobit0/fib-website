/*
* THE PARLOUR - the table: countdown, the three colours, the room's bets and the payout board.
*
* The one overlay that takes input: only the BUTTONS take pointer events; the frame, wheel,
* seat rail and veils stay transparent so chat, nav and the collection stay reachable.
*
* The countdown is only a picture of `betsCloseAt`: `placeRouletteBet` re-checks the window
* server-side, so a slow client clock gets a 409 rather than a bet accepted after the roll.
*/

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../../../config/constants.js';
import { COLORS } from '../config/constants';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useSound } from '../../../context/SoundContext.jsx';
import { getDiscordAvatarUrl } from '../../../utils/helpers.js';
import { serverNow } from '../../../utils/serverClock.js';
import {
    T_TURN, T_CALL, T_REVEAL, COLOURS, BRASS, BRASS_INK, CARD_IVORY,
    seatResolvesAt, totalResolvesAt, shade, glow,
} from './rouletteTimeline.js';

const ORDER = ['red', 'black', 'green'];

/**
* The table's own column. Desktop: centred under the band, controls chip-tray sized rather than
* inheriting the full-bleed frame width. Phone (DESIGN.md §8): the shaft fills the viewport and the
* wheel shell does not scroll, so an apron row fell below the fold (y=846 at 390x844); the table is
* a fixed tray above the tab bar instead, transparent to touch except on the plaques.
*/
const PHONE_TAB_BAR = 56;

const tableBox = (isMobile) => (isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: PHONE_TAB_BAR + 8,
        // Above the reel and its overlays, below the banners and the tab bar.
        zIndex: 12,
        width: '100%',
        maxWidth: 640,
        margin: '0 auto',
        padding: '14px 12px 12px',
        boxSizing: 'border-box',
        // The tray reads out of the shaft: no edge, just the room getting denser toward the bottom.
        background: 'linear-gradient(180deg, rgba(28,4,7,0) 0%, rgba(28,4,7,0.82) 26%, rgba(28,4,7,0.93) 100%)',
        pointerEvents: 'none',
    }
    : {
        width: '100%',
        maxWidth: 510,
        margin: '0 auto',
        padding: '0 22px 18px',
        boxSizing: 'border-box',
    });

/**
* The seats, shortest odds first, then by name so it is stable against server enumeration.
* Keep in step with the arrival's `sortManifest`: two things index into this array, and a second sort would pair a row with somebody else's money.
*/
function sortSeats(seats) {
    return [...seats].sort(
        (a, b) => (a.payout ?? 0) - (b.payout ?? 0)
            || String(a.username).localeCompare(String(b.username))
    );
}

/**
* The table's container; on a phone it portals to `document.body`. `position: fixed` alone failed
* because the apron's ancestor (`position: relative; z-index: 1`) is a stacking context, so the
* tray painted under the shaft's canvas while looking correct in the DOM. THE ARRIVAL's theatre
* portals for the same reason.
*/
function Tray({ isMobile, style, className, children }) {
    const tray = <div className={className} style={{ ...tableBox(isMobile), ...style }}>{children}</div>;
    return isMobile ? createPortal(tray, document.body) : tray;
}

function Avatar({ seat, size = 26, ring }) {
    return (
        <img
            src={getDiscordAvatarUrl(seat.discordId, seat.discordAvatar, 64)}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            style={{
                width: size, height: size, borderRadius: '50%', display: 'block',
                border: `1.5px solid ${ring || 'rgba(255,255,255,0.18)'}`,
                background: COLORS.bg,
            }}
        />
    );
}

/**
* One colour's plaque and the chip pile on it. Edge and face are two layers wearing the same
* chamfer. Hover, focus-visible and active live in `.fib-parlour-plaque` (inline styles cannot
* express them); the pocket colour arrives as a custom property. The pile is faces, not a count,
* because the question in the last seconds is whether to join them.
*/
function BetButton({ colour, multiplier, seats, mine, locked, onPick }) {
    const c = COLOURS[colour];
    const chosen = mine === colour;
    const [pressed, setPressed] = useState(false);

    return (
        <button
            type="button"
            className="fib-parlour-plaque"
            data-chosen={chosen ? 'true' : 'false'}
            data-settling={pressed ? 'true' : undefined}
            onAnimationEnd={() => setPressed(false)}
            disabled={locked}
            onClick={() => { setPressed(true); onPick(chosen ? null : colour); }}
            aria-pressed={chosen}
            aria-label={`Bet on ${c.label}, pays ${multiplier} times${chosen ? ' — your bet' : ''}`}
            style={{
                '--c': c.hex,
                '--c-top': shade(c.hex, -0.65),
                '--c-lo': shade(c.hex, -0.45),
                '--c-glow': glow(c.hex, 0.55),
                // All three words are ivory: the only step that clears AA on all three lacquers. The pocket's ink stays on the payout board (§8).
                '--ink': chosen ? '#FFFFFF' : CARD_IVORY,
            }}
        >
            <span className="fib-parlour-plaque-edge" aria-hidden="true" />
            <span className="fib-parlour-plaque-face" aria-hidden="true" />

            <span className="fib-parlour-plaque-body">
                <span className="fib-parlour-bet-chip" aria-hidden="true" />
                <span className="fib-parlour-plaque-label">{c.label}</span>
                {/* "PAYS 6×" (multiplication sign): the multiplier is the one number a player must reason about before the clock runs out. */}
                <span className="fib-parlour-plaque-odds">PAYS {multiplier}×</span>

                <span style={{
                    gridColumn: '1 / -1',
                    display: 'flex', justifyContent: 'center', minHeight: 20, marginTop: 4,
                    paddingLeft: seats.length ? 8 : 0,
                }}>
                    {seats.slice(0, 5).map(s => (
                        <span key={s.userId} style={{ marginLeft: -8, display: 'block' }}>
                            <Avatar seat={s} size={20} ring={BRASS} />
                        </span>
                    ))}
                    {seats.length > 5 && (
                        <span style={{
                            marginLeft: -4, fontSize: 10, fontWeight: 800, alignSelf: 'center',
                            color: BRASS_INK,
                        }}>
                            +{seats.length - 5}
                        </span>
                    )}
                </span>
            </span>
        </button>
    );
}

function RouletteTable({
    table, result, payout, stake, multipliers, betsCloseAt, myBet, onBet, t, isMobile,
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const { playSfx } = useSound();
    const { user } = useAuth();
    const requestRef = useRef(false);
    const awaitingTableRef = useRef(false);
    // Keyed by deadline so a new table starts untouched. An untouched seat settles `away` for nothing, so
    // KEEP must not look chosen until pressed; the server's `acted` is authoritative, this covers the gap.
    const [touchedTable, setTouchedTable] = useState(null);

    // Broadcasts are authoritative, but must not overwrite an in-flight choice.
    useEffect(() => {
        if (!table || !user?.id || (requestRef.current && !awaitingTableRef.current)) return;
        onBet(table.seats?.find(seat => seat.userId === user.id)?.bet ?? null);
        if (awaitingTableRef.current) {
            awaitingTableRef.current = false;
            requestRef.current = false;
            setBusy(false);
            setError(null);
        }
    }, [table, user?.id, onBet]);

    const locked = t >= T_CALL || Boolean(result);

    // Fired on the edge, not the state: this re-renders four times a second and a condition-tied sound would play that often.
    const firedRef = useRef({ call: t >= T_CALL, reveal: t >= T_REVEAL });
    useEffect(() => {
        const fired = firedRef.current;
        if (!fired.call && t >= T_CALL) {
            fired.call = true;
            playSfx?.('parlour_call');
        }
        if (!fired.reveal && result && t >= T_REVEAL) {
            fired.reveal = true;
            playSfx?.('parlour_reveal');
            // Only if it was YOUR pocket. The bell is the room's; this is yours,
            // and it lands after the bell rather than under it.
            if (payout?.outcome === 'hit') {
                setTimeout(() => playSfx?.('event_win'), 430);
            }
        }
    }, [t, result, payout, playSfx]);

    const pick = useCallback(async (colour) => {
        if (locked || busy || requestRef.current) return;
        const previousBet = myBet?.bet ?? null;
        requestRef.current = true;
        setBusy(true);
        setError(null);
        playSfx?.('parlour_chip');
        onBet(colour);
        setTouchedTable(betsCloseAt);
        try {
            const res = await fetch(`${API_BASE_URL}/api/roulette/bet`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ colour }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                // The API explicitly refuses bets with 409; auth failures also
                // happen before the bet is placed. A 5xx may follow a mutation.
                if ([401, 403, 409].includes(res.status)) {
                    setError(body.error || 'That bet did not land');
                    onBet(previousBet);
                } else {
                    throw new Error('Unconfirmed bet');
                }
            }
        } catch {
            setError('Confirming your bet...');
            try {
                const res = await fetch(`${API_BASE_URL}/api/global-event/status`, {
                    credentials: 'include', cache: 'no-store',
                });
                if (!res.ok) throw new Error('Table unavailable');
                const state = await res.json();
                if (state?.type !== 'roulette' || state.data?.betsCloseAt !== betsCloseAt
                    || !Array.isArray(state.data?.seats) || !user?.id) {
                    throw new Error('Table unavailable');
                }
                onBet(state.data.seats.find(seat => seat.userId === user.id)?.bet ?? null);
                setError(null);
            } catch {
                // Keep the choice pending until an authoritative broadcast arrives.
                awaitingTableRef.current = true;
                setError('Bet unconfirmed. Waiting for the table...');
            }
        } finally {
            if (!awaitingTableRef.current) {
                requestRef.current = false;
                setBusy(false);
            }
        }
    }, [locked, busy, myBet, onBet, playSfx, betsCloseAt, user?.id]);

    const byColour = useMemo(() => {
        const map = { red: [], black: [], green: [], fold: [], away: [] };
        for (const s of table?.seats || []) map[s.bet || (s.acted ? 'fold' : 'away')].push(s);
        return map;
    }, [table]);
    const keptChosen = !myBet?.bet && (touchedTable === betsCloseAt
        || Boolean(table?.seats?.find(seat => seat.userId === user?.id)?.acted));

    /* ── after the ball: the payout board ─────────────────────────────────── */
    if (result && t >= T_REVEAL) {
        const rows = sortSeats(result.results || []);
        const pocket = COLOURS[result.pocket?.colour] || COLOURS.black;
        // The player's line comes from the PRIVATE payout message, so this component never needs to know which seat is its own.
        const mine = payout;

        const totalShown = t >= totalResolvesAt(rows.length);
        const award = mine?.luckySpinsAwarded;
        const headline = mine?.outcome === 'hit' ? 'You called it'
            : mine?.outcome === 'fold' ? 'You kept your spins'
            : mine?.outcome === 'away' ? 'You sat out'
                : mine?.outcome === 'loss' ? 'Not this time' : 'The wheel has landed';
        const amount = Number.isFinite(award) ? award.toLocaleString() : null;

        return (
            <Tray isMobile={isMobile} className="fib-parlour-result-tray" style={{
                maxHeight: isMobile ? 'min(52dvh, 360px)' : undefined,
                minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column',
                pointerEvents: 'auto',
                paddingBottom: isMobile ? 12 : 8,
            }}>
                <div className="fib-parlour-settlement" data-outcome={mine?.outcome || 'spectator'}>
                    <div className="fib-parlour-result-hero" role="status">
                        <div className="fib-parlour-winning-pocket" style={{
                            '--pocket': pocket.hex, '--pocket-ink': pocket.ink,
                        }}>
                            <strong>{result.pocket?.n ?? '?'}</strong>
                            <span>{pocket.label}</span>
                        </div>
                        <div className="fib-parlour-award">
                            <div className="fib-parlour-result-caption">{headline}</div>
                            <div className="fib-parlour-award-value">
                                {amount !== null ? (
                                    <><strong>{award > 0 ? '+' : ''}{amount}</strong><span>lucky spins</span></>
                                ) : <strong className="fib-parlour-public-result">{pocket.label} wins</strong>}
                            </div>
                            <div className="fib-parlour-result-note">
                                {mine?.outcome === 'hit' ? 'Your colour came in.'
                                    : mine?.outcome === 'fold' ? 'Your spins stayed with you.'
                                    : mine?.outcome === 'away' ? 'Pick a colour or press KEEP to be paid.'
                                        : mine?.outcome === 'loss' ? (
                                            result.pocket?.colour === 'green' && mine.bet !== 'green'
                                                ? 'The house pocket takes this round.' : 'Your colour did not land.'
                                        ) : 'The table is settling.'}
                            </div>
                        </div>
                    </div>
                    <div className="fib-parlour-payout-heading">
                        <span>AT THE TABLE</span><span>LUCKY SPINS</span>
                    </div>
                    <div className="fib-parlour-payout-list" role="region" aria-label="Player payouts" tabIndex={0}>
                        {rows.length === 0 && <div className="fib-parlour-payout-empty">No player results this round</div>}
                        {rows.map((r, i) => {
                            const shown = t >= seatResolvesAt(i, rows.length);
                            const c = COLOURS[r.bet];
                            return (
                                <div key={r.userId} className="fib-parlour-payout-row"
                                    data-shown={shown} data-outcome={r.outcome} aria-hidden={!shown}>
                                    <Avatar seat={r} size={24} ring={c?.ink} />
                                    <span className="fib-parlour-player-name" title={r.username}>{r.username}</span>
                                    <span className="fib-parlour-player-bet" style={{ color: c?.ink || '#c6aaa0' }}>
                                        {c?.label || (r.outcome === 'away' ? 'AWAY' : 'KEPT')}
                                    </span>
                                    <strong className="fib-parlour-player-payout">
                                        {r.payout > 0 ? '+' + r.payout.toLocaleString() : '0'}
                                    </strong>
                                </div>
                            );
                        })}
                    </div>
                    <div className="fib-parlour-payout-total" aria-live="polite">
                        <span>{totalShown ? 'TABLE PAID' : 'SETTLING THE TABLE'}</span>
                        <strong>{totalShown ? (result.totalPaid ?? 0).toLocaleString() + ' lucky spins' : '?'}</strong>
                    </div>
                </div>
            </Tray>
        );
    }

    /* ── before the ball: the table ───────────────────────────────────────── */
    // Nothing until the slots have finished turning over. There is no table to
    // bet at while the reel is still becoming one.
    if (t < T_TURN) return null;

    const secondsLeft = Math.max(0, Math.ceil(((betsCloseAt ?? 0) - serverNow()) / 1000));

    return (
        <Tray isMobile={isMobile}>
            {/* No marquee kicker here; the terms are on the plaques (PAYS 2×/6×) and the bottom line. The brass hairline stays: it gives the tray a top edge on a phone. */}
            <div className="fib-parlour-rule" aria-hidden="true" />
            <div className="fib-parlour-caption">THE PARLOUR <span>· {stake} ON THE TABLE</span></div>

            {/* The call. One line, and it changes exactly once. */}
            <div
                role="status"
                style={{
                    textAlign: 'center', marginBottom: 10,
                    fontWeight: 900, letterSpacing: '0.16em',
                    fontSize: isMobile ? 14 : 17,
                    color: locked ? COLORS.redInk : BRASS_INK,
                    textShadow: locked ? `0 0 20px ${COLOURS.red.hex}CC` : 'none',
                }}
            >
                {locked ? 'NO MORE BETS' : (
                    <>
                        PLACE YOUR BETS
                        {/* Seconds use the numeral's fixed advance so 19 -> 18 -> 17 does not walk the line sideways. */}
                        <span style={{
                            marginLeft: 10,
                            color: secondsLeft <= 5 ? COLORS.redInk : COLORS.text,
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {secondsLeft}s
                        </span>
                    </>
                )}
            </div>

            <div className="fib-parlour-bet-tray">
                {ORDER.map(colour => (
                    <BetButton
                        key={colour}
                        colour={colour}
                        multiplier={multipliers?.[colour] ?? (colour === 'green' ? 6 : 2)}
                        seats={byColour[colour]}
                        mine={myBet?.bet ?? null}
                        locked={locked || busy}
                        onPick={pick}
                    />
                ))}
            </div>

            {/* Folding is a button too, so keeping the stake can be confirmed. */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, minHeight: 30,
                position: 'relative', zIndex: 1,
            }}>
                <button
                    type="button"
                    className="fib-parlour-keep"
                    data-chosen={keptChosen ? 'true' : 'false'}
                    disabled={locked || busy}
                    onClick={() => pick(null)}
                    aria-pressed={keptChosen}
                >
                    KEEP {stake}
                </button>

                <span style={{
                    fontSize: 11, fontWeight: 600, textAlign: 'right',
                    color: error ? COLORS.redInk : COLORS.neutralInk,
                }}>
                    {error || (byColour.fold.length > 0
                        ? `${byColour.fold.length} sitting out`
                        : `${stake} lucky spins on the table`)}
                </span>
            </div>
        </Tray>
    );
}

export default memo(RouletteTable);
