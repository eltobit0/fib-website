import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL, TEAM_MEMBERS, RARE_MEMBERS } from '../../config/constants';
import { COLORS, SPACE, Z } from './config/constants';
import { useAuth, AuthProvider } from '../../context/AuthContext';
import { ActivityProvider, useActivity } from '../../context/ActivityContext';
import { SoundProvider } from '../../context/SoundContext.jsx';
import { AnimationStyles } from './effects/AnimationStyles.jsx';
import { WheelSpinner } from './WheelSpinner';
import { UsernameModal } from './modals';
import { CollectionBook } from './features/CollectionBook.jsx';
import { SpinHistory } from './modals/SpinHistory.jsx';
import { EventHistoryBoard } from './modals/EventHistoryBoard.jsx';
import { AdminPanel } from './admin/AdminPanel.jsx';
import { Achievements } from './features/Achievements.jsx';
import { UserProfile } from './features/UserProfile.jsx';
import { LiveActivityToast } from './sidebars/LiveActivityToast.jsx';
import { PixiMythicCelebration as MythicCelebration } from './effects/PixiMythicCelebration.jsx';
import { RecursionOverlay } from './effects/RecursionOverlay.jsx';

// Stats counter a spin result increments, by tier (names from /api/collection). `event` counts as a trigger; commons advance only totalSpins.
const COUNTER_FOR_TIER = {
    insane: 'insaneCount',
    mythic: 'mythicCount',
    legendary: 'legendaryCount',
    relic: 'relicCount',
    exotic: 'exoticCount',
    rare: 'rareCount',
    event: 'eventTriggers',
};
import KingOfWheelBanner from './effects/KingOfWheelBanner.jsx';
import FirstBloodBanner from './effects/FirstBloodBanner.jsx';
import CommunityGoalBanner from './effects/CommunityGoalBanner.jsx';
import { CommunityForgeAtmosphere } from './effects/CommunityForge.jsx';
import MilestoneMeter from './effects/MilestoneMeter.jsx';
import { DailyBountyPlaque, BountyCelebration } from './effects/DailyBounty.jsx';
import EventSelectionWheel from './effects/EventSelectionWheel.jsx';
import { useEventSlotBusy } from './effects/useEventSlotBusy.js';
import { ActivityFeedSidebar } from './sidebars/ActivityFeedSidebar.jsx';
import { ActivityTicker } from './sidebars/ActivityTicker.jsx';
import { StageShortcuts } from './spin/StageShortcuts.jsx';
import { LeaderboardSidebar } from './sidebars/LeaderboardSidebar.jsx';
import { NotificationBell, NotificationCenter } from './modals/NotificationCenter.jsx';
// Release notes: per-release and authored in the repo; the bell is per-user text from the admin panel. See ChangelogModal.jsx.
import { ChangelogModal } from './modals/ChangelogModal.jsx';
import { useChangelog } from '../../utils/useChangelog.js';
import { LiveChat } from './features/LiveChat.jsx';
import { SoundButton, SoundSettingsPanel } from './modals/SoundSettings.jsx';
import { CanvasNocturneField } from './canvas/CanvasNocturneField.jsx';

import { TopbarIconButton, TopbarDivider, TopbarUserChip } from './topbar/TopbarControls.jsx';
import { prestigeStanding } from '../../utils/prestigeHelpers.js';
import { MobileTabBar } from './topbar/MobileTabBar.jsx';
import { MobileMoreSheet } from './topbar/MobileMoreSheet.jsx';
import { SaverOffer } from './topbar/SaverOffer.jsx';
// `prefersCalm` covers saver mode and the OS motion preference; utils/motion's alias is a re-export, so new callers import it here.
import { useSaverMode, toggleSaverMode, prefersCalm } from '../../config/power.js';
import { useWheelViewport } from './config/breakpoints.js';
// The arrival's beats, so the lucky-spin counter changes on the frame the board
// resolves this player's row rather than at t=0. See the payout handler below.
import { sortManifest, rowLandsAt, totalLandsAt } from './effects/arrivalTimeline.js';
// THE PARLOUR's reveal beat, for the same job one event along: holding a payout
// back until the animation has actually said what happened.
import { T_REVEAL } from './effects/rouletteTimeline.js';
import ParlourAtmosphere from './effects/ParlourAtmosphere.jsx';
import { KotwArenaAtmosphere } from './effects/KotwArena.jsx';
import { HighRollerAtmosphere } from './effects/HighRollerTable.jsx';
import { revealDuration } from './effects/highRollerTimeline.js';
import { FirstBloodRoom } from './effects/FirstBloodRoom.jsx';
import { serverNow } from '../../utils/serverClock.js';
import {
    User, Edit3, LogOut, Settings,
    BookOpen, ScrollText, Trophy, Check, Clock,
    Sparkles, Star, Diamond, Zap, Award, Activity, PartyPopper,
    ArrowLeft, Home, Bell, X, MoreHorizontal, Volume2, Battery, BatteryLow,
    Radio
} from 'lucide-react';

const CosmicLoader = () => (
    <div style={{
        minHeight: '100vh',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px'
    }}>
        <AnimationStyles />
        <CanvasNocturneField />
        <div style={{
            position: 'relative',
            width: '80px',
            height: '80px',
        }}>
            {/* Outer ring */}
            <div style={{
                position: 'absolute',
                inset: 0,
                border: `3px solid ${COLORS.border}`,
                borderTopColor: COLORS.gold,
                borderRadius: '50%',
                animation: 'none',
            }} />
            {/* Inner ring */}
            <div style={{
                position: 'absolute',
                inset: '10px',
                border: `3px solid ${COLORS.border}`,
                borderTopColor: COLORS.purple,
                borderRadius: '50%',
                animation: 'none',
            }} />
            {/* Core */}
            <div style={{
                position: 'absolute',
                inset: '20px',
                background: `radial-gradient(circle, ${COLORS.gold}44 0%, transparent 70%)`,
                borderRadius: '50%',
                animation: 'none',
            }} />
        </div>
        <div style={{
            color: COLORS.textMuted,
            fontSize: '14px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            animation: 'none',
        }}>
            Loading
        </div>
    </div>
);

// Back out of the wheel: the only control on the row that leaves the page, so it keeps a visible container.
function BackButton({ onBack }) {
    const [hovered, setHovered] = useState(false);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                if (onBack) {
                    onBack();
                } else {
                    window.location.href = '/';
                }
            }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${SPACE.sm}px`,
                height: '38px',
                padding: `0 ${SPACE.md}px`,
                fontSize: '14px',
                borderRadius: '10px',
                color: hovered ? COLORS.text : COLORS.textMuted,
                background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${hovered ? COLORS.border : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer',
                flexShrink: 0,
                transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
            }}
        >
            <ArrowLeft size={17} />
            <span>Back</span>
        </button>
    );
}

function UsernamePromptModal({ onSetUsername, onDismiss }) {
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{
                background: `linear-gradient(135deg, ${COLORS.bgLight} 0%, ${COLORS.bg} 100%)`,
                borderRadius: '20px',
                border: `1px solid ${COLORS.border}`,
                padding: '36px',
                maxWidth: '400px',
                width: '100%',
                textAlign: 'center',
                // Ease-out-quint: overshoot easing is reserved for the spin control (DESIGN.md §8); a dialog should decelerate and stop.
                animation: 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                boxShadow: `0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05) inset`
            }}>
                <div style={{
                    width: '72px',
                    height: '72px',
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${COLORS.gold}33 0%, ${COLORS.orange}22 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 24px',
                    boxShadow: `0 0 30px ${COLORS.gold}33`,
                    animation: 'none',
                }}>
                    <PartyPopper size={32} color={COLORS.gold} />
                </div>

                <h3 style={{
                    color: COLORS.text,
                    margin: '0 0 12px',
                    fontSize: '22px',
                    fontWeight: '700',
                    letterSpacing: '-0.5px',
                }}>
                    Welcome to the Wheel!
                </h3>

                <p style={{
                    color: COLORS.textMuted,
                    margin: '0 0 28px',
                    fontSize: '14px',
                    lineHeight: '1.6'
                }}>
                    Set a username to appear on the <strong style={{ color: COLORS.gold }}>leaderboard</strong> and
                    the <strong style={{ color: COLORS.purple }}>activity feed</strong> when you pull rare items!
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        onClick={onSetUsername}
                        style={{
                            padding: '16px 28px',
                            background: `linear-gradient(135deg, ${COLORS.accent} 0%, #4752C4 100%)`,
                            border: 'none',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 4px 16px rgba(88, 101, 242, 0.3)',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 8px 24px rgba(88, 101, 242, 0.4)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(88, 101, 242, 0.3)';
                        }}
                    >
                        <User size={18} />
                        Set Username
                    </button>

                    <button
                        onClick={onDismiss}
                        style={{
                            padding: '14px 24px',
                            background: 'transparent',
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: '12px',
                            color: COLORS.textMuted,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = COLORS.textMuted;
                            e.currentTarget.style.color = COLORS.text;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = COLORS.border;
                            e.currentTarget.style.color = COLORS.textMuted;
                        }}
                    >
                        Maybe Later
                    </button>
                </div>

                <p style={{
                    color: COLORS.textMuted,
                    margin: '20px 0 0',
                    fontSize: '12px',
                    opacity: 0.7,
                }}>
                    You can always set your username later in profile settings
                </p>
            </div>
        </div>
    );
}

function WheelOfFortunePage({ onBack }) {
    const { user, loading: authLoading, login, logout } = useAuth();
    const {
        kotwWinner, firstBloodWinner, communityGoalReward, communityGoalResult,
        arrival, arrivalCrate, roulette, roulettePayout, rouletteResult, globalEventStatus,
        highRoller, highRollerPayout, highRollerResult,
        refreshDailyBounty,
    } = useActivity();
    // The plaque and the meter both step aside for an event; their shared
    // wrapper does too, so its padding and gap do not linger in an empty slot.
    const eventSlotBusy = useEventSlotBusy();
    const [arenaVisible, setArenaVisible] = useState(false);
    const [firstBloodRoomVisible, setFirstBloodRoomVisible] = useState(false);
    const [forgeVisible, setForgeVisible] = useState(false);
    // Keep compact navigation through the event's reveal, then restore the panels.
    const compactEventNavigation = !!(forgeVisible || firstBloodRoomVisible || arenaVisible
        || arrival || roulette || rouletteResult || highRoller || highRollerResult
        || globalEventStatus?.active || globalEventStatus?.pending);
    const [allItems, setAllItems] = useState([]);
    const [dynamicItems, setDynamicItems] = useState([]);
    // The signed-in player's prestige state for the collection lens, re-read after every spin that lands in a run.
    const [prestige, setPrestige] = useState(null);
    const [collection, setCollection] = useState({});
    const [collectionDetails, setCollectionDetails] = useState({});
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState({ totalSpins: 0, insaneCount: 0, mythicCount: 0, legendaryCount: 0, relicCount: 0, exoticCount: 0, rareCount: 0, eventTriggers: 0, totalDuplicates: 0 });
    const [kotwLuckySpins, setKotwLuckySpins] = useState(0); // KOTW winner lucky spins
    const kotwLuckySpinsRef = useRef(0); // Ref for immediate access (bypasses React batching)
    const [loading, setLoading] = useState(true);

    const [showUsernameModal, setShowUsernameModal] = useState(false);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [showCollection, setShowCollection] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showEventLog, setShowEventLog] = useState(false);
    const [showAdmin, setShowAdmin] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    // The bottom bar's link to the chat: a counter it bumps to open the panel,
    // and the chat's unread count mirrored back out for the tab's badge.
    const [chatOpenSignal, setChatOpenSignal] = useState(0);
    const [chatUnread, setChatUnread] = useState(0);
    const [showMore, setShowMore] = useState(false);
    const [showAchievements, setShowAchievements] = useState(false);
    const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);

    // Release notes: shown once per release; `enabled` holds the popup back while the username modal owns the screen (it waits, not skips). Entries and seen-version storage live in config/changelog.js.
    const {
        isOpen: showChangelog,
        hasUnseen: changelogUnseen,
        openChangelog,
        closeChangelog,
    } = useChangelog({ enabled: !showUsernameModal && !showUsernamePrompt });

    // Notification state
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSoundSettings, setShowSoundSettings] = useState(false);
    // Read here, not in the sheet, which stays a stateless list of descriptors.
    const saverMode = useSaverMode();
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

    // Mobile activity feed modal state
    const [showMobileActivity, setShowMobileActivity] = useState(false);
    // The surface's single viewport question; see config/breakpoints.js.
    const { isPhone: isMobile, hasFlanks } = useWheelViewport();

    // Detect when current user wins KOTW and update lucky spins immediately
    // Use a ref to track if we've already processed this winner event
    const processedKotwWinnerRef = useRef(null);
    useEffect(() => {
        if (kotwWinner?.winner && user?.id && kotwWinner.winner.userId === user.id) {
            // Only process if this is a new winner event (different eventId or timestamp)
            const winnerKey = `${kotwWinner.eventId}-${kotwWinner.winner.userId}`;
            if (processedKotwWinnerRef.current !== winnerKey) {
                processedKotwWinnerRef.current = winnerKey;
                const spinsAwarded = kotwWinner.winner.luckySpinsAwarded || 0;
                const newTotal = kotwWinner.winner.luckySpinsTotal;
                console.log('[WheelPage] Current user won KOTW! Awarding', spinsAwarded, 'lucky spins');
                // Only apply the balance the server reports: deriving it double-counts when the in-flight spin's response already carried it.
                if (typeof newTotal === 'number') {
                    // Update ref IMMEDIATELY (bypasses React batching)
                    kotwLuckySpinsRef.current = newTotal;
                    // Also update state for re-render
                    setKotwLuckySpins(newTotal);
                }
            }
        }
    }, [kotwWinner, user?.id]);

    // Detect when current user wins First Blood and update lucky spins immediately
    // First Blood shares the same lucky spins pool as KOTW
    const processedFirstBloodWinnerRef = useRef(null);
    useEffect(() => {
        if (firstBloodWinner?.winner && user?.id && firstBloodWinner.winner.userId === user.id) {
            // Only process if this is a new winner event
            const winnerKey = `${firstBloodWinner.eventId}-${firstBloodWinner.winner.userId}`;
            if (processedFirstBloodWinnerRef.current !== winnerKey) {
                processedFirstBloodWinnerRef.current = winnerKey;
                const spinsAwarded = firstBloodWinner.winner.luckySpinsAwarded || 0;
                const newTotal = firstBloodWinner.winner.luckySpinsTotal;
                console.log('[WheelPage] Current user won First Blood! Awarding', spinsAwarded, 'lucky spins');
                // Take the server's number: the reward is granted inside the winning spin's request, so its response already reported the post-award balance.
                if (typeof newTotal === 'number') {
                    kotwLuckySpinsRef.current = newTotal;
                    setKotwLuckySpins(newTotal);
                }
            }
        }
    }, [firstBloodWinner, user?.id]);

    // Community Goal pays every participant. Keyed on communityGoalResult, not the reward, so the counter changes when the summary banner explains it and not mid-spin; the server sends the reward first.
    const processedCommunityGoalRewardRef = useRef(null);
    useEffect(() => {
        if (!communityGoalResult || !communityGoalReward || !user?.id) return;

        const newTotal = communityGoalReward.luckySpinsTotal;
        if (typeof newTotal !== 'number') return;

        // The reward is per-user and carries no event id, so the result's identity is what
        // distinguishes one payout from the next.
        const rewardKey = `${communityGoalResult.progress}-${communityGoalResult.participantCount}-${newTotal}`;
        if (processedCommunityGoalRewardRef.current === rewardKey) return;
        processedCommunityGoalRewardRef.current = rewardKey;

        console.log('[WheelPage] Community Goal paid out', communityGoalReward.luckySpinsAwarded, 'lucky spins');
        // The server's figure verbatim, for the reason given on the two handlers above.
        kotwLuckySpinsRef.current = newTotal;
        setKotwLuckySpins(newTotal);
    }, [communityGoalResult, communityGoalReward, user?.id]);

    // The Arrival's payout is keyed on `arrival` but held until the board resolves this player's row (`rowLandsAt`, same `sortManifest` order as the theatre; `totalLandsAt` as fallback; immediate under reduced motion), or the badge ticks before a crate is off the train.
    // The timer is cleared only on unmount: cancelling in this effect's cleanup would drop the payout, since `processedArrivalRef` already claimed the key.
    const processedArrivalRef = useRef(null);
    const arrivalPayoutTimeoutRef = useRef(null);
    useEffect(() => {
        if (!arrival || !arrivalCrate || !user?.id) return;

        const newTotal = arrivalCrate.luckySpinsTotal;
        if (typeof newTotal !== 'number') return;

        const key = `${arrival.serverTime}-${newTotal}`;
        if (processedArrivalRef.current === key) return;
        processedArrivalRef.current = key;

        const pay = () => {
            console.log('[WheelPage] Arrival paid out', arrivalCrate.luckySpinsAwarded, 'lucky spins');
            kotwLuckySpinsRef.current = newTotal;
            setKotwLuckySpins(newTotal);
            arrivalPayoutTimeoutRef.current = null;
        };

        const rows = arrival.manifest ? sortManifest(arrival.manifest) : [];
        const n = rows.length;
        const mine = rows.findIndex(row => row.userId === user.id);
        const landsAt = (prefersCalm() || n === 0)
            ? 0
            : (mine >= 0 ? rowLandsAt(mine, n) : totalLandsAt(n));

        if (landsAt <= 0) {
            pay();
            return;
        }

        clearTimeout(arrivalPayoutTimeoutRef.current);
        arrivalPayoutTimeoutRef.current = setTimeout(pay, landsAt * 1000);
    }, [arrival, arrivalCrate, user?.id]);

    useEffect(() => () => clearTimeout(arrivalPayoutTimeoutRef.current), []);

    // The Parlour's payout, held until the ball stops: it is broadcast seven seconds before the ball settles, and the balance would give the result away (same hazard as settleKotwSpin).
    const processedParlourRef = useRef(null);
    const parlourPayoutTimeoutRef = useRef(null);
    useEffect(() => {
        if (!roulette || !roulettePayout || !user?.id) return;

        const newTotal = roulettePayout.luckySpinsTotal;
        // A loss and a fold-with-nothing carry no balance: there is nothing to
        // apply, and the board still says what happened.
        if (typeof newTotal !== 'number') return;

        const key = `${roulette.openedAt}-${newTotal}`;
        if (processedParlourRef.current === key) return;
        processedParlourRef.current = key;

        const pay = () => {
            console.log('[WheelPage] Parlour paid out', roulettePayout.luckySpinsAwarded, 'lucky spins');
            kotwLuckySpinsRef.current = newTotal;
            setKotwLuckySpins(newTotal);
            parlourPayoutTimeoutRef.current = null;
        };

        // The theatre's clock is the server's, so the wait is measured the same
        // way it is: from `openedAt`, not from when this effect happened to run.
        const dueAt = roulette.openedAt + T_REVEAL * 1000;
        const waitMs = prefersCalm() ? 0 : Math.max(0, dueAt - serverNow());

        if (waitMs <= 0) {
            pay();
            return;
        }

        clearTimeout(parlourPayoutTimeoutRef.current);
        parlourPayoutTimeoutRef.current = setTimeout(pay, waitMs);
    }, [roulette, roulettePayout, user?.id]);

    useEffect(() => () => clearTimeout(parlourPayoutTimeoutRef.current), []);

    // The bounty's box count is per player and ActivityContext reads it before sign-in, so re-read whenever who is signed in changes.
    useEffect(() => {
        refreshDailyBounty();
    }, [user?.id, refreshDailyBounty]);

    // High Roller's payout, held until the reveal ends (the balance is the result), timed from highRollerTimeline.js like the table. It waits for both the private payout and the public result, which carries the settle time.
    const processedHighRollerRef = useRef(null);
    const highRollerPayoutTimeoutRef = useRef(null);
    useEffect(() => {
        if (!highRoller || !highRollerPayout || !highRollerResult || !user?.id) return;
        const newTotal = highRollerPayout.luckySpinsTotal;
        // A loss carries no balance: there is nothing to apply.
        if (typeof newTotal !== 'number') return;
        const key = `${highRoller.openedAt}-${newTotal}`;
        if (processedHighRollerRef.current === key) return;
        processedHighRollerRef.current = key;

        const pay = () => {
            console.log('[WheelPage] High Roller paid out', highRollerPayout.luckySpinsAwarded, 'lucky spins');
            kotwLuckySpinsRef.current = newTotal;
            setKotwLuckySpins(newTotal);
            highRollerPayoutTimeoutRef.current = null;
        };

        const settledAt = highRollerResult.settledAt;
        const dueAt = settledAt ? settledAt + revealDuration(highRollerResult.dealer?.cards?.length) : 0;
        const waitMs = prefersCalm() ? 0 : Math.max(0, dueAt - serverNow());
        if (waitMs <= 0) {
            pay();
            return;
        }
        clearTimeout(highRollerPayoutTimeoutRef.current);
        highRollerPayoutTimeoutRef.current = setTimeout(pay, waitMs);
    }, [highRoller, highRollerPayout, highRollerResult, user?.id]);

    // Only on unmount. The table tearing down must NOT cancel a pending payout -
    // it is the player's real balance, and the teardown lands after the reveal.
    useEffect(() => () => clearTimeout(highRollerPayoutTimeoutRef.current), []);


    // Fetch items and user data
    async function fetchItems() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/items`);
            const data = await res.json();
            setAllItems(data.items || []);
            setDynamicItems(data.dynamicItems || []);
        } catch (err) {
            console.error('Failed to fetch items:', err);
        }
    }

    async function fetchCollection() {
        if (!user) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/collection`, { credentials: 'include' });
            const data = await res.json();
            setCollection(data.collection || {});
            setCollectionDetails(data.collectionDetails || {});
            setStats({
                totalSpins: data.totalSpins || 0,
                insaneCount: data.insaneCount || 0,
                mythicCount: data.mythicCount || 0,
                legendaryCount: data.legendaryCount || 0,
                // Every tier needs a count here and in the initial state (relicCount was missing, so the refetch dropped the key).
                relicCount: data.relicCount || 0,
                exoticCount: data.exoticCount || 0,
                rareCount: data.rareCount || 0,
                eventTriggers: data.eventTriggers || 0,
                totalDuplicates: data.totalDuplicates || 0
            });
            // Set KOTW lucky spins from collection response
            const serverKotwSpins = data.kotwLuckySpins || 0;
            kotwLuckySpinsRef.current = serverKotwSpins;
            setKotwLuckySpins(serverKotwSpins);
        } catch (err) {
            console.error('Failed to fetch collection:', err);
        }
    }

    async function fetchHistory() {
        if (!user) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/history?limit=50`, { credentials: 'include' });
            const data = await res.json();
            setHistory(data.history || []);
        } catch (err) {
            console.error('Failed to fetch history:', err);
        }
    }

    async function fetchUnreadCount() {
        if (!user) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/notifications/unread-count`, { credentials: 'include' });
            const data = await res.json();
            setUnreadNotificationCount(data.count || 0);
        } catch (err) {
            console.error('Failed to fetch unread count:', err);
        }
    }

    useEffect(() => {
        fetchItems().then(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (user) {
            fetchCollection();
            fetchHistory();
            fetchUnreadCount();
        }
    }, [user]);

    // Handler to update KOTW lucky spins (updates both ref and state)
    const handleKotwLuckySpinsUpdate = useCallback((newCount) => {
        kotwLuckySpinsRef.current = newCount;
        setKotwLuckySpins(newCount);
    }, []);

    const refreshPrestige = useCallback(async () => {
        if (!user) return;
        try {
            const res = await fetch(`${API_BASE_URL}/api/prestige`, { credentials: 'include' });
            if (res.ok) setPrestige(await res.json());
        } catch {
            // The panel simply keeps its main-collection lens without this.
        }
    }, [user]);

    useEffect(() => {
        let cancelled = false;
        if (!user) return undefined;
        (async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/prestige`, { credentials: 'include' });
                if (res.ok && !cancelled) setPrestige(await res.json());
            } catch {
                // Non-fatal: no lens, same panel as before.
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    const handleSpinComplete = useCallback((spinResult) => {
        if (!spinResult?.result) return;
        const { result } = spinResult;

        // A recursion trigger is not a collected item: the server returns early for `isRecursion` without upsertCollection, so do not optimistically add the texture. `isEvent` never reaches here.
        if (spinResult.isRecursion || spinResult.isEvent) return;

        // Update collection
        setCollection(prev => ({
            ...prev,
            [result.texture]: (prev[result.texture] || 0) + 1
        }));

        // One counter per tier via COUNTER_FOR_TIER; anything absent (common) only advances totalSpins.
        const counterField = COUNTER_FOR_TIER[result.type];
        setStats(prev => ({
            ...prev,
            totalSpins: prev.totalSpins + 1,
            ...(counterField ? { [counterField]: (prev[counterField] || 0) + 1 } : null),
            // Count duplicates from `spinResult.isNew`, the server's verdict, not the local map; under prestige every pull is a main-collection duplicate.
            ...(spinResult.isNew ? null : { totalDuplicates: (prev.totalDuplicates || 0) + 1 }),
        }));

        // A pull that landed in a run moves its count, and the panel is showing it.
        if (spinResult.prestige) refreshPrestige();

        // Update history
        setHistory(prev => [{
            item_texture: result.texture,
            item_name: result.name,
            item_type: result.type,
            spun_at: new Date().toISOString()
        }, ...prev.slice(0, 99)]);

        // Prompt user to set a username if they haven't
        if (user && !user.customUsername) {
            const dismissed = localStorage.getItem('fib_username_prompt_dismissed');
            if (!dismissed) {
                setTimeout(() => {
                    setShowUsernamePrompt(true);
                }, 1500);
            }
        }
    }, [user, refreshPrestige]);

    // Helper to get Discord avatar URL
    function getDiscordAvatarUrl() {
        if (!user) return 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (user.discordAvatar && user.discordId) {
            const format = user.discordAvatar.startsWith('a_') ? 'gif' : 'png';
            return `https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.${format}?size=64`;
        }
        if (user.discordId) {
            try {
                const defaultIndex = Number(BigInt(user.discordId) >> 22n) % 6;
                return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
            } catch {
                return 'https://cdn.discordapp.com/embed/avatars/0.png';
            }
        }
        return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    if (authLoading || loading) {
        return <CosmicLoader />;
    }

    return (
        <div style={{
            // HUD shell: a grid, so the reel is a full-width row by construction. `100dvh`, not `100vh` (mobile address bar), and `minmax(0, 1fr)` on the centre column so a wide result cannot push the grid past the viewport.
            // Rows: topbar, ticker, spacer, reel, stage, nav; the two flexible rows around the reel centre it (see the 0.34fr note). One column: the sidebars have left this axis.
            height: '100dvh',
            display: 'grid',
            // 0.34fr above the band, 1fr below: tuned so the band's midpoint lands on the viewport's midpoint; re-measure if the topbar or ticker height changes. The phone drops the gap.
            // The row COUNT must match what WheelSpinner's wrapper, the ticker and banners place themselves in, or implicit rows land the meter under the spin card. Stage floor `minmax(350px, 1fr)` is the measured idle block.
            gridTemplateRows: isMobile
                ? 'auto auto auto minmax(0, 1fr)'
                : highRoller
                    ? 'auto auto 0px minmax(0, 1fr) 0px'
                : roulette
                    ? 'auto auto 0.22fr auto minmax(0, 1fr)'
                    : forgeVisible
                        // A small extra drop aligns the result with the forge's anvil.
                        ? 'auto auto minmax(152px, 0.58fr) auto minmax(300px, 1fr)'
                    : firstBloodRoomVisible
                        // A modest shift, with the result taking priority over header space.
                        ? 'auto auto minmax(130px, 0.5fr) auto minmax(300px, 1fr)'
                    : arenaVisible
                        ? 'auto auto auto auto minmax(300px, 1fr)'
                    : 'auto auto 0.34fr auto minmax(350px, 1fr)',
            gridTemplateColumns: 'minmax(0, 1fr)',
            // Room for the fixed bottom bar and the home indicator; the bar reserves no layout space.
            ...(isMobile
                ? { paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px))' }
                : null),
            background: COLORS.bg,
            color: COLORS.text,
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            // The event changes the furniture's material as well as the room.
            // Unset variables restore each surface's usual blue-hour palette.
            '--wheel-panel-top': highRoller ? '#302039' : roulette ? '#310a12' : forgeVisible ? '#30251c' : firstBloodRoomVisible ? '#301a13' : arenaVisible ? '#102133' : undefined,
            '--wheel-panel-bottom': highRoller ? '#160f1d' : roulette ? '#19050b' : forgeVisible ? '#07121c' : firstBloodRoomVisible ? '#100a08' : arenaVisible ? '#050c15' : undefined,
            '--wheel-control-top': highRoller ? '#392940' : roulette ? '#3b131b' : undefined,
            '--wheel-control-bottom': highRoller ? '#211728' : roulette ? '#230a11' : undefined,
            '--wheel-surface-light': highRoller ? '209,178,116' : roulette ? '225,126,111' : firstBloodRoomVisible ? '216,139,90' : arenaVisible ? '214,174,100' : undefined,
            position: 'relative',
            overflow: isMobile ? 'hidden' : 'auto',
            boxSizing: 'border-box',
        }}>
            <AnimationStyles />
            <CanvasNocturneField />
            <KotwArenaAtmosphere visible={arenaVisible} />
            <FirstBloodRoom visible={firstBloodRoomVisible} />
            {/* Keyed on the table so a second table gets a fresh mount and a fresh take. */}
            {highRoller && <HighRollerAtmosphere key={highRoller.openedAt || 'high-roller'} openedAt={highRoller.openedAt} />}
            <CommunityForgeAtmosphere visible={forgeVisible} />

            {/* The Parlour's light, over the whole surface: mounted at the page because it is the ROOM, not a layer on the reel. Under everything else and takes no pointer events (ParlourAtmosphere.jsx, DESIGN.md §9b). */}
            {/* The pocket colour reaches the room only so the deck can shower in it after the band lands; it is not a second readout. */}
            {/* Keyed on the table: the room's rAF loops park after T_END and restart only on a fresh mount, so without the key a second table opens into a frozen room. */}
            {roulette && (
                <ParlourAtmosphere
                    key={roulette.openedAt || 'parlour'}
                    openedAt={roulette.openedAt}
                    pocketColour={rouletteResult?.pocket?.colour ?? null}
                />
            )}

            {/* Topbar, row 1: where you are, who you are, how to leave, in one 56px row. Its soft bottom rule is the one frame it keeps; the Nocturne's borderless world starts below it. */}
            <header style={{
                gridRow: 1,
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                borderBottom: `1px solid ${COLORS.border}44`,
                // No `space-between`: the wordmark's `margin-right: auto` splits the row, and both would distribute the leftover twice.
                gap: `${SPACE.md}px`,
                padding: `${SPACE.xs}px ${SPACE.lg}px`,
                minHeight: '56px',
                boxSizing: 'border-box',
                position: 'relative',
                zIndex: Z.content,
            }}>
                {/* Leave: the one control not about the wheel, so it keeps a visible container; no hover slide. */}
                <BackButton onBack={onBack} />

                {/* Wordmark */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${SPACE.sm}px`,
                    minWidth: 0,
                    marginRight: 'auto',
                }}>
                    <Sparkles size={16} style={{ color: COLORS.gold, opacity: 0.8, flexShrink: 0 }} />
                    <h1 style={{
                        margin: 0,
                        fontSize: '17px',
                        fontWeight: '700',
                        color: COLORS.gold,
                        letterSpacing: '0.01em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                    }}>
                        Wheel of Fortune
                    </h1>
                </div>

                {/* Right-hand cluster, grouped by question with hairline dividers: where can I go | where do I stand | who am I. One button vocabulary (`TopbarIconButton`). */}
                {!user ? (
                    // Signed out, "What's new" still needs an entry point: the cluster below is signed-in only and the popup is shown to everyone.
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <TopbarIconButton
                        onClick={openChangelog}
                        icon={<Sparkles size={19} />}
                        label="What's new"
                        align="end"
                        badge={changelogUnseen ? (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    top: '9px',
                                    right: '9px',
                                    width: '7px',
                                    height: '7px',
                                    borderRadius: '50%',
                                    background: COLORS.gold,
                                    boxShadow: `0 0 6px ${COLORS.gold}`,
                                }}
                            />
                        ) : null}
                    />
                    <button onClick={login} style={{
                        padding: '10px 20px',
                        background: 'linear-gradient(135deg, #5865F2, #4752C4)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: `${SPACE.sm}px`,
                        flexShrink: 0,
                        transition: 'filter 0.2s ease',
                    }}
                        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                    >
                        <svg width="18" height="18" viewBox="0 0 71 55" fill="currentColor">
                            <path d="M60.1 4.9C55.6 2.8 50.7 1.3 45.7.4c-.1 0-.2 0-.2.1-.6 1.1-1.3 2.6-1.8 3.7-5.5-.8-10.9-.8-16.3 0-.5-1.2-1.2-2.6-1.8-3.7 0-.1-.1-.1-.2-.1-5 .9-9.9 2.4-14.4 4.5 0 0 0 0-.1.1C1.6 18.7-.9 32.1.3 45.4c0 .1 0 .1.1.2 6.1 4.5 12 7.2 17.7 9 .1 0 .2 0 .3-.1 1.4-1.9 2.6-3.8 3.6-5.9.1-.1 0-.3-.1-.3-2-.8-3.8-1.7-5.6-2.7-.1-.1-.1-.3 0-.4.4-.3.8-.6 1.1-.9.1-.1.2-.1.2 0 11.6 5.3 24.2 5.3 35.7 0 .1 0 .2 0 .2.1.4.3.7.6 1.1.9.1.1.1.3 0 .4-1.8 1-3.6 1.9-5.6 2.7-.1 0-.2.2-.1.3 1.1 2.1 2.3 4 3.6 5.9.1.1.2.1.3.1 5.8-1.8 11.7-4.5 17.8-9 0 0 .1-.1.1-.2 1.5-15.3-2.5-28.6-10.5-40.4 0 0 0-.1-.1-.1zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.4 3.2 6.4 7.2s-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2c3.6 0 6.5 3.2 6.4 7.2s-2.8 7.2-6.4 7.2z"/>
                        </svg>
                        Login with Discord
                    </button>
                    </div>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        // 2px inside a group, a divider between groups.
                        gap: '2px',
                        flexShrink: 0,
                        minWidth: 0,
                    }}>
                        {/* Where can I go: Collection and the leaderboard live in the stage flanks on desktop, so they stay here only on mobile, where the flanks do not render. */}
                        {/* No Collection here on a phone either: the bottom bar carries it; the desktop flanks own it above 1200px. */}
                        {!isMobile && (
                            <TopbarIconButton
                                onClick={() => setShowHistory(true)}
                                icon={<ScrollText size={19} />}
                                label="History"
                            />
                        )}
                        {/* No Trophy button: the leaderboard pill opens the same modal and says more. */}
                        {!isMobile && (
                            <TopbarIconButton
                                onClick={() => setShowAchievements(true)}
                                icon={<Award size={19} />}
                                label="Achievements"
                            />
                        )}
                        {/* THE EVENT LOG: its own destination, not a register on the odds board (a document of facts versus a log of news). Nothing else opens it; the odds board, ticker and bell cannot say who won the last King of the Wheel. */}
                        {!isMobile && (
                            <TopbarIconButton
                                onClick={() => setShowEventLog(true)}
                                icon={<Radio size={19} />}
                                label="Event log"
                            />
                        )}
                        {/* WHAT'S NEW: nothing else opens it; the bell carries text only and needs an account, while this draws the rarity ladder. The dot is not a count on purpose: only one release is unread at a time. */}
                        {!isMobile && (
                            <TopbarIconButton
                                onClick={openChangelog}
                                icon={<Sparkles size={19} />}
                                label="What's new"
                                badge={changelogUnseen ? (
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute',
                                            top: '9px',
                                            right: '9px',
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            background: COLORS.gold,
                                            boxShadow: `0 0 6px ${COLORS.gold}`,
                                        }}
                                    />
                                ) : null}
                            />
                        )}
                        {/* History, Achievements and Live activity are in the phone's overflow sheet (MobileMoreSheet.jsx). */}

                        {/* Where do I stand: mobile only; the right-hand stage flank carries the top five and your rank on desktop. */}
                        {/* No leaderboard pill on the phone: the bottom bar's Board tab is the way in. */}

                        {!isMobile && <TopbarDivider />}

                        {/* Who am I: the container is only around the identity; the actions beside it are plain topbar buttons. */}
                        {/* The identity chip is desktop-only: the bottom bar's "You" tab is the phone's profile entry. */}
                        {!isMobile && (
                            <>
                                <TopbarUserChip
                                    avatarUrl={getDiscordAvatarUrl()}
                                    name={user.customUsername || 'Player'}
                                    approved={!!user.usernameApproved}
                                    pending={!!user.customUsername && !user.usernameApproved}
                                    standing={prestigeStanding(prestige)}
                                    onClick={() => setShowProfile(true)}
                                />
                                <TopbarIconButton
                                    onClick={() => setShowUsernameModal(true)}
                                    icon={<Edit3 size={17} />}
                                    label="Edit name"
                                />
                                <SoundButton onClick={() => setShowSoundSettings(true)} />
                            </>
                        )}
                        <TopbarIconButton
                            onClick={() => setShowNotifications(true)}
                            icon={<Bell size={17} />}
                            label="Notifications"
                            tone={unreadNotificationCount > 0 ? 'attention' : 'default'}
                            badge={unreadNotificationCount > 0 ? (
                                <span style={{
                                    position: 'absolute',
                                    top: '3px',
                                    right: '3px',
                                    background: COLORS.red,
                                    color: '#fff',
                                    fontSize: '10px',
                                    fontWeight: '700',
                                    lineHeight: 1,
                                    borderRadius: '999px',
                                    minWidth: '15px',
                                    height: '15px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '0 4px',
                                    boxSizing: 'border-box',
                                }}>
                                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                                </span>
                            ) : null}
                        />
                        {user.isAdmin && !isMobile && (
                            <TopbarIconButton
                                onClick={() => setShowAdmin(true)}
                                icon={<Settings size={17} />}
                                label="Admin panel"
                            />
                        )}
                        {!isMobile && (
                            <TopbarIconButton
                                onClick={logout}
                                icon={<LogOut size={17} />}
                                label="Log out"
                                tone="danger"
                                align="end"
                            />
                        )}

                        {/* The phone's one overflow control: everything the bar cannot hold is one tap behind it. */}
                        {isMobile && (
                            <TopbarIconButton
                                onClick={() => setShowMore(true)}
                                icon={<MoreHorizontal size={19} />}
                                label="More"
                                align="end"
                            />
                        )}
                    </div>
                )}

            </header>
            {/* End topbar */}

            {/* Rows 2 and 3 come from WheelSpinner, whose root is `display: contents` on desktop so its children become grid children; spin state and the rAF refs stay inside it. */}
            <WheelSpinner
                arenaVisible={arenaVisible}
                firstBloodVisible={firstBloodRoomVisible}
                forgeVisible={forgeVisible}
                compactEventNavigation={compactEventNavigation}
                prestige={prestige}
                onOpenCollection={() => setShowCollection(true)}
                allItems={allItems}
                collection={collection}
                onSpinComplete={handleSpinComplete}
                user={user}
                dynamicItems={dynamicItems}
                wheelSize={150}
                kotwLuckySpins={kotwLuckySpins}
                kotwLuckySpinsRef={kotwLuckySpinsRef}
                onKotwLuckySpinsUpdate={handleKotwLuckySpinsUpdate}
                // Both viewport answers are passed down and read; they once disagreed by 800px.
                isMobile={isMobile}
                hasFlanks={hasFlanks}
                stageColumn={1}
                onOpenLeaderboard={() => setShowLeaderboard(true)}
            />

            {!isMobile && compactEventNavigation && <StageShortcuts
                onOpenCollection={() => setShowCollection(true)}
                onOpenLeaderboard={() => setShowLeaderboard(true)}
            />}

            {/* Live activity, row 2: a horizontal ticker, desktop only. On a phone the feed is the bottom bar's Live destination. Row 2 is an `auto` track, so it collapses to zero when empty (ActivityTicker notes why there are two presentations). */}
            {user && !isMobile && (
                <div style={{
                    gridRow: 2,
                    gridColumn: 1,
                    borderBottom: `1px solid ${COLORS.border}33`,
                    minWidth: 0,
                    zIndex: Z.content,
                }}>
                    <ActivityTicker onOpenFull={() => setShowMobileActivity(true)} />
                </div>
            )}



            {/* `isMobile` is the only place the 1400px breakpoint is written: a second mechanism (a media query) drifted from it and left widths with no sidebar and no button. */}

            {/* Modals */}
            {showUsernameModal && (
                <UsernameModal
                    onClose={() => setShowUsernameModal(false)}
                    currentUsername={user?.customUsername}
                />
            )}

            {/* The full leaderboard is LeaderboardSidebar in modal mode: one implementation, so it carries King of the Wheel too; its global totals strip moved across. */}
            {showLeaderboard && (
                <div
                    onClick={(e) => { if (e.target === e.currentTarget) setShowLeaderboard(false); }}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        // The scrim ladder's middle step, matching the collection board.
                        background: 'rgba(0,0,0,0.8)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Full-bleed on a phone, inset on desktop, like the collection board.
                        padding: isMobile ? 0 : `${SPACE.lg}px`,
                        zIndex: 1100,
                        animation: 'fadeIn 0.25s ease-out',
                    }}
                >
                    <LeaderboardSidebar
                        onClose={() => setShowLeaderboard(false)}
                    />
                </div>
            )}

            {showCollection && (
                <CollectionBook
                    onClose={() => setShowCollection(false)}
                    collection={collection}
                    collectionDetails={collectionDetails}
                    stats={stats}
                    allItems={allItems}
                    dynamicItems={dynamicItems}
                />
            )}

            {showEventLog && (
                <EventHistoryBoard onClose={() => setShowEventLog(false)} />
            )}

            {showHistory && (
                <SpinHistory
                    onClose={() => setShowHistory(false)}
                    history={history}
                />
            )}

            {showAdmin && (
                <AdminPanel
                    onClose={() => setShowAdmin(false)}
                    allItems={allItems}
                />
            )}

            {showProfile && user && (
                <UserProfile
                    userId={user.id}
                    onClose={() => setShowProfile(false)}
                    isOwnProfile={true}
                    onEditUsername={() => {
                        setShowProfile(false);
                        setShowUsernameModal(true);
                    }}
                />
            )}

            {showAchievements && (
                <Achievements onClose={() => setShowAchievements(false)} />
            )}

            {showUsernamePrompt && (
                <UsernamePromptModal
                    onSetUsername={() => {
                        setShowUsernamePrompt(false);
                        setShowUsernameModal(true);
                    }}
                    onDismiss={() => {
                        setShowUsernamePrompt(false);
                        localStorage.setItem('fib_username_prompt_dismissed', 'true');
                    }}
                />
            )}

            {/* Live Activity Toast */}
            <LiveActivityToast />

            {/* Insane Item Celebration */}
            <MythicCelebration currentUserId={user?.id} />

            {/* The daily bounty's claim. ActivityContext decides when it shows
                (after the winning reel lands); this only draws it. */}
            <BountyCelebration currentUserId={user?.id} />

            {/* Live events, row 3: the banners sit in the gap above the reel (they were `position: fixed` and covered the topbar). They stay mounted while idle: each owns its event's countdown, soundtrack, settle handling and global event status, and renders null itself. */}
            <div style={{
                gridRow: 3,
                gridColumn: 1,
                // Bottom-aligned so the banner sits flush on the reel, which takes the event's colour.
                alignSelf: !isMobile && (firstBloodRoomVisible || forgeVisible) ? 'stretch' : 'end',
                justifySelf: 'stretch',
                minWidth: 0,
                zIndex: Z.content,
                display: 'flex',
                flexDirection: 'column',
                gap: `${SPACE.sm}px`,
                ...(!isMobile && (firstBloodRoomVisible || forgeVisible) ? {
                    minHeight: 0,
                    justifyContent: 'flex-end',
                    containerType: 'size',
                    containerName: forgeVisible ? 'forge-banner-slot' : 'fb-banner-slot',
                } : null),
            }}>
                {/* Recursion uses the same slot, rules and flush-on-the-reel alignment as the other four. */}
                <RecursionOverlay inline />
                {/* Gold Rush is retired: its `is_gold_rush` flags on collections, history and the feed remain as data and are still read by the collection plaque and feed. */}
                {/* The arrival is not in this row: it plays in one frame growing from the reel band (effects/ArrivalTheatre.jsx, mounted in WheelSpinner), so this slot stays empty. ActivityContext holds it until the wheel lands. */}
                <KingOfWheelBanner arena onArenaVisibility={setArenaVisible} isMobile={isMobile} isAdmin={user?.isAdmin} currentUserId={user?.id} inline />
                <FirstBloodBanner isMobile={isMobile} isAdmin={user?.isAdmin} inline room onRoomVisibility={setFirstBloodRoomVisible} />
                <CommunityGoalBanner forge onForgeVisibility={setForgeVisible} isMobile={isMobile} isAdmin={user?.isAdmin} inline />
                {/* The roll, in the same slot as the meter and banners (see EventSelectionWheel.jsx). */}
                <EventSelectionWheel isMobile={isMobile} />

                {/* Shown when no event or roll is firing; both plinths yield via useEventSlotBusy. The meter carries the bottom padding, so the bounty row takes it on the phone. */}
                {!eventSlotBusy && (
                    <div style={{
                        display: 'flex',
                        flexDirection: isMobile ? 'column' : 'row',
                        justifyContent: 'center',
                        alignItems: isMobile ? 'stretch' : 'flex-end',
                        gap: isMobile ? `${SPACE.xs}px` : `${SPACE.sm}px`,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: isMobile ? 0 : `${SPACE.sm}px` }}>
                            <DailyBountyPlaque isMobile={isMobile} />
                        </div>
                        <MilestoneMeter isMobile={isMobile} onOpen={() => setShowEventLog(true)} />
                    </div>
                )}
            </div>

            {/* Notification Center */}
            {showNotifications && (
                <NotificationCenter
                    isOpen={showNotifications}
                    onClose={() => {
                        setShowNotifications(false);
                        fetch(`${API_BASE_URL}/api/notifications/unread-count`, { credentials: 'include' })
                            .then(res => res.json())
                            .then(data => setUnreadNotificationCount(data.count || 0))
                            .catch(() => {});
                    }}
                />
            )}

            {/* Sound Settings Modal */}
            {showSoundSettings && (
                <SoundSettingsPanel onClose={() => setShowSoundSettings(false)} />
            )}

            {showChangelog && (
                <ChangelogModal onClose={closeChangelog} isMobile={isMobile} />
            )}

            {/* Mobile Activity Feed Modal */}
            {showMobileActivity && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '20px',
                    animation: 'fadeIn 0.3s ease-out'
                }}
                     onClick={(e) => {
                         if (e.target === e.currentTarget) setShowMobileActivity(false);
                     }}
                >
                    <div style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '380px',
                        // A definite height, not just maxHeight: ActivityFeedSidebar is `height: 100%`, which collapses against an auto-height parent and the feed would overflow unscrollably. Capped at 640px.
                        height: 'min(90vh, 640px)',
                        minHeight: 0,
                        animation: 'slideUp 0.3s ease-out'
                    }}>
                        {/* Close button */}
                        <button
                            onClick={() => setShowMobileActivity(false)}
                            style={{
                                position: 'absolute',
                                top: '-14px',
                                right: '-14px',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                background: COLORS.bgLight,
                                border: `1px solid ${COLORS.border}`,
                                color: COLORS.text,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1,
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                            }}
                        >
                            <X size={18} />
                        </button>
                        <ActivityFeedSidebar />
                    </div>
                </div>
            )}

            {/* On a phone the bottom bar opens chat and LiveChat's own launcher is suppressed (MobileTabBar.jsx; LiveChat.jsx for the signal counter). */}
            {user && (
                <LiveChat
                    user={user}
                    isAdmin={user.isAdmin}
                    openSignal={chatOpenSignal}
                    onUnreadChange={setChatUnread}
                    hideLauncher={isMobile}
                />
            )}

            {/* The phone's four destinations, in the thumb zone. */}
            {isMobile && (
                <MobileTabBar
                    active={
                        showCollection ? 'collection'
                            : showLeaderboard ? 'leaderboard'
                                : showProfile ? 'profile'
                                    // 'activity' is last in the chain so existing precedence is untouched.
                                    : showMobileActivity ? 'activity'
                                        : null
                    }
                    // 'chat' is absent on purpose: LiveChat owns its open state and is poked via `chatOpenSignal`, a counter.
                    unreadChat={chatUnread}
                    onSelect={(id) => {
                        if (id === 'collection') setShowCollection(true);
                        else if (id === 'leaderboard') setShowLeaderboard(true);
                        else if (id === 'activity') setShowMobileActivity(true);
                        else if (id === 'profile') setShowProfile(true);
                        else if (id === 'chat') setChatOpenSignal(n => n + 1);
                    }}
                />
            )}

            {/* Everything the phone's topbar cannot hold. Ordered by how often it
                is reached, with the destructive action last and alone in red. */}
            {isMobile && (
                <MobileMoreSheet
                    open={showMore}
                    onClose={() => setShowMore(false)}
                    items={[
                        // Live activity is a bottom-bar destination, not a sheet row.
                        { id: 'history', label: 'Spin history', Icon: ScrollText, onSelect: () => setShowHistory(true) },
                        { id: 'eventlog', label: 'Event log', Icon: Radio, onSelect: () => setShowEventLog(true) },
                        { id: 'achievements', label: 'Achievements', Icon: Award, onSelect: () => setShowAchievements(true) },
                        // The phone's only way back to the release notes; `value` carries the unseen mark since sheet rows have no badge slot.
                        {
                            id: 'changelog',
                            label: "What's new",
                            Icon: Sparkles,
                            value: changelogUnseen ? 'New' : undefined,
                            onSelect: openChangelog,
                        },
                        { id: 'name', label: 'Edit name', Icon: Edit3, onSelect: () => setShowUsernameModal(true) },
                        { id: 'sound', label: 'Sound', Icon: Volume2, onSelect: () => setShowSoundSettings(true) },
                        {
                            id: 'saver',
                            label: 'Battery saver',
                            Icon: saverMode ? BatteryLow : Battery,
                            value: saverMode ? 'On' : 'Off',
                            valueActive: saverMode,
                            // The sheet stays up: this row reports rather than navigates, matching the nav drawer's toggle.
                            keepOpen: true,
                            onSelect: toggleSaverMode,
                        },
                        user?.isAdmin
                            ? { id: 'admin', label: 'Admin panel', Icon: Settings, onSelect: () => setShowAdmin(true) }
                            : null,
                        { id: 'logout', label: 'Log out', Icon: LogOut, onSelect: logout, tone: 'danger' },
                    ]}
                />
            )}

            {/* Asked once, on a phone that looks like it is struggling. See
                SaverOffer.jsx for why it asks rather than acts. */}
            <SaverOffer isMobile={isMobile} />
        </div>
    );
}

export default function WheelOfFortune({ onBack }) {
    return (
        <AuthProvider>
            <ActivityProvider>
                <SoundProvider>
                    <WheelOfFortunePage onBack={onBack || (() => window.location.hash = '')} />
                </SoundProvider>
            </ActivityProvider>
        </AuthProvider>
    );
}
