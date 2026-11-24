import { KotwSpinControl } from './spin/KotwSpinControl.jsx';
import { ForgeSpinControl } from './effects/CommunityForge.jsx';
import { ARENA } from './config/arenaTheme.js';
// THE NOCTURNE (DESIGN.md): the spin surface is one borderless blue-hour city; every mode themes the same three rows (band, stage, status).
// No card may replace the band or status row: the Try Again button lives in that row, so hiding it strands the player.
import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import { serverNow } from '../../utils/serverClock.js';
import { OddsInfoModal } from './modals/OddsInfoModal.jsx';
import { SpinResult } from './spin/SpinResult.jsx';
import { FirstBloodSpinControl } from './spin/FirstBloodSpinControl.jsx';
import { ShaftResult } from './spin/ShaftResult.jsx';
import { KotwArenaStandings } from './effects/KotwArena.jsx';
import { StageFlanks } from './spin/StageFlanks.jsx';
import { getItemRarity } from '../../utils/helpers.js';
import { getRarityInk } from '../../utils/rarityHelpers.jsx';
import { EventPayout } from './spin/EventPayout.jsx';
import { EnhancedWheelIdleState } from './canvas/EnhancedWheelIdleState.jsx';
import { CanvasSpinningStrip, preloadItemImages, warmImageCache, MOBILE_ROW_PITCH } from './canvas/CanvasSpinningStrip.jsx';
import { loadAtlas } from './canvas/atlas.js';
import { CanvasResultItem } from './canvas/CanvasResultItem.jsx';
import { CanvasBonusStrip, BONUS_PITCH, BONUS_PITCH_MOBILE, BONUS_STRIP_LENGTH, BONUS_FINAL_INDEX } from './canvas/CanvasBonusStrip.jsx';
import { SpinLanes, LANE_PITCH } from './spin/SpinLanes.jsx';
import { BonusEventPlaque } from './spin/BonusEventPlaque.jsx';
import { LuckyResultPanel } from './spin/LuckyResultPanel.jsx';
import { LaneResultsRow } from './spin/LaneResultsRow.jsx';

import {
    API_BASE_URL, IMAGE_BASE_URL,
    ITEM_WIDTH, STRIP_HEIGHT, STRIP_LENGTH, FINAL_INDEX,
    TEAM_MEMBERS, EXOTIC_ITEMS, RELIC_ITEMS, RARE_MEMBERS, MYTHIC_ITEMS, MYTHIC_ITEM, EVENT_ITEM, BONUS_EVENTS, INSANE_ITEMS, RECURSION_ITEM
} from '../../config/constants.js';
import { COLORS, SPACE, Z, SURFACE_NOISE } from './config/constants';
import { RARITY } from '../../utils/rarityHelpers.jsx';
import { useWheelConfig } from '../../hooks/useWheelConfig';
import { useActivity } from '../../context/ActivityContext.jsx';
import { ArrivalTheatre } from './effects/ArrivalTheatre.jsx';
import { CanvasRouletteStrip } from './canvas/CanvasRouletteStrip.jsx';
import RouletteTable from './effects/RouletteTable.jsx';
import { T_REVEAL } from './effects/rouletteTimeline.js';
import ParlourDeck from './effects/ParlourDeck.jsx';
import { HighRollerRoom } from './effects/HighRollerTable.jsx';
import { MysteryBoxOpening, MysteryCoat, MysteryBoxShelf } from './effects/MysteryBoxOpening.jsx';
import { useSound } from '../../context/SoundContext.jsx';
import { useCalm } from '../../config/power.js';


// Stage copy for a recursion trigger, coloured from BONUS_IDENTITY.recursion so board, plaque and lamp share one identity.
const RECURSION_ANNOUNCEMENT = {
    id: 'recursion',
    name: 'Recursion',
    description: 'You hit the wheel inside the wheel. A lucky spin is now running server-wide, for everyone.',
};

// Resting offset from the slot centre, uniform across the range and scaled by the reel's pitch.
// The ceiling is a pixel clearance (LINE_CLEARANCE, 4px floor), not a fraction: below it the line, rim and seam merge. Half a pitch is ambiguous.
const LINE_CLEARANCE = 4;

function landingVariance(itemWidth) {
    const max = Math.min(itemWidth * 0.46, itemWidth / 2 - LINE_CLEARANCE);
    return (Math.random() * 2 - 1) * max;
}

function WheelSpinnerComponent({ allItems, collection, prestige, onSpinComplete, user, dynamicItems, kotwLuckySpins = 0, kotwLuckySpinsRef, onKotwLuckySpinsUpdate, stageColumn = 2, onOpenCollection, onOpenLeaderboard, compactEventNavigation = false, isMobile = false, hasFlanks = true, arenaVisible = false, firstBloodVisible = false, forgeVisible = false }) {
    // Get spin duration from server config
    const { spinDuration } = useWheelConfig();

    // Get recursion status from ActivityContext - no separate polling!
    const { recursionStatus, updateRecursionStatus, globalEventStatus, recoverGlobalEventStatus, kotwUserStats, updateKotwUserStats, markKotwSpinStart, markSpinInFlight, markSpinLanded,
        firstBloodWinner, firstBloodResultPending, communityGoalResult,
        communityGoalResultPending, kotwWinner, kotwWinnerPending, arrival,
        roulette, rouletteTable, rouletteResult, rouletteMyBet, setRouletteMyBet, roulettePayout,
        highRoller, highRollerTable, highRollerResult, highRollerPayout, applyHighRollerTable,
        bountyBoard, mysteryBoxes, setMysteryBoxes, bountyCelebration } = useActivity();
    const mysteryBoxesRef = useRef(mysteryBoxes);
    mysteryBoxesRef.current = mysteryBoxes;

    // Open daily bounties, held in a ref as well: buildStrip runs from the spin's async path and must see current state.
    // "Open" lags the claim celebration (ActivityContext), so the winner's landing tile still wears the mark.
    // Every collectible special, shaped as buildStrip shapes it; the mystery box reel and special bounties draw from here.
    const specialContents = useMemo(() => [
        ...INSANE_ITEMS.map(i => ({ ...i, isInsane: true })),
        ...MYTHIC_ITEMS.map(i => ({ ...i, isMythic: true })),
        ...TEAM_MEMBERS.map(m => ({
            ...m,
            isSpecial: true,
            texture: m.username ? `special_${m.username}` : m.name.toLowerCase().replace(/\s+/g, '_'),
        })),
        ...RELIC_ITEMS.map(i => ({ ...i, isRelic: true })),
        ...EXOTIC_ITEMS.map(i => ({ ...i, isExotic: true })),
        ...RARE_MEMBERS.map(r => ({ ...r, isRare: true, texture: `rare_${r.username}` })),
    ], []);

    // A string key, so the memo below re-runs when the open set changes and not
    // on every board broadcast that leaves it as it was.
    const openBountyKey = (bountyBoard?.bounties || [])
        .filter(b => !b.winner && !b.expired)
        .map(b => b.texture)
        .join('|');
    const openBounties = useMemo(() => {
        // Expired ones too: a bounty closes when the next opens (services/dailyBounty.js).
        const open = (bountyBoard?.bounties || []).filter(b => !b.winner && !b.expired);
        // A bounty can be any item (wheel-backend services/dailyBounty.js), so look in commons and specials; the fallback is built from its own fields.
        return open.map(b => allItems.find(i => i.texture === b.texture)
            || specialContents.find(i => i.texture === b.texture)
            || {
                texture: b.texture,
                name: b.name,
                type: b.rarity || 'regular',
                imageUrl: b.imageUrl || null,
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openBountyKey, allItems, specialContents]);
    const openBountiesRef = useRef(openBounties);
    openBountiesRef.current = openBounties;

    // The arrival owns the reel: shafts close and spinning is refused. ActivityContext holds it until any in-flight spin has landed.
    const arrivalOwnsReel = Boolean(arrival);

    // The Parlour becomes the reel (CanvasRouletteStrip) on the same pitch and detent. Spinning is refused, but the table is not held for an in-flight spin; markSpinLanded still fires.
    const parlourOwnsReel = Boolean(roulette);

    // High Roller takes the band for the dealer and the apron for the player, and refuses spins like the Parlour (see HighRollerTable.jsx).
    const highRollerOwnsReel = Boolean(highRoller);
    const [highRollerIntent, setHighRollerIntent] = useState(null);

    // Either table owns the reel.
    const tableOwnsReel = parlourOwnsReel || highRollerOwnsReel;

    /** Any takeover means the band is not the reel's for the moment. */
    const bandIsTaken = arrivalOwnsReel || tableOwnsReel;

    // Passed as a function so the canvas reads it per frame without re-rendering this component.
    const parlourOpenedAt = roulette?.openedAt ?? null;
    const parlourOpenedAtRef = useRef(parlourOpenedAt);
    useEffect(() => { parlourOpenedAtRef.current = parlourOpenedAt; });
    const parlourClock = useCallback(() => {
        const origin = parlourOpenedAtRef.current;
        return origin ? Math.max(0, (serverNow() - origin) / 1000) : 0;
    }, []);
    // The render path reads the origin directly; only the rAF loops go through
    // the ref, which keeps a ref read out of the render body.
    const parlourT = parlourOpenedAt ? Math.max(0, (serverNow() - parlourOpenedAt) / 1000) : 0;

    // 250ms tick: the apron's beats are coarse; the ring has its own rAF loop.
    const [, setParlourTick] = useState(0);
    useEffect(() => {
        if (!parlourOpenedAt) return undefined;
        const id = setInterval(() => setParlourTick(n => n + 1), 250);
        return () => clearInterval(id);
    }, [parlourOpenedAt]);


    // `stopSoundtrack` is deliberately not pulled out: the settings modal and SoundContext own stopping it.
    const { startSoundtrack, playRaritySound, playRecursionSound, playSfx, isPlaying: isMusicPlaying } = useSound();

    // Parlour fret tick, handed to the ring so the pin crossing is computed once, by the canvas. Declared below useSound on purpose: useRef(playSfx) above its const throws (TDZ).
    // Stable identity; playSfx goes through a ref because its callback changes with volume while the ring mounts once.
    const playSfxRef = useRef(playSfx);
    useEffect(() => { playSfxRef.current = playSfx; });
    const playParlourTick = useCallback((speed) => {
        playSfxRef.current?.('parlour_tick', { speed });
    }, []);

    // Saver mode or an explicit reduced-motion preference. See config/power.js.
    const calm = useCalm();

    const [state, setState] = useState('idle');
    const [strip, setStrip] = useState([]);
    const [result, setResult] = useState(null);
    const [isNewItem, setIsNewItem] = useState(false);
    // Prestige counterpart of isNewItem: { level, levelKey, isNew, count } during a run, else null. A separate fact: under prestige every pull is a main-collection duplicate.
    const [prestigePull, setPrestigePull] = useState(null);
    const [showOddsInfo, setShowOddsInfo] = useState(false);
    const [spinProgress, setSpinProgress] = useState(0); // 0-1 for Phase 2 effects
    const [atlasReady, setAtlasReady] = useState(false);
    // Use ref for canvas offset to avoid re-renders during animation
    const canvasOffsetRef = useRef(0);
    const animationRef = useRef(null);
    // Track last spin progress to avoid redundant setState calls
    const lastSpinProgressRef = useRef(-1);

    // Phone shaft row pitch (a height): the only number deciding item size on a phone.
    // Imported from canvas/CanvasSpinningStrip.jsx, the single definition; restating it drifts the landing maths from the draw.

    const offsetRef = useRef(0);

    // Triple spin state
    const [tripleStrips, setTripleStrips] = useState([[], [], [], [], []]);
    const [tripleResults, setTripleResults] = useState([null, null, null, null, null]);
    const [tripleNewItems, setTripleNewItems] = useState([false, false, false, false, false]);
    // Use refs for triple offsets to avoid re-renders during animation
    const tripleAnimationRefs = useRef([null, null, null, null, null]);
    const tripleOffsetRefs = useRef([0, 0, 0, 0, 0]);

    // Bonus wheel state - using horizontal strip like main wheel
    const [bonusStrip, setBonusStrip] = useState([]);
    const bonusOffsetRef = useRef(0); // Use ref instead of state
    const [selectedEvent, setSelectedEvent] = useState(null);
    const bonusWheelRef = useRef(null);

    // Lucky spin state
    const [luckyResult, setLuckyResult] = useState(null);
    const [isLuckyNew, setIsLuckyNew] = useState(false);

    // Recursion active state - derived from ActivityContext
    const recursionActive = recursionStatus?.active || false;
    const recursionSpinsRemaining = recursionStatus?.userSpinsRemaining ?? 0;

    // Mystery box (wheel-backend services/dailyBounty.js): held back, not spent, during a global event or recursion window; boxReadyRef is what performSpin reads.
    const boxReady = !!user && mysteryBoxes > 0
        && !globalEventStatus?.active && !globalEventStatus?.pending
        && !(recursionActive && recursionSpinsRemaining > 0);
    const boxReadyRef = useRef(boxReady);
    boxReadyRef.current = boxReady;
    const currentSpinIsMysteryRef = useRef(false);
    const [currentSpinIsMystery, setCurrentSpinIsMystery] = useState(false);
    const pendingMysteryBoxesRef = useRef(null);

    // Boxes wait on the shelf until opened; opening arms the reel (`boxArmed`) and the next spin spends it. performSpin opens a box only when armed AND ready.
    // Nothing may sit over the reel while it is the event; a box claimed during an event waits on the shelf.
    const [boxSceneOpen, setBoxSceneOpen] = useState(false);
    const [boxUnwrapping, setBoxUnwrapping] = useState(false);
    const [boxClaimName, setBoxClaimName] = useState(null);
    const [boxArmed, setBoxArmed] = useState(false);
    const boxArmedRef = useRef(false);
    boxArmedRef.current = boxArmed;
    // Non-zero while the reel is taking the coat; a counter, so a second box
    // restarts the coat rather than being swallowed by the first.
    const [boxCoating, setBoxCoating] = useState(0);
    // Bumped when a box lands on the shelf, so it can catch it.
    const [boxShelved, setBoxShelved] = useState(0);
    const boxCoatTimerRef = useRef(null);
    const reelBandRef = useRef(null);
    const boxShelfRef = useRef(null);
    const boxGilded = boxReady && boxArmed;
    // Only a box the reel is wearing leaves the shelf.
    const shelvedBoxes = Math.max(0, mysteryBoxes - (boxGilded ? 1 : 0));

    // Nothing to arm without a box.
    useEffect(() => {
        if (mysteryBoxes <= 0 && boxArmed) setBoxArmed(false);
    }, [mysteryBoxes, boxArmed]);

    const ownClaimKey = bountyCelebration?.winner && user?.id != null && bountyCelebration.winner.userId === user.id
        ? `${bountyCelebration.id ?? bountyCelebration.day}-${bountyCelebration.winner.userId}`
        : null;
    useEffect(() => {
        if (!ownClaimKey) return;
        setBoxClaimName(bountyCelebration.name);
        setBoxUnwrapping(false);
        setBoxSceneOpen(true);
        // Keyed on the claim, not on the object ActivityContext rebuilds.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownClaimKey]);

    /** Take a box down from the shelf: the same scene, without a claim. */
    function openBoxFromShelf() {
        // The armed box, held back by an event, is already opened and waits for
        // the reel; only the boxes behind it can be taken down meanwhile.
        const takeable = shelvedBoxes - (boxArmed && !boxReady ? 1 : 0);
        if (takeable <= 0 || boxSceneOpen) return;
        setBoxClaimName(null);
        setBoxUnwrapping(false);
        setBoxSceneOpen(true);
    }

    // Track if the CURRENT RESULT was from a recursion lucky spin
    // This persists during result display even after user runs out of spins
    const [resultWasRecursionSpin, setResultWasRecursionSpin] = useState(false);

    // Track if the CURRENT RESULT was from a KOTW lucky spin
    const [resultWasKotwLuckySpin, setResultWasKotwLuckySpin] = useState(false);

    // Track if current spin is using KOTW lucky (set at spin start, cleared at idle)
    const [currentSpinIsKotwLucky, setCurrentSpinIsKotwLucky] = useState(false);

    // Tier colour comes from the shared ladder (utils/rarityHelpers); do not rebuild inline ternary chains.

    // Track if the CURRENT spin animation is a recursion lucky spin
    // This prevents visual effects from changing mid-animation when spinsRemaining updates
    const currentSpinIsRecursionRef = useRef(false);

    // Track if the CURRENT spin animation is a KOTW lucky spin
    const currentSpinIsKotwLuckyRef = useRef(false);

    // Pending spin flag for instant respin
    const pendingSpinRef = useRef(false);

    // Ref to hold current spin function for keyboard events
    const spinRef = useRef(null);

    // Ref to hold current respin function for keyboard events
    const respinRef = useRef(null);

    // Animation cancellation flag to prevent stale updates
    const animationCancelledRef = useRef(false);

    // AbortController for cancelling in-flight API requests
    const abortControllerRef = useRef(null);

    // Pending KOTW result to apply after animation completes
    const pendingKotwResultRef = useRef(null);
    const [landedKotwPoints, setLandedKotwPoints] = useState(null);
    // Pending lucky spin balance, held for the same reason - see settleKotwSpin()
    const pendingKotwLuckySpinsRef = useRef(null);

    // Error state for server unavailability
    const [error, setError] = useState(null);

    // Client-side cooldown tracking (mirrors server's 3s cooldown)
    const lastSpinTimeRef = useRef(0);
    const SPIN_COOLDOWN = 3000; // 3 seconds - must match server

    function canSpin() {
        const now = Date.now();
        if (now - lastSpinTimeRef.current < SPIN_COOLDOWN) {
            setError("Don't spin too fast!");
            return false;
        }
        return true;
    }

    function markSpinTime() {
        lastSpinTimeRef.current = Date.now();
    }

    // ResizeObserver, not a render-time read: the mount is flex:1 and its siblings settle after first paint, so ShaftResult would pin to a stale height.
    const reelMountRef = useRef(null);
    const [shaftHeight, setShaftHeight] = useState(0);
    useEffect(() => {
        const el = reelMountRef.current;
        if (!el || !isMobile || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            const h = el.getBoundingClientRect().height;
            if (h > 0) setShaftHeight(h);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [isMobile, state]);

    // Viewport breakpoints come from config/breakpoints.js; do not add a local resize listener (it once disagreed with WheelPage by 800px).

    // Gate the spin button on the single atlas request; awaiting ~1,500 sprites cost 9s cold. Heads and custom art are warmed but not waited for.
    useEffect(() => {
        if (allItems.length === 0) return;

        let isMounted = true;
        setAtlasReady(false);

        loadAtlas().then((ok) => {
            if (!isMounted) return;
            // Opens the gate either way: a failed atlas falls back to per-item images.
            setAtlasReady(true);
            if (!ok) warmImageCache(allItems);
        });

        // Not awaited, and deliberately not cancelled on unmount — an in-flight
        // sweep that outlives the component is just cache the next mount inherits.
        warmImageCache([...INSANE_ITEMS, ...MYTHIC_ITEMS, ...RARE_MEMBERS, ...EXOTIC_ITEMS, ...RELIC_ITEMS, ...TEAM_MEMBERS]);

        return () => {
            isMounted = false;
        };
    }, [allItems]);

    // Load the strip's 80 items as soon as one exists, winner first: it sits static under a glow, so it cannot be late. Keyed on the strip so no spin path can forget it.
    useEffect(() => {
        if (strip.length === 0) return;
        const winner = strip[FINAL_INDEX];
        preloadItemImages(winner ? [winner, ...strip] : strip);
    }, [strip]);

    // One state list for the phone's tap and the spacebar: a payoff restarts, idle starts, anything else is mid-move. The handler is on the band wrapper so the lanes and bonus board have a tap target.
    const bandTapRestarts = state === 'result' || state === 'recursion' || state === 'luckyResult'
        || state === 'tripleResult' || state === 'tripleLuckyResult';
    // `!bandIsTaken` is the cursor's share of the refusal spin and respin already make.
    const bandTappable = Boolean(user) && allItems.length > 0 && !bandIsTaken
        && (bandTapRestarts || state === 'idle');
    const handleBandTap = () => {
        if (!isMobile || !bandTappable) return;
        if (bandTapRestarts) {
            respinRef.current?.();
        } else {
            spinRef.current?.();
        }
    };

    // Shown only while there is a box; a claim-opened scene may be briefly empty so a payout landing just after still finds it.
    const boxShown = boxSceneOpen && (mysteryBoxes > 0 || boxUnwrapping);
    const boxSceneOpenRef = useRef(false);
    boxSceneOpenRef.current = boxShown;

    function closeBoxScene() {
        setBoxSceneOpen(false);
        setBoxUnwrapping(false);
        setBoxClaimName(null);
    }

    // "Later": the box has flown to the shelf, which catches it.
    function shelveBox() {
        closeBoxScene();
        setBoxShelved(n => n + 1);
    }

    // Close once empty, but only after it HAS shown something: the claim and the box count are two broadcasts and the count can land a beat late.
    const boxShownWasRef = useRef(false);
    useEffect(() => {
        if (boxSceneOpen && !boxShown && boxShownWasRef.current) closeBoxScene();
        boxShownWasRef.current = boxShown;
    }, [boxSceneOpen, boxShown]);
    // ...and a claim whose box never turns up does not leave the scene waiting
    // to spring open at some unrelated later moment.
    useEffect(() => {
        if (!boxSceneOpen) return undefined;
        const t = setTimeout(() => {
            if (!boxSceneOpenRef.current) closeBoxScene();
        }, 10_000);
        return () => clearTimeout(t);
    }, [boxSceneOpen]);

    useEffect(() => () => clearTimeout(boxCoatTimerRef.current), []);

    // The gilt reaches the reel: at rest and armed it is the box's reel; the coat covers the change until the sheen runs out.
    function gildReelFromBox() {
        setBoxUnwrapping(true);
        if (state === 'result') {
            setStrip([]);
            setResult(null);
            setIsNewItem(false);
            setPrestigePull(null);
            setState('idle');
        }
        setBoxArmed(true);
        setBoxCoating(c => c + 1);
        clearTimeout(boxCoatTimerRef.current);
        boxCoatTimerRef.current = setTimeout(() => setBoxCoating(0), 1800);
    }

    // Spacebar to spin/respin
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Only trigger on spacebar, and not when typing in an input
            if (e.code === 'Space' &&
                !e.target.closest('input, textarea, [contenteditable]')) {

                // Check if we can spin
                if (!user || allItems.length === 0) return;

                // The box scene owns the keyboard while up: a spin would open the box unseen or overlap the reveal.
                if (boxSceneOpenRef.current) return;

                e.preventDefault();

                // If in result state, use respin for instant re-spin
                if (state === 'result' || state === 'tripleResult' || state === 'luckyResult' || state === 'tripleLuckyResult' || state === 'recursion') {
                    respinRef.current?.();
                } else if (state === 'idle') {
                    spinRef.current?.();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state, user, allItems.length]);

    useEffect(() => {
        return () => {
            animationCancelledRef.current = true;
            if (abortControllerRef.current) abortControllerRef.current.abort();
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            if (bonusWheelRef.current) cancelAnimationFrame(bonusWheelRef.current);
            tripleAnimationRefs.current.forEach(ref => { if (ref) cancelAnimationFrame(ref); });
        };
    }, []);

    // spin is omitted from deps on purpose: it is not memoized and pendingSpinRef handles stale closures.
    useEffect(() => {
        if (state === 'idle' && pendingSpinRef.current) {
            pendingSpinRef.current = false;
            spin();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    // Fisher-Yates shuffle helper
    function shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Dormant reel: a sample of the pool, built once per pool because buildStrip shuffles and a per-render build would flicker. A held mystery box shows its own reel at rest.
    const dormantStrip = useMemo(
        () => (allItems.length
            ? (boxGilded ? buildMysteryStrip(null) : buildStrip(allItems[0]))
            : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [allItems.length, openBounties, boxGilded],
    );

    // The drift writes the ref the spin animation writes, so a spin takes over from wherever it left off. Stopped by prefers-reduced-motion and saver mode (`prefersCalm`, in deps so toggling is live).
    useEffect(() => {
        if (state !== 'idle' || dormantStrip.length === 0) return;
        if (typeof window === 'undefined') return;
        if (calm) return;

        // The canvas draws the dormant strip as a cylinder (`loop`), so any offset is valid; the modulo by one whole strip keeps the offset bounded.
        let raf = null;
        let last = null;
        const PX_PER_SECOND = 14;   // slow enough to read, fast enough to notice
        const wrap = dormantStrip.length * ITEM_WIDTH;

        const tick = (now) => {
            if (last === null) last = now;
            const dt = (now - last) / 1000;
            last = now;
            canvasOffsetRef.current = (canvasOffsetRef.current + PX_PER_SECOND * dt) % wrap;
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => { if (raf) cancelAnimationFrame(raf); };
    }, [state, dormantStrip.length, calm]);

    // Flags a tile as one of today's open bounties by texture alone: a bounty can be any item and textures are unique across tiers.
    function markBounty(item) {
        const open = openBountiesRef.current;
        if (!open.length || !item || item.isBounty) return item;
        if (!open.some(b => b.texture === item.texture)) return item;
        return { ...item, isBounty: true };
    }

    // The mystery box's reel: every tile a special at equal odds per item, because the server rolls one special uniformly (services/dailyBounty.js openBox). Decoration; the winner at FINAL_INDEX is the server's.
    function buildMysteryStrip(finalItem, length = STRIP_LENGTH) {
        const contents = specialContents;
        if (contents.length === 0) return buildStrip(finalItem || allItems[0], length);

        const newStrip = [];
        for (let i = 0; i < length; i++) {
            // No winner for the dormant reel: every slot is the box's contents.
            newStrip.push(i === FINAL_INDEX && finalItem
                ? finalItem
                : contents[Math.floor(Math.random() * contents.length)]);
        }
        return newStrip;
    }

    function buildStrip(finalItem, length = STRIP_LENGTH) {
        const newStrip = [];
        // The pinned winner index, not `length - 8`: the strip length derives from it (config/constants.js).
        const finalIndex = FINAL_INDEX;

        // Shuffle all item pools for better visual randomness
        const shuffledItems = shuffleArray([...allItems]);
        const shuffledInsane = shuffleArray([...INSANE_ITEMS]);
        const shuffledMythic = shuffleArray([...MYTHIC_ITEMS]);
        const shuffledRare = shuffleArray([...RARE_MEMBERS]);
        const shuffledExotic = shuffleArray([...EXOTIC_ITEMS]);
        const shuffledRelic = shuffleArray([...RELIC_ITEMS]);
        const shuffledLegendary = shuffleArray([...TEAM_MEMBERS]);

        const bounties = openBountiesRef.current;

        // Use indices to iterate through shuffled arrays (guarantees distribution)
        let itemIndex = 0;
        let insaneIndex = 0;
        let mythicIndex = 0;
        let rareIndex = 0;
        let exoticIndex = 0;
        let relicIndex = 0;
        let legendaryIndex = 0;

        for (let i = 0; i < length; i++) {
            if (i === finalIndex) {
                newStrip.push(markBounty(finalItem));
            } else {
                const roll = Math.random();
                let newItem = null;

                // Visual flair - show special items in the strip animation
                if (roll < 0.001 && shuffledInsane.length > 0) {
                    // 0.1% chance for insane
                    const insane = shuffledInsane[insaneIndex % shuffledInsane.length];
                    insaneIndex++;
                    newItem = { ...insane, isInsane: true };
                } else if (roll < 0.003 && shuffledMythic.length > 0) {
                    // 0.2% chance for mythic (0.1% to 0.3%)
                    const mythic = shuffledMythic[mythicIndex % shuffledMythic.length];
                    mythicIndex++;
                    newItem = { ...mythic, isMythic: true };
                } else if (roll < 0.033 && shuffledRare.length > 0) {
                    // 3% chance for rare
                    const rare = shuffledRare[rareIndex % shuffledRare.length];
                    rareIndex++;
                    newItem = { ...rare, isRare: true, texture: `rare_${rare.username}` };
                } else if (roll < 0.040 && shuffledExotic.length > 0) {
                    // Roll bands are decoration only, mirroring the server's authoritative strip (wheel-backend services/spin.js); keep the two in step.
                    // Exotic carries its own whole texture, unlike member tiers built from a username.
                    const exotic = shuffledExotic[exoticIndex % shuffledExotic.length];
                    exoticIndex++;
                    newItem = { ...exotic, isExotic: true };
                } else if (roll < 0.046 && shuffledRelic.length > 0) {
                    // Relic: 0.6% band, own whole texture (`relic_*`). Specials keep their 5.3% total and the tiers divide it, so a new rarity never makes the strip busier.
                    const relic = shuffledRelic[relicIndex % shuffledRelic.length];
                    relicIndex++;
                    newItem = { ...relic, isRelic: true };
                } else if (roll < 0.053 && shuffledLegendary.length > 0) {
                    // 0.7% chance for legendary
                    const member = shuffledLegendary[legendaryIndex % shuffledLegendary.length];
                    legendaryIndex++;
                    newItem = {
                        ...member,
                        isSpecial: true,
                        texture: member.username ? `special_${member.username}` : member.name.toLowerCase().replace(/\s+/g, '_')
                    };
                } else if (roll < 0.058 && bounties.length > 0) {
                    // 0.5% for today's open bounty, band for band with the server's buildStrip (wheel-backend services/spin.js); with several open, each tile is one at random.
                    newItem = { ...bounties[Math.floor(Math.random() * bounties.length)], isBounty: true };
                } else if (shuffledItems.length > 0) {
                    // Regular items - iterate through shuffled pool for maximum variety
                    newItem = shuffledItems[itemIndex % shuffledItems.length];
                    itemIndex++;
                }

                // ALWAYS push an item - fallback to first available item if needed
                if (newItem) {
                    // The shuffled pool contains the bounty too, so an ordinary
                    // draw of it is marked like a teased one.
                    newStrip.push(markBounty(newItem));
                } else if (shuffledItems.length > 0) {
                    // Fallback: use a regular item
                    newStrip.push(shuffledItems[itemIndex % shuffledItems.length]);
                    itemIndex++;
                } else {
                    // Ultimate fallback: use the finalItem (shouldn't happen in practice)
                    newStrip.push(finalItem);
                }
            }
        }
        return newStrip;
    }

    // Instant respin - no delays
    function respin() {
        // Same arrival refusal as spin(): Try Again, a reel tap and Space all bypass spin() and land here.
        if (bandIsTaken) return;

        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        tripleAnimationRefs.current.forEach(ref => { if (ref) cancelAnimationFrame(ref); });

        // Reset states
        setResult(null);
        setIsNewItem(false);
        setPrestigePull(null);
        setTripleResults([null, null, null, null, null]);
        setTripleNewItems([false, false, false, false, false]);
        // Note: don't reset currentSpinIsKotwLucky here - performSpin will set it correctly

        // Directly perform spin (bypass idle check)
        performSpin();
    }

    // Keep refs updated for keyboard handler
    respinRef.current = respin;

    // Helper to update spin progress only when value changes
    const updateSpinProgress = (value) => {
        if (lastSpinProgressRef.current !== value) {
            lastSpinProgressRef.current = value;
            setSpinProgress(value);
        }
    };

    // Core spin logic - extracted so respin can call it directly
    async function performSpin() {
        if (!user || allItems.length === 0) return;

        // Client-side cooldown check (prevents animation flash)
        if (!canSpin()) return;

        // Reset cancellation flag for new spin
        animationCancelledRef.current = false;

        // Track if this spin will use a recursion lucky spin (before API call)
        // This ensures visual effects stay consistent during the animation
        currentSpinIsRecursionRef.current = recursionActive && recursionSpinsRemaining > 0;

        // Mirrors the server: holding a lucky-spin balance is enough, the event need not be running. Read via ref (props go stale under batching).
        // An ARMED mystery box takes this spin ahead of everything; decided once against the state of the click, and the reel, endpoint and theme all read it.
        const opensBox = boxReadyRef.current && boxArmedRef.current;
        // Spent by this spin, so disarmed now; the spin's theme runs off currentSpinIsMystery.
        if (opensBox) setBoxArmed(false);
        currentSpinIsMysteryRef.current = opensBox;
        setCurrentSpinIsMystery(opensBox);
        if (opensBox) currentSpinIsRecursionRef.current = false;

        const currentKotwSpins = kotwLuckySpinsRef?.current ?? kotwLuckySpins;
        const isKotwEventActive = globalEventStatus?.type === 'king_of_wheel' && globalEventStatus?.active;
        // Opening a box spends no lucky spin - the server never looks at the balance.
        const willUseKotwLucky = !opensBox && !currentSpinIsRecursionRef.current && currentKotwSpins > 0;
        currentSpinIsKotwLuckyRef.current = willUseKotwLucky;

        // Set state for KOTW spin - this triggers re-render with correct styling
        setCurrentSpinIsKotwLucky(willUseKotwLucky);
        setLandedKotwPoints(null);

        // Applied on landing, not on response: the response can already carry a post-award balance (First Blood, KOTW) and would announce a win over a spinning strip.
        const applyPendingKotwLuckySpins = () => {
            if (pendingKotwLuckySpinsRef.current !== null && onKotwLuckySpinsUpdate) {
                onKotwLuckySpinsUpdate(pendingKotwLuckySpinsRef.current);
            }
            pendingKotwLuckySpinsRef.current = null;
            // The box count too, on the same rule: the gilding comes off when
            // the reel lands, not while it is still turning.
            if (pendingMysteryBoxesRef.current !== null) {
                setMysteryBoxes(pendingMysteryBoxesRef.current);
            }
            pendingMysteryBoxesRef.current = null;
        };

        // Helper to flush KOTW pending state on any exit path
        const flushKotwPending = () => {
            if (isKotwEventActive && kotwUserStats) {
                // Clear any stale pending result to prevent future spins from crashing
                updateKotwUserStats?.({ ...kotwUserStats, pending: null });
            }
            // The spin may still have been processed server-side before we gave up on
            // it, so don't strand a balance we were already told about.
            applyPendingKotwLuckySpins();
            // Whatever happened, this wheel is no longer turning. Release any
            // deferred event results waiting for the landing.
            markSpinLanded();
        };

        // Settle on landing: the server omits kotwResult when the event expired mid-request, and without the else branch the pending flag never clears and the leaderboard row freezes.
        const settleKotwSpin = () => {
            if (pendingKotwResultRef.current) {
                setLandedKotwPoints({
                    points: pendingKotwResultRef.current.pointsEarned ?? null,
                    expiresAt: globalEventStatus?.expiresAt,
                });
                updateKotwUserStats(pendingKotwResultRef.current);
                pendingKotwResultRef.current = null;
            } else if (isKotwEventActive) {
                updateKotwUserStats(kotwUserStats);
            }
            applyPendingKotwLuckySpins();
            // The wheel has landed - release any deferred event results that were
            // waiting on it (Community Goal summary, First Blood winner).
            markSpinLanded();
        };

        try {
            setState('spinning');
            updateSpinProgress(0); // Reset progress for Phase 2 effects

            // Mark KOTW spin as pending to prevent premature point display
            if (globalEventStatus?.type === 'king_of_wheel' && globalEventStatus?.active) {
                markKotwSpinStart();
            }

            // Marks the wheel in flight: event results arriving mid-spin are held and drained by markSpinLanded().
            markSpinInFlight();

            // Start soundtrack when spinning begins
            if (!isMusicPlaying) {
                startSoundtrack();
            }

            // IMMEDIATELY build a placeholder strip and start animation
            // This makes the wheel feel instant - no waiting for API
            const placeholderItem = allItems[Math.floor(Math.random() * allItems.length)];
            // A box's reel is the box's contents from the first frame; the winner
            // is swapped into FINAL_INDEX when the server answers, as ever.
            const placeholderStrip = opensBox ? buildMysteryStrip(null) : buildStrip(placeholderItem);
            setStrip(placeholderStrip);
            offsetRef.current = 0;
            canvasOffsetRef.current = 0;

            // Pre-calculate animation parameters (use larger items on mobile)
            const itemWidth = isMobile ? MOBILE_ROW_PITCH : ITEM_WIDTH;
            const targetOffset = FINAL_INDEX * itemWidth;
            const finalOffset = targetOffset + landingVariance(itemWidth);

            // Start animation IMMEDIATELY (before API returns)
            let startTime = null;
            let spinResult = null;
            let finalItem = placeholderItem;

            // Create abort controller for this request with timeout
            const controller = new AbortController();
            abortControllerRef.current = controller;
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            // Make API call in parallel with animation
            const apiCall = (async () => {
                try {
                    const res = await fetch(`${API_BASE_URL}${opensBox ? '/api/spin/mystery' : '/api/spin'}`, {
                        method: 'POST',
                        credentials: 'include',
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);

                    // Check if cancelled during fetch
                    if (animationCancelledRef.current) return null;

                    spinResult = await res.json();

                    // Recovery only: the spin response carries the server's event state for a client whose stream died (see recoverGlobalEventStatus). A box opening carries none.
                    recoverGlobalEventStatus(spinResult.globalEventStatus);

                    // Box count held for the landing like the lucky-spin balance; a 403 means another tab opened it, so 0.
                    if (opensBox) {
                        pendingMysteryBoxesRef.current = res.status === 403 ? 0 : (spinResult.mysteryBoxes ?? null);
                    }

                    // Handle rate limit / cooldown
                    if (res.status === 429 || spinResult.cooldown) {
                        setError("Don't spin too fast!");
                        animationCancelledRef.current = true;
                        if (animationRef.current) cancelAnimationFrame(animationRef.current);
                        setStrip([]);
                        setResult(null);
                        setIsNewItem(false);
                        setPrestigePull(null);
                        setState('idle');
                        flushKotwPending();
                        return null;
                    }

                    if (!res.ok || !spinResult.result) {
                        throw new Error(spinResult.error || 'Spin failed');
                    }

                    // Track if this specific spin was a recursion lucky spin
                    // This persists in the result view even after user runs out of spins
                    setResultWasRecursionSpin(spinResult.isRecursionSpin || false);

                    // Track if this specific spin was a KOTW lucky spin
                    setResultWasKotwLuckySpin(spinResult.isKotwLuckySpin || false);

                    // Update recursion state in ActivityContext from spin result
                    if (spinResult.recursionStatus) {
                        updateRecursionStatus(spinResult.recursionStatus);
                    }

                    // Hold the new lucky spin balance until the wheel lands - applying it
                    // here would reveal the reward mid-animation. See settleKotwSpin().
                    if (spinResult.kotwLuckySpinsRemaining !== undefined) {
                        pendingKotwLuckySpinsRef.current = spinResult.kotwLuckySpinsRemaining;
                    }

                    // Store KOTW result to apply after animation completes
                    if (spinResult.kotwResult) {
                        pendingKotwResultRef.current = {
                            points: spinResult.kotwResult.totalPoints,
                            rank: spinResult.kotwResult.rank,
                            pointsEarned: spinResult.kotwResult.pointsEarned,
                        };
                    }

                    // Mark spin time only after successful response
                    markSpinTime();

                    finalItem = {
                        ...spinResult.result,
                        isSpecial: spinResult.result.type === 'legendary',
                        isRare: spinResult.result.type === 'rare',
                        isMythic: spinResult.result.type === 'mythic',
                        isEvent: spinResult.result.type === 'event',
                        isRecursion: spinResult.result.type === 'recursion',
                        // Out of the box: the result panels print MYSTERY for it.
                        isMystery: !!spinResult.isMystery,
                    };

                    // Check again before updating state
                    if (animationCancelledRef.current) return null;

                    // Update only the final item in the strip at FINAL_INDEX (position 72)
                    // This prevents visible items from randomly changing during the animation
                    setStrip(prevStrip => {
                        const newStrip = [...prevStrip];
                        // Use constant FINAL_INDEX to ensure consistency with animation target
                        if (FINAL_INDEX >= 0 && FINAL_INDEX < newStrip.length) {
                            // A box pull never claims the bounty (the server skips it), so it must not wear the bounty mark.
                            newStrip[FINAL_INDEX] = opensBox ? finalItem : markBounty(finalItem);
                        }
                        return newStrip;
                    });
                    setResult(finalItem);
                    setIsNewItem(spinResult.isNew);
                    setPrestigePull(spinResult.prestige || null);

                    return spinResult;
                } catch (err) {
                    clearTimeout(timeoutId);
                    // Re-throw unless aborted (which is intentional)
                    if (err.name === 'AbortError') {
                        return null; // Silently ignore abort
                    }
                    throw err;
                }
            })();

            const animate = (timestamp) => {
                // Bail out if animation was cancelled (e.g., cooldown, unmount)
                if (animationCancelledRef.current) return;

                if (!startTime) startTime = timestamp;
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / spinDuration, 1);
                const eased = 1 - Math.pow(1 - progress, 4);
                offsetRef.current = eased * finalOffset;

                // Update spin progress for Phase 2 visual effects (throttled updates)
                // Only update at key thresholds to avoid excessive re-renders
                if (progress < 0.1) updateSpinProgress(0);
                else if (progress >= 0.5 && progress < 0.55) updateSpinProgress(0.5);
                else if (progress >= 0.7 && progress < 0.75) updateSpinProgress(0.7);
                else if (progress >= 0.9) updateSpinProgress(0.95);

                // Canvas strip reads directly from canvasOffsetRef - no setState needed!
                canvasOffsetRef.current = offsetRef.current;

                if (progress < 1 && !animationCancelledRef.current) {
                    animationRef.current = requestAnimationFrame(animate);
                } else if (!animationCancelledRef.current) {
                    // Animation complete - wait for API if needed, then finish
                    apiCall.then((result) => {
                        // Check for cancellation before updating state
                        if (animationCancelledRef.current) return;

                        // If result is null (e.g., abort), reset to idle
                        if (result === null) {
                            setState('idle');
                            flushKotwPending();
                            return;
                        }

                        if (result.isRecursion) {
                            // RECURSION triggered! Show special result state
                            setState('recursion');
                            playRecursionSound();
                            // Apply pending KOTW result now that animation is complete
                            settleKotwSpin();
                            if (onSpinComplete) onSpinComplete(result);
                        } else if (result.isEvent) {
                            setState('event');
                            // The bonus wheel takes over from here and never returns to
                            // this handler, so the KOTW spin has to be settled now.
                            settleKotwSpin();
                            setTimeout(() => spinBonusWheel(result.bonusEvent), 1500);
                        } else {
                            setState('result');
                            setSpinProgress(1); // Animation complete
                            // Play sound based on item rarity
                            if (result.result?.type) {
                                playRaritySound(result.result.type);
                            }
                            // Apply pending KOTW result now that animation is complete
                            settleKotwSpin();
                            if (onSpinComplete) onSpinComplete(result);
                        }
                    }).catch((err) => {
                        // Check for cancellation before updating state
                        if (animationCancelledRef.current) return;

                        console.error('Spin failed:', err);
                        if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                            setError('Server unavailable. Please try again later.');
                        } else {
                            setError(err.message || 'Spin failed. Please try again.');
                        }
                        // Clear stale spin state
                        setStrip([]);
                        setResult(null);
                        setIsNewItem(false);
                        setPrestigePull(null);
                        setState('idle');
                        flushKotwPending();
                    });
                }
            };
            animationRef.current = requestAnimationFrame(animate);
        } catch (err) {
            console.error('Spin failed:', err);
            if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
                setError('Server unavailable. Please try again later.');
            } else {
                setError(err.message || 'Spin failed. Please try again.');
            }
            // Clear stale spin state
            setStrip([]);
            setResult(null);
            setIsNewItem(false);
            setPrestigePull(null);
            setState('idle');
            flushKotwPending();
        }
    }

    async function spin() {
        if (state !== 'idle' || !user) return;
        // The platform belongs to the train: refused, not queued, so no spin fires unasked after the event.
        if (bandIsTaken) return;
        if (allItems.length === 0) return;
        setError(null); // Clear any previous error
        performSpin();
    }

    // Keep spinRef updated for keyboard handler
    spinRef.current = spin;

    // Helper function to select a weighted random event
    function selectWeightedEvent() {
        const totalWeight = BONUS_EVENTS.reduce((sum, e) => sum + (e.weight || 1), 0);
        let roll = Math.random() * totalWeight;

        for (const event of BONUS_EVENTS) {
            roll -= (event.weight || 1);
            if (roll <= 0) return event;
        }
        return BONUS_EVENTS[0]; // Fallback
    }

    // The wheel is presentation: /api/spin already decided the event, and picking another would be refused. selectWeightedEvent() serves filler slots only.
    function spinBonusWheel(rolledEvent) {
        setState('bonusWheel');

        // Match the server's roll; a local roll keeps an older backend (no bonusEvent) playable.
        const event = (rolledEvent && BONUS_EVENTS.find(e => e.id === rolledEvent.id)) || selectWeightedEvent();
        setSelectedEvent(event);

        // 80 tiles landing at 64. The pitch is owned by CanvasBonusStrip, not restated here: a mismatch lands on the wrong tile.
        const newStrip = [];
        for (let i = 0; i < BONUS_STRIP_LENGTH; i++) {
            if (i === BONUS_FINAL_INDEX) {
                newStrip.push(event);
            } else {
                // Random event for filler (also weighted for visual consistency)
                newStrip.push(selectWeightedEvent());
            }
        }
        setBonusStrip(newStrip);
        bonusOffsetRef.current = 0;

        // Lands on the pitch the board draws at (phone vs band), owned by the drawing component like MOBILE_ROW_PITCH.
        const targetOffset = BONUS_FINAL_INDEX * (isMobile ? BONUS_PITCH_MOBILE : BONUS_PITCH);
        const finalOffset = targetOffset + (Math.random() - 0.5) * 20;
        let startTime = null;
        const duration = 3500;

        const animateStrip = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quartic for nice deceleration
            const eased = 1 - Math.pow(1 - progress, 4);
            bonusOffsetRef.current = eased * finalOffset;

            if (progress < 1) {
                bonusWheelRef.current = requestAnimationFrame(animateStrip);
            } else {
                // Show result briefly then execute
                setState('bonusResult');
                setTimeout(() => executeSelectedEvent(event), 1500);
            }
        };
        bonusWheelRef.current = requestAnimationFrame(animateStrip);
    }

    // Execute the selected bonus event
    async function executeSelectedEvent(event) {
        if (event.id === 'triple_spin') {
            triggerTripleSpin();
        } else if (event.id === 'lucky_spin') {
            triggerLuckySpin();
        } else if (event.id === 'triple_lucky_spin') {
            triggerTripleLuckySpin();
        }
    }

    // Lucky spin - equal probability for all items (bonus event reward - no cooldown)
    async function triggerLuckySpin() {
        setState('luckySpinning');
        animationCancelledRef.current = false;

        try {
            // No body: the server knows which bonus event it rolled for this user and
            // gates the spin on that, so there is nothing for the client to declare.
            const res = await fetch(`${API_BASE_URL}/api/spin/lucky`, {
                method: 'POST',
                credentials: 'include'
            });
            const spinResult = await res.json();

            // Same recovery as the ordinary spin.
            recoverGlobalEventStatus(spinResult.globalEventStatus);

            // Check for errors (no cooldown check - this is a bonus reward)
            if (!res.ok || !spinResult.result) {
                setError(spinResult.error || 'Spin failed. Please wait a moment and try again.');
                setState('idle');
                return;
            }

            const finalItem = {
                ...spinResult.result,
                isSpecial: spinResult.result.type === 'legendary',
                isRare: spinResult.result.type === 'rare',
                isMythic: spinResult.result.type === 'mythic',
                isLucky: true
            };

            // Build strip and animate
            const newStrip = buildStrip(finalItem);
            setStrip(newStrip);
            setLuckyResult(finalItem);
            setIsLuckyNew(spinResult.isNew);
            setPrestigePull(spinResult.prestige || null);
            offsetRef.current = 0;
            canvasOffsetRef.current = 0;

            const itemWidth = isMobile ? MOBILE_ROW_PITCH : ITEM_WIDTH;
            const targetOffset = FINAL_INDEX * itemWidth;
            const finalOffset = targetOffset + landingVariance(itemWidth);
            let startTime = null;

            const animate = (timestamp) => {
                // Bail out if animation was cancelled
                if (animationCancelledRef.current) return;

                if (!startTime) startTime = timestamp;
                const elapsed = timestamp - startTime;
                const progress = Math.min(elapsed / spinDuration, 1);
                const eased = 1 - Math.pow(1 - progress, 4);
                offsetRef.current = eased * finalOffset;

                // Canvas strip reads directly from canvasOffsetRef - no setState needed!
                canvasOffsetRef.current = offsetRef.current;

                if (progress < 1 && !animationCancelledRef.current) {
                    animationRef.current = requestAnimationFrame(animate);
                } else if (!animationCancelledRef.current) {
                    setState('luckyResult');
                    // Play sound for lucky result
                    if (finalItem?.type) {
                        playRaritySound(finalItem.type);
                    }
                    if (onSpinComplete) onSpinComplete(spinResult);
                }
            };
            animationRef.current = requestAnimationFrame(animate);
        } catch (error) {
            console.error('Lucky spin failed:', error);
            setState('idle');
        }
    }

    async function triggerTripleSpin() {
        setState('tripleSpinning');

        try {
            // `bonus` is the only field the server reads: it spends a bonus credit instead of the cooldown.
            async function getValidSpin() {
                let attempts = 0;
                while (attempts < 5) {
                    const res = await fetch(`${API_BASE_URL}/api/spin`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ bonus: true })
                    });
                    const result = await res.json();

                    // Same recovery as the ordinary spin above.
                    recoverGlobalEventStatus(result.globalEventStatus);

                    // Handle rate limit / cooldown - throw to abort triple spin
                    if (res.status === 429 || result.cooldown) {
                        throw new Error('COOLDOWN');
                    }

                    // Check for other errors
                    if (!res.ok || !result.result) {
                        throw new Error(result.error || 'Spin failed');
                    }

                    if (!result.isEvent) {
                        return result;
                    }
                    attempts++;
                }
                // Fallback: return a random regular item (shouldn't happen often)
                const regularItem = allItems[Math.floor(Math.random() * allItems.length)];
                return {
                    result: { ...regularItem, type: 'regular' },
                    isNew: !collection[regularItem.texture],
                    isEvent: false
                };
            }

            // Get 5 valid spins (retrying if we hit events)
            const results = await Promise.all([getValidSpin(), getValidSpin(), getValidSpin(), getValidSpin(), getValidSpin()]);

            const newStrips = [];
            const newResults = [];
            const newItems = [];

            for (let i = 0; i < 5; i++) {
                const spinResult = results[i];
                const finalItem = {
                    ...spinResult.result,
                    isSpecial: spinResult.result.type === 'legendary',
                    isRare: spinResult.result.type === 'rare',
                    isMythic: spinResult.result.type === 'mythic'
                };
                newStrips.push(buildStrip(finalItem));
                newResults.push(finalItem);
                newItems.push(spinResult.isNew);
            }

            setTripleStrips(newStrips);
            setTripleResults(newResults);
            setTripleNewItems(newItems);
            tripleOffsetRefs.current = [0, 0, 0, 0, 0];

            // Staggered animation start
            const delays = [0, 200, 400, 600, 800];
            const completedCount = { current: 0 };
            // Must stop on the pitch the lanes draw at; LANE_PITCH is owned by SpinLanes.
            const tripleItemWidth = LANE_PITCH(isMobile, false);

            delays.forEach((delay, rowIndex) => {
                setTimeout(() => {
                    const targetOffset = FINAL_INDEX * tripleItemWidth;
                    const finalOffset = targetOffset + landingVariance(tripleItemWidth);
                    let startTime = null;

                    const animate = (timestamp) => {
                        if (!startTime) startTime = timestamp;
                        const elapsed = timestamp - startTime;
                        const progress = Math.min(elapsed / spinDuration, 1);
                        const eased = 1 - Math.pow(1 - progress, 4);

                        // Canvas strips read directly from tripleOffsetRefs - no setState needed!
                        tripleOffsetRefs.current[rowIndex] = eased * finalOffset;

                        if (progress < 1) {
                            tripleAnimationRefs.current[rowIndex] = requestAnimationFrame(animate);
                        } else {
                            completedCount.current++;
                            if (completedCount.current === 5) {
                                setState('tripleResult');
                                // Play sound for best rarity among all 5 results
                                const rarityPriority = ['insane', 'mythic', 'legendary', 'rare'];
                                const bestRarity = results.reduce((best, r) => {
                                    const type = r?.result?.type;
                                    const bestIndex = rarityPriority.indexOf(best);
                                    const typeIndex = rarityPriority.indexOf(type);
                                    if (typeIndex !== -1 && (bestIndex === -1 || typeIndex < bestIndex)) {
                                        return type;
                                    }
                                    return best;
                                }, null);
                                if (bestRarity) playRaritySound(bestRarity);
                                // Bonus spins spend KOTW lucky spins server-side, so reconcile the badge. The five requests run concurrently and Promise.all keeps argument order, not completion order, so the lowest balance reported is the reliable one.
                                const reportedBalances = results
                                    .map(r => r?.kotwLuckySpinsRemaining)
                                    .filter(v => typeof v === 'number');
                                if (reportedBalances.length > 0 && onKotwLuckySpinsUpdate) {
                                    onKotwLuckySpinsUpdate(Math.min(...reportedBalances));
                                }
                                results.forEach(r => { if (onSpinComplete) onSpinComplete(r); });
                            }
                        }
                    };
                    tripleAnimationRefs.current[rowIndex] = requestAnimationFrame(animate);
                }, delay);
            });
        } catch (error) {
            // Show error message on cooldown, log other failures
            if (error.message === 'COOLDOWN') {
                setError("Don't spin too fast!");
            } else {
                console.error('Triple spin failed:', error);
            }
            setState('idle');
        }
    }

    // Triple Lucky Spin - 3 lucky spins with equal probability for all items
    async function triggerTripleLuckySpin() {
        setState('tripleLuckySpinning');

        try {
            // Helper to get a lucky spin result.
            // No body: the server rolled this bonus event and counts the trigger itself.
            async function getLuckySpin() {
                const res = await fetch(`${API_BASE_URL}/api/spin/lucky`, {
                    method: 'POST',
                    credentials: 'include'
                });
                const data = await res.json();

                // Same recovery as above.
                recoverGlobalEventStatus(data.globalEventStatus);

                if (!res.ok) {
                    throw new Error(data.error || 'Lucky spin failed');
                }

                return data;
            }

            // Get all 3 lucky spin results
            const results = await Promise.all([getLuckySpin(), getLuckySpin(), getLuckySpin()]);

            // Build strips for each result
            const strips = results.map(r => {
                const finalItem = {
                    ...r.result,
                    isSpecial: r.result.type === 'legendary',
                    isRare: r.result.type === 'rare',
                    isMythic: r.result.type === 'mythic',
                    isLucky: true
                };
                return buildStrip(finalItem);
            });

            setTripleStrips(strips);
            setTripleResults(results.map(r => ({
                ...r.result,
                isSpecial: r.result.type === 'legendary',
                isRare: r.result.type === 'rare',
                isMythic: r.result.type === 'mythic',
                isLucky: true
            })));
            setTripleNewItems(results.map(r => r.isNew));
            tripleOffsetRefs.current = [0, 0, 0];

            // Animate all three strips with staggered starts
            const completedCount = { current: 0 };
            const delays = [0, 200, 400];
            // Same contract as the 5x: stop on the lanes' own pitch.
            const tripleItemWidth = LANE_PITCH(isMobile, true);

            strips.forEach((_, rowIndex) => {
                const delay = delays[rowIndex];

                setTimeout(() => {
                    const targetOffset = FINAL_INDEX * tripleItemWidth;
                    const finalOffset = targetOffset + landingVariance(tripleItemWidth);
                    let startTime = null;

                    const animate = (timestamp) => {
                        if (!startTime) startTime = timestamp;
                        const elapsed = timestamp - startTime;
                        const progress = Math.min(elapsed / spinDuration, 1);
                        const eased = 1 - Math.pow(1 - progress, 4);

                        // Canvas strips read directly from tripleOffsetRefs - no setState needed!
                        tripleOffsetRefs.current[rowIndex] = eased * finalOffset;

                        if (progress < 1) {
                            tripleAnimationRefs.current[rowIndex] = requestAnimationFrame(animate);
                        } else {
                            completedCount.current++;
                            if (completedCount.current === 3) {
                                setState('tripleLuckyResult');
                                // Play sound for best rarity among all 3 results
                                const rarityPriority = ['insane', 'mythic', 'legendary', 'rare'];
                                const bestRarity = results.reduce((best, r) => {
                                    const type = r?.result?.type;
                                    const bestIndex = rarityPriority.indexOf(best);
                                    const typeIndex = rarityPriority.indexOf(type);
                                    if (typeIndex !== -1 && (bestIndex === -1 || typeIndex < bestIndex)) {
                                        return type;
                                    }
                                    return best;
                                }, null);
                                if (bestRarity) playRaritySound(bestRarity);
                                results.forEach(r => { if (onSpinComplete) onSpinComplete(r); });
                            }
                        }
                    };
                    tripleAnimationRefs.current[rowIndex] = requestAnimationFrame(animate);
                }, delay);
            });
        } catch (error) {
            console.error('Triple lucky spin failed:', error);
            setState('idle');
        }
    }

    // totalItemCount includes both regular items and dynamic items (team members, special items)
    const totalItemCount = allItems.length + (dynamicItems?.length || 0);


    // Compute recursion effects flag - must be before any early returns
    // Use ref during spinning/result to persist styling even after spin count decreases
    const showSpinRecursionEffects = (state === 'spinning' || state === 'result')
        ? currentSpinIsRecursionRef.current
        : (recursionActive && recursionSpinsRemaining > 0);

    // Compute KOTW lucky effects flag
    // Use state variable which is set at spin start for immediate effect
    const showSpinKotwLuckyEffects = (state === 'spinning' || state === 'result')
        ? currentSpinIsKotwLucky
        : (!showSpinRecursionEffects && !boxGilded && kotwLuckySpins > 0);

    // The gilded reel outranks the lucky themes; it yields only to an event's own takeover.
    const showMysteryEffects = (state === 'spinning' || state === 'result')
        ? currentSpinIsMystery
        : (state === 'idle' && boxGilded);

    // Combined flag for any lucky spin effects (for shared logic like equal odds)
    const showAnySpinLuckyEffects = showSpinRecursionEffects || showSpinKotwLuckyEffects;

    // KOTW Lucky is crimson/gold, distinct from Recursion's matrix green.
    const KOTW_CRIMSON = arenaVisible ? ARENA.gold : '#F43F5E';
    const KOTW_GOLD = arenaVisible ? ARENA.gold : '#F59E0B';

    // Event mode tints the reel to the event's hue (presentation only); lucky spins outrank it.
    // Declared below KOTW_CRIMSON and the lucky flags it reads: any earlier is a TDZ and renders blank with a clean build.
    const EVENT_ACCENT = {
        king_of_wheel: arenaVisible ? ARENA.gold : KOTW_CRIMSON,
        first_blood: COLORS.red,
        community_goal: COLORS.aqua,
    };
    // The accent must outlive the event clock: global_event_end clears the status while result banners are still up (8s First Blood, 12s Community Goal, 30s KOTW; see ActivityContext).
    const aftermathEventType = firstBloodResultPending || firstBloodWinner
        ? 'first_blood'
        : communityGoalResultPending || communityGoalResult
            ? 'community_goal'
            : kotwWinnerPending || kotwWinner
                ? 'king_of_wheel'
                : null;
    const eventAccent = (globalEventStatus?.active || aftermathEventType)
        ? EVENT_ACCENT[aftermathEventType || globalEventStatus?.type] || null
        : null;

    // Takeover modes theme the same band and stage; each owns one accent (bonus orange, lucky green, 5x gold). Declared above the accents that read `modeAccent`.
    const isBonusMode = state === 'bonusWheel' || state === 'bonusResult';
    const isLuckyMode = state === 'luckySpinning' || state === 'luckyResult';
    const isTripleMode = state === 'tripleSpinning' || state === 'tripleResult' || state === 'tripleLuckySpinning' || state === 'tripleLuckyResult';
    const isModeSpinning = state === 'bonusWheel' || state === 'luckySpinning' || state === 'tripleSpinning' || state === 'tripleLuckySpinning';
    const modeAccent = isBonusMode
        ? COLORS.orange
        : (isLuckyMode || state === 'tripleLuckySpinning' || state === 'tripleLuckyResult')
            ? COLORS.green
            : isTripleMode
                ? COLORS.gold
                : null;

    // A result can remain on screen between events; its points belong only to
    // the competition in which that spin landed.
    const arenaPoints = arenaVisible && landedKotwPoints
        && (globalEventStatus?.type !== 'king_of_wheel' || landedKotwPoints.expiresAt === globalEventStatus.expiresAt)
        ? landedKotwPoints.points : null;

    const bandAccent = arenaVisible ? ARENA.gold : showMysteryEffects ? COLORS.mystery : showSpinRecursionEffects
        ? COLORS.recursion
        : showSpinKotwLuckyEffects
            ? KOTW_GOLD
            : modeAccent || (forgeVisible ? '#EAB268' : firstBloodVisible ? '#D65B45' : eventAccent) || COLORS.gold;

    const KOTW_SLATE = '#1E293B';
    const KOTW_SLATE_DARK = '#0F172A';


    // Idle renders the same rows as every state: a fixed-height grid row cannot appear and disappear, so the reel is dormant, not absent.

    const ruleColor = arenaVisible ? `${ARENA.gold}99` : showMysteryEffects ? `${COLORS.mystery}88` : showSpinRecursionEffects
        ? `${COLORS.recursion}40`
        : showSpinKotwLuckyEffects
            ? `${KOTW_CRIMSON}50`
            : modeAccent
                ? `${modeAccent}45`
                : firstBloodVisible ? '#BF805799' : eventAccent
                    ? `${eventAccent}55`
                    : `${COLORS.gold}28`;

    // `consoleColor` mirrors the label's ternary; the two are one decision.
    const spinningState = state === 'spinning' || state === 'tripleSpinning' || state === 'tripleLuckySpinning' || state === 'luckySpinning' || state === 'bonusWheel';
    const resultState = state === 'result' || state === 'tripleResult' || state === 'luckyResult' || state === 'tripleLuckyResult' || state === 'recursion' || state === 'bonusResult';
    // The table draws over a reel that keeps rendering and is not held for a landing, so put away the last pull (state back to idle, not merely hidden) or a stale pull returns later.
    // Only the states drawing a payoff over an idle band: the bonus board and 3x/5x lanes replace the band, and cutting them would strand a multi-spin flow.
    useEffect(() => {
        if (!tableOwnsReel) return;
        if (state !== 'result' && state !== 'luckyResult') return;
        setState('idle');
        setResult(null);
        setIsNewItem(false);
        setPrestigePull(null);
    }, [tableOwnsReel, state]);

    const consoleColor = arenaVisible ? ARENA.ink : showMysteryEffects ? COLORS.mystery : state === 'recursion' ? COLORS.recursion
        : state === 'event' || state === 'bonusWheel' || state === 'bonusResult' ? COLORS.orange
            : state === 'luckySpinning' || state === 'luckyResult' || state === 'tripleLuckySpinning' || state === 'tripleLuckyResult' ? COLORS.green
                : showSpinRecursionEffects ? COLORS.recursion
                    : showSpinKotwLuckyEffects ? KOTW_GOLD
                        : firstBloodVisible ? '#E7BA8D' : COLORS.gold;

    return (
        // `display: contents`: children are direct children of WheelPage's grid, so each must place itself (gridRow/gridColumn) or it is auto-placed.
        // The phone keeps a flex column exactly the viewport tall with no scroll; the shaft takes what the other rows leave.
        <div className={forgeVisible ? 'cg-forge-machine-theme' : firstBloodVisible ? 'fb-machine' : arenaVisible ? "kotw-machine" : undefined} style={isMobile ? {
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch',
            padding: 0,
            position: 'relative',
            // Row 4 of the phone template, under the topbar, ticker and banner/meter slot.
            gridRow: 4,
            gridColumn: 1,
            minHeight: 0,
            overflow: 'hidden',
        } : { display: 'contents' }}>

            {/* Odds Info Modal */}
            {showOddsInfo && (
                <OddsInfoModal
                    onClose={() => setShowOddsInfo(false)}
                    dynamicItems={dynamicItems}
                    allItems={allItems}
                />
            )}

            {/* Main spin surface across two grid rows: a full-width band (status + reel) with the result in the stage below. No card, so nothing caps the reel's width. */}
                    {/* ── Row 2: the reel band ─────────────────────────────── */}
                    <div ref={reelBandRef} className={highRollerOwnsReel ? "kotw-reel-band hr-active-band" : "kotw-reel-band"} style={{
                        gridRow: 4,
                        gridColumn: '1 / -1',
                        position: 'relative',
                        zIndex: Z.reel,
                        // `minHeight: 0`: a flex child would otherwise refuse to shrink below its content.
                        ...(isMobile ? { flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
                        // The band's rules are fading overlays, not borders.
                        background: highRollerOwnsReel ? 'transparent' : parlourOwnsReel
                            ? 'linear-gradient(180deg, #350a13 0%, #26060e 44%, #180409 100%)'
                            : showMysteryEffects
                            // The canvas's GILT_DEEP ramp carried to the DOM ground so no seam shows.
                            ? 'linear-gradient(180deg, #2a1c05 0%, #3a2708 46%, #150e03 100%)'
                            : showSpinRecursionEffects
                            ? 'linear-gradient(180deg, #0a150a 0%, #12240e 46%, #0a150a 100%)'
                            : showSpinKotwLuckyEffects
                                ? `linear-gradient(180deg, ${KOTW_SLATE_DARK} 0%, ${KOTW_SLATE} 46%, ${KOTW_SLATE_DARK} 100%)`
                                : modeAccent
                                    // Takeover modes tint the deck with a wash, not a repaint.
                                    ? `linear-gradient(180deg, ${modeAccent}12 0%, ${modeAccent}06 45%, #05060a 100%)`
                                    : eventAccent
                                        ? `linear-gradient(180deg, ${eventAccent}14 0%, ${eventAccent}08 55%, #14141a 100%)`
                                        : 'linear-gradient(180deg, var(--wheel-panel-top, #0d1322) 0%, var(--wheel-panel-bottom, #0a0d18) 44%, #05060a 100%)',
                        // During an event the band glows even at rest, so the
                        // surface looks live rather than only reacting on a spin.
                        boxShadow: state === 'spinning' || isModeSpinning
                            ? `0 0 60px -20px ${bandAccent}`
                            : eventAccent
                                ? `0 0 46px -26px ${eventAccent}`
                                : 'none',
                        transition: 'box-shadow 0.3s ease-out, background 0.4s ease-out',
                    }}>
                        {/* The band's two rules as fading hairlines: viaduct rail above, street glow below. */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${ruleColor} 14%, ${ruleColor} 86%, transparent)` }} />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${ruleColor} 14%, ${ruleColor} 86%, transparent)` }} />

                        {/* The box's coat going on - see gildReelFromBox. */}
                        {boxCoating > 0 && <MysteryCoat key={boxCoating} />}

                        {/* No divider under the header: the seam is the band's top hairline, drawn by the canvas. */}
                        <div className="kotw-reel-console" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            gap: isMobile ? 12 : 0,
                            // Reserves the tallest variant (64 = 32px control + 16px padding twice) so the band never changes height when a result lands.
                            minHeight: '64px',
                            boxSizing: 'border-box',
                            // The deck's top face: SURFACE_NOISE grain with sky light from the rail; the canvas hairline below separates it from the reel.
                            backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, rgba(var(--wheel-surface-light, 148,168,212),0.06) 0%, rgba(var(--wheel-surface-light, 148,168,212),0) 42%), linear-gradient(180deg, var(--wheel-panel-top, #0d1322) 0%, var(--wheel-panel-bottom, #0a0d18) 100%)`,
                        }}>
                            {/* Left and right groups take equal slack (`flex: 1 1 0`) so the KOTW board stays centred on the bar when the row's contents change width. */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 0', minWidth: 0 }}>
                                {/* The console: a plinth plate of status LEDs and the state label; the lamps only ever agree with the label (caption rule from the spin control). */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: isMobile ? '4px 8px' : '5px 10px',
                                    ...(isMobile ? { display: 'none' } : {}),
                                    borderRadius: 0,
                                    backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, var(--wheel-control-top, #1b1b28) 0%, var(--wheel-control-bottom, #12121c) 100%)`,
                                    boxShadow: 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.10), inset 0 -1px 0 rgba(0,0,0,0.45)',
                                }}>
                                    {/* Decoration only; the label carries state for assistive tech. */}
                                    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <div style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: COLORS.gold, opacity: 0.9,
                                            boxShadow: `0 0 6px ${COLORS.gold}88`,
                                        }} />
                                        <div style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: consoleColor,
                                            opacity: spinningState ? 1 : 0.22,
                                            boxShadow: spinningState ? `0 0 6px ${consoleColor}88` : 'none',
                                            animation: spinningState ? 'fibLedBlink 0.7s ease-in-out infinite' : 'none',
                                        }} />
                                        <div style={{
                                            width: 6, height: 6, borderRadius: '50%',
                                            background: consoleColor,
                                            opacity: resultState ? 1 : 0.22,
                                            boxShadow: resultState ? `0 0 6px ${consoleColor}88` : 'none',
                                        }} />
                                    </div>
                                    <div aria-hidden="true" style={{ display: 'flex', gap: '2px' }}>
                                        {Array.from({ length: 12 }).map((_, i) => (
                                            <div key={i} style={{
                                                width: 3, height: 8, borderRadius: 1,
                                                background: consoleColor,
                                                opacity: spinningState ? 0.18 : resultState ? 1 : 0.35,
                                                boxShadow: resultState ? `0 0 4px ${consoleColor}66` : 'none',
                                                animation: spinningState ? 'fibLedChase 1.2s linear infinite' : 'none',
                                                animationDelay: `${-i * 0.1}s`,
                                            }} />
                                        ))}
                                    </div>
                                </div>
                                <span style={{
                                    color: arenaVisible ? ARENA.ink : state === 'recursion' ? COLORS.recursion
                                        : state === 'event' || state === 'bonusWheel' || state === 'bonusResult' ? COLORS.orange
                                            : (state === 'luckySpinning' || state === 'luckyResult' || state === 'tripleLuckySpinning' || state === 'tripleLuckyResult') ? COLORS.green
                                                : showSpinRecursionEffects ? COLORS.recursion
                                                    : showSpinKotwLuckyEffects ? '#F8FAFC'
                                                        : firstBloodVisible ? '#E7BA8D' : COLORS.gold,
                                    fontSize: '18px',
                                    fontWeight: '600',
                                    // The row may not change height between spin states and this label is the only thing that can wrap ("Triple Lucky Spinning…" took three lines at 414px); mode names are short on purpose.
                                    whiteSpace: 'nowrap',
                                    marginRight: '12px',
                                    textShadow: showSpinRecursionEffects
                                        ? `0 0 10px ${COLORS.recursion}`
                                        : showSpinKotwLuckyEffects
                                            ? `0 0 8px ${KOTW_CRIMSON}88`
                                            : 'none',
                                }}>
                                {state === 'spinning' ? (
                                        showMysteryEffects ? 'Opening the box...'
                                        : showSpinRecursionEffects ? 'Lucky Spinning...'
                                            : showSpinKotwLuckyEffects ? 'Event Lucky Spin...'
                                                : 'Spinning...'
                                    ) :
                                    state === 'recursion' ? 'RECURSION!' :
                                        state === 'event' ? 'BONUS EVENT!' :
                                            state === 'bonusWheel' ? 'Selecting Event...' :
                                                state === 'bonusResult' ? 'Event Selected!' :
                                                    state === 'tripleSpinning' ? '5x Spinning...' :
                                                        state === 'tripleResult' ? '5x Win!' :
                                                            state === 'luckySpinning' ? 'Lucky Spinning...' :
                                                                state === 'luckyResult' ? 'Lucky Win!' :
                                                                    state === 'tripleLuckySpinning' ? '3x Lucky Spinning...' :
                                                                        state === 'tripleLuckyResult' ? '3x Lucky Win!' :
                                                                            state === 'idle' ? (highRollerOwnsReel ? (highRollerResult ? 'High Roller · Table settled' : 'High Roller · Jimbo’s table') : firstBloodVisible ? 'First Blood is on the line' : arenaVisible ? 'The crown is in play' : showMysteryEffects ? 'Mystery box · spin to open' : 'Ready to spin') :
                                                                                (firstBloodVisible ? 'Your latest pull' : arenaVisible ? 'Points on the board' : showMysteryEffects ? 'Out of the box!' : 'Gamba!')}
                            </span>
                            </div>

                            {/* Centre slot: standings during a King of the Wheel event, the lucky spins it paid out afterwards; both show if both apply. */}
                            <EventPayout luckySpins={kotwLuckySpins} isMobile={isMobile} />

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: isMobile ? '0 0 auto' : '1 1 0', minWidth: 0, justifyContent: 'flex-end' }}>
                                {/* Box shelf: mounted even when empty, invisibly, so a box being put away has somewhere to fly. */}
                                <MysteryBoxShelf
                                    ref={boxShelfRef}
                                    count={shelvedBoxes}
                                    held={!boxReady}
                                    caught={boxShelved}
                                    compact={isMobile}
                                    onOpen={openBoxFromShelf}
                                />
                                {/* Info button: the 50% circle is the ratified shape for `?`. */}
                                <button
                                    onClick={() => setShowOddsInfo(true)}
                                    style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, var(--wheel-control-top, #1b1b28) 0%, var(--wheel-control-bottom, #12121c) 100%)`,
                                        boxShadow: 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.10), inset 0 -1px 0 rgba(0,0,0,0.45)',
                                        color: COLORS.textMuted,
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.15s'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.color = COLORS.aqua;
                                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.14), inset 0 0 18px rgba(85,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.45)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.color = COLORS.textMuted;
                                        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.10), inset 0 -1px 0 rgba(0,0,0,0.45)';
                                    }}
                                    title="How drop rates work"
                                >
                                    ?
                                </button>

                                {/* Desktop only: on a phone the reel itself is the respin (DESIGN.md §8), and this widest slot would crowd the `?` and the label. */}
                                {!isMobile && (state === 'result' || state === 'tripleResult' || state === 'luckyResult' || state === 'tripleLuckyResult' || state === 'recursion') && (
                                    <button onClick={respin} style={{
                                        padding: '8px 14px',
                                        borderRadius: 0,
                                        backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, var(--wheel-control-top, #1b1b28) 0%, var(--wheel-control-bottom, #12121c) 100%)`,
                                        boxShadow: 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.10), inset 0 -1px 0 rgba(0,0,0,0.45)',
                                        color: COLORS.textMuted, fontSize: '13px', cursor: 'pointer',
                                        transition: 'all 0.15s'
                                    }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.color = COLORS.text;
                                                e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.14), inset 0 0 18px rgba(255,183,94,0.10), inset 0 -1px 0 rgba(0,0,0,0.45)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.color = COLORS.textMuted;
                                                e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(var(--wheel-surface-light, 190,198,220),0.10), inset 0 -1px 0 rgba(0,0,0,0.45)';
                                            }}
                                    >Try Again</button>
                                )}
                            </div>
                        </div>

                        {/* The strip container is a mount, not a frame: the canvas draws its own edges, so no border, bezel or overlay here, no horizontal padding on desktop, and transparent so the row's themed gradient shows through. */}
                        <div style={isMobile
                            // Full-bleed and flexing: the shaft's mount is the
                            // whole width and whatever height is left.
                            ? { padding: 0, flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }
                            : { padding: '8px 0 22px' }}>
                            {/* The phone's one tap gesture lives on the band, not the reel mount, so the 3x/5x lanes and bonus board (which replace the mount) have a target; Try Again is desktop-only. Returns immediately off the phone. */}
                            <div
                                onClick={handleBandTap}
                                style={isMobile
                                    ? { position: 'relative', flex: '1 1 0', minHeight: 0, cursor: bandTappable ? 'pointer' : 'default' }
                                    : { position: 'relative' }}>
                                {/* Street glow: static amber curb light at the bottom of the band, the only overlay over the canvas (which draws its own vignette). At the strip container's level so takeover modes share it. */}
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'radial-gradient(ellipse 76% 50% at 50% 84%, rgba(255,183,94,0.05) 0%, rgba(var(--wheel-surface-light, 206,214,236),0.02) 40%, transparent 68%)',
                                    zIndex: 3,
                                    pointerEvents: 'none',
                                }} />

                                {isBonusMode ? (
                                    // Bonus board: replaces the reel in the same mount. It has no canvas detent, so its platform line is a DOM hairline on both breakpoints.
                                    <div style={{
                                        position: 'relative',
                                        // On a phone the board fills the shaft's space like the reel it stands in for.
                                        height: isMobile ? '100%' : `${STRIP_HEIGHT}px`,
                                        flex: isMobile ? '1 1 0' : undefined,
                                        minHeight: isMobile ? 0 : undefined,
                                        width: '100%',
                                        overflow: 'hidden',
                                        borderRadius: 0,
                                    }}>
                                        <CanvasBonusStrip
                                            events={bonusStrip}
                                            offsetRef={bonusOffsetRef}
                                            isMobile={isMobile}
                                            isSpinning={state === 'bonusWheel'}
                                            isResult={state === 'bonusResult'}
                                            // The landing index the strip was built around, not re-derived from its length.
                                            finalIndex={BONUS_FINAL_INDEX}
                                        />
                                        {/* Platform line turned to match the board's travel axis: it must point along the motion, not across it. */}
                                        <div style={{
                                            position: 'absolute',
                                            ...(isMobile
                                                ? { left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', height: '2px' }
                                                : { top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '2px' }),
                                            background: COLORS.orange,
                                            zIndex: 10,
                                            boxShadow: `0 0 14px ${COLORS.orange}, 0 0 28px ${COLORS.orange}88`,
                                        }} />
                                        <div style={{
                                            position: 'absolute',
                                            width: 0, height: 0,
                                            ...(isMobile
                                                ? {
                                                    left: '-1px', top: '50%', transform: 'translateY(-50%)',
                                                    borderTop: '8px solid transparent', borderBottom: '8px solid transparent',
                                                    borderLeft: `12px solid ${COLORS.orange}`,
                                                }
                                                : {
                                                    top: '-1px', left: '50%', transform: 'translateX(-50%)',
                                                    borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
                                                    borderTop: `12px solid ${COLORS.orange}`,
                                                }),
                                            zIndex: 11,
                                            filter: `drop-shadow(0 0 6px ${COLORS.orange})`,
                                        }} />
                                        <div style={{
                                            position: 'absolute',
                                            width: 0, height: 0,
                                            ...(isMobile
                                                ? {
                                                    right: '-1px', top: '50%', transform: 'translateY(-50%)',
                                                    borderTop: '8px solid transparent', borderBottom: '8px solid transparent',
                                                    borderRight: `12px solid ${COLORS.orange}`,
                                                }
                                                : {
                                                    bottom: '-1px', left: '50%', transform: 'translateX(-50%)',
                                                    borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
                                                    borderBottom: `12px solid ${COLORS.orange}`,
                                                }),
                                            zIndex: 11,
                                            filter: `drop-shadow(0 0 6px ${COLORS.orange})`,
                                        }} />
                                    </div>
                                ) : isTripleMode ? (
                                    // 3x/5x takeovers: parallel lanes sharing the band's row (see SpinLanes.jsx).
                                    <SpinLanes
                                        laneCount={state === 'tripleLuckySpinning' || state === 'tripleLuckyResult' ? 3 : 5}
                                        isTripleLucky={state === 'tripleLuckySpinning' || state === 'tripleLuckyResult'}
                                        strips={tripleStrips}
                                        offsetRefs={tripleOffsetRefs}
                                        isSpinning={state === 'tripleSpinning' || state === 'tripleLuckySpinning'}
                                        isResult={state === 'tripleResult' || state === 'tripleLuckyResult'}
                                        isMobile={isMobile}
                                        accentColor={modeAccent || COLORS.gold}
                                    />
                                ) : (
                            <div
                                ref={reelMountRef}
                                // The tap is on the band, one level up.
                                style={{
                                    position: 'relative',
                                    // The shaft takes the full width and the height the stage row gives it; no fixed height (landscape 390 vs portrait 844).
                                    height: isMobile || highRollerOwnsReel ? '100%' : `${STRIP_HEIGHT}px`,
                                    width: '100%',
                                    overflow: 'hidden',
                                    // No corners: a radius at the viewport edge is a notch.
                                    borderRadius: 0,
                                    margin: 0,
                                    // The mount's shadow; depth inside the band is the canvas's job.
                                    boxShadow: highRollerOwnsReel ? 'none' : '0 16px 36px -20px rgba(0,0,0,0.85)',
                                }}>

                                {/* Arrival: the reel's slots shutter here in the mount, and the station plays in a fixed frame growing from this rectangle (ArrivalTheatre.jsx). The wheel keeps rendering underneath. */}
                                {/* Keyed on the event so a second arrival gets a fresh clock; reuse left `start` at the previous arrival's mount time and rendered a blank band. */}
                                {arrivalOwnsReel && (
                                    <ArrivalTheatre key={arrival?.expiresAt || 'arrival'} />
                                )}

                                {/* Parlour pockets drawn OVER the reel, which keeps rendering underneath (a turning slot shows the item at its edges). Keyed on the table for a fresh canvas. */}
                                {parlourOwnsReel && (
                                    <CanvasRouletteStrip
                                        key={roulette.openedAt || 'parlour'}
                                        pockets={roulette.pockets}
                                        pocketIndex={rouletteResult?.pocketIndex ?? null}
                                        clock={parlourClock}
                                        isMobile={isMobile}
                                        onTick={playParlourTick}
                                    />
                                )}

                                {/* Parlour deck, phone only: it mounts in the band, since portalling to the body put cards over the topbar and help control (see ParlourDeck's footer). Desktop uses ParlourAtmosphere. */}
                                {parlourOwnsReel && isMobile && (
                                    <ParlourDeck
                                        key={`deck-${roulette.openedAt || 'parlour'}`}
                                        openedAt={roulette.openedAt}
                                        pocketColour={rouletteResult?.pocket?.colour ?? null}
                                        isMobile
                                    />
                                )}

                                {/* High Roller's dealer over the reel; keyed on the table like the Parlour. */}
                                {highRollerOwnsReel && (
                                    <HighRollerRoom
                                        key={`hr-dealer-${highRoller.openedAt || 'table'}`}
                                        table={highRollerTable}
                                        result={highRollerResult}
                                        dealAt={highRoller.dealAt}
                                        actsFrom={highRoller.actsFrom}
                                        playClosesAt={highRoller.playClosesAt}
                                        intent={highRollerIntent}
                                        payout={highRollerPayout}
                                        payouts={highRoller.payouts}
                                        onTable={applyHighRollerTable}
                                        onIntent={setHighRollerIntent}
                                        isMobile={isMobile}
                                    />
                                )}

                                {/* Matrix scanlines overlay - Recursion only */}
                                {showSpinRecursionEffects && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${COLORS.recursion}08 2px, ${COLORS.recursion}08 4px)`,
                                        zIndex: 6,
                                        pointerEvents: 'none',
                                        animation: 'matrixFlicker 0.1s infinite',
                                    }} />
                                )}

                                {/* No DOM centre line or triangle pointers on either breakpoint: the canvas draws its own detent (see CanvasSpinningStrip.jsx), and a bar over the winning item is worse. */}

                                {/* Pointer - Enhanced with heartbeat during slowdown */}
                                {showAnySpinLuckyEffects ? (
                                    <>
                                        {/* Top Bracket for lucky spins */}
                                        <div style={{
                                            position: 'absolute',
                                            ...(isMobile ? {
                                                left: '-6px', top: '50%', transform: 'translateY(-50%)',
                                            } : {
                                                top: '-6px', left: '50%', transform: 'translateX(-50%)',
                                            }),
                                            zIndex: 11,
                                            filter: showSpinRecursionEffects
                                                ? `drop-shadow(0 0 8px ${COLORS.recursion}) drop-shadow(0 0 16px ${COLORS.recursion}88)`
                                                : `drop-shadow(0 0 8px ${KOTW_GOLD}) drop-shadow(0 0 12px ${KOTW_CRIMSON}66)`,
                                            animation: state === 'spinning' && spinProgress > 0.7
                                                ? (isMobile ? 'indicatorHeartbeatMobile 0.4s ease-in-out infinite' : 'indicatorHeartbeat 0.4s ease-in-out infinite')
                                                : 'none',
                                        }}>
                                            <div style={{
                                                ...(isMobile ? {
                                                    width: '10px',
                                                    height: '24px',
                                                    borderTop: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderBottom: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderLeft: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderRight: 'none',
                                                    borderRadius: '4px 0 0 4px',
                                                } : {
                                                    width: '24px',
                                                    height: '10px',
                                                    borderLeft: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderRight: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderTop: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderBottom: 'none',
                                                    borderRadius: '4px 4px 0 0',
                                                }),
                                                background: showSpinRecursionEffects ? `${COLORS.recursion}11` : `${KOTW_GOLD}11`,
                                            }} />
                                        </div>
                                        {/* Bottom Bracket for lucky spins */}
                                        <div style={{
                                            position: 'absolute',
                                            ...(isMobile ? {
                                                right: '-6px', top: '50%', transform: 'translateY(-50%)',
                                            } : {
                                                bottom: '-6px', left: '50%', transform: 'translateX(-50%)',
                                            }),
                                            zIndex: 11,
                                            filter: showSpinRecursionEffects
                                                ? `drop-shadow(0 0 8px ${COLORS.recursion}) drop-shadow(0 0 16px ${COLORS.recursion}88)`
                                                : `drop-shadow(0 0 8px ${KOTW_GOLD}) drop-shadow(0 0 12px ${KOTW_CRIMSON}66)`,
                                            animation: state === 'spinning' && spinProgress > 0.7
                                                ? (isMobile ? 'indicatorHeartbeatMobile 0.4s ease-in-out infinite' : 'indicatorHeartbeat 0.4s ease-in-out infinite')
                                                : 'none',
                                        }}>
                                            <div style={{
                                                ...(isMobile ? {
                                                    width: '10px',
                                                    height: '24px',
                                                    borderTop: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderBottom: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderRight: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderLeft: 'none',
                                                    borderRadius: '0 4px 4px 0',
                                                } : {
                                                    width: '24px',
                                                    height: '10px',
                                                    borderLeft: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderRight: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderBottom: `3px solid ${showSpinRecursionEffects ? COLORS.recursion : KOTW_GOLD}`,
                                                    borderTop: 'none',
                                                    borderRadius: '0 0 4px 4px',
                                                }),
                                                background: showSpinRecursionEffects ? `${COLORS.recursion}11` : `${KOTW_GOLD}11`,
                                            }} />
                                        </div>
                                    </>
                                ) : null}
                                {/* No phone pointers: a second indicator would argue with the canvas detent. Lucky brackets stay on both breakpoints as a mode signal. */}

                                {/* Result Shockwave Effect */}
                                {state === 'result' && (
                                    <>
                                        <div style={{
                                            position: 'absolute',
                                            top: '50%', left: '50%',
                                            width: isMobile ? '100px' : '60px',
                                            height: isMobile ? '100px' : '60px',
                                            border: `2px solid ${showSpinRecursionEffects ? COLORS.recursion : showSpinKotwLuckyEffects ? KOTW_GOLD : COLORS.gold}`,
                                            borderRadius: '50%',
                                            animation: 'resultShockwaveRing 0.6s ease-out forwards',
                                            pointerEvents: 'none',
                                            zIndex: 8,
                                        }} />
                                        <div style={{
                                            position: 'absolute',
                                            top: '50%', left: '50%',
                                            width: isMobile ? '100px' : '60px',
                                            height: isMobile ? '100px' : '60px',
                                            border: `2px solid ${showSpinRecursionEffects ? COLORS.recursion : showSpinKotwLuckyEffects ? KOTW_GOLD : COLORS.gold}66`,
                                            borderRadius: '50%',
                                            animation: 'resultShockwaveRing 0.6s ease-out 0.1s forwards',
                                            pointerEvents: 'none',
                                            zIndex: 8,
                                        }} />
                                    </>
                                )}

                                <CanvasSpinningStrip
                                    items={state === 'idle' ? dormantStrip : strip}
                                    // The dormant reel is a cylinder; the spin strip
                                    // is a finite sequence with a winning slot in it.
                                    loop={state === 'idle'}
                                    offsetRef={canvasOffsetRef}
                                    isMobile={isMobile}
                                    isSpinning={state === 'spinning' || state === 'luckySpinning'}
                                    isResult={state === 'result' || state === 'event' || state === 'luckyResult'}
                                    spinProgress={spinProgress}
                                    isRecursion={showSpinRecursionEffects}
                                    themeType={arenaVisible ? 'kotw-arena' : showMysteryEffects ? 'mystery' : showSpinKotwLuckyEffects ? 'kotw' : firstBloodVisible && !showSpinRecursionEffects && !isLuckyMode ? 'first-blood' : null}
                                    accentColor={arenaVisible ? ARENA.gold : showMysteryEffects ? COLORS.mystery : showSpinKotwLuckyEffects ? KOTW_GOLD : showSpinRecursionEffects ? COLORS.recursion : isLuckyMode ? COLORS.green : firstBloodVisible ? '#D65B45' : eventAccent || null}
                                    // The shaft fills its mount and the canvas measures its own box.
                                    stripWidth={undefined}
                                    stripHeight={isMobile ? undefined : STRIP_HEIGHT}
                                    finalIndex={FINAL_INDEX}
                                    isLuckySpin={showAnySpinLuckyEffects || isLuckyMode}
                                />

                                {/* Phone payoff over the landed row (ShaftResult.jsx). `top` is the canvas's formula `stripCentre + finalIndex × pitch − offset`, not the midpoint: the spin rests up to 45% of a pitch off centre. Reading canvasOffsetRef in render is safe only because the offset has finished moving. */}
                                {/* Idle caption floats over the shaft's bottom vignette, costing no layout. */}
                                {/* Hidden while the parlour owns the reel: the phone table is a tray over this line, and tapping does nothing then. */}
                                {isMobile && state === 'idle' && !tableOwnsReel && (
                                    <div style={{
                                        position: 'absolute',
                                        left: 0, right: 0, bottom: 0,
                                        paddingBottom: `${SPACE.md}px`,
                                        textAlign: 'center',
                                        pointerEvents: 'none',
                                        zIndex: 12,
                                    }}>
                                        <div style={{
                                            color: COLORS.gold,
                                            fontSize: '15px',
                                            fontWeight: 700,
                                            textShadow: `0 0 20px ${COLORS.gold}44, 0 2px 8px rgba(0,0,0,0.9)`,
                                        }}>
                                            {!user ? 'Login to spin!'
                                                : allItems.length === 0 ? 'Fetching item pool...'
                                                    : firstBloodVisible ? 'Tap to spin for First Blood' : arenaVisible ? 'Tap to spin for the crown' : 'Tap the reel to spin'}
                                        </div>
                                        <div style={{
                                            fontSize: '11px',
                                            color: COLORS.textMuted,
                                            marginTop: '2px',
                                            textShadow: '0 2px 8px rgba(0,0,0,0.9)',
                                        }}>
                                            Win one of {totalItemCount.toLocaleString('en-US')} items
                                        </div>
                                    </div>
                                )}

                                {/* `!parlourOwnsReel` closes the one frame between the table opening and the effect putting the reel away. */}
                                {isMobile && !tableOwnsReel && (state === 'result' || state === 'luckyResult')
                                    && (state === 'result' ? result : luckyResult) && shaftHeight > 0 && (
                                    <ShaftResult
                                        arena={arenaVisible}
                                        firstBlood={firstBloodVisible}
                                        kotwPoints={state === "result" ? arenaPoints : null}
                                        result={state === 'result' ? result : luckyResult}
                                        isNewItem={state === 'result' ? isNewItem : isLuckyNew}
                                        prestigePull={prestigePull}
                                        collection={collection}
                                        // Landed row's centre via the canvas's formula, not the shaft midpoint (the spin rests up to 45% of a pitch off centre).
                                        centerY={(shaftHeight / 2 - MOBILE_ROW_PITCH / 2)
                                            + FINAL_INDEX * MOBILE_ROW_PITCH
                                            - canvasOffsetRef.current
                                            + MOBILE_ROW_PITCH / 2}
                                    />
                                )}
                            </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* ── Row 3: the stage ─────────────────────────────────── */}
                    <div className="kotw-result-stage" style={{
                        ...(highRollerOwnsReel ? { visibility: 'hidden' } : null),
                        gridRow: 5,
                        gridColumn: stageColumn,
                        minHeight: 0,
                        ...(!isMobile ? { containerType: 'size', containerName: 'wheel-stage' } : null),
                        // Bets are scenery; the settlement must remain reachable on short screens.
                        overflowY: parlourOwnsReel && !(rouletteResult && parlourT >= T_REVEAL) ? 'hidden' : 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        // `flex-start`, not `center`: a centred overflowing flex column cannot scroll to its top.
                        justifyContent: 'flex-start',
                        paddingTop: tableOwnsReel || arenaVisible || firstBloodVisible || forgeVisible ? '8px' : `${SPACE.md}px`,
                        zIndex: Z.content,
                        // Phone apron under the shaft: zero height for normal and lucky modes (the result is drawn in the shaft, the idle caption floats in its fade). One height always: resizing at the press would jump the reel.
                        // Takeovers keep a taller apron (plaque, lucky panel, lane readout); it changes when the band swaps content, never mid-spin.
                        ...(isMobile
                            ? {
                                flex: '0 0 auto',
                                height: highRollerOwnsReel ? '0px' : isBonusMode || isTripleMode ? '236px' : '0px',
                                paddingLeft: `${SPACE.md}px`,
                                paddingRight: `${SPACE.md}px`,
                                paddingTop: `${SPACE.sm}px`,
                            }
                            : null),
                        // Flanks pin to this box absolutely so data cannot shift the result panel, which must stay exactly under the reel (see ResultFlanks.jsx).
                        position: 'relative',
                    }}>
                        {/* Idle: the spin CTA (card, rarity legend, keyboard hint) lives in the stage. */}
                        {/* The phone's idle copy is drawn over the shaft's bottom
                            fade instead — see the reel — so this stays desktop's. */}
                        {/* The Parlour answers in the apron like the bonus plaque and lane readout; rendered before and suppressing the idle state so they never stack. */}
                        {parlourOwnsReel && (
                            <RouletteTable
                                table={rouletteTable}
                                result={rouletteResult}
                                payout={roulettePayout}
                                stake={roulette.stake}
                                multipliers={roulette.multipliers}
                                betsCloseAt={roulette.betsCloseAt}
                                myBet={rouletteMyBet}
                                onBet={setRouletteMyBet}
                                t={parlourT}
                                isMobile={isMobile}
                            />
                        )}

                        {!isMobile && state === 'idle' && !tableOwnsReel && !arenaVisible && !firstBloodVisible && !forgeVisible && (
                            <EnhancedWheelIdleState
                                user={user}
                                allItems={allItems}
                                totalItemCount={totalItemCount}
                                recursionActive={recursionActive}
                                recursionSpinsRemaining={recursionSpinsRemaining}
                                kotwLuckySpins={kotwLuckySpins}
                                mysteryBox={boxGilded}
                                error={error}
                                onSpin={spin}
                                isMobile={isMobile}
                                isLoading={!atlasReady}
                                isSpinning={state === 'spinning'}
                            />
                        )}

                        {!isMobile && state === 'idle' && !tableOwnsReel && forgeVisible && (
                            <ForgeSpinControl onSpin={spin} user={user} isLoading={!atlasReady} error={error}/>
                        )}
                        {!isMobile && state === 'idle' && !tableOwnsReel && arenaVisible && (
                            <KotwSpinControl onSpin={spin} user={user} isLoading={!atlasReady} error={error}/>
                        )}

                        {!isMobile && state === 'idle' && !tableOwnsReel && firstBloodVisible && !arenaVisible && (
                            <FirstBloodSpinControl onSpin={spin} user={user} isLoading={!atlasReady} error={error}
                                luckySpins={kotwLuckySpins} recursionSpins={recursionActive ? recursionSpinsRemaining : 0}/>
                        )}

                        {/* Desktop only: on a phone the winning row carries the answer (ShaftResult). */}
                        {/* `!parlourOwnsReel`, as for ShaftResult: avoids one frame of the last pull under the table. */}
                        {!isMobile && !tableOwnsReel && state === 'result' && result && (
                            <>
                                <SpinResult
                                    arena={arenaVisible}
                                    firstBlood={firstBloodVisible}
                                    forge={forgeVisible}
                                    kotwPoints={arenaPoints}
                                    result={result}
                                    isNewItem={isNewItem}
                                    prestigePull={prestigePull}
                                    collection={collection}
                                    resultWasRecursionSpin={resultWasRecursionSpin}
                                    resultWasKotwLuckySpin={resultWasKotwLuckySpin}
                                    isMobile={isMobile}
                                />
                            </>
                        )}

                        {/* Takeover results answer on the same stage in the same register: bonus signboard, lucky payoff panel, per-lane readout. */}
                        {state === 'bonusResult' && selectedEvent && (
                            <BonusEventPlaque
                                event={selectedEvent}
                                isMobile={isMobile}
                            />
                        )}
                        {/* Recursion answers on both breakpoints as a theme of the band plus a signboard; the reel keeps the pulled item. Unlike item results it shows on the phone too: an announcement has no in-shaft answer. */}
                        {state === 'recursion' && (
                            <BonusEventPlaque
                                event={RECURSION_ANNOUNCEMENT}
                                isMobile={isMobile}
                            />
                        )}
                        {/* Desktop only: the phone's lucky spin lands in the shaft like an ordinary one. */}
                        {!isMobile && state === 'luckyResult' && luckyResult && (
                            <LuckyResultPanel
                                result={luckyResult}
                                isNewItem={isLuckyNew}
                                prestigePull={prestigePull}
                                collection={collection}
                                isMobile={isMobile}
                            />
                        )}
                        {(state === 'tripleResult' || state === 'tripleLuckyResult') && (
                            <LaneResultsRow
                                items={tripleResults}
                                isTripleLucky={state === 'tripleLuckyResult'}
                                isNew={tripleNewItems}
                                isMobile={isMobile}
                                // The readout lays itself out on the lanes' own
                                // grid, so it has to be told how many there are.
                                laneCount={state === 'tripleLuckyResult' ? 3 : 5}
                            />
                        )}

                        {hasFlanks && !isTripleMode && !compactEventNavigation && <StageFlanks
                            prestige={prestige}
                            showResultLine={state === 'result' && !!result}
                            isNewItem={isNewItem}
                            // `collection` is a map of texture -> count, not a list; reading it as an array gives an empty panel.
                            owned={result ? (collection?.[result.texture] ?? 0) : 0}
                            // Count entries actually held, not keys: zero-count keys made optimistic writes show as progress.
                            collectedCount={Object.values(collection || {}).filter(n => n > 0).length}
                            // `totalItemCount`, not `allItems.length`: allItems is the commons only (the meter read 1,557 / 1,531).
                            poolSize={totalItemCount}
                            tierInk={result ? getRarityInk(getItemRarity(result)) : COLORS.text}
                            userId={user?.id}
                            isMobile={isMobile}
                            onOpenCollection={onOpenCollection}
                            onOpenLeaderboard={onOpenLeaderboard}
                        />}

                        {/* Event standings remain part of the arena. */}
                        {hasFlanks && !isTripleMode && arenaVisible && (
                            <KotwArenaStandings onOpenLeaderboard={onOpenLeaderboard} />
                        )}
                    </div>

            {boxShown && (
                <MysteryBoxOpening
                    held={!boxReady}
                    claimedName={boxClaimName}
                    targetRef={reelBandRef}
                    shelfRef={boxShelfRef}
                    onGild={gildReelFromBox}
                    onDone={closeBoxScene}
                    onShelved={shelveBox}
                />
            )}
        </div>
    );
}

// This comparator is an allow-list: a prop missing from it is silently frozen at its first value (stageColumn was). Add new props here.
export const WheelSpinner = memo(WheelSpinnerComponent, (prevProps, nextProps) => {
    // Return true if props are equal (skip re-render)
    // Return false if props are different (re-render)
    return (
        prevProps.compactEventNavigation === nextProps.compactEventNavigation &&
        prevProps.prestige === nextProps.prestige &&
        prevProps.arenaVisible === nextProps.arenaVisible &&
        prevProps.firstBloodVisible === nextProps.firstBloodVisible &&
        prevProps.forgeVisible === nextProps.forgeVisible &&
        prevProps.stageColumn === nextProps.stageColumn &&
        prevProps.isMobile === nextProps.isMobile &&
        prevProps.hasFlanks === nextProps.hasFlanks &&
        prevProps.user?.id === nextProps.user?.id &&
        prevProps.allItems === nextProps.allItems &&
        prevProps.dynamicItems === nextProps.dynamicItems &&
        prevProps.onSpinComplete === nextProps.onSpinComplete &&
        prevProps.collection === nextProps.collection &&
        prevProps.kotwLuckySpins === nextProps.kotwLuckySpins &&
        prevProps.kotwLuckySpinsRef === nextProps.kotwLuckySpinsRef &&
        prevProps.onKotwLuckySpinsUpdate === nextProps.onKotwLuckySpinsUpdate
    );
});
