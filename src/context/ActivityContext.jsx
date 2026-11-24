import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL } from '../config/constants';
import { parseActivityDate, spinRevealDelay } from '../utils/helpers.js';
import { noteServerTime, serverNow } from '../utils/serverClock.js';
/* Imported, not copied: clearing before the arrival's timeline ends hands back a still-shuttered wheel. */
import { T_LIFT_END } from '../components/wheel/effects/arrivalTimeline.js';
import { isSaverOn } from '../config/power.js';

/* Exported only for src/dev/ArrivalTiming.jsx, the arrival timing harness; the app goes through `useActivity()`. */
export const ActivityContext = createContext(null);

// How far back mythic/insane drops are folded into the main activity feed. The board
// itself is all-time; this only governs how long a rare drop lingers in the All tab.
const RARE_FEED_MERGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/* The beat between the winning pull surfacing in the feed and First Blood naming its winner, so they read as a sequence. */
const FIRST_BLOOD_ANNOUNCE_BEAT_MS = 1200;

/* First Blood's beat, measured from the reel landing: `spinRevealDelay(wonAt)` is when the winning reel comes to rest. */
const BOUNTY_ANNOUNCE_BEAT_MS = 900;
const BOUNTY_STALE_RETRY_MS = 30_000;
const BOUNTY_CELEBRATION_MS = 7000;

/* Measured from the result. Must outlast the client timeline's T_END - T_CALL (13.4s): unmounting hands the band back to the reel. */
const ROULETTE_TEARDOWN_MS = 14200;

/* Dead-man switch from the open, on the SERVER's clock: while `roulette` is set spinning is refused and only a teardown
   gives the reel back, so any path that sets the table without arming one would need a reload. */
const ROULETTE_MAX_LIFETIME_MS = 34000;

/* TEARDOWN runs from `high_roller_result`, just inside the server's HIGH_ROLLER_SETTLE_MS (14s), and must outlast the
   reveal in effects/highRollerTimeline.js (~9.9s). MAX_LIFETIME is the dead-man switch: the longest legitimate table is 41.5s. */
const HIGH_ROLLER_TEARDOWN_MS = 13000;
const HIGH_ROLLER_MAX_LIFETIME_MS = 48000;


export function ActivityProvider({ children }) {
    const [feed, setFeed] = useState([]);
    const [rareFeed, setRareFeed] = useState([]); // All-time mythic/insane, for the board
    const [lastId, setLastId] = useState(null);
    const [newItems, setNewItems] = useState([]);
    const [initialized, setInitialized] = useState(false);
    const [recursionStatus, setRecursionStatus] = useState({ active: false });
    const [globalEventStatus, setGlobalEventStatus] = useState({ active: false, milestone: null });

    // Mirrors globalEventStatus so recoverGlobalEventStatus can read it outside a state updater, which React may run twice.
    const globalEventStatusRef = useRef(globalEventStatus);
    useEffect(() => {
        globalEventStatusRef.current = globalEventStatus;
    }, [globalEventStatus]);

    /* The `activatesAt` (raw server ms) of the latest event instance seen: the end broadcast nulls `type`, so only the start
       tells a finished event from a missed one. Captured before `applyGlobalEventStatus` corrects it in place. */
    const knownEventStartRef = useRef(null);

    const [kotwLeaderboard, setKotwLeaderboard] = useState([]);
    const [kotwUserStats, setKotwUserStats] = useState(null);
    const [kotwWinner, setKotwWinner] = useState(null);
    const [kotwSpinPending, setKotwSpinPending] = useState(false); // Track if user is mid-spin
    const [eventSelection, setEventSelection] = useState(null); // For event selection animation

    const [firstBloodWinner, setFirstBloodWinner] = useState(null);

    const [communityGoal, setCommunityGoal] = useState(null); // { progress, target, participants }
    const [communityGoalResult, setCommunityGoalResult] = useState(null);
    const [communityGoalResultPending, setCommunityGoalResultPending] = useState(false);

    // Both events hold their result back so it cannot land mid-spin; these keep their banners up through that gap.
    const [kotwWinnerPending, setKotwWinnerPending] = useState(false);
    const [firstBloodResultPending, setFirstBloodResultPending] = useState(false);
    const [communityGoalReward, setCommunityGoalReward] = useState(null); // This user's payout

    /* `arrival` is the public manifest; `arrivalCrate` is this player's private new balance. */
    const [arrival, setArrival] = useState(null);
    const [arrivalCrate, setArrivalCrate] = useState(null);

    /* `roulette` is fixed at the open and its presence is the event; `rouletteTable` is replaced wholesale per frame;
       `rouletteMyBet` is a local echo. Balances ride the private `roulette_payout`, never here. */
    const [roulette, setRoulette] = useState(null);
    const [rouletteTable, setRouletteTable] = useState(null);
    const [rouletteResult, setRouletteResult] = useState(null);
    const [rouletteMyBet, setRouletteMyBetState] = useState(null);
    const [roulettePayout, setRoulettePayout] = useState(null);

    /* `highRoller` holds the fixed facts and its presence is the event; `highRollerTable` is replaced wholesale;
       `highRollerPayout` is this player's private outcome. */
    const [highRoller, setHighRoller] = useState(null);
    const [highRollerTable, setHighRollerTableState] = useState(null);
    const [highRollerResult, setHighRollerResult] = useState(null);
    const [highRollerPayout, setHighRollerPayout] = useState(null);
    // Read by applyHighRollerTable: an action's response can land after the
    // result, and must not put the hole card back face down.
    const highRollerSettledRef = useRef(false);

    /* Daily bounties run all day underneath the global events (see wheel-backend services/dailyBounty.js). A claim updates the
       board only when the celebration shows: the broadcast leaves before the winner's reel stops. */
    const [bountyBoard, setBountyBoard] = useState(null);
    const [bountyWinsToday, setBountyWinsToday] = useState(0);
    const [bountyCelebration, setBountyCelebration] = useState(null);
    const bountyRevealTimeoutRef = useRef(null);
    const bountyClearTimeoutRef = useRef(null);
    // A board dropped while a claim's reveal held the card back; the reveal refetches once shown.
    const bountyBoardStaleRef = useRef(false);
    const pendingWinsTodayRef = useRef(null);

    /* Held until the celebration reveals: the wheel turns gold above zero, which would spoil a spin still turning. */
    const [mysteryBoxes, setMysteryBoxes] = useState(0);
    const pendingBoxesRef = useRef(null);

    const isVisibleRef = useRef(true);
    const eventSourceRef = useRef(null);
    // The SSE reconnect's backoff state. Both live outside the effect's closure
    // so a re-run cannot strand a pending timer or reset a backoff mid-storm.
    const reconnectTimerRef = useRef(null);
    const reconnectAttemptRef = useRef(0);
    const lastIdRef = useRef(null);
    const initializedRef = useRef(false);

    const eventSelectionTimeoutRef = useRef(null);
    const kotwWinnerDelayTimeoutRef = useRef(null);
    const kotwWinnerTimeoutRef = useRef(null);
    const firstBloodTimeoutRef = useRef(null);
    const firstBloodClearTimeoutRef = useRef(null);
    const rouletteClearTimeoutRef = useRef(null);
    const highRollerClearTimeoutRef = useRef(null);
    const communityGoalResultTimeoutRef = useRef(null);
    const communityGoalClearTimeoutRef = useRef(null);
    const arrivalTimeoutRef = useRef(null);
    const arrivalClearTimeoutRef = useRef(null);
    // True while this client's own wheel is animating; see deferResultUntilLanding().
    const spinInFlightRef = useRef(false);
    const deferredResultRevealsRef = useRef([]);
    const deferredResultGuardsRef = useRef([]);
    // A list: several drops can be in their reveal window at once, each with its own timer.
    const feedRevealTimeoutsRef = useRef([]);

    useEffect(() => {
        lastIdRef.current = lastId;
    }, [lastId]);

    useEffect(() => {
        initializedRef.current = initialized;
    }, [initialized]);

    const fetchRecursionStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/recursion/status`, { credentials: 'include' });
            const data = await res.json();
            setRecursionStatus(data);
        } catch (e) {
            console.error('[ActivityContext] Failed to fetch recursion status:', e);
        }
    }, []);

    /* The full status is only pushed when event state changes, so the milestone is refreshed separately, on a timer, from the
       cheap endpoint. It writes into the same `globalEventStatus.milestone`. */
    const refreshMilestone = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/global-event/milestone`, { credentials: 'include' });
            if (!res.ok) return;
            const milestone = await res.json();
            if (!milestone || typeof milestone.remaining !== 'number') return;
            setGlobalEventStatus(prev => ({ ...prev, milestone }));
        } catch {
            // A stale meter is a fine failure; the next tick tries again.
        }
    }, []);

    /* Shared by the fetch and every spin response, which all carry the same getEventState() payload. */
    const applyGlobalEventStatus = useCallback(async (data) => {
        try {
            if (!data) return;

            /* Kept raw: THE PARLOUR's timeline reads it through `serverNow()`, which expects server ms, and the block below rewrites it to local. */
            const rawActivatesAt = data.activatesAt;
            if (data.type && rawActivatesAt) knownEventStartRef.current = rawActivatesAt;

            if (data.serverTime && (data.activatesAt || data.expiresAt)) {
                const clockOffset = data.serverTime - Date.now();
                console.log('[Fetch] Clock offset:', clockOffset, 'ms');
                if (data.activatesAt) {
                    data.activatesAt = data.activatesAt - clockOffset;
                }
                if (data.expiresAt) {
                    data.expiresAt = data.expiresAt - clockOffset;
                }
            }

            setGlobalEventStatus(data);

            // Fetched here so a page loaded mid-event gets the standings; they are otherwise pushed only when someone spins.
            if (data?.active && data?.type === 'king_of_wheel') {
                try {
                    const kotwRes = await fetch(`${API_BASE_URL}/api/kotw/leaderboard`, { credentials: 'include' });
                    const kotwData = await kotwRes.json();
                    if (kotwData?.leaderboard) setKotwLeaderboard(kotwData.leaderboard);
                    // The endpoint returns the caller's own row when signed in.
                    if (kotwData?.userStats) setKotwUserStats(kotwData.userStats);
                } catch (e) {
                    console.error('[ActivityContext] Failed to fetch KOTW leaderboard:', e);
                }
            }
            /* `roulette_open` is one-shot, so a page loaded mid-table restores it from here. The origin is `rawActivatesAt` (see above). */
            if (data?.active && data?.type === 'roulette' && data?.data) {
                const table = data.data;
                setRoulette({
                    pockets: table.pockets,
                    stake: table.stake,
                    multipliers: table.multipliers,
                    openedAt: rawActivatesAt,
                    betsCloseAt: table.betsCloseAt,
                    expiresAt: data.expiresAt,
                });
                setRouletteTable({ seats: table.seats || [], counts: table.counts });
                // A pocket in the payload means the ball has already dropped —
                // the player walked in on the payout rather than on the betting.
                if (table.pocket) {
                    setRouletteResult({
                        pocketIndex: table.pocketIndex,
                        pocket: table.pocket,
                        results: [],
                        totalPaid: 0,
                    });
                }
            }
            /* A page loaded mid-table restores it from here, the Parlour's way; the origin is `rawActivatesAt`. */
            if (data?.active && data?.type === 'high_roller' && data?.data) {
                const table = data.data;
                setHighRoller({
                    payouts: table.payouts,
                    openedAt: rawActivatesAt,
                    dealAt: table.dealAt,
                    actsFrom: table.actsFrom,
                    playClosesAt: table.playClosesAt,
                    expiresAt: data.expiresAt,
                });
                setHighRollerTableState({ dealer: table.dealer, seats: table.seats || [] });
                // Walked in on the reveal: nothing arms the teardown from here, which the dead-man switch covers. Always reset, or a new
                // table inherits the previous one's settled flag and its moves are refused.
                highRollerSettledRef.current = !!table.results;
                if (table.results) {
                    setHighRollerResult({ dealer: table.dealer, results: table.results });
                }
            }
        } catch (e) {
            console.error('[ActivityContext] Failed to apply global event status:', e);
        }
    }, []);

    // On mount and tab return, since a backgrounded tab can miss the broadcasts. Never while a celebration is pending,
    // or it would print the winner early.
    const fetchDailyBounty = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/bounty`, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (bountyRevealTimeoutRef.current) {
                bountyBoardStaleRef.current = true;
                return;
            }
            setBountyBoard(data.bounties ? data : null);
            setMysteryBoxes(data.mysteryBoxes || 0);
            setBountyWinsToday(data.winsToday || 0);
        } catch (e) {
            console.error('[ActivityContext] Failed to fetch daily bounty:', e);
        }
    }, []);

    // Safety net under the opening broadcast: once the time passes, ask (a few seconds late on purpose), and keep asking every
    // BOUNTY_STALE_RETRY_MS while the board still points at the past. `bountyRetry` is what re-runs this effect.
    const nextBountyAt = bountyBoard?.next?.opensAt || bountyBoard?.dayEndsAt || null;
    const [bountyRetry, setBountyRetry] = useState(0);
    useEffect(() => {
        if (!nextBountyAt) return undefined;
        const wait = Date.parse(nextBountyAt) - serverNow() + 5000;
        if (!Number.isFinite(wait)) return undefined;
        // Beyond setTimeout's range: nothing opens that far out; a later fetch will do.
        if (wait > 2 ** 31 - 1) return undefined;
        const stale = wait <= 0;
        const timer = setTimeout(() => {
            fetchDailyBounty();
            if (stale) setBountyRetry(n => n + 1);
        }, stale ? BOUNTY_STALE_RETRY_MS : wait);
        return () => clearTimeout(timer);
    }, [nextBountyAt, bountyRetry, fetchDailyBounty]);

    const fetchGlobalEventStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/global-event/status`, { credentials: 'include' });
            await applyGlobalEventStatus(await res.json());
        } catch (e) {
            console.error('[ActivityContext] Failed to fetch global event status:', e);
        }
    }, [applyGlobalEventStatus]);

    /* RECOVERY ONLY: fills in an event a dead SSE connection missed, from the status every spin response carries. A slow
       response can arrive after `global_event_end`, so this may add what was missed but never undo an ending. */
    const recoverGlobalEventStatus = useCallback((payload) => {
        if (!payload?.type) return;
        if (!payload.active && !payload.pending) return;

        // Already known: the live state is fresher than any spin response.
        const current = globalEventStatusRef.current;
        if (current?.type === payload.type && (current.active || current.pending)) return;

        /* Already seen and over: a spin response built before the end can arrive after it, and re-opening a finished table
           leaves nothing to arm its teardown. Matched by start, since the end nulls `type`. */
        if (payload.activatesAt && payload.activatesAt === knownEventStartRef.current) return;

        console.log('[Spin] Recovered a missed global event from the spin response:', payload.type);
        // Not awaited: the caller is a spin handler mid-animation and has nothing to do
        // with the result. applyGlobalEventStatus swallows its own failures.
        applyGlobalEventStatus(payload);
    }, [applyGlobalEventStatus]);

    const fetchActivity = useCallback(async () => {
        if (!isVisibleRef.current) return;

        try {
            // Only this request is timed (see utils/serverClock.js): the two run concurrently, so timing both would measure the slower.
            const sentAt = Date.now();
            let allRoundTrip;
            const [allRes, rareRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/activity/all?limit=100`, { credentials: 'include' })
                    .then(res => { allRoundTrip = Date.now() - sentAt; return res; }),
                // All-time, for the Mythic & Insane board; the main feed still only merges the last 7 days.
                fetch(`${API_BASE_URL}/api/activity/rare?days=all&limit=500`)
            ]);

            const allData = await allRes.json();
            const rareData = await rareRes.json();

            if (rareData.feed) {
                setRareFeed(rareData.feed);
            }

            if (allData.feed) {
                if (allData.serverTime) {
                    // The authoritative clock sample: the only one whose travel time is known.
                    noteServerTime(allData.serverTime, allRoundTrip);
                }

                if (allData.recursionStatus !== undefined) {
                    setRecursionStatus(prev => {
                        if (!prev.active && allData.recursionStatus.active) {
                            return allData.recursionStatus;
                        }
                        if (allData.recursionStatus.userSpinsRemaining !== undefined || allData.recursionStatus.remainingTime !== undefined) {
                            return { ...prev, ...allData.recursionStatus };
                        }
                        return prev;
                    });
                }

                let mergedFeed = allData.feed;
                if (rareData.feed && rareData.feed.length > 0) {
                    const rareCutoff = Date.now() - RARE_FEED_MERGE_WINDOW_MS;
                    const existingIds = new Set(allData.feed.map(item => item.id));
                    const additionalRare = rareData.feed.filter(item =>
                        !existingIds.has(item.id) && parseActivityDate(item.created_at) >= rareCutoff);
                    if (additionalRare.length > 0) {
                        mergedFeed = [...allData.feed, ...additionalRare]
                            .sort((a, b) => parseActivityDate(b.created_at) - parseActivityDate(a.created_at));
                    }
                }

                /* Hold back drops still in their reveal window, as the SSE path does: this replaces the whole feed and is not gated on `lastId`.
                   Held items are the youngest, so prepending oldest first keeps the order. */
                const revealNow = [];
                const revealLater = [];
                for (const item of mergedFeed) {
                    (spinRevealDelay(item.created_at) > 0 ? revealLater : revealNow).push(item);
                }
                for (const item of revealLater) {
                    const revealTimeout = setTimeout(() => {
                        setFeed(prev => (prev.some(f => f.id === item.id)
                            ? prev
                            : [item, ...prev].slice(0, 150)));
                        feedRevealTimeoutsRef.current =
                            feedRevealTimeoutsRef.current.filter(id => id !== revealTimeout);
                    }, spinRevealDelay(item.created_at));
                    feedRevealTimeoutsRef.current.push(revealTimeout);
                }

                const newestId = mergedFeed[0]?.id;
                const currentLastId = lastIdRef.current;
                const isInit = initializedRef.current;

                if (!isInit) {
                    setLastId(newestId);
                    setInitialized(true);
                    setFeed(revealNow);
                } else if (currentLastId !== null && newestId && newestId > currentLastId) {
                    const newlyDetected = mergedFeed.filter(item => item.id > currentLastId);
                    setNewItems(newlyDetected);
                    setLastId(newestId);
                    setFeed(revealNow);
                } else {
                    setFeed(revealNow);
                    setNewItems([]);
                }
            }
        } catch (e) {
            console.error('Failed to fetch activity:', e);
        }
    }, []); // No dependencies - uses refs

    // Results arriving mid-spin wait for markSpinLanded() rather than a fixed delay; a guard timer releases a result stranded
    // by a landing that never fires.
    const deferResultUntilLanding = useCallback((reveal) => {
        deferredResultRevealsRef.current.push(reveal);
        const guard = setTimeout(() => {
            const i = deferredResultRevealsRef.current.indexOf(reveal);
            if (i >= 0) {
                deferredResultRevealsRef.current.splice(i, 1);
                reveal();
            }
        }, 15000);
        deferredResultGuardsRef.current.push(guard);
    }, []);

    const markSpinInFlight = useCallback(() => {
        spinInFlightRef.current = true;
    }, []);

    const markSpinLanded = useCallback(() => {
        spinInFlightRef.current = false;
        const reveals = deferredResultRevealsRef.current.splice(0);
        deferredResultGuardsRef.current.forEach(clearTimeout);
        deferredResultGuardsRef.current = [];
        for (const reveal of reveals) reveal();
    }, []);

    useEffect(() => {
        fetchActivity();
        fetchGlobalEventStatus();
        fetchDailyBounty();

        const connectSSE = () => {
            if (eventSourceRef.current?.readyState === EventSource.OPEN) return;

            try {
                const eventSource = new EventSource(`${API_BASE_URL}/api/events/stream`, {
                    withCredentials: true
                });

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        // Taken before the switch so even an unhandled message type keeps the clock offset fresh (see utils/serverClock.js).
                        noteServerTime(data.timestamp);

                        switch (data.type) {
                            case 'recursion_wakeup':
                                console.log('[SSE] Recursion wake-up received');
                                fetchRecursionStatus();
                                break;

                            case 'global_event_status':
                            case 'global_event_countdown':
                            case 'global_event_start':
                                console.log('[SSE] Global event update:', data.type, data);
                                // All three carry the target, and global_event_status also carries progress, so a mid-event join gets a filled bar.
                                if (data.eventType === 'community_goal') {
                                    setCommunityGoal(prev => ({
                                        progress: data.progress ?? prev?.progress ?? 0,
                                        target: data.target ?? prev?.target ?? 0,
                                        tiers: data.tiers ?? prev?.tiers ?? [],
                                        tierReached: data.tierReached ?? prev?.tierReached ?? null,
                                        payout: data.payout ?? prev?.payout ?? data.participationReward ?? 0,
                                        participationReward: data.participationReward ?? prev?.participationReward ?? 0,
                                        participants: data.participants ?? prev?.participants ?? 0,
                                        // Stages gate on rare-or-better drops as well as points.
                                        specialDrops: data.specialDrops ?? prev?.specialDrops ?? 0,
                                    }));
                                }
                                // The instance, before the offset correction below
                                // rewrites it. See knownEventStartRef.
                                if (data.activatesAt) knownEventStartRef.current = data.activatesAt;
                                setGlobalEventStatus(prev => {
                                    let active = prev.active;
                                    let pending = prev.pending;

                                    if (data.type === 'global_event_countdown') {
                                        active = false;
                                        pending = true;
                                    } else if (data.type === 'global_event_start') {
                                        active = true;
                                        pending = false;
                                    } else if (data.active !== undefined) {
                                        active = data.active;
                                        pending = data.pending || false;
                                    }

                                    // Adjusted for clock skew so countdowns are right even when the client's clock differs.
                                    let adjustedActivatesAt = data.activatesAt || prev.activatesAt;
                                    let adjustedExpiresAt = data.expiresAt || prev.expiresAt;

                                    if (data.serverTime && (data.activatesAt || data.expiresAt)) {
                                        const clockOffset = data.serverTime - Date.now();
                                        console.log('[SSE] Clock offset:', clockOffset, 'ms');
                                        if (data.activatesAt) {
                                            adjustedActivatesAt = data.activatesAt - clockOffset;
                                        }
                                        if (data.expiresAt) {
                                            adjustedExpiresAt = data.expiresAt - clockOffset;
                                        }
                                    }

                                    return {
                                        ...prev,
                                        active,
                                        pending,
                                        type: data.eventType || prev.type,
                                        data: data.boostedRarity
                                            ? { boostedRarity: data.boostedRarity, multiplier: data.multiplier }
                                            : data.eventType === 'community_goal'
                                                ? {
                                                    target: data.target,
                                                    tiers: data.tiers,
                                                    participationReward: data.participationReward,
                                                }
                                                : prev.data,
                                        activatesAt: adjustedActivatesAt,
                                        expiresAt: adjustedExpiresAt,
                                        milestone: data.milestone || prev.milestone,
                                    };
                                });
                                break;

                            case 'global_event_end':
                                console.log('[SSE] Global event ended:', data);
                                setGlobalEventStatus({
                                    active: false,
                                    pending: false,
                                    type: null,
                                    data: null,
                                    milestone: data.milestone || null
                                });
                                setKotwLeaderboard([]);
                                setKotwUserStats(null);
                                // Deliberately not cleared here: this lands ~5s before the result, and the result handler clears it. See communityGoalResultPending.
                                break;

                            case 'global_event_milestone':
                                // Pushed after every spin while no event runs: the milestone's only live signal.
                                if (data.milestone && typeof data.milestone.remaining === 'number') {
                                    setGlobalEventStatus(prev => ({ ...prev, milestone: data.milestone }));
                                }
                                break;

                            case 'event_selection':
                                console.log('[SSE] Event selection started:', data);
                                if (eventSelectionTimeoutRef.current) {
                                    clearTimeout(eventSelectionTimeoutRef.current);
                                }
                                setEventSelection(data);
                                eventSelectionTimeoutRef.current = setTimeout(() => {
                                    setEventSelection(null);
                                    eventSelectionTimeoutRef.current = null;
                                }, data.selectionDuration + 1000);
                                break;

                            case 'kotw_leaderboard':
                                console.log('[SSE] KOTW leaderboard update:', data);
                                setKotwLeaderboard(data.leaderboard || []);
                                break;

                            case 'kotw_winner':
                                console.log('[SSE] KOTW winner announced:', data);
                                if (kotwWinnerDelayTimeoutRef.current) {
                                    clearTimeout(kotwWinnerDelayTimeoutRef.current);
                                }
                                if (kotwWinnerTimeoutRef.current) {
                                    clearTimeout(kotwWinnerTimeoutRef.current);
                                }
                                // Delayed like First Blood: KOTW ends on a server timer, routinely mid-spin, and must not land over an unlanded wheel.
                                setKotwWinnerPending(true);
                                kotwWinnerDelayTimeoutRef.current = setTimeout(() => {
                                    setKotwWinner(data);
                                    setKotwWinnerPending(false);
                                    kotwWinnerDelayTimeoutRef.current = null;
                                    kotwWinnerTimeoutRef.current = setTimeout(() => {
                                        setKotwWinner(null);
                                        setKotwLeaderboard([]);
                                        setKotwUserStats(null);
                                        kotwWinnerTimeoutRef.current = null;
                                    }, 30000); // Keep winner visible for 30 seconds
                                }, 5000); // Wait for spin animation to complete
                                break;

                            case 'community_goal_progress':
                                // Already throttled server-side past the spin animation, so safe to apply at once.
                                setCommunityGoal(prev => ({
                                    ...prev,
                                    progress: data.progress,
                                    target: data.target,
                                    tiers: data.tiers ?? prev?.tiers ?? [],
                                    tierReached: data.tierReached ?? null,
                                    payout: data.payout ?? prev?.payout ?? 0,
                                    participants: data.participants,
                                    specialDrops: data.specialDrops ?? prev?.specialDrops ?? 0,
                                }));
                                break;

                            case 'community_goal_result': {
                                console.log('[SSE] Community Goal result:', data);
                                if (communityGoalResultTimeoutRef.current) {
                                    clearTimeout(communityGoalResultTimeoutRef.current);
                                }
                                if (communityGoalClearTimeoutRef.current) {
                                    clearTimeout(communityGoalClearTimeoutRef.current);
                                }
                                // Flagged at once so the banner holds its ground through the delay below instead of vanishing and popping back.
                                setCommunityGoalResultPending(true);

                                const reveal = () => {
                                    setCommunityGoalResult(data);
                                    setCommunityGoalResultPending(false);
                                    setCommunityGoal(null);
                                    communityGoalResultTimeoutRef.current = null;
                                    communityGoalClearTimeoutRef.current = setTimeout(() => {
                                        setCommunityGoalResult(null);
                                        setCommunityGoalReward(null);
                                        communityGoalClearTimeoutRef.current = null;
                                    }, 12000);
                                };

                                if (spinInFlightRef.current) {
                                    // Mid-spin: defer to the wheel's actual landing rather than a fixed wait.
                                    deferResultUntilLanding(reveal);
                                } else {
                                    // No local spin to spoil - keep the settle rhythm.
                                    communityGoalResultTimeoutRef.current = setTimeout(reveal, 5000);
                                }
                                break;
                            }

                            case 'arrival': {
                                console.log('[SSE] Arrival:', data);
                                if (arrivalTimeoutRef.current) clearTimeout(arrivalTimeoutRef.current);
                                if (arrivalClearTimeoutRef.current) clearTimeout(arrivalClearTimeoutRef.current);

                                const show = () => {
                                    setArrival(data);
                                    arrivalTimeoutRef.current = null;
                                    /* This also re-enables spinning, so it must not fire before the reel is back. */
                                    arrivalClearTimeoutRef.current = setTimeout(() => {
                                        setArrival(null);
                                        setArrivalCrate(null);
                                        arrivalClearTimeoutRef.current = null;
                                    }, T_LIFT_END * 1000 + 300);
                                };

                                // Same deferral as the community goal and First Blood: an arrival must not land over a turning wheel.
                                if (spinInFlightRef.current) {
                                    deferResultUntilLanding(show);
                                } else {
                                    show();
                                }
                                break;
                            }

                            case 'roulette_open': {
                                console.log('[SSE] Parlour table open:', data);
                                if (rouletteClearTimeoutRef.current) {
                                    clearTimeout(rouletteClearTimeoutRef.current);
                                    rouletteClearTimeoutRef.current = null;
                                }
                                setRouletteResult(null);
                                setRoulettePayout(null);
                                setRouletteMyBetState(null);
                                setRouletteTable({ seats: data.seats || [], counts: data.counts });
                                setRoulette(data);

                                /* THE PARLOUR never sends `global_event_start`, so the status is set here, or connected clients see no event running.
                                   `openedAt` stays raw, for the reason in applyGlobalEventStatus. */
                                knownEventStartRef.current = data.openedAt;
                                const parlourOffset = data.serverTime ? data.serverTime - Date.now() : 0;
                                setGlobalEventStatus(prev => ({
                                    ...prev,
                                    active: true,
                                    pending: false,
                                    type: 'roulette',
                                    activatesAt: data.openedAt ? data.openedAt - parlourOffset : prev.activatesAt,
                                    expiresAt: data.expiresAt ? data.expiresAt - parlourOffset : prev.expiresAt,
                                }));

                                /* Deliberately NOT deferred behind a spin in flight: it opens a window to act in, and there is no result yet to spoil. */
                                break;
                            }

                            case 'roulette_bets':
                                /* Replaced wholesale, not merged: a merge cannot tell a vanished seat from a dropped frame. */
                                setRouletteTable({ seats: data.seats || [], counts: data.counts });
                                break;

                            case 'roulette_result': {
                                console.log('[SSE] Parlour result:', data);
                                setRouletteResult(data);
                                /* The result must outlive the theatre's unmount, or the payout board empties while the frame is still collapsing. */
                                if (rouletteClearTimeoutRef.current) {
                                    clearTimeout(rouletteClearTimeoutRef.current);
                                }
                                rouletteClearTimeoutRef.current = setTimeout(() => {
                                    setRoulette(null);
                                    setRouletteTable(null);
                                    setRouletteResult(null);
                                    setRouletteMyBetState(null);
                                    rouletteClearTimeoutRef.current = null;
                                }, ROULETTE_TEARDOWN_MS);
                                break;
                            }

                            case 'roulette_payout':
                                console.log('[SSE] Parlour payout:', data);
                                setRoulettePayout(data);
                                break;

                            case 'high_roller_open': {
                                console.log('[SSE] High Roller table open:', data);
                                if (highRollerClearTimeoutRef.current) {
                                    clearTimeout(highRollerClearTimeoutRef.current);
                                    highRollerClearTimeoutRef.current = null;
                                }
                                highRollerSettledRef.current = false;
                                setHighRollerResult(null);
                                setHighRollerPayout(null);
                                setHighRollerTableState({ dealer: data.dealer, seats: data.seats || [] });
                                setHighRoller({
                                    payouts: data.payouts,
                                    openedAt: data.openedAt,
                                    dealAt: data.dealAt,
                                    actsFrom: data.actsFrom,
                                    playClosesAt: data.playClosesAt,
                                    expiresAt: data.expiresAt,
                                });
                                /* No `global_event_start` here either (see `roulette_open`), and not deferred, for the Parlour's reason. */
                                knownEventStartRef.current = data.openedAt;
                                const highRollerOffset = data.serverTime ? data.serverTime - Date.now() : 0;
                                setGlobalEventStatus(prev => ({
                                    ...prev,
                                    active: true,
                                    pending: false,
                                    type: 'high_roller',
                                    activatesAt: data.openedAt ? data.openedAt - highRollerOffset : prev.activatesAt,
                                    expiresAt: data.expiresAt ? data.expiresAt - highRollerOffset : prev.expiresAt,
                                }));
                                break;
                            }

                            case 'high_roller_table':
                                // Never after the settle: a late throttled frame would turn the hole card back over.
                                if (!highRollerSettledRef.current) {
                                    setHighRollerTableState({ dealer: data.dealer, seats: data.seats || [] });
                                }
                                break;

                            case 'high_roller_result': {
                                console.log('[SSE] High Roller result:', data);
                                highRollerSettledRef.current = true;
                                setHighRollerResult(data);
                                setHighRollerTableState({ dealer: data.dealer, seats: data.results || [] });
                                // The table settles early when everyone is done,
                                // and the server pulls its expiry in to match.
                                if (data.expiresAt) {
                                    const offset = data.serverTime ? data.serverTime - Date.now() : 0;
                                    setGlobalEventStatus(prev => (prev?.type === 'high_roller'
                                        ? { ...prev, expiresAt: data.expiresAt - offset }
                                        : prev));
                                }
                                if (highRollerClearTimeoutRef.current) {
                                    clearTimeout(highRollerClearTimeoutRef.current);
                                }
                                highRollerClearTimeoutRef.current = setTimeout(() => {
                                    setHighRoller(null);
                                    setHighRollerTableState(null);
                                    setHighRollerResult(null);
                                    highRollerClearTimeoutRef.current = null;
                                }, HIGH_ROLLER_TEARDOWN_MS);
                                break;
                            }

                            case 'high_roller_payout':
                                console.log('[SSE] High Roller payout:', data);
                                setHighRollerPayout(data);
                                break;

                            case 'arrival_crate':
                                console.log('[SSE] Arrival crate:', data);
                                setArrivalCrate(data);
                                break;

                            case 'community_goal_reward':
                                // Sent only to participants, with their own new balance.
                                console.log('[SSE] Community Goal reward:', data);
                                setCommunityGoalReward(data);
                                break;

                            case 'daily_bounty':
                            case 'daily_bounty_day':
                                // `daily_bounty`: a bounty opened. `daily_bounty_day`: midnight rollover, this player's count back to zero.
                                // Nothing to hold back for either: no pull is behind it.
                                console.log(`[SSE] ${data.type}:`, data.bounty || data.board);
                                if (data.type === 'daily_bounty_day') setBountyWinsToday(0);
                                if (!data.board) break;
                                if (bountyRevealTimeoutRef.current) {
                                    bountyBoardStaleRef.current = true;
                                } else {
                                    setBountyBoard(data.board);
                                }
                                break;

                            case 'daily_bounty_claimed': {
                                console.log('[SSE] Daily bounty claimed:', data.bounty);
                                const claimed = data.bounty;
                                if (!claimed?.winner) break;

                                if (bountyRevealTimeoutRef.current) {
                                    clearTimeout(bountyRevealTimeoutRef.current);
                                }
                                if (bountyClearTimeoutRef.current) {
                                    clearTimeout(bountyClearTimeoutRef.current);
                                }

                                const reveal = () => {
                                    bountyRevealTimeoutRef.current = null;
                                    if (data.board) setBountyBoard(data.board);
                                    setBountyCelebration(claimed);
                                    // The winner's box, held with the rest - see
                                    // mysteryBoxes. Only the winner ever has one.
                                    if (pendingBoxesRef.current !== null) {
                                        setMysteryBoxes(pendingBoxesRef.current);
                                        pendingBoxesRef.current = null;
                                    }
                                    if (pendingWinsTodayRef.current !== null) {
                                        setBountyWinsToday(pendingWinsTodayRef.current);
                                        pendingWinsTodayRef.current = null;
                                    }
                                    // Something arrived while this was held back -
                                    // an opening, most likely. Read it now.
                                    if (bountyBoardStaleRef.current) {
                                        bountyBoardStaleRef.current = false;
                                        fetchDailyBounty();
                                    }
                                    bountyClearTimeoutRef.current = setTimeout(() => {
                                        setBountyCelebration(null);
                                        bountyClearTimeoutRef.current = null;
                                    }, BOUNTY_CELEBRATION_MS);
                                };

                                // First Blood waits for the winning reel (from `wonAt`, server clock) and this client's own wheel.
                                const revealAt = Date.now() + spinRevealDelay(claimed.winner.wonAt) + BOUNTY_ANNOUNCE_BEAT_MS;
                                const revealAfterPull = () => {
                                    const wait = revealAt - Date.now();
                                    // Held in the ref even at zero so fetchDailyBounty
                                    // cannot print the winner first in between.
                                    bountyRevealTimeoutRef.current = setTimeout(reveal, Math.max(0, wait));
                                };
                                // Marks the reveal as pending for fetchDailyBounty's
                                // guard while it waits on the landing, too.
                                bountyRevealTimeoutRef.current = -1;
                                if (spinInFlightRef.current) {
                                    deferResultUntilLanding(revealAfterPull);
                                } else {
                                    revealAfterPull();
                                }
                                break;
                            }

                            case 'daily_bounty_payout':
                                // Normally arrives while the reveal is still pending and is picked up by it; otherwise applied now.
                                console.log('[SSE] Daily bounty payout:', data);
                                if (bountyRevealTimeoutRef.current) {
                                    pendingBoxesRef.current = data.mysteryBoxes ?? 0;
                                    pendingWinsTodayRef.current = data.winsToday ?? null;
                                } else {
                                    setMysteryBoxes(data.mysteryBoxes ?? 0);
                                    if (data.winsToday != null) setBountyWinsToday(data.winsToday);
                                }
                                break;

                            case 'first_blood_result': {
                                console.log('[SSE] First Blood result:', data);
                                if (firstBloodTimeoutRef.current) {
                                    clearTimeout(firstBloodTimeoutRef.current);
                                }
                                if (firstBloodClearTimeoutRef.current) {
                                    clearTimeout(firstBloodClearTimeoutRef.current);
                                }
                                setFirstBloodResultPending(true);

                                const reveal = () => {
                                    setFirstBloodWinner(data);
                                    setFirstBloodResultPending(false);
                                    firstBloodTimeoutRef.current = null;
                                    firstBloodClearTimeoutRef.current = setTimeout(() => {
                                        setFirstBloodWinner(null);
                                        firstBloodClearTimeoutRef.current = null;
                                    }, 8000); // Show winner for 8 seconds before clearing
                                };

                                // Must clear both this client's landing (deferred below) and the winning pull reaching the feed, which is held until
                                // `created_at + SPIN_REVEAL_MS`: so measure from `wonAt` on the server's clock, plus a beat. No `wonAt`: flat settle.
                                const feedDelay = data.winner?.wonAt
                                    ? spinRevealDelay(data.winner.wonAt) + FIRST_BLOOD_ANNOUNCE_BEAT_MS
                                    : 5000;
                                const revealAt = Date.now() + feedDelay;

                                const revealAfterPull = () => {
                                    const wait = revealAt - Date.now();
                                    if (wait <= 0) {
                                        reveal();
                                        return;
                                    }
                                    firstBloodTimeoutRef.current = setTimeout(reveal, wait);
                                };

                                if (spinInFlightRef.current) {
                                    // Whichever wait finishes last decides.
                                    deferResultUntilLanding(revealAfterPull);
                                } else {
                                    revealAfterPull();
                                }
                                break;
                            }

                            case 'activity':
                                if (data.item && data.item.id) {

                                    // Not before the reel that produced this drop has finished turning. `spinRevealDelay` measures from `created_at`,
                                    // so a late drop is not held twice.
                                    const revealIn = spinRevealDelay(data.item.created_at);
                                    const prependToFeed = () => setFeed(prev => {
                                        if (prev.some(item => item.id === data.item.id)) return prev;
                                        return [data.item, ...prev].slice(0, 150);
                                    });

                                    if (revealIn <= 0) {
                                        prependToFeed();
                                    } else {
                                        const revealTimeout = setTimeout(() => {
                                            prependToFeed();
                                            feedRevealTimeoutsRef.current =
                                                feedRevealTimeoutsRef.current.filter(id => id !== revealTimeout);
                                        }, revealIn);
                                        feedRevealTimeoutsRef.current.push(revealTimeout);
                                    }

                                    // `lastId` moves at once: holding it would let the catch-up fetch pull the delayed drop and prepend it early.
                                    setLastId(prev => {
                                        if (prev === null || data.item.id > prev) return data.item.id;
                                        return prev;
                                    });

                                    setNewItems(prev => {
                                        if (prev.some(item => item.id === data.item.id)) return prev;
                                        return [data.item, ...prev].slice(0, 50);
                                    });

                                    setInitialized(true);
                                }
                                break;

                            case 'chat':
                                window.dispatchEvent(new CustomEvent('sse-chat-message', {
                                    detail: data.message
                                }));
                                break;

                            case 'chat_typing':
                                window.dispatchEvent(new CustomEvent('sse-chat-typing', {
                                    detail: { userId: data.userId, username: data.username, isTyping: data.isTyping }
                                }));
                                break;

                            case 'online_count':
                                window.dispatchEvent(new CustomEvent('sse-online-count', {
                                    detail: { count: data.count, userIds: data.userIds }
                                }));
                                break;

                            case 'connected':
                                console.log('[SSE] Connected');
                                if (data.onlineCount !== undefined) {
                                    window.dispatchEvent(new CustomEvent('sse-online-count', {
                                        detail: { count: data.onlineCount, userIds: data.onlineUserIds }
                                    }));
                                }
                                break;
                        }
                    } catch (e) {
                        console.error('[SSE] Parse error:', e);
                    }
                };

                eventSource.onerror = () => {
                    console.log('[SSE] Connection error, state:', eventSource.readyState);
                    eventSource.close();
                    eventSourceRef.current = null;
                    scheduleReconnect();
                };

                // Reset on `onopen` only: `new EventSource()` succeeds whether or not anything is listening, so resetting there
                // would keep the backoff at its first step.
                eventSource.onopen = () => {
                    reconnectAttemptRef.current = 0;
                };

                eventSourceRef.current = eventSource;
            } catch (e) {
                console.error('[SSE] Connect error:', e);
                scheduleReconnect();
            }
        };

        /* Backoff from 1s doubling to 30s, a single pending timer, and no retry while hidden (`visibilitychange` reconnects). */
        const scheduleReconnect = () => {
            if (reconnectTimerRef.current) return;
            if (document.hidden) return;

            const attempt = reconnectAttemptRef.current;
            const delay = Math.min(1000 * 2 ** attempt, 30000);
            reconnectAttemptRef.current = Math.min(attempt + 1, 5);

            reconnectTimerRef.current = setTimeout(() => {
                reconnectTimerRef.current = null;
                if (document.hidden) return;
                console.log('[SSE] Attempting reconnection...');
                connectSSE();
                fetchActivity();
                // Openings, claims and the midnight rollover are all broadcasts
                // the dead connection may have missed.
                fetchDailyBounty();
            }, delay);
        };

        connectSSE();

        const handleVisibilityChange = () => {
            isVisibleRef.current = !document.hidden;

            if (document.hidden) {
                // Saver mode hangs up while hidden: an open EventSource keeps a phone's radio awake. The reconnect on return is instant.
                if (isSaverOn()) {
                    if (reconnectTimerRef.current) {
                        clearTimeout(reconnectTimerRef.current);
                        reconnectTimerRef.current = null;
                    }
                    if (eventSourceRef.current) {
                        eventSourceRef.current.close();
                        eventSourceRef.current = null;
                    }
                }
                return;
            }

            reconnectAttemptRef.current = 0;
            fetchActivity();
            fetchGlobalEventStatus();
            fetchDailyBounty();
            if (eventSourceRef.current?.readyState !== EventSource.OPEN) {
                connectSSE();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            if (eventSelectionTimeoutRef.current) {
                clearTimeout(eventSelectionTimeoutRef.current);
                eventSelectionTimeoutRef.current = null;
            }
            if (kotwWinnerDelayTimeoutRef.current) {
                clearTimeout(kotwWinnerDelayTimeoutRef.current);
                kotwWinnerDelayTimeoutRef.current = null;
            }
            if (kotwWinnerTimeoutRef.current) {
                clearTimeout(kotwWinnerTimeoutRef.current);
                kotwWinnerTimeoutRef.current = null;
            }
            if (firstBloodTimeoutRef.current) {
                clearTimeout(firstBloodTimeoutRef.current);
                firstBloodTimeoutRef.current = null;
            }
            if (firstBloodClearTimeoutRef.current) {
                clearTimeout(firstBloodClearTimeoutRef.current);
                firstBloodClearTimeoutRef.current = null;
            }
            if (communityGoalResultTimeoutRef.current) {
                clearTimeout(communityGoalResultTimeoutRef.current);
                communityGoalResultTimeoutRef.current = null;
            }
            if (communityGoalClearTimeoutRef.current) {
                clearTimeout(communityGoalClearTimeoutRef.current);
                communityGoalClearTimeoutRef.current = null;
            }
            if (rouletteClearTimeoutRef.current) {
                clearTimeout(rouletteClearTimeoutRef.current);
                rouletteClearTimeoutRef.current = null;
            }
            if (highRollerClearTimeoutRef.current) {
                clearTimeout(highRollerClearTimeoutRef.current);
                highRollerClearTimeoutRef.current = null;
            }
            if (bountyRevealTimeoutRef.current) {
                clearTimeout(bountyRevealTimeoutRef.current);
                bountyRevealTimeoutRef.current = null;
            }
            if (bountyClearTimeoutRef.current) {
                clearTimeout(bountyClearTimeoutRef.current);
                bountyClearTimeoutRef.current = null;
            }
            feedRevealTimeoutsRef.current.forEach(clearTimeout);
            feedRevealTimeoutsRef.current = [];
            deferredResultGuardsRef.current.forEach(clearTimeout);
            deferredResultGuardsRef.current = [];
            deferredResultRevealsRef.current = [];
        };
    }, [fetchActivity, fetchRecursionStatus, fetchGlobalEventStatus, fetchDailyBounty, deferResultUntilLanding]);

    const clearNewItems = useCallback(() => {
        setNewItems([]);
    }, []);

    const updateRecursionStatus = useCallback((status) => {
        setRecursionStatus(status);
    }, []);

    const updateGlobalEventStatus = useCallback((status) => {
        setGlobalEventStatus(status);
    }, []);

    const markKotwSpinStart = useCallback(() => {
        setKotwSpinPending(true);
    }, []);

    const updateKotwUserStats = useCallback((stats) => {
        setKotwUserStats(stats);
        setKotwSpinPending(false);
    }, []);

    /* Local echo: `rouletteTable` arrives on a 600ms throttle, so the button would look dead waiting for it. */
    const setRouletteMyBet = useCallback((bet) => {
        setRouletteMyBetState(bet === null || bet === undefined ? null : { bet });
    }, []);

    /* Dead-man switch for any path that sets `roulette` without a result to follow (e.g. a page loaded after the drop):
       the table refuses spins, so without it the page needs a reload. Deliberately later than T_END (29.6s). */
    useEffect(() => {
        const openedAt = roulette?.openedAt;
        if (!openedAt) return undefined;
        const id = setTimeout(() => {
            console.warn('[Parlour] Table outlived its timeline - clearing.');
            if (rouletteClearTimeoutRef.current) {
                clearTimeout(rouletteClearTimeoutRef.current);
                rouletteClearTimeoutRef.current = null;
            }
            setRoulette(null);
            setRouletteTable(null);
            setRouletteResult(null);
            setRouletteMyBetState(null);
            /* Clear the status too: no `global_event_start` exists for the parlour, so nothing else unsets it. Only for a roulette,
               since any other type is a later event. */
            setGlobalEventStatus(prev => (prev?.type === 'roulette'
                ? { ...prev, active: false, pending: false, type: null, data: null }
                : prev));
        }, Math.max(0, openedAt + ROULETTE_MAX_LIFETIME_MS - serverNow()));
        return () => clearTimeout(id);
    }, [roulette?.openedAt]);

    /* Applied from the action's response rather than waiting on the broadcast throttle; refused once settled. */
    const applyHighRollerTable = useCallback((table) => {
        if (highRollerSettledRef.current || !table) return;
        setHighRollerTableState({ dealer: table.dealer, seats: table.seats || [] });
    }, []);

    /* The Parlour's dead-man switch, for the same reason. */
    useEffect(() => {
        const openedAt = highRoller?.openedAt;
        if (!openedAt) return undefined;
        const id = setTimeout(() => {
            console.warn('[High Roller] Table outlived its timeline - clearing.');
            if (highRollerClearTimeoutRef.current) {
                clearTimeout(highRollerClearTimeoutRef.current);
                highRollerClearTimeoutRef.current = null;
            }
            setHighRoller(null);
            setHighRollerTableState(null);
            setHighRollerResult(null);
            setGlobalEventStatus(prev => (prev?.type === 'high_roller'
                ? { ...prev, active: false, pending: false, type: null, data: null }
                : prev));
        }, Math.max(0, openedAt + HIGH_ROLLER_MAX_LIFETIME_MS - serverNow()));
        return () => clearTimeout(id);
    }, [highRoller?.openedAt]);

    const value = {
        feed,
        rareFeed,
        // No `serverTime` here: ask utils/serverClock.js's `serverNow()`.
        newItems,
        clearNewItems,
        initialized,
        recursionStatus,
        updateRecursionStatus,
        globalEventStatus,
        // Fed from a spin response, to fill in an event the client missed entirely.
        recoverGlobalEventStatus,
        updateGlobalEventStatus,
        refreshMilestone,
        kotwLeaderboard,
        kotwUserStats,
        kotwWinner,
        kotwWinnerPending,
        kotwSpinPending,
        markKotwSpinStart,
        updateKotwUserStats,
        // Spin lifecycle - lets deferred event results wait for this client's
        // wheel to land instead of firing over a turning wheel
        markSpinInFlight,
        markSpinLanded,
        eventSelection,
        firstBloodWinner,
        firstBloodResultPending,
        communityGoal,
        communityGoalResult,
        communityGoalResultPending,
        communityGoalReward,
        arrival,
        arrivalCrate,
        roulette,
        rouletteTable,
        rouletteResult,
        rouletteMyBet,
        setRouletteMyBet,
        roulettePayout,
        highRoller,
        highRollerTable,
        highRollerResult,
        highRollerPayout,
        applyHighRollerTable,
        bountyBoard,
        bountyWinsToday,
        bountyCelebration,
        mysteryBoxes,
        // Set from a box-opening spin's response, which carries the new count.
        setMysteryBoxes,
        // Re-read on sign-in: the box count is per player.
        refreshDailyBounty: fetchDailyBounty,
    };

    return (
        <ActivityContext.Provider value={value}>
            {children}
        </ActivityContext.Provider>
    );
}

export function useActivity() {
    const context = useContext(ActivityContext);
    if (!context) {
        throw new Error('useActivity must be used within an ActivityProvider');
    }
    return context;
}