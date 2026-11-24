import React, { useRef, useLayoutEffect } from 'react';
import { Crown, Trophy, Medal } from 'lucide-react';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { kotwStandings } from '../../../utils/kotwStandings.js';

// King of the Wheel standings in the reel's status bar (the row's middle is the largest unused horizontal space), the vertical LeaderboardSidebar board turned on its side: rank badge, name, monospace points, crimson highlight on your row. It is not in the band's headroom: a change to STRIP_HEIGHT or the sprite scale would silently overlap the items.

const KOTW_BG_DARK = '#0F172A';
const KOTW_PRIMARY = '#F43F5E';
const KOTW_TEXT = '#F8FAFC';
const KOTW_SILVER = '#94A3B8';
const KOTW_GOLD = '#F59E0B';
const KOTW_BRONZE = '#B45309';

const RANK_COLORS = [KOTW_GOLD, KOTW_SILVER, KOTW_BRONZE];
const RANK_ICONS = [Crown, Trophy, Medal];

export function KotwReelBoard() {
    const { globalEventStatus, kotwLeaderboard, kotwUserStats, kotwSpinPending } = useActivity();
    const { user } = useAuth();

    // Overtake animation, FLIP: before paint each chip's new x is compared with its last, moved chips are offset back and released so they slide. Only on a change of order, on the compositor. (The `slideIn` in the leaderboard file belongs to its own rows.)
    const chipRefs = useRef(new Map());
    const prevX = useRef(new Map());
    const prevOrder = useRef('');

    useLayoutEffect(() => {
        const reduce = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        // Only an actual overtake animates, keyed on the sequence of ids, not on x movement: the row shifts whenever the status bar's contents change width, and that made five chips glide for no reason.
        const order = [...chipRefs.current.keys()].join(',');
        const reordered = prevOrder.current !== '' && prevOrder.current !== order;
        prevOrder.current = order;

        const next = new Map();
        chipRefs.current.forEach((el, id) => {
            if (!el) return;
            const x = el.getBoundingClientRect().left;
            next.set(id, x);

            const old = prevX.current.get(id);
            if (old == null || reduce || !reordered) return;
            const delta = old - x;
            if (Math.abs(delta) < 1) return;

            // Jump back to where it was, then release on the next frame.
            el.style.transition = 'none';
            el.style.transform = `translateX(${delta}px)`;
            requestAnimationFrame(() => {
                el.style.transition = 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)';
                el.style.transform = 'translateX(0)';
            });
        });
        prevX.current = next;
    });

    const isKotw = globalEventStatus?.active && globalEventStatus?.type === 'king_of_wheel';
    if (!isKotw || !kotwLeaderboard?.length) return null;

    // Ordered by the points these chips will PRINT, not broadcast order, so a chip cannot reach first while showing its old number (utils/kotwStandings.js). Sorted before the slice: cutting the server's top five first would let a held-back player keep a seat the sixth owns.
    const standings = kotwStandings(kotwLeaderboard, {
        userId: user?.id,
        pending: kotwSpinPending,
        confirmedPoints: kotwUserStats?.points,
    });

    // Five across is what fits before names start colliding at this height. The
    // full board is in the leaderboard modal, which has its own KOTW mode.
    const entries = standings.slice(0, 5);

    return (
        <div
            style={{
                // Sized to its content; the status bar's left and right groups each take `flex: 1 1 0`, so this stays centred on the bar.
                flex: '0 0 auto',
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                flexWrap: 'nowrap',
                overflow: 'hidden',
                padding: '0 16px',
                pointerEvents: 'none',
            }}
        >
            {entries.map((entry, index) => {
                const RankIcon = RANK_ICONS[index] || null;
                const rankColor = RANK_COLORS[index] || KOTW_SILVER;
                const isCurrentUser = entry.userId === user?.id;

                return (
                    <div
                        key={entry.userId}
                        ref={el => {
                            if (el) chipRefs.current.set(entry.userId, el);
                            else chipRefs.current.delete(entry.userId);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '6px 14px 6px 6px',
                            borderRadius: '10px',
                            // The status bar is solid, so these need not be near-opaque as they did over the moving reel.
                            background: isCurrentUser
                                ? `linear-gradient(135deg, ${KOTW_PRIMARY}33, ${KOTW_BG_DARK}CC)`
                                : `${KOTW_BG_DARK}99`,
                            border: isCurrentUser
                                ? `1px solid ${KOTW_PRIMARY}AA`
                                : `1px solid ${rankColor}44`,
                            boxShadow: isCurrentUser
                                ? `0 0 14px -4px ${KOTW_PRIMARY}`
                                : 'none',
                            minWidth: 0,
                            flexShrink: 1,
                        }}
                    >
                        {/* Rank badge */}
                        <span style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '8px',
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: index < 3
                                ? `linear-gradient(135deg, ${rankColor}40, ${rankColor}18)`
                                : 'rgba(255,255,255,0.06)',
                            border: `1px solid ${rankColor}55`,
                        }}>
                            {RankIcon
                                ? <RankIcon size={16} color={rankColor} />
                                : <span style={{ fontSize: '13px', fontWeight: 700, color: KOTW_SILVER }}>{index + 1}</span>}
                        </span>

                        <span style={{
                            fontSize: '14px',
                            fontWeight: isCurrentUser ? 700 : 600,
                            color: isCurrentUser ? KOTW_PRIMARY : KOTW_TEXT,
                            maxWidth: '150px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}>
                            {entry.username}
                        </span>

                        <span style={{
                            fontSize: '18px',
                            fontWeight: 900,
                            fontFamily: 'monospace',
                            color: index < 3 ? rankColor : KOTW_TEXT,
                            flexShrink: 0,
                        }}>
                            {/* Already the value to show: `kotwStandings` held it back while this player's spin resolves and placed the chip on that number. */}
                            {entry.points}
                        </span>
                        <span style={{
                            fontSize: '10px',
                            color: KOTW_SILVER,
                            flexShrink: 0,
                            marginLeft: '-5px',
                        }}>
                            pts
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
