import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../../../config/constants.js';
import { COLORS, DECK, rail } from '../config/constants';
import { FlapText, BoardLabel, Plinth, Segmented } from '../features/collection/FlapBoard.jsx';
import { prestigeInk, prestigeIcon, prestigeLabel, isIridescentPrestige, prestigeStanding } from '../../../utils/prestigeHelpers.js';
import { PrestigeRing } from '../spin/StageFlanks.jsx';
import { useWheelViewport } from '../config/breakpoints.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { RARITY, RARITY_KEYS, getRarityIcon, getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { kotwStandings } from '../../../utils/kotwStandings.js';
import { UserProfile } from '../features/UserProfile.jsx';
import {
    Trophy, RefreshCw, Crown, Medal, Award,
    BookOpen, TrendingUp, Layers, Zap, Timer, Swords, Info, X, Clover, Sparkles
} from 'lucide-react';
import { visibleInterval } from '../../../config/power.js';

/** Global-totals field names. Pluralised, and distinct from the per-player
 *  `*_count` fields — these come from getGlobalStats, a separate query. */
const GLOBAL_TOTAL_FIELD = {
    insane: 'total_insanes',
    mythic: 'total_mythics',
    legendary: 'total_legendaries',
    relic: 'total_relics',
    exotic: 'total_exotics',
    rare: 'total_rares',
};

// KOTW Colors - Crimson Obsidian theme (aggressive/competitive)
const KOTW_BG = '#1E293B';        // Cool Slate Grey
const KOTW_BG_DARK = '#0F172A';   // Dark Graphite (depth)
const KOTW_PRIMARY = '#F43F5E';   // Vivid Crimson/Blood Orange
const KOTW_TEXT = '#F8FAFC';      // Ice White
const KOTW_GOLD = '#F59E0B';      // Gold for 1st place
const KOTW_SILVER = '#94A3B8';    // Silver for 2nd
const KOTW_BRONZE = '#D97706';    // Bronze for 3rd

// Number format forced to en-US (the site is English-only), matching the collection board.
const fmtNum = n => (typeof n === 'number' && isFinite(n) ? n : Number(n) || 0).toLocaleString('en-US');

// Helper to get Discord avatar URL
function getDiscordAvatarUrl(discordId, avatarHash, size = 64) {
    if (avatarHash) {
        const format = avatarHash.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${format}?size=${size}`;
    }
    try {
        if (!discordId || !/^\d+$/.test(String(discordId))) {
            return `https://cdn.discordapp.com/embed/avatars/0.png`;
        }
        const defaultIndex = (BigInt(discordId) >> 22n) % 6n;
        return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    } catch {
        return `https://cdn.discordapp.com/embed/avatars/0.png`;
    }
}

// The full leaderboard, as a board: one component serves the rail and the modal (the modal only adds the global totals and a close button), so no version lags the other.
export function LeaderboardSidebar({ onClose }) {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [activeTab, setActiveTab] = useState('collection');
    // Which window the board ranks over: 'all' is the career board, the others are the calendar periods from /api/leaderboard/period. Two lenses (measure and window), so changing the window keeps the measure.
    const [period, setPeriod] = useState('all');
    // The server names the window: the client would otherwise reimplement the Monday arithmetic in a second timezone.
    const [periodMeta, setPeriodMeta] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [showKotwMode, setShowKotwMode] = useState(false);
    const intervalRef = useRef(null);
    const kotwExpiryTimeoutRef = useRef(null); // Track expiry-based hide timeout
    const { user } = useAuth();
    const { isPhone } = useWheelViewport();
    const { globalEventStatus, kotwLeaderboard, kotwUserStats, kotwSpinPending } = useActivity();

    // Auto-enable KOTW mode when event is active, auto-disable when it ends
    // Also check expiresAt as a fallback in case SSE event_end is missed
    const eventExpired = globalEventStatus?.expiresAt && Date.now() > globalEventStatus.expiresAt;
    const isKotwActive = globalEventStatus?.type === 'king_of_wheel' &&
        (globalEventStatus?.active || globalEventStatus?.pending) &&
        !eventExpired;

    // KOTW timer state for real-time updates
    const [kotwRemainingTime, setKotwRemainingTime] = useState(0);
    const [pendingCountdownTime, setPendingCountdownTime] = useState(0);

    useEffect(() => {
        if (isKotwActive && !showKotwMode) {
            setShowKotwMode(true);
        } else if (!isKotwActive && showKotwMode) {
            // Auto-disable KOTW mode after event ends (with delay to show final results)
            const timeout = setTimeout(() => {
                setShowKotwMode(false);
            }, 8000); // 8 seconds to see final standings
            return () => clearTimeout(timeout);
        }
    }, [isKotwActive, showKotwMode]);

    // Update KOTW timer every second (both active and pending countdown)
    useEffect(() => {
        if (!isKotwActive || !showKotwMode) {
            // Clear expiry timeout if event is no longer active
            if (kotwExpiryTimeoutRef.current) {
                clearTimeout(kotwExpiryTimeoutRef.current);
                kotwExpiryTimeoutRef.current = null;
            }
            return;
        }

        const updateTimer = () => {
            // Update active event remaining time
            if (globalEventStatus?.expiresAt) {
                const remaining = Math.max(0, globalEventStatus.expiresAt - Date.now());
                setKotwRemainingTime(remaining);

                // Fallback: if timer hits 0, force hide the overlay after a brief delay
                // This handles the case where SSE global_event_end is missed
                if (remaining === 0 && !kotwExpiryTimeoutRef.current) {
                    kotwExpiryTimeoutRef.current = setTimeout(() => {
                        kotwExpiryTimeoutRef.current = null;
                        setShowKotwMode(false);
                    }, 8000); // Same delay as normal end to show final standings
                }
            }
            // Update pending countdown time
            if (globalEventStatus?.pending && globalEventStatus?.activatesAt) {
                setPendingCountdownTime(Math.max(0, globalEventStatus.activatesAt - Date.now()));
            } else {
                setPendingCountdownTime(0);
            }
        };

        updateTimer();
        // Visibility-gated: a hidden tab would re-render every second for nobody; it catches up on return.
        const stop = visibleInterval(updateTimer, 1000);
        return () => {
            stop();
            // Don't clear kotwExpiryTimeoutRef here - let it complete its task
        };
    }, [isKotwActive, showKotwMode, globalEventStatus?.expiresAt, globalEventStatus?.activatesAt, globalEventStatus?.pending]);

    // Global totals, modal mode only: the 380px panel has no room for the six-column strip.
    const [globalStats, setGlobalStats] = useState(null);
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/stats/global`)
            .then(res => res.json())
            .then(data => setGlobalStats(data))
            .catch(err => console.error('Failed to fetch global stats:', err));
    }, []);

    const isPeriod = period !== 'all';

    // The newest request wins: every load is stamped and a stale response writes nothing. The lenses select endpoints with different row SHAPES (career `total_spins` vs period `spins`), so a late response read through the wrong accessors renders a board of dots.
    // A stamp, not an AbortController: a refresh timer can overlap a lens change with both requests legitimately in flight.
    const requestIdRef = useRef(0);

    const loadLeaderboard = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        const superseded = () => requestId !== requestIdRef.current;
        try {
            const url = period === 'all'
                ? `${API_BASE_URL}/api/leaderboard?sort=${activeTab}`
                : `${API_BASE_URL}/api/leaderboard/period?period=${period}&sort=${activeTab}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch');
            const data = await res.json();
            if (superseded()) return;
            setLeaderboard(data.leaderboard || []);
            setPeriodMeta(period === 'all' ? null : { label: data.label, since: data.since });
            setLastUpdated(new Date());
        } catch (e) {
            if (superseded()) return;
            console.error('Failed to load leaderboard:', e);
        } finally {
            // A superseded request must not clear the spinner: the replacing load is still running.
            if (!superseded()) setLoading(false);
        }
    }, [activeTab, period]);

    useEffect(() => {
        loadLeaderboard();

        // Auto-refresh every 5 minutes (20 in saver mode), and never while the
        // tab is hidden.
        intervalRef.current = visibleInterval(loadLeaderboard, 5 * 60 * 1000, { stretch: true });

        return () => {
            if (intervalRef.current) {
                intervalRef.current();
                intervalRef.current = null;
            }
        };
    }, [loadLeaderboard]);

    const sortOptions = {
        collection: { label: 'Items', icon: <BookOpen size={12} />, color: COLORS.gold },
        spins: { label: 'Spins', icon: <TrendingUp size={12} />, color: COLORS.text },
        duplicates: { label: 'Dupes', icon: <Layers size={12} />, color: COLORS.accent },
        events: { label: 'Events', icon: <Zap size={12} />, color: COLORS.orange },
        // Green because it is already what a lucky spin looks like here (the spinner paints every lucky state with it); a fresh colour would fork that identity. It is also the only tone that separates from `collection` and `duplicates` (the same oklch value).
        lucky: { label: 'Lucky', icon: <Clover size={12} />, color: COLORS.green },
        // Period-only: inside a window "how many specials this week" is the question, and the collection column (distinct items owned) cannot answer it.
        specials: { label: 'Specials', icon: <Sparkles size={12} />, color: DECK.amber },
    };

    // Measures each window can rank by: `collection` and `duplicates` are career facts with no meaning in a week, `specials` only makes sense over a window; spins, lucky and events are shared.
    const SORTS_BY_WINDOW = {
        all: ['collection', 'spins', 'duplicates', 'events', 'lucky'],
        period: ['spins', 'lucky', 'events', 'specials'],
    };

    const availableSorts = SORTS_BY_WINDOW[isPeriod ? 'period' : 'all'];

    // Changing window keeps the measure where it can: collection and duplicates map to Specials and back; spins, lucky and events survive untouched.
    const changePeriod = (next) => {
        const nextSorts = SORTS_BY_WINDOW[next === 'all' ? 'all' : 'period'];
        if (!nextSorts.includes(activeTab)) {
            setActiveTab(next === 'all' ? 'collection' : 'specials');
        }
        setPeriod(next);
    };

    const getValueForTab = (entry) => {
        let value;
        if (isPeriod) {
            // The period payload names its own columns, deliberately not reusing the career names: `spins` here is spins in the window, not users.total_spins.
            switch (activeTab) {
                case 'lucky': value = entry.lucky_spins; break;
                case 'events': value = entry.events; break;
                case 'specials': value = entry.specials; break;
                case 'spins':
                default: value = entry.spins;
            }
            return value ?? 0;
        }
        switch (activeTab) {
            case 'collection': value = entry.unique_items; break;
            case 'spins': value = entry.total_spins; break;
            case 'duplicates': value = entry.total_duplicates; break;
            case 'events': value = entry.event_triggers; break;
            case 'lucky': value = entry.lucky_spins_used; break;
            default: value = entry.unique_items;
        }
        return value ?? 0; // Coerce null/undefined to 0
    };

    // Format time for KOTW timer
    const formatKotwTime = (ms) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Render KOTW Leaderboard overlay
    const renderKotwLeaderboard = () => {
        const remainingTime = kotwRemainingTime;
        const isPending = globalEventStatus?.pending;
        const countdownTime = pendingCountdownTime;

        const rankColors = [KOTW_GOLD, KOTW_SILVER, KOTW_BRONZE];
        const RankIcons = [Crown, Trophy, Medal];

        // Ordered by the points each row will print, including the freeze for a spin that has not landed (see utils/kotwStandings.js).
        const standings = kotwStandings(kotwLeaderboard, {
            userId: user?.id,
            pending: kotwSpinPending,
            confirmedPoints: kotwUserStats?.points,
        });

        // The "Your score" panel reads the same standings as the list so they cannot disagree: `kotwUserStats.rank` goes stale when someone else scores. Falls back to the stats object when this player is not in the broadcast's top ten.
        const myStanding = user ? standings.find(e => e.userId === user.id) : null;
        const myPoints = myStanding?.points ?? kotwUserStats?.points ?? 0;
        const myRank = myStanding?.rank ?? kotwUserStats?.rank ?? null;

        return (
            <div style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(180deg, ${KOTW_BG} 0%, ${KOTW_BG_DARK} 50%, ${KOTW_BG}ee 100%)`,
                borderRadius: '16px',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}>
                {/* KOTW Header */}
                <div style={{
                    padding: '16px 18px',
                    borderBottom: `2px solid ${KOTW_PRIMARY}`,
                    background: `linear-gradient(180deg, ${KOTW_PRIMARY}18 0%, transparent 100%)`,
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: `linear-gradient(135deg, ${KOTW_PRIMARY}30, ${KOTW_BG_DARK})`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                border: `1px solid ${KOTW_PRIMARY}50`,
                            }}>
                                <Crown size={20} color={KOTW_PRIMARY} />
                            </div>
                            <div>
                                <h3 style={{
                                    margin: 0,
                                    color: KOTW_TEXT,
                                    fontSize: '15px',
                                    fontWeight: '700',
                                }}>
                                    King of the Wheel
                                </h3>
                                <div style={{
                                    fontSize: '11px',
                                    color: KOTW_PRIMARY,
                                }}>
                                    {isPending ? 'Starting soon...' : 'Competition active'}
                                </div>
                            </div>
                        </div>

                        {/* Timer / Toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isPending ? (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    background: `${KOTW_PRIMARY}33`,
                                    borderRadius: '8px',
                                    border: `1px solid ${KOTW_PRIMARY}`,
                                }}>
                                    <Swords size={14} color={KOTW_PRIMARY} />
                                    <span style={{
                                        fontSize: '16px',
                                        fontWeight: 700,
                                        color: KOTW_PRIMARY,
                                    }}>
                                        {Math.ceil(countdownTime / 1000)}
                                    </span>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    background: remainingTime < 60000 ? 'rgba(255,68,68,0.2)' : `${KOTW_PRIMARY}22`,
                                    borderRadius: '8px',
                                    border: `1px solid ${remainingTime < 60000 ? '#ff4444' : KOTW_PRIMARY}66`,
                                }}>
                                    <Timer size={14} color={remainingTime < 60000 ? '#ff4444' : KOTW_PRIMARY} />
                                    <span style={{
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        color: remainingTime < 60000 ? '#ff4444' : KOTW_PRIMARY,
                                        fontFamily: 'monospace',
                                    }}>
                                        {formatKotwTime(remainingTime)}
                                    </span>
                                </div>
                            )}

                            <button
                                onClick={() => setShowKotwMode(false)}
                                style={{
                                    background: `${COLORS.bgLighter}60`,
                                    border: `1px solid ${COLORS.border}`,
                                    color: COLORS.textMuted,
                                    cursor: 'pointer',
                                    padding: '7px',
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                                title="Show normal leaderboard"
                            >
                                <Trophy size={14} />
                            </button>
                        </div>
                    </div>

                    {/* User's stats */}
                    {kotwUserStats && myPoints > 0 && (
                        <div style={{
                            marginTop: '12px',
                            padding: '10px 14px',
                            background: KOTW_BG_DARK,
                            borderRadius: '10px',
                            border: `1px solid ${KOTW_PRIMARY}44`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: KOTW_SILVER, fontSize: '12px' }}>Your score:</span>
                                <span style={{
                                    fontSize: '20px',
                                    fontWeight: 900,
                                    color: KOTW_PRIMARY,
                                    fontFamily: 'monospace',
                                }}>
                                    {myPoints}
                                </span>
                                <span style={{ color: KOTW_SILVER, fontSize: '12px' }}>pts</span>
                            </div>
                            {myRank && (
                                <div style={{
                                    padding: '4px 10px',
                                    background: myRank <= 3 ? `${rankColors[myRank - 1]}33` : `${KOTW_PRIMARY}33`,
                                    borderRadius: '6px',
                                    border: `1px solid ${myRank <= 3 ? rankColors[myRank - 1] : KOTW_PRIMARY}66`,
                                }}>
                                    <span style={{
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        color: myRank <= 3 ? rankColors[myRank - 1] : KOTW_TEXT,
                                    }}>
                                        #{myRank}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Leaderboard List */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px',
                }}>
                    {(!kotwLeaderboard || kotwLeaderboard.length === 0) ? (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                            color: KOTW_PRIMARY,
                            gap: '12px',
                        }}>
                            <Swords size={40} style={{ opacity: 0.6 }} />
                            <span style={{ fontSize: '14px', color: KOTW_TEXT, opacity: 0.8 }}>
                                {isPending ? 'Competition starting soon...' : 'Spin to earn points!'}
                            </span>
                            <span style={{ fontSize: '12px', color: KOTW_SILVER, opacity: 0.6 }}>
                                Rarer items = more points
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {standings.map((entry, index) => {
                                const RankIcon = RankIcons[index] || Award;
                                const rankColor = rankColors[index] || KOTW_SILVER;
                                const isCurrentUser = entry.userId === user?.id;

                                return (
                                    <div
                                        key={entry.userId}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 14px',
                                            background: isCurrentUser
                                                ? `linear-gradient(135deg, ${KOTW_PRIMARY}25, ${KOTW_BG_DARK})`
                                                : KOTW_BG_DARK,
                                            borderRadius: '10px',
                                            border: isCurrentUser
                                                ? `2px solid ${KOTW_PRIMARY}88`
                                                : `1px solid ${KOTW_BG}`,
                                        }}
                                    >
                                        {/* Rank */}
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: index < 3
                                                ? `linear-gradient(135deg, ${rankColor}40, ${rankColor}20)`
                                                : KOTW_BG,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            border: `1px solid ${index < 3 ? rankColor : KOTW_BG}60`,
                                        }}>
                                            {index < 3 ? (
                                                <RankIcon size={16} color={rankColor} />
                                            ) : (
                                                <span style={{
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    color: KOTW_SILVER,
                                                }}>
                                                    {index + 1}
                                                </span>
                                            )}
                                        </div>

                                        {/* Name */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '14px',
                                                fontWeight: isCurrentUser ? 700 : 600,
                                                color: isCurrentUser ? KOTW_PRIMARY : KOTW_TEXT,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {entry.username}
                                                {isCurrentUser && ' (You)'}
                                            </div>
                                            <div style={{
                                                fontSize: '11px',
                                                color: KOTW_SILVER,
                                            }}>
                                                {entry.spins} spin{entry.spins !== 1 ? 's' : ''}
                                            </div>
                                        </div>

                                        {/* Points */}
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                fontSize: '18px',
                                                fontWeight: 900,
                                                color: index < 3 ? rankColor : KOTW_TEXT,
                                                fontFamily: 'monospace',
                                            }}>
                                                {/* Already the value to show, and the value this row was placed on (see kotwStandings). */}
                                                {entry.points}
                                            </div>
                                            <div style={{
                                                fontSize: '10px',
                                                color: KOTW_SILVER,
                                            }}>
                                                pts
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer hint */}
                <div style={{
                    padding: '10px 16px',
                    borderTop: `1px solid ${KOTW_PRIMARY}44`,
                    background: KOTW_BG_DARK,
                    fontSize: '11px',
                    color: KOTW_TEXT,
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                }}>
                    <style>{`
                        .kotw-lucky-info:hover .kotw-lucky-tooltip {
                            opacity: 1 !important;
                            visibility: visible !important;
                        }
                    `}</style>
                    <Trophy size={14} color={KOTW_GOLD} /> Winner earns Lucky Spins based on score!
                    <span style={{ position: 'relative', display: 'inline-flex' }} className="kotw-lucky-info">
                        <Info size={12} color="#94A3B8" style={{ cursor: 'help' }} />
                        <span className="kotw-lucky-tooltip" style={{
                            position: 'absolute',
                            bottom: '100%',
                            right: 0,
                            marginBottom: '8px',
                            padding: '10px 14px',
                            background: '#1E293B',
                            border: `1px solid ${KOTW_PRIMARY}44`,
                            borderRadius: '8px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                            whiteSpace: 'nowrap',
                            fontSize: '11px',
                            color: '#E2E8F0',
                            zIndex: 1000,
                            opacity: 0,
                            visibility: 'hidden',
                            transition: 'opacity 0.2s, visibility 0.2s',
                            pointerEvents: 'none',
                            textAlign: 'left',
                        }}>
                            <div style={{ fontWeight: 700, color: KOTW_GOLD, marginBottom: '6px' }}>Lucky Spin Formula</div>
                            <div style={{ fontFamily: 'monospace', color: '#94A3B8', marginBottom: '8px' }}>
                                log₂(points ÷ 50 + 1) × 4
                            </div>
                            <div style={{ display: 'flex', gap: '12px', color: '#CBD5E1' }}>
                                <span>50pts → <strong style={{ color: '#22C55E' }}>4</strong></span>
                                <span>500pts → <strong style={{ color: '#22C55E' }}>13</strong></span>
                                <span>3000pts → <strong style={{ color: '#22C55E' }}>23</strong></span>
                            </div>
                            {/* Tooltip arrow */}
                            <div style={{
                                position: 'absolute',
                                bottom: '-6px',
                                right: '8px',
                                width: 0,
                                height: 0,
                                borderLeft: '6px solid transparent',
                                borderRight: '6px solid transparent',
                                borderTop: `6px solid ${KOTW_PRIMARY}44`,
                            }} />
                        </span>
                    </span>
                </div>
            </div>
        );
    };

    // THE BOARD: the collection board's register with the sort turned round (deck material, ruled rows, no boxes, split-flap drums).
    // One measure column named by the lens, plus a share-of-leader meter: the old permanent ITEMS/SPINS/DUPES columns duplicated the filter that selects between them.
    const metricTone = {
        collection: DECK.amber,
        spins: DECK.ink,
        duplicates: COLORS.accent,
        events: COLORS.orange,
        lucky: COLORS.green,
        specials: DECK.amber,
    }[activeTab] || DECK.amber;

    // "In prestige" answers whichever metric the lens is on. Items and duplicates come from the run's own rows (duplicates are counted server-side against the PRESTIGE collection; a baseline subtraction just returned the spin count). Spins and events are the career total minus the baseline recorded when the run opened.
    // Returns null for "nothing to say" (not prestiging, or a run older than the baselines): null prints as a dot, never a zero.
    const prestigeValueFor = (entry) => {
        if (!(entry.prestige_active_level > 0)) return null;

        const since = (total, base) =>
            (base === null || base === undefined) ? null : Math.max(0, (total || 0) - base);

        switch (activeTab) {
            case 'collection': return entry.prestige_items ?? null;
            case 'spins': return since(entry.total_spins, entry.prestige_spins_at_start);
            case 'duplicates': return entry.prestige_duplicates ?? null;
            case 'events': return since(entry.event_triggers, entry.prestige_events_at_start);
            // No `since` or baseline: a lucky spin writes a timestamped spin_history row, so the server counts them from the run's start; Lucky is always measurable.
            case 'lucky': return entry.prestige_lucky_spins ?? null;
            default: return entry.prestige_items ?? null;
        }
    };

    const rows = leaderboard.slice(0, 100);

    // RANK | avatar | PLAYER | measure | share | prestige | collection. The phone stops after the first four: the fixed-width tier marks (130px) once left the flexible name column at zero pixels on a 390px screen.
    // The collection column is a LENGTH derived from its marks, not `auto`: header and rows share one template, and `auto` sizes it to two different contents so later columns drift.
    const markTiers = RARITY_KEYS.filter(k => GLOBAL_TOTAL_FIELD[k]);

    // Period strip: summed from the rows and labelled "on this board", not `globalStats` (all-time totals beside a week's board). The endpoint returns the top 100, so a busier window has an uncounted tail.
    const boardTotals = !isPeriod ? null : leaderboard.reduce((acc, e) => {
        acc.players += 1;
        acc.spins += e.spins || 0;
        acc.lucky_spins += e.lucky_spins || 0;
        acc.events += e.events || 0;
        for (const key of markTiers) acc[key] += e[`${key}_count`] || 0;
        return acc;
    }, { players: 0, spins: 0, lucky_spins: 0, events: 0, ...Object.fromEntries(markTiers.map(k => [k, 0])) });
    const MARK_W = 38;
    const marksWidth = markTiers.length * MARK_W;

    // The period board is a different register: it shows ALL FOUR measures at once, and the lens only decides the ORDER and which column is tinted. Tier marks mean the window's pulls and add up to the Specials column.
    const boardColumns = isPeriod
        ? (isPhone
            ? '30px 24px minmax(0, 1fr) 76px'
            : `46px 30px minmax(0, 1fr) 84px 72px 72px 84px ${marksWidth}px`)
        : (isPhone
            ? '30px 24px minmax(0, 1fr) 76px'
            : `46px 30px minmax(0, 1fr) 96px 132px 68px ${marksWidth}px`);

    // The period board's numeric columns, in print order; the header and rows both walk this so a column cannot be added to one and forgotten in the other.
    const PERIOD_COLUMNS = [
        { id: 'spins', label: 'Spins', field: 'spins' },
        { id: 'lucky', label: 'Lucky', field: 'lucky_spins' },
        { id: 'events', label: 'Events', field: 'events' },
        { id: 'specials', label: 'Specials', field: 'specials' },
    ];

    return (
        <>
            <div
                className="fib-board-scroll fib-leaderboard"
                style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '1180px',
                    height: isPhone ? '100%' : 'min(88vh, 860px)',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundImage: DECK.face,
                    // The board's three edges: a lit rail along the top, a front
                    // lip at the bottom, and the shadow that seats it on the scrim.
                    boxShadow: [
                        `inset 0 1px 0 ${rail(0.12)}`,
                        'inset 0 -2px 0 rgba(0,0,0,0.55)',
                        `inset 0 -3px 0 ${rail(0.09)}`,
                        '0 32px 80px rgba(0,0,0,0.65)',
                    ].join(', '),
                    overflow: 'hidden',
                }}
            >
                {/* KOTW keeps its own world: a spin mode with its own identity that overlays this board rather than restyling it. */}
                {showKotwMode && isKotwActive && renderKotwLeaderboard()}

                {/* ── THE HEAD ────────────────────────────────────────────── */}
                <div style={{
                    position: 'relative',
                    flex: '0 0 auto',
                    padding: isPhone ? '16px 16px 0' : '24px 26px 0',
                    backgroundImage: `linear-gradient(180deg, ${DECK.sky} 0%, transparent 78%)`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', minWidth: 0 }}>
                            <FlapText
                                text="Leaderboard"
                                size={isPhone ? 26 : 36}
                                tone={DECK.ink}
                                weight={800}
                                plate
                            />
                            <BoardLabel tone={DECK.inkMid}>
                                {leaderboard.length} {leaderboard.length === 1 ? 'player' : 'players'}
                                {/* In a period this counts who has SPUN in the window; the server leaves idle players off the board. */}
                                {isPeriod && periodMeta ? ` · ${periodMeta.label.toLowerCase()}` : ''}
                            </BoardLabel>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
                            <Plinth
                                as="button"
                                className="fib-board-hit"
                                onClick={loadLeaderboard}
                                aria-label="Refresh the leaderboard"
                                style={{
                                    width: '36px', height: '36px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: DECK.inkMid,
                                }}
                            ><RefreshCw size={14} /></Plinth>
                            {onClose && (
                                <Plinth
                                    as="button"
                                    className="fib-board-hit"
                                    onClick={onClose}
                                    aria-label="Close the leaderboard"
                                    style={{
                                        width: '36px', height: '36px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: DECK.inkMid,
                                    }}
                                ><X size={16} /></Plinth>
                            )}
                        </div>
                    </div>

                    {/* The server's own totals, as the board's second register. */}
                    {(isPeriod ? boardTotals : globalStats) && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                            flexWrap: 'wrap', gap: '16px',
                            margin: isPhone ? '14px 0 10px' : '20px 0 10px',
                        }}>
                            <div style={{ display: 'flex' }}>
                                {/* No Players tile in a period: the chip beside the title already counts the board. */}
                                {(isPeriod ? [
                                    { label: 'Spins', value: fmtNum(boardTotals.spins) },
                                    { label: 'Lucky', value: fmtNum(boardTotals.lucky_spins) },
                                    { label: 'Events', value: fmtNum(boardTotals.events) },
                                ] : [
                                    { label: 'Players', value: fmtNum(globalStats.total_players ?? leaderboard.length) },
                                    { label: 'Spins', value: fmtNum(globalStats.total_spins) },
                                ]).map((f, i) => (
                                    <div
                                        key={f.label}
                                        style={{
                                            padding: i === 0 ? '0 22px 0 0' : '0 22px',
                                            boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                                        }}
                                    >
                                        <FlapText text={f.value} size={isPhone ? 22 : 27} tone={DECK.ink} plate delay={60 + i * 40} />
                                        <div style={{ marginTop: '7px' }}><BoardLabel>{f.label}</BoardLabel></div>
                                    </div>
                                ))}
                            </div>

                            {/* Every special ever pulled on the server by tier, or in a period every special pulled inside the window. Tier ink, no chips. */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 18px' }}>
                                {markTiers.map(key => (
                                    <span key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                        <BoardLabel size={13} tone={getRarityInk(key)} style={{ letterSpacing: '0.03em' }}>
                                            {fmtNum(isPeriod ? boardTotals[key] : globalStats[GLOBAL_TOTAL_FIELD[key]])}
                                        </BoardLabel>
                                        <BoardLabel>{RARITY[key].label}</BoardLabel>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* The board's baseline: a rule, not a meter, since a ranking has no completion to fill one with. */}
                    <div style={{ height: '2px', background: 'rgba(0,0,0,0.45)', boxShadow: `inset 0 1px 0 ${rail(0.10)}` }} />
                </div>

                {/* ── THE LENS ────────────────────────────────────────────── */}
                <div style={{
                    flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    padding: isPhone ? '12px 16px' : '14px 26px 12px',
                }}>
                    <BoardLabel>Rank by</BoardLabel>
                    <Segmented
                        value={activeTab}
                        onChange={setActiveTab}
                        options={availableSorts.map(id => [id, sortOptions[id].label])}
                        label="Rank the board by"
                        tone={metricTone}
                    />

                    {/* The second lens: over what window. Career first, as the board this page opens on. */}
                    <BoardLabel>Over</BoardLabel>
                    <Segmented
                        value={period}
                        onChange={changePeriod}
                        options={[
                            ['all', 'All time'],
                            ['day', 'Today'],
                            ['week', 'Week'],
                            ['month', 'Month'],
                        ]}
                        label="Rank the board over"
                        tone={metricTone}
                    />

                    <div style={{ flex: '1 1 auto' }} />
                    {/* The server's own label and clock: boards reset, so a thin Monday board must be able to say it has just started. */}
                    {isPeriod && periodMeta && (
                        <BoardLabel tone={DECK.inkMid}>
                            {periodMeta.label} · since {periodMeta.since} UTC
                        </BoardLabel>
                    )}
                    {lastUpdated && (
                        <BoardLabel tone={DECK.inkMid}>
                            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                        </BoardLabel>
                    )}
                </div>

                {/* The column headings live INSIDE the scroller: outside it the scrollbar narrows the rows but not the header, so every column after the flexible name column drifts (12px measured). Sticky; it bleeds to the scroller's edges with a negative margin while keeping the rows' padding. */}
                <div
                    className="fib-board-scroll"
                    style={{
                        flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                        padding: isPhone ? '0 16px 12px' : '0 26px 16px',
                        background: 'rgba(0,0,0,0.30)',
                        boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
                    }}
                >
                    <div style={{
                        position: 'sticky', top: 0, zIndex: 2,
                        display: 'grid', gridTemplateColumns: boardColumns,
                        alignItems: 'center', gap: '0 12px',
                        marginInline: isPhone ? '-16px' : '-26px',
                        paddingInline: isPhone ? '16px' : '26px',
                        paddingBlock: '10px 8px',
                        backgroundImage: DECK.face,
                        boxShadow: `inset 0 -1px 0 ${rail(0.08)}`,
                    }}>
                        <BoardLabel>#</BoardLabel>
                        <span />
                        <BoardLabel>Player</BoardLabel>
                        {isPeriod ? (
                            isPhone ? (
                                // The phone keeps one column, the one the board is ranked by: four numeric columns on 390px left every player nameless.
                                <BoardLabel tone={metricTone} style={{ textAlign: 'right' }}>
                                    {sortOptions[activeTab].label}
                                </BoardLabel>
                            ) : (
                                <>
                                    {PERIOD_COLUMNS.map(col => (
                                        <BoardLabel
                                            key={col.id}
                                            tone={col.id === activeTab ? metricTone : undefined}
                                            style={{ textAlign: 'right' }}
                                        >
                                            {col.label}
                                        </BoardLabel>
                                    ))}
                                    <BoardLabel style={{ textAlign: 'right' }}>By tier</BoardLabel>
                                </>
                            )
                        ) : (
                            <>
                                {/* One measure column, named by the lens. */}
                                <BoardLabel tone={metricTone} style={{ textAlign: 'right' }}>
                                    {sortOptions[activeTab].label}
                                </BoardLabel>
                                {/* Named for the metric, so the column never reads as
                                    "items" while the board is ranked by spins. */}
                                {!isPhone && (
                                    <BoardLabel tone={metricTone} style={{ textAlign: 'right' }}>
                                        {`${sortOptions[activeTab].label} in prestige`}
                                    </BoardLabel>
                                )}
                                {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Prestige</BoardLabel>}
                                {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Collection</BoardLabel>}
                            </>
                        )}
                    </div>
                    {loading && rows.length === 0 ? (
                        <div style={{ padding: '28px 0', textAlign: 'center' }}>
                            <BoardLabel tone={DECK.inkMid}>Reading the board…</BoardLabel>
                        </div>
                    ) : rows.length === 0 ? (
                        <div style={{ padding: '28px 0', textAlign: 'center' }}>
                            {/* An empty period board is the NORMAL state early in a window, so it says which window is empty. */}
                            <BoardLabel tone={DECK.inkMid}>
                                {isPeriod && periodMeta
                                    ? `Nobody has spun since ${periodMeta.since} — first spin takes the lead`
                                    : 'No players on the board yet'}
                            </BoardLabel>
                        </div>
                    ) : rows.map((entry, idx) => {
                        const rank = idx + 1;
                        const isMe = user && user.id === entry.id;
                        const value = getValueForTab(entry);
                        const standing = prestigeStanding(entry);
                        const level = standing.level;
                        // One value for the label and the drums: a null username was announced as "null, rank 4" while the row read "Unknown".
                        const name = entry.custom_username || 'Unknown';
                        const prestigeValue = prestigeValueFor(entry);
                        // What the row says out loud must match what it shows: aria-label REPLACES a button's inner content. The desktop period row prints four measures and announces them; phone and career rows keep the short form.
                        const measureSpeech = (isPeriod && !isPhone)
                            ? PERIOD_COLUMNS
                                .map(col => `${fmtNum(entry[col.field] ?? 0)} ${col.label.toLowerCase()}`)
                                .join(', ')
                            : `${fmtNum(value)} ${sortOptions[activeTab].label.toLowerCase()}`;
                        // Medal metals, which DESIGN.md §8 sanctions for placings only; beyond third the numeral is ordinary ink.
                        const rankTone = rank === 1 ? KOTW_GOLD
                            : rank === 2 ? KOTW_SILVER
                            : rank === 3 ? KOTW_BRONZE
                            : DECK.inkMid;

                        return (
                            <button
                                key={entry.id}
                                className={`fib-board-hit fib-register-row${isMe ? ' is-active' : ''}`}
                                onClick={() => setSelectedUser(entry.id)}
                                aria-label={`${name}, rank ${rank}, ${measureSpeech}${isPeriod && periodMeta ? ` ${periodMeta.label.toLowerCase()}` : ''}${level > 0 ? `, ${prestigeLabel(level)}` : ''}`}
                                style={{
                                    display: 'grid', gridTemplateColumns: boardColumns,
                                    alignItems: 'center', gap: '0 12px',
                                    width: '100%', padding: isPhone ? '9px 0' : '11px 0',
                                    border: 'none', textAlign: 'left', font: 'inherit',
                                    // Your own row wears the board's selected state: station amber.
                                    '--fib-row-wash': `${DECK.amber}12`,
                                    '--fib-row-tone': DECK.amber,
                                }}
                            >
                                <FlapText
                                    text={String(rank)}
                                    digits
                                    size={16}
                                    tone={rankTone}
                                    weight={rank <= 3 ? 800 : 700}
                                    delay={40 + Math.min(idx, 12) * 22}
                                />

                                {/* The avatar, ringed by prestige, as in the stage's standings. */}
                                <PrestigeRing standing={standing}>
                                    <img
                                        src={getDiscordAvatarUrl(entry.discord_id, entry.discord_avatar)}
                                        alt=""
                                        width={isPhone ? 22 : 26}
                                        height={isPhone ? 22 : 26}
                                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                        style={{ borderRadius: '50%', display: 'block' }}
                                    />
                                </PrestigeRing>

                                <FlapText
                                    text={name}
                                    title={name}
                                    size={isPhone ? 15 : 16}
                                    tone={isMe ? DECK.amber : DECK.ink}
                                    weight={isMe ? 800 : 700}
                                    delay={60 + Math.min(idx, 12) * 22}
                                    style={{ minWidth: 0, overflow: 'hidden' }}
                                />

                                {isPeriod && !isPhone ? (
                                    // All four measures, the ranked one tinted. A zero is a dot: in a ruled column a bare 0 and a missing value look identical.
                                    PERIOD_COLUMNS.map(col => {
                                        const n = entry[col.field] ?? 0;
                                        const ranked = col.id === activeTab;
                                        return n === 0 ? (
                                            <BoardLabel key={col.id} tone={DECK.inkDim} style={{ textAlign: 'right' }}>·</BoardLabel>
                                        ) : (
                                            <FlapText
                                                key={col.id}
                                                text={fmtNum(n)}
                                                digits
                                                size={ranked ? 16 : 15}
                                                tone={ranked ? metricTone : DECK.ink}
                                                weight={ranked ? 800 : 700}
                                                delay={80 + Math.min(idx, 12) * 22}
                                                style={{ justifyContent: 'flex-end' }}
                                            />
                                        );
                                    })
                                ) : (
                                    <FlapText
                                        text={fmtNum(value)}
                                        digits
                                        size={isPhone ? 14 : 16}
                                        tone={metricTone}
                                        delay={80 + Math.min(idx, 12) * 22}
                                        style={{ justifyContent: 'flex-end' }}
                                    />
                                )}

                                {/* Share of the leader: how far ahead first place is. */}
                                {/* The player's current prestige run: items collected the second time round. A dot for the majority who are not prestiging, since an empty cell reads as missing. */}
                                {/* Career columns only: items-in-prestige and prestige level are career-long facts a window has nothing to say about. */}
                                {!isPeriod && !isPhone && (
                                    prestigeValue !== null ? (
                                        <FlapText
                                            text={fmtNum(prestigeValue)}
                                            digits
                                            size={15}
                                            tone={prestigeInk(entry.prestige_active_level)}
                                            delay={90 + Math.min(idx, 12) * 22}
                                            style={{ justifyContent: 'flex-end' }}
                                        />
                                    ) : (
                                        <BoardLabel tone={DECK.inkDim} style={{ textAlign: 'right' }}>·</BoardLabel>
                                    )
                                )}

                                {!isPeriod && !isPhone && (
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '5px' }}>
                                        {level > 0 ? (
                                            <span
                                                className={isIridescentPrestige(level) && standing.earned ? 'fib-holo-text' : undefined}
                                                title={`${prestigeLabel(level)}${standing.earned ? '' : ' — in progress'}`}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '4px',
                                                    color: isIridescentPrestige(level) && standing.earned ? undefined : prestigeInk(level),
                                                    // Full strength in both states: dimming muted an ink chosen to clear AA, and the avatar ring already says whether the level is won.
                                                }}
                                            >
                                                {/* The mark alone: this column is 62px and cannot spell the level out. The name is the cell's accessible name and tooltip. */}
                                                {prestigeIcon(level, 13)}
                                                <span className="fib-sr-only">
                                                    {prestigeLabel(level)}
                                                    {standing.earned ? '' : ' — in progress'}
                                                </span>
                                            </span>
                                        ) : (
                                            // A dot, not a blank: an empty cell in a ruled column reads as a missing value.
                                            <BoardLabel tone={DECK.inkDim}>·</BoardLabel>
                                        )}
                                    </span>
                                )}

                                {/* The collection by tier: icon and count in the tier's ink, no chips. `<tier>_count` is NOT the same measurement on both boards: distinct items owned career-wide, pulls in a window (a second mythic counts only there), so only the tooltip can tell them apart. */}
                                {!isPhone && <span style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${markTiers.length}, ${MARK_W}px)`,
                                    justifyContent: 'end',
                                    alignItems: 'center',
                                }}>
                                    {markTiers.map(key => {
                                        const count = entry[`${key}_count`] || 0;
                                        if (count === 0) {
                                            return (
                                                <span key={key} title={`${RARITY[key].label}: none`} style={{ textAlign: 'center', color: DECK.inkDim, fontSize: '13px' }}>·</span>
                                            );
                                        }
                                        return (
                                            <span
                                                key={key}
                                                title={isPeriod
                                                    ? `${RARITY[key].label}: ${count} pulled ${(periodMeta?.label || '').toLowerCase()}`
                                                    : `${RARITY[key].label}: ${count}`}
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                                                    color: getRarityInk(key),
                                                }}
                                            >
                                                {getRarityIcon(key, 12)}
                                                <BoardLabel size={13} tone="currentColor" style={{ letterSpacing: 0, fontVariantNumeric: 'tabular-nums' }}>{count}</BoardLabel>
                                            </span>
                                        );
                                    })}
                                </span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* User Profile Modal - rendered outside the board for proper fixed positioning */}
            {selectedUser && (
                <UserProfile
                    userId={selectedUser}
                    onClose={() => setSelectedUser(null)}
                    isOwnProfile={user && user.id === selectedUser}
                />
            )}
        </>
    );
}