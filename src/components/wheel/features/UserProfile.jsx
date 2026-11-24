// THE CONCOURSE: the player board. One board, two columns, no tabs; `isOwnProfile` adds edit affordances rather than rearranging anything (a lens, not a second board).
// A visitor's board has no best day or rank-against-the-field (/api/stats/me and /rankings/:id are session-gated): absent, never zeroed. `profile.*_count` is SUM(count), copies pulled, so the register keeps HELD (unique over total) and PULLED (copies) apart.

import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL, IMAGE_BASE_URL, CUSTOM_IMAGE_BASE_URL } from '../../../config/constants.js';
import { DECK, rail } from '../config/constants';
import { getMinecraftHeadUrl } from '../../../utils/helpers.js';
import {
    RARITY, RARITY_KEYS, getRarityColor, getRarityInk, getRarityOnColor,
    getRarityStops, getRarityIcon, isIridescentRarity,
} from '../../../utils/rarityHelpers.jsx';
import {
    prestigeLabel, prestigeColor, prestigeInk, prestigeIcon,
    isIridescentPrestige, prestigeStanding,
} from '../../../utils/prestigeHelpers.js';
import { FlapText, BoardLabel, RowLamp, BoardMeter, Plinth } from './collection/FlapBoard.jsx';
import { PrestigeRing } from '../spin/StageFlanks.jsx';
import { useWheelViewport } from '../config/breakpoints.js';
import { Achievements } from './Achievements.jsx';
import { LuckInfoModal } from '../modals/LuckInfoModal.jsx';
import { CollectionBook } from './CollectionBook.jsx';
import {
    X, Trophy, Edit3, Plus, Check, HelpCircle, BookOpen, Crown,
} from 'lucide-react';
import { AchievementIcon } from '../../../utils/achievementIcons.jsx';

// Tiers that go into a collection: all but `common` (not special) and `event` (a trigger, never collected).
const COLLECTABLE_TIERS = RARITY_KEYS.filter(key => key !== 'common' && key !== 'event');

/** Zeroed counts for every collectable tier — the initial state for both counters. */
const EMPTY_TIER_COUNTS = Object.fromEntries(COLLECTABLE_TIERS.map(key => [key, 0]));

// Insane is exempt from the overdue claim, as on the collection board: its expectation exceeds any account's spin count.
const NO_STREAK = new Set(['insane']);

/* A prestige level is worn as a numeral: "II" reads as a rank where "2" reads as
   a quantity, and it sits beside counts that are quantities. */
// Number format forced to en-US (the site is English-only); locale formats once disagreed between panels.
const fmt = n => (typeof n === 'number' && isFinite(n) ? n : Number(n) || 0).toLocaleString('en-US');

/** A board date: short, tracked, and the same shape the collection board uses. */
const fmtDate = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }).toUpperCase();
};

const fmtMonth = iso => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase();
};

export function UserProfile({ userId, onClose, isOwnProfile, onEditUsername }) {
    const [profile, setProfile] = useState(null);
    const [extendedStats, setExtendedStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showLuckInfoModal, setShowLuckInfoModal] = useState(false);
    const [rankings, setRankings] = useState({ spins: null, events: null });
    const [specialItems, setSpecialItems] = useState([]);
    const [specialItemTotals, setSpecialItemTotals] = useState(EMPTY_TIER_COUNTS);
    const [uniqueCollected, setUniqueCollected] = useState(EMPTY_TIER_COUNTS);
    const [showAchievements, setShowAchievements] = useState(false);
    const [showCollectionBook, setShowCollectionBook] = useState(false);
    const [collectionBookData, setCollectionBookData] = useState(null);

    // `details` carries `firstObtained`, which RECENT FINDS and the register's LAST PULL need.
    const [collection, setCollection] = useState({});
    const [details, setDetails] = useState({});

    // Showcase data
    const [badges, setBadges] = useState([]);
    const [showcase, setShowcase] = useState([]);
    const [userAchievements, setUserAchievements] = useState([]);
    const [achievementSummary, setAchievementSummary] = useState(null);
    const [userCollection, setUserCollection] = useState([]);
    const [prestige, setPrestige] = useState(null);

    // Edit modals
    const [showBadgeEditor, setShowBadgeEditor] = useState(false);
    const [showShowcaseEditor, setShowShowcaseEditor] = useState(false);
    const [pendingBadges, setPendingBadges] = useState([]);
    const [pendingShowcase, setPendingShowcase] = useState([]);

    // `hasFlanks` (1200px) is the two-column line, measured: from 900 to 1199 the register's tracks need more than the column has, so that range gets the narrow layout.
    const { isPhone, hasFlanks } = useWheelViewport();
    const twoColumn = hasFlanks;

    useEffect(() => {
        loadProfile();
    }, [userId]);

    // Escape closes the board (a dialog). Guarded rather than stopPropagation: CollectionBook binds Escape on `window` in the bubble phase too, and stopPropagation does not stop a same-node listener, so the profile would close under it. While anything of the board's is open on top, that thing owns the key.
    const childOpen = showCollectionBook || showAchievements || showLuckInfoModal
        || showBadgeEditor || showShowcaseEditor;

    useEffect(() => {
        if (childOpen) return undefined;
        const onKey = e => {
            if (e.key !== 'Escape') return;
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, childOpen]);

    async function loadProfile() {
        try {
            // `/api/collection/user/:id` returns `collectionDetails` (name, type, first-obtained per item) beyond the texture -> count map.
            const fetchPromises = [
                fetch(`${API_BASE_URL}/api/user/${userId}/profile`),
                isOwnProfile
                    ? fetch(`${API_BASE_URL}/api/stats/me`, { credentials: 'include' })
                    : Promise.resolve(null),
                fetch(`${API_BASE_URL}/api/user/${userId}/badges`),
                fetch(`${API_BASE_URL}/api/user/${userId}/showcase`),
                isOwnProfile
                    ? fetch(`${API_BASE_URL}/api/stats/rankings/${userId}`, { credentials: 'include' })
                    : Promise.resolve(null),
                fetch(`${API_BASE_URL}/api/special-items`),
                fetch(`${API_BASE_URL}/api/collection/user/${userId}`),
                fetch(`${API_BASE_URL}/api/prestige/user/${userId}`),
                fetch(`${API_BASE_URL}/api/achievements/user/${userId}`),
            ];

            const [
                profileRes, statsRes, badgesRes, showcaseRes, rankingsRes,
                specialRes, collectionRes, prestigeRes, achievementsRes,
            ] = await Promise.all(fetchPromises);

            const profileData = await profileRes.json();
            setProfile(profileData);

            if (statsRes) {
                const statsData = await statsRes.json();
                setExtendedStats(statsData);
            }

            const badgesData = await badgesRes.json();
            setBadges(badgesData.badges || []);

            const showcaseData = await showcaseRes.json();
            setShowcase(showcaseData.showcase || []);

            // Process rankings if available
            if (rankingsRes && rankingsRes.ok) {
                const rankingsData = await rankingsRes.json();
                setRankings(rankingsData);
            }

            if (prestigeRes && prestigeRes.ok) {
                setPrestige(await prestigeRes.json());
            }

            if (achievementsRes && achievementsRes.ok) {
                const a = await achievementsRes.json();
                setUserAchievements(a.unlocked || []);
                setAchievementSummary({
                    total: a.totalAchievements ?? null,
                    hiddenUnlocked: a.hiddenUnlockedCount ?? 0,
                });
            }

            // Get special items and collection for completion tracking
            const specialData = await specialRes.json();
            const items = specialData.items || [];
            setSpecialItems(items);

            // Per tier from the shared ladder (exotic was once missing from both objects).
            const byTier = Object.fromEntries(
                COLLECTABLE_TIERS.map(key => [key, items.filter(i => i.rarity === key)])
            );
            setSpecialItemTotals(
                Object.fromEntries(COLLECTABLE_TIERS.map(key => [key, byTier[key].length]))
            );

            const collectionData = await collectionRes.json();
            const userCollectionMap = collectionData.collection || {};
            setCollection(userCollectionMap);
            setDetails(collectionData.collectionDetails || {});

            setUniqueCollected(Object.fromEntries(COLLECTABLE_TIERS.map(key => [
                key,
                byTier[key].filter(item => userCollectionMap[item.texture] > 0).length,
            ])));
        } catch (e) {
            console.error('Failed to load profile:', e);
        } finally {
            setLoading(false);
        }
    }

    async function loadAchievementsForEditor() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/achievements/me`, { credentials: 'include' });
            const data = await res.json();
            setUserAchievements(data.unlocked || []);
            setPendingBadges(badges.map(b => b.id));
        } catch (e) {
            console.error('Failed to load achievements:', e);
        }
    }

    async function loadCollectionForEditor() {
        try {
            // Fetch both collection and special items data
            const [collectionRes, specialRes] = await Promise.all([
                fetch(`${API_BASE_URL}/api/collection`, { credentials: 'include' }),
                fetch(`${API_BASE_URL}/api/special-items`)
            ]);

            const collectionData = await collectionRes.json();
            const specialData = await specialRes.json();

            // Create lookup map for special items (username, image_url)
            const specialItemsMap = {};
            (specialData.items || []).forEach(item => {
                specialItemsMap[item.texture] = {
                    username: item.username,
                    image_url: item.image_url
                };
            });

            // Convert collectionDetails object to array and filter for special items only
            const collectionDetails = collectionData.collectionDetails || {};
            const items = Object.entries(collectionDetails)
                .map(([texture, info]) => ({
                    item_texture: texture,
                    item_name: info.name,
                    item_type: info.type,
                    count: info.count,
                    username: specialItemsMap[texture]?.username,
                    image_url: specialItemsMap[texture]?.image_url
                }))
                .filter(item => COLLECTABLE_TIERS.includes(item.item_type) || item.item_type === 'event');

            // Rarest first, off RARITY_KEYS.
            const order = key => {
                const i = RARITY_KEYS.indexOf(key);
                return i < 0 ? RARITY_KEYS.length : i;
            };
            setUserCollection(items.sort((a, b) => order(a.item_type) - order(b.item_type)));
            setPendingShowcase(showcase.map(s => s.item_texture));
        } catch (e) {
            console.error('Failed to load collection:', e);
        }
    }

    async function saveBadges() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/badges/me`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ badges: pendingBadges })
            });
            const data = await res.json();
            if (data.badges) {
                setBadges(data.badges);
            }
            setShowBadgeEditor(false);
        } catch (e) {
            console.error('Failed to save badges:', e);
        }
    }

    async function saveShowcase() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/showcase/me`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ items: pendingShowcase })
            });
            const data = await res.json();
            if (data.showcase) {
                setShowcase(data.showcase);
            }
            setShowShowcaseEditor(false);
        } catch (e) {
            console.error('Failed to save showcase:', e);
        }
    }

    async function loadCollectionBook() {
        try {
            const itemsRes = await fetch(`${API_BASE_URL}/api/items`);
            const itemsData = await itemsRes.json();

            // The book gets EVERY held row, not just specials: it marks held from `collection` but prints the plaque from `collectionDetails`, so projecting `specialItems` showed commons as held with 'Copies held 0'. Also restores `isLucky` / `isGoldRush`.
            const byTexture = new Map(specialItems.map(i => [i.texture, i]));
            const bookDetails = Object.fromEntries(
                Object.entries(details).map(([texture, d]) => {
                    const special = byTexture.get(texture);
                    return [texture, {
                        ...d,
                        name: d.name || special?.name,
                        type: d.type || special?.rarity,
                        username: special?.username,
                        image_url: special?.image_url,
                    }];
                })
            );

            setCollectionBookData({
                collection,
                collectionDetails: bookDetails,
                // CollectionBook's Spin Stats panel reads camelCase totalSpins/*Count.
                stats: {
                    totalSpins: profile?.total_spins || 0,
                    insaneCount: profile?.insane_count || 0,
                    mythicCount: profile?.mythic_count || 0,
                    legendaryCount: profile?.legendary_count || 0,
                    relicCount: profile?.relic_count || 0,
                    exoticCount: profile?.exotic_count || 0,
                    rareCount: profile?.rare_count || 0,
                    eventTriggers: profile?.event_triggers || 0,
                    totalDuplicates: profile?.total_duplicates || 0
                },
                dryStreaks: profile?.dry_streaks || null,
                allItems: itemsData.items || [],
                dynamicItems: specialItems,
            });
            setShowCollectionBook(true);
        } catch (e) {
            console.error('Failed to load collection book:', e);
        }
    }

    function toggleBadge(achievementId) {
        setPendingBadges(prev => {
            if (prev.includes(achievementId)) {
                return prev.filter(id => id !== achievementId);
            } else if (prev.length < 3) {
                return [...prev, achievementId];
            }
            return prev;
        });
    }

    // The showcase is a list of three picks, not a set: duplicates are legitimate (`user_showcase` allows them), so every guard is per-copy and the POST takes the array as it stands.
    function addShowcaseItem(texture, ownedCount = 1) {
        setPendingShowcase(prev => {
            const currentCount = prev.filter(t => t === texture).length;
            if (prev.length < 3 && currentCount < ownedCount) {
                return [...prev, texture];
            }
            return prev;
        });
    }

    // Removal is by SLOT, not by item.
    function removeShowcaseSlot(index) {
        setPendingShowcase(prev => prev.filter((_, i) => i !== index));
    }

    function getDiscordAvatarUrl(discordId, avatarHash, size = 128) {
        if (!discordId) return 'https://cdn.discordapp.com/embed/avatars/0.png';
        if (avatarHash) {
            const format = avatarHash.startsWith('a_') ? 'gif' : 'png';
            return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${format}?size=${size}`;
        }
        try {
            const defaultIndex = Number(BigInt(discordId) >> 22n) % 6;
            return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        } catch {
            return 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
    }

    // Luck as a word: amber above the field, ordinary ink otherwise; luck has no tier, so no extra palette.
    function luckStanding(rating, percentile) {
        if (!rating) return { tone: DECK.inkDim, label: null };
        if (percentile == null) return { tone: DECK.inkMid, label: 'Calculating' };

        const top = 100 - percentile;
        const label = top <= 1 ? 'Top 1%'
            : top <= 5 ? 'Top 5%'
            : top <= 10 ? 'Top 10%'
            : top <= 25 ? 'Top 25%'
            : top <= 50 ? 'Top 50%'
            : 'Bottom 50%';

        return { tone: top <= 25 ? DECK.amber : DECK.inkMid, label };
    }

    /* A rank against the field, or null. Never a zero — see the module header. */
    function standingText(r) {
        if (!r) return null;
        if (r.rank <= 10) return `#${r.rank}`;
        if (r.percentile == null) return null;
        return r.percentile >= 50 ? `Top ${100 - r.percentile}%` : `Bottom ${r.percentile}%`;
    }

    function getShowcaseImageUrl(item) {
        if (!item) return `${IMAGE_BASE_URL}/barrier.png`;

        // Custom image URL (e.g., from database)
        if (item.image_url) {
            return item.image_url;
        }

        // Mythic items without username - use constants
        if (item.item_type === 'mythic' && !item.username) {
            // Check for known mythics
            if (item.item_texture === 'mythic_cavendish') {
                return `${CUSTOM_IMAGE_BASE_URL}/cavendish.png`;
            }
            if (item.item_texture === 'mythic_jimbo') {
                return '/jimbo.png';
            }
            // Fallback for unknown mythics
            return `${CUSTOM_IMAGE_BASE_URL}/cavendish.png`;
        }

        // Player heads (legendaries and rares with usernames)
        if (item.username) {
            return getMinecraftHeadUrl(item.username);
        }

        // Event items
        if (item.item_type === 'event') {
            return '/event.png';
        }

        // Fallback to texture-based URL (shouldn't reach here for special items)
        return `${IMAGE_BASE_URL}/${item.item_texture}.png`;
    }

    const register = useMemo(() => COLLECTABLE_TIERS.map(key => {
        const items = specialItems.filter(i => i.rarity === key);
        if (items.length === 0) return null;

        const held = uniqueCollected[key] || 0;
        const total = specialItemTotals[key] || items.length;
        // Copies, not items. See the header: this is the figure the old profile
        // printed under the tier's own name.
        const pulled = profile?.[`${key}_count`] || 0;

        let last = null;
        for (const i of items) {
            const at = details?.[i.texture]?.firstObtained;
            if (at && (!last || new Date(at) > new Date(last))) last = at;
        }

        // Expected spins between pulls = 1 / the tier's summed chance. `chance` is a FRACTION, not a percentage (the collection board came out 100x too large).
        const chanceSum = items.reduce((sum, i) => sum + (Number(i.chance) || 0), 0);
        const expected = chanceSum > 0 ? Math.round(1 / chanceSum) : null;
        // `?? null`, never `?? 0`: zeros read as 'just pulled one' for every tier and nothing could be overdue.
        const since = NO_STREAK.has(key) ? null : (profile?.dry_streaks?.[key] ?? null);
        const overdue = expected != null && since != null && since > expected;

        // Complete outranks overdue: a finished tier is not overdue, but the wait still belongs on SINCE.
        const status = held >= total ? 'complete'
            : held === 0 ? 'empty'
            : overdue ? 'overdue'
            : 'tracking';

        return {
            key, label: RARITY[key].label,
            tone: getRarityColor(key), ink: getRarityInk(key),
            held, total, pulled, last, since, expected, overdue, status,
        };
    }).filter(Boolean), [specialItems, uniqueCollected, specialItemTotals, profile, details]);

    // RECENT FINDS: `firstObtained` is the FIRST copy, so this lists discoveries ("found"), and a duplicate does not move an item up.
    const recentFinds = useMemo(() => {
        const specials = new Set(specialItems.map(i => i.texture));
        const byTexture = new Map(specialItems.map(i => [i.texture, i]));

        return Object.entries(details)
            .filter(([texture, d]) => specials.has(texture) && d.firstObtained)
            .sort((a, b) => new Date(b[1].firstObtained) - new Date(a[1].firstObtained))
            .slice(0, 5)
            .map(([texture, d]) => ({
                texture,
                name: d.name || byTexture.get(texture)?.name || texture,
                type: d.type || byTexture.get(texture)?.rarity,
                at: d.firstObtained,
                count: d.count,
                item: {
                    item_texture: texture,
                    item_type: d.type || byTexture.get(texture)?.rarity,
                    username: byTexture.get(texture)?.username,
                    image_url: byTexture.get(texture)?.image_url,
                },
            }));
    }, [details, specialItems]);

    if (loading) {
        return (
            <div style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1100,
            }}>
                <BoardLabel size={13} tone={DECK.inkDim}>Reading the board…</BoardLabel>
            </div>
        );
    }

    // An unreadable board says so; calling onClose() during render warns and looks like a dead click.
    if (!profile) {
        return (
            <div
                onClick={(e) => e.target === e.currentTarget && onClose()}
                role="dialog"
                aria-modal="true"
                aria-label="Player board"
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1100, padding: '20px',
                }}
            >
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px',
                    padding: '26px', backgroundImage: DECK.face,
                    boxShadow: `inset 0 1px 0 ${rail(0.12)}, 0 32px 80px rgba(0,0,0,0.65)`,
                }}>
                    <FlapText text="Board unreadable" size={22} tone={DECK.ink} weight={800} />
                    <BoardLabel tone={DECK.inkMid}>
                        This player&apos;s record could not be loaded
                    </BoardLabel>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <Plinth
                            as="button"
                            className="fib-board-hit"
                            onClick={() => { setLoading(true); loadProfile(); }}
                            style={{ padding: '0 14px', height: '32px', display: 'flex', alignItems: 'center', color: DECK.amber }}
                        ><BoardLabel tone="currentColor">Try again</BoardLabel></Plinth>
                        <Plinth
                            as="button"
                            className="fib-board-hit"
                            onClick={onClose}
                            style={{ padding: '0 14px', height: '32px', display: 'flex', alignItems: 'center', color: DECK.inkMid }}
                        ><BoardLabel tone="currentColor">Close</BoardLabel></Plinth>
                    </div>
                </div>
            </div>
        );
    }

    // `total_possible` is the mcmeta pool plus specials and can arrive as 0: unguarded it printed NaN% and handed `scaleX(NaN)` to the platform line.
    const completionPercent = profile.total_possible > 0
        ? (profile.unique_items / profile.total_possible) * 100
        : null;
    const luckRating = profile.luckRating || extendedStats?.luckRating;
    const luck = luckStanding(luckRating?.rating, luckRating?.percentile);
    const luckiestDay = extendedStats?.luckiestDay;

    // `total > 0` guards the window before the special-items request lands, when every tier would read as complete.
    const completedTiers = COLLECTABLE_TIERS.filter(
        key => specialItemTotals[key] > 0 && uniqueCollected[key] >= specialItemTotals[key]
    );

    const standing = prestigeStanding(prestige);
    const specialsHeld = COLLECTABLE_TIERS.reduce((n, k) => n + (uniqueCollected[k] || 0), 0);
    const specialsPulled = COLLECTABLE_TIERS.reduce((n, k) => n + (profile[`${k}_count`] || 0), 0);
    const avgBetween = specialsPulled > 0 && profile.total_spins >= 10
        ? Math.round(profile.total_spins / specialsPulled)
        : null;

    // Two registers at a 1.35 size ratio (as on the collection board): three figures about HOLDING lead, three about SPINNING support.
    const holdFigures = [
        { label: 'Held', value: fmt(profile.unique_items), tone: DECK.ink },
        {
            label: 'Complete',
            value: completionPercent == null ? '—' : `${completionPercent.toFixed(1)}%`,
            tone: completionPercent == null ? DECK.inkDim : DECK.amber,
        },
        { label: 'Specials', value: fmt(specialsHeld), tone: DECK.ink },
    ];
    const spinFigures = [
        { label: 'Spins', value: fmt(profile.total_spins) },
        { label: 'Duplicates', value: fmt(profile.total_duplicates) },
        { label: 'Events', value: fmt(profile.event_triggers) },
    ];

    // Tracks: lamp / tier / held / pulled / meter / last / since / status. The phone drops PULLED, the meter and LAST PULL (derivable) and keeps SINCE. The name track has a FLOOR and the meter FLEXES, as on the collection board; the phone floor is 56 so 320px does not overflow.
    const registerColumns = isPhone
        ? '8px minmax(66px, 1fr) 64px 50px 72px'
        : '10px minmax(92px, 1fr) 72px 62px minmax(40px, 0.6fr) 66px 60px 80px';

    const gutter = isPhone ? '16px' : '26px';

    // A drum cell is ~0.62em plus 2px, so a name is ~length × (0.62 × size + 2) wide; the top step exists for Discord's 32-character names, which drums neither wrap nor ellipsise.
    const nameLength = (profile.custom_username || 'Player').length;
    const nameSize = (isPhone ? [24, 19, 15, 12] : [34, 26, 20, 16])[
        nameLength > 26 ? 3 : nameLength > 20 ? 2 : nameLength > 12 ? 1 : 0
    ];

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-label={`${profile.custom_username || 'Player'}'s player board`}
            className="fib-profile"
            style={{
                position: 'fixed', inset: 0,
                // Scrim ladder's middle step, matching the collection board and leaderboard.
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1100,
                padding: isPhone ? 0 : '20px',
                animation: 'fadeIn 0.25s ease-out',
            }}
        >
            <div
                className="fib-board-scroll"
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
                {/* ── THE HEAD ────────────────────────────────────────────── */}
                <div style={{
                    position: 'relative',
                    flex: '0 0 auto',
                    padding: isPhone ? `16px ${gutter} 0` : `24px ${gutter} 0`,
                    backgroundImage: `linear-gradient(180deg, ${DECK.sky} 0%, transparent 78%)`,
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'flex-start',
                        justifyContent: 'space-between', gap: '12px 16px', flexWrap: 'wrap',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flexShrink: 0, maxWidth: '100%' }}>
                            {/* The same ring as the leaderboard and stage; earned and in-progress rings are deliberately identical (owner's call). */}
                            <PrestigeRing standing={standing}>
                                <img
                                    src={getDiscordAvatarUrl(profile.discord_id, profile.discord_avatar, 256)}
                                    alt=""
                                    width={isPhone ? 56 : 68}
                                    height={isPhone ? 56 : 68}
                                    style={{
                                        display: 'block',
                                        borderRadius: '50%',
                                        background: DECK.faceDeep,
                                        objectFit: 'cover',
                                    }}
                                    onError={(e) => {
                                        e.target.onerror = null;
                                        e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                                    }}
                                />
                            </PrestigeRing>

                            <div style={{ minWidth: 0 }}>
                                {/* A drum cannot shrink or wrap, so a long name is sized down instead (Discord allows 32 characters). */}
                                <FlapText
                                    text={profile.custom_username || 'Player'}
                                    size={nameSize}
                                    tone={DECK.ink}
                                    weight={800}
                                    plate
                                />
                                <div style={{
                                    display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                                    gap: '4px 14px', marginTop: '10px',
                                }}>
                                    {/* Qualified: this is rank in the default leaderboard order (collection size), while the Record's ranks are spins and events. */}
                                    <BoardLabel tone={profile.rank === 1 ? DECK.amber : DECK.inkMid}>
                                        {typeof profile.rank === 'number' ? `Rank ${profile.rank} by collection` : 'Unranked'}
                                    </BoardLabel>
                                    <BoardLabel tone={DECK.inkMid}>
                                        Joined {fmtMonth(profile.created_at)}
                                    </BoardLabel>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
                            {/* Level worn spelled out where there is room ("Rare Prestige"), the mark alone elsewhere. Anything naming a specific level wears that level's icon; the Crown belongs to the action that starts a run. */}
                            {standing.level > 0 && (
                                <span
                                    className={isIridescentPrestige(standing.level) ? 'fib-holo' : undefined}
                                    title={`${prestigeLabel(standing.level)}${standing.earned ? '' : ' — in progress'}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                                        height: '36px', flex: '0 0 auto',
                                        padding: isPhone ? 0 : '0 12px',
                                        width: isPhone ? '36px' : undefined,
                                        background: isIridescentPrestige(standing.level)
                                            ? undefined
                                            : `${prestigeColor(standing.level)}22`,
                                        boxShadow: `inset 0 -2px 0 ${prestigeColor(standing.level)}`,
                                        color: isIridescentPrestige(standing.level)
                                            ? '#1a1a1a'
                                            : prestigeInk(standing.level),
                                    }}
                                >
                                    {prestigeIcon(standing.level, 13)}
                                    {/* On the phone the name is the accessible name; the qualifier trails the label in both cases. */}
                                    {isPhone
                                        ? <span className="fib-sr-only">{prestigeLabel(standing.level)}</span>
                                        : <BoardLabel tone="currentColor">{prestigeLabel(standing.level)}</BoardLabel>}
                                    {!standing.earned && (
                                        <span className="fib-sr-only"> — in progress</span>
                                    )}
                                </span>
                            )}

                            {/* The two ways out live in the head, the only part that never scrolls; they act on the whole board, as on the sibling boards. */}
                            <Plinth
                                as="button"
                                className="fib-board-hit"
                                onClick={loadCollectionBook}
                                aria-label={`Open ${isOwnProfile ? 'your' : profile.custom_username + '’s'} collection board`}
                                title={isPhone ? 'Collection board' : undefined}
                                style={{
                                    height: '36px',
                                    padding: isPhone ? 0 : '0 12px',
                                    width: isPhone ? '36px' : undefined,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                                    color: DECK.inkMid,
                                }}
                            >
                                <BookOpen size={14} />
                                {!isPhone && <BoardLabel tone="currentColor">Collection</BoardLabel>}
                            </Plinth>
                            <Plinth
                                as="button"
                                className="fib-board-hit"
                                onClick={() => setShowAchievements(true)}
                                aria-label={`Open ${isOwnProfile ? 'your' : profile.custom_username + '’s'} achievements`}
                                title={isPhone ? 'Achievements' : undefined}
                                style={{
                                    height: '36px',
                                    padding: isPhone ? 0 : '0 12px',
                                    width: isPhone ? '36px' : undefined,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                                    color: DECK.inkMid,
                                }}
                            >
                                <Trophy size={14} />
                                {!isPhone && <BoardLabel tone="currentColor">Achievements</BoardLabel>}
                            </Plinth>

                            {isOwnProfile && onEditUsername && (
                                <Plinth
                                    as="button"
                                    className="fib-board-hit"
                                    onClick={onEditUsername}
                                    aria-label="Change your username"
                                    style={{
                                        width: '36px', height: '36px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: DECK.inkMid,
                                    }}
                                ><Edit3 size={14} /></Plinth>
                            )}
                            <Plinth
                                as="button"
                                className="fib-board-hit"
                                onClick={onClose}
                                aria-label="Close the profile"
                                style={{
                                    width: '36px', height: '36px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: DECK.inkMid,
                                }}
                            ><X size={16} /></Plinth>
                        </div>
                    </div>

                    {/* The figures, in two registers. */}
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
                            {holdFigures.map((f, i) => (
                                <div
                                    key={f.label}
                                    style={{
                                        paddingTop: 0, paddingBottom: 0,
                                        paddingLeft: i === 0 ? 0 : isPhone ? '12px' : '26px',
                                        paddingRight: isPhone ? '12px' : '26px',
                                        boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                                    }}
                                >
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
                        {!isPhone && <SpinRegister figures={spinFigures} align="right" />}
                    </div>

                    {/* The platform line: the board's baseline, filled to completion; no label, HELD and COMPLETE stand above it. */}
                    <BoardMeter
                        value={(completionPercent || 0) / 100}
                        tone={standing.level > 0 ? prestigeColor(standing.level) : DECK.amber}
                        height={3}
                    />

                    {isPhone && (
                        <div style={{ padding: '14px 0 2px' }}>
                            <SpinRegister figures={spinFigures} size={17} />
                        </div>
                    )}
                </div>

                {/* Two columns, one scroller. The DOM is in the narrow reading order (identity, record, then banners and exits) and the desktop composition uses grid AREAS, not `order`, which moves only the paint and gives keyboard users a different reading order. */}
                <div
                    className="fib-board-scroll"
                    style={{
                        flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                        marginTop: isPhone ? '10px' : '14px',
                        // Cut one step deeper than the board it sits in — a
                        // recess, with the board's own edge as its top seam.
                        background: 'rgba(0,0,0,0.30)',
                        boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
                    }}
                >
                    <div style={twoColumn ? {
                        display: 'grid',
                        gridTemplateColumns: '336px minmax(0, 1fr)',
                        gridTemplateAreas: '"caseTop record" "caseRest record"',
                        gridTemplateRows: 'auto 1fr',
                        alignItems: 'start',
                        gap: '0 26px',
                        padding: `6px ${gutter} 24px`,
                    } : {
                        display: 'flex',
                        flexDirection: 'column',
                        padding: `4px ${gutter} 20px`,
                    }}>
                        {/* ── THE CASE: IDENTITY ──────────────────────────── */}
                        <div style={{ minWidth: 0, gridArea: 'caseTop' }}>
                            <Panel
                                title="Showcase"
                                action={isOwnProfile && (
                                    <PanelAction
                                        onClick={() => { loadCollectionForEditor(); setShowShowcaseEditor(true); }}
                                        label="Edit showcase"
                                    ><Edit3 size={11} /> Edit</PanelAction>
                                )}
                            >
                                {/* Three mounts: a tier is a RIM around a square mount (DESIGN.md §9). An empty slot is a recess only on your own board, as an invitation to the picker. */}
                                {showcase.length === 0 && !isOwnProfile ? (
                                    <BoardLabel tone={DECK.inkMid}>Nothing on show</BoardLabel>
                                ) : (
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {/* A visitor sees only what is on show: no dead recesses beside a single item. */}
                                        {(isOwnProfile ? [0, 1, 2] : showcase.map((_, i) => i)).map(idx => {
                                            const item = showcase[idx];
                                            if (item) {
                                                return (
                                                    <ShowcaseMount
                                                        key={`${item.item_texture}-${idx}`}
                                                        tier={item.item_type}
                                                        name={item.item_name}
                                                        src={getShowcaseImageUrl(item)}
                                                    />
                                                );
                                            }
                                            return (
                                                <ShowcaseMount
                                                    key={idx}
                                                    empty
                                                    onClick={() => { loadCollectionForEditor(); setShowShowcaseEditor(true); }}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </Panel>

                            <Panel
                                title="Badges"
                                action={isOwnProfile && (
                                    <PanelAction
                                        onClick={() => { loadAchievementsForEditor(); setShowBadgeEditor(true); }}
                                        label="Edit badges"
                                    ><Edit3 size={11} /> Edit</PanelAction>
                                )}
                            >
                                {/* A badge's name is in the DOM for screen readers, not only a `title` (unreachable on touch). */}
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {badges.length > 0 ? badges.map((badge, idx) => (
                                        <Plinth
                                            key={badge.id || idx}
                                            as="button"
                                            className="fib-board-hit"
                                            onClick={() => setShowAchievements(true)}
                                            title={badge.name}
                                            style={{
                                                width: '38px', height: '38px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: DECK.ink,
                                            }}
                                        >
                                            <span className="fib-sr-only">{badge.name}</span>
                                            <AchievementIcon name={badge.icon} size={16} color="currentColor" />
                                        </Plinth>
                                    )) : (
                                        <BoardLabel tone={DECK.inkMid}>
                                            {isOwnProfile ? 'None equipped' : 'No badges'}
                                        </BoardLabel>
                                    )}
                                </div>
                            </Panel>
                        </div>

                        {/* ── THE RECORD ──────────────────────────────────── */}
                        <div style={{ minWidth: 0, gridArea: 'record' }}>
                            <Panel title="Register">
                                <div style={{
                                    display: 'grid', gridTemplateColumns: registerColumns,
                                    alignItems: 'center', gap: isPhone ? '0 6px' : '0 12px', padding: '0 0 8px',
                                }}>
                                    <span />
                                    <BoardLabel>Tier</BoardLabel>
                                    <BoardLabel style={{ textAlign: 'right' }}>Held</BoardLabel>
                                    {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Pulled</BoardLabel>}
                                    {!isPhone && <span />}
                                    {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Found</BoardLabel>}
                                    <BoardLabel style={{ textAlign: 'right' }}>Since</BoardLabel>
                                    <BoardLabel style={{ textAlign: 'right' }}>Status</BoardLabel>
                                </div>

                                {/* Empty state for when `/api/special-items` fails. */}
                                {register.length === 0 && (
                                    <div style={{ padding: '12px 0' }}>
                                        <BoardLabel tone={DECK.inkMid}>Tiers unavailable</BoardLabel>
                                    </div>
                                )}
                                {/* The empty line sits OUTSIDE the list: a `role="list"` with no listitem is malformed. */}
                                <div role={register.length > 0 ? 'list' : undefined}>
                                    {register.map((row, i) => {
                                        const statusWord = {
                                            complete: 'Complete', overdue: 'Overdue',
                                            empty: 'None held', tracking: 'Collecting',
                                        }[row.status];
                                        const statusTone = row.status === 'complete' ? row.ink
                                            : row.status === 'overdue' ? DECK.amber
                                            : DECK.inkMid;

                                        // The whole claim as one sentence on the row: a `title` alone is unreachable on touch and unreliable for assistive tech.
                                        const waitSentence = row.expected != null && row.since != null
                                            ? `${fmt(row.since)} spins since the last ${row.label}; one costs about ${fmt(row.expected)} spins on average`
                                            : null;

                                        return (
                                            <div
                                                key={row.key}
                                                // `is-static`: on the collection board the row hover signals a filter control; here the row is a readout, so no lift.
                                                className="fib-register-row is-static"
                                                role="listitem"
                                                aria-label={[
                                                    row.label,
                                                    `${fmt(row.held)} of ${fmt(row.total)} held`,
                                                    `${fmt(row.pulled)} pulled`,
                                                    waitSentence,
                                                    statusWord,
                                                ].filter(Boolean).join('. ')}
                                                style={{
                                                    display: 'grid', gridTemplateColumns: registerColumns,
                                                    alignItems: 'center', gap: isPhone ? '0 6px' : '0 12px',
                                                    width: '100%', padding: isPhone ? '9px 0' : '12px 0',
                                                }}
                                            >
                                                <RowLamp
                                                    state={row.status === 'complete' ? 'lit' : row.overdue ? 'due' : 'dark'}
                                                    tone={row.tone}
                                                />
                                                {/* A tier with nothing held keeps its ink: it has the most left to do. */}
                                                <FlapText
                                                    text={row.label}
                                                    size={isPhone ? 15 : 16}
                                                    tone={row.held > 0 ? row.ink : DECK.ink}
                                                    weight={700}
                                                    delay={280 + i * 55}
                                                />
                                                <FlapText
                                                    text={`${fmt(row.held)} / ${fmt(row.total)}`}
                                                    size={15} tone={DECK.ink}
                                                    delay={300 + i * 55}
                                                    style={{ justifyContent: 'flex-end' }}
                                                />
                                                {!isPhone && (
                                                    <FlapText
                                                        text={fmt(row.pulled)} digits size={15}
                                                        tone={row.pulled > 0 ? DECK.inkMid : DECK.inkDim}
                                                        delay={315 + i * 55}
                                                        style={{ justifyContent: 'flex-end' }}
                                                    />
                                                )}
                                                {!isPhone && (
                                                    <BoardMeter
                                                        value={row.total > 0 ? row.held / row.total : 0}
                                                        tone={row.tone}
                                                        spent={row.status === 'complete'}
                                                    />
                                                )}
                                                {!isPhone && (
                                                    <FlapText
                                                        text={fmtDate(row.last) || '—'}
                                                        size={14} tone={DECK.inkMid} weight={600}
                                                        delay={330 + i * 55}
                                                        style={{ justifyContent: 'flex-end' }}
                                                    />
                                                )}
                                                <FlapText
                                                    text={row.since == null ? '—' : fmt(row.since)}
                                                    digits={row.since != null} size={15}
                                                    tone={row.overdue ? DECK.amber : DECK.inkMid}
                                                    delay={345 + i * 55}
                                                    style={{ justifyContent: 'flex-end' }}
                                                />
                                                <BoardLabel size={12} tone={statusTone} style={{ textAlign: 'right' }}>
                                                    {statusWord}
                                                </BoardLabel>
                                            </div>
                                        );
                                    })}
                                </div>
                            </Panel>

                            <Panel title="Record">
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isPhone ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
                                    gap: '0',
                                }}>
                                    <RecordFigure
                                        label="Spins"
                                        value={fmt(profile.total_spins)}
                                        note={standingText(rankings.spins)}
                                        first
                                    />
                                    {/* Lifetime, not the unspent balance (see the column's note in statements.js). No share-of-SPINS note on purpose: the numerator counts only item-producing spins while the denominator includes event and recursion triggers. */}
                                    <RecordFigure
                                        label="Lucky spins"
                                        value={fmt(profile.lucky_spins_used || 0)}
                                        tone={profile.lucky_spins_used > 0 ? DECK.amber : DECK.inkDim}
                                    />
                                    <RecordFigure
                                        label="Luck"
                                        value={luckRating?.rating != null ? String(luckRating.rating) : '—'}
                                        tone={luck.tone}
                                        note={luck.label}
                                        onInfo={luckRating ? () => setShowLuckInfoModal(true) : null}
                                        first={isPhone}
                                    />
                                    <RecordFigure
                                        label="Events"
                                        value={fmt(profile.event_triggers)}
                                        note={standingText(rankings.events)}
                                    />
                                    {/* "One special every N spins" is the honest reading; N counts COPIES, since that is what a spin produces. */}
                                    <RecordFigure
                                        label="Per special"
                                        value={avgBetween != null ? `~${fmt(avgBetween)}` : '—'}
                                        note={avgBetween != null ? `${fmt(specialsPulled)} pulled` : null}
                                        first={isPhone}
                                    />
                                </div>

                                {/* Own-profile only: /api/stats/me is session-gated, so a visitor's board has no best day. Absent, never zeroed. */}
                                {luckiestDay && luckiestDay.spins > 0 && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', flexWrap: 'wrap',
                                        gap: '8px 18px', marginTop: '14px', paddingTop: '12px',
                                        boxShadow: `inset 0 1px 0 ${rail(0.06)}`,
                                    }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '7px', color: DECK.amber }}>
                                            <Crown size={13} />
                                            <BoardLabel tone="currentColor">Best day</BoardLabel>
                                        </span>
                                        {/* `new Date('2026-08-14')` parses as UTC midnight and prints in local time, so east of UTC this can be a day behind the register's FOUND column. Known and left: one decorative line. */}
                                        <BoardLabel size={13} tone={DECK.ink} style={{ letterSpacing: '0.03em' }}>
                                            {new Date(luckiestDay.date).toLocaleDateString('en-US', {
                                                weekday: 'short', month: 'short', day: 'numeric',
                                            })}
                                        </BoardLabel>
                                        <BoardLabel tone={DECK.inkMid}>{fmt(luckiestDay.spins)} spins</BoardLabel>
                                        <div style={{ display: 'flex', gap: '14px', marginLeft: 'auto' }}>
                                            {COLLECTABLE_TIERS.map(key => {
                                                const n = luckiestDay[`${key}_count`] || 0;
                                                if (n <= 0) return null;
                                                return (
                                                    <span key={key} style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                        <BoardLabel size={13} tone={getRarityInk(key)} style={{ letterSpacing: '0.03em' }}>
                                                            {n}
                                                        </BoardLabel>
                                                        <BoardLabel>{RARITY[key].label}</BoardLabel>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </Panel>

                            {/* ── RECENT FINDS ─────────────────────────────── */}
                            <Panel title="Recent finds">
                                {recentFinds.length === 0 ? (
                                    <BoardLabel tone={DECK.inkMid}>No specials found yet</BoardLabel>
                                ) : (
                                    <div>
                                        {recentFinds.map((find, i) => (
                                            <div
                                                key={find.texture}
                                                className="fib-register-row is-static"
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '34px minmax(0, 1fr) auto 62px',
                                                    alignItems: 'center', gap: isPhone ? '0 6px' : '0 12px',
                                                    padding: '9px 0',
                                                }}
                                            >
                                                <ShowcaseMount
                                                    tier={find.type}
                                                    name={find.name}
                                                    src={getShowcaseImageUrl(find.item)}
                                                    size={34}
                                                    quiet
                                                />
                                                <span style={{
                                                    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                                                    fontSize: '15px', fontWeight: 600,
                                                    letterSpacing: '0.03em',
                                                    color: getRarityInk(find.type),
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {find.name}
                                                </span>
                                                <BoardLabel size={12} tone={DECK.inkDim}>
                                                    {find.count > 1 ? `×${fmt(find.count)}` : ''}
                                                </BoardLabel>
                                                <FlapText
                                                    text={fmtDate(find.at) || '—'}
                                                    size={14} tone={DECK.inkMid} weight={600}
                                                    delay={380 + i * 40}
                                                    style={{ justifyContent: 'flex-end' }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Panel>

                            {/* No "View all" here: the head's Achievements button and every mark below open the same modal. */}
                            <Panel title="Achievements">
                                {userAchievements.length === 0 ? (
                                    <BoardLabel tone={DECK.inkMid}>None unlocked yet</BoardLabel>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
                                            <FlapText
                                                text={achievementSummary?.total
                                                    ? `${fmt(userAchievements.length)}/${fmt(achievementSummary.total)}`
                                                    : fmt(userAchievements.length)}
                                                size={20} tone={DECK.ink} plate delay={400}
                                            />
                                            <BoardLabel tone={DECK.inkMid}>Unlocked</BoardLabel>
                                        </div>
                                        {/* Every mark opens the full list: a tooltip-only name is unreadable on a phone, and each mark is a tab stop so the sr-only name is keyboard-reachable. */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {userAchievements.slice(0, isPhone ? 8 : 12).map((a, idx) => (
                                                <Plinth
                                                    key={a.id || `hidden-${idx}`}
                                                    as="button"
                                                    className="fib-board-hit"
                                                    onClick={() => setShowAchievements(true)}
                                                    // A censored achievement is one the player earned and a visitor may not see by name; it keeps its slot so the count adds up.
                                                    title={a.censored ? 'Hidden achievement' : a.name}
                                                    style={{
                                                        width: '34px', height: '34px',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: a.censored ? DECK.inkDim : DECK.inkMid,
                                                    }}
                                                >
                                                    <span className="fib-sr-only">
                                                        {a.censored ? 'Hidden achievement' : a.name}
                                                    </span>
                                                    {a.censored
                                                        ? <HelpCircle size={14} />
                                                        : <AchievementIcon name={a.icon} size={15} color="currentColor" />}
                                                </Plinth>
                                            ))}
                                            {userAchievements.length > (isPhone ? 8 : 12) && (
                                                <span style={{ display: 'flex', alignItems: 'center', paddingLeft: '4px' }}>
                                                    <BoardLabel tone={DECK.inkMid}>
                                                        +{fmt(userAchievements.length - (isPhone ? 8 : 12))} more
                                                    </BoardLabel>
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </Panel>
                        </div>
                        {/* ── THE CASE: WHAT IS FINISHED ──────────────────── */}
                        <div style={{ minWidth: 0, gridArea: 'caseRest' }}>
                            {/* THE BANNERS are kept as they were (owner-pinned): the border is a deliberate exception to the Nocturne's no-border rule, not an oversight to fix; only the radius went. */}
                            {completedTiers.length > 0 && (
                                <Panel title="Completed collections">
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {completedTiers.map(key => (
                                            <CompletionBanner
                                                key={key}
                                                rarity={key}
                                                total={specialItemTotals[key]}
                                            />
                                        ))}
                                    </div>
                                </Panel>
                            )}

                        </div>

                    </div>
                </div>
            </div>

            {/* ── BADGE EDITOR ──────────────────────────────────────────────── */}
            {showBadgeEditor && (
                <EditorSheet
                    title="Equip badges"
                    hint={`${pendingBadges.length} of 3 chosen`}
                    onCancel={() => setShowBadgeEditor(false)}
                    onSave={saveBadges}
                    isPhone={isPhone}
                >
                    {userAchievements.length === 0 ? (
                        <BoardLabel tone={DECK.inkMid}>No achievements unlocked yet</BoardLabel>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '8px' }}>
                            {userAchievements.filter(a => a.id).map(a => {
                                const picked = pendingBadges.includes(a.id);
                                return (
                                    <Plinth
                                        key={a.id}
                                        as="button"
                                        className="fib-board-hit"
                                        live={picked}
                                        aria-pressed={picked}
                                        onClick={() => toggleBadge(a.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '10px 12px', textAlign: 'left',
                                            color: picked ? DECK.ink : DECK.inkMid,
                                        }}
                                    >
                                        <AchievementIcon name={a.icon} size={16} color="currentColor" />
                                        <span style={{ minWidth: 0, flex: 1 }}>
                                            <BoardLabel size={12} tone="currentColor">{a.name}</BoardLabel>
                                        </span>
                                        {picked && <Check size={13} color={DECK.amber} />}
                                    </Plinth>
                                );
                            })}
                        </div>
                    )}
                </EditorSheet>
            )}

            {/* ── SHOWCASE EDITOR ───────────────────────────────────────────── */}
            {showShowcaseEditor && (
                <EditorSheet
                    title="Choose showcase items"
                    hint={`${pendingShowcase.length} of 3 chosen`}
                    onCancel={() => setShowShowcaseEditor(false)}
                    onSave={saveShowcase}
                    isPhone={isPhone}
                >
                    {/* The slots REMOVE and the grid ADDS: a showcase holds three picks, not a set, so a toggle tile would make a second copy unreachable. Removal is by slot, not by item. */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        paddingBottom: '14px', marginBottom: '4px',
                        boxShadow: `inset 0 -1px 0 ${rail(0.07)}`,
                    }}>
                        {[0, 1, 2].map(idx => {
                            const texture = pendingShowcase[idx];
                            const item = texture && userCollection.find(i => i.item_texture === texture);
                            if (!item) {
                                return <ShowcaseMount key={idx} empty size={52} />;
                            }
                            return (
                                <button
                                    key={`${texture}-${idx}`}
                                    type="button"
                                    onClick={() => removeShowcaseSlot(idx)}
                                    aria-label={`Remove ${item.item_name} from slot ${idx + 1}`}
                                    title="Remove from showcase"
                                    className="fib-board-hit"
                                    style={{ position: 'relative', background: 'none', border: 0, padding: 0 }}
                                >
                                    <ShowcaseMount
                                        tier={item.item_type}
                                        name={item.item_name}
                                        src={getShowcaseImageUrl(item)}
                                        size={52}
                                    />
                                    <span
                                        aria-hidden="true"
                                        style={{
                                            position: 'absolute', right: '-3px', top: '-3px',
                                            width: '16px', height: '16px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: DECK.amber, color: '#141414',
                                        }}
                                    ><X size={11} /></span>
                                </button>
                            );
                        })}
                        <BoardLabel tone={DECK.inkDim} style={{ marginLeft: '4px' }}>
                            {pendingShowcase.length < 3 ? 'Pick from below' : 'Click a slot to clear it'}
                        </BoardLabel>
                    </div>

                    {userCollection.length === 0 ? (
                        <BoardLabel tone={DECK.inkMid}>No special items collected yet</BoardLabel>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {userCollection.map(item => {
                                const picked = pendingShowcase.filter(t => t === item.item_texture).length;
                                const owned = item.count || 1;
                                // You may show a copy for every copy you hold, up to the three slots; the tile says which limit it hit.
                                const canAdd = picked < owned && pendingShowcase.length < 3;
                                return (
                                    <button
                                        key={item.item_texture}
                                        type="button"
                                        onClick={() => addShowcaseItem(item.item_texture, owned)}
                                        disabled={!canAdd}
                                        aria-label={[
                                            item.item_name,
                                            RARITY[item.item_type]?.label || item.item_type,
                                            owned > 1 ? `${owned} held` : null,
                                            picked > 0 ? `${picked} in showcase` : null,
                                        ].filter(Boolean).join(' — ')}
                                        className={canAdd ? 'fib-board-hit' : undefined}
                                        style={{
                                            position: 'relative', background: 'none', border: 0, padding: 0,
                                            opacity: canAdd ? 1 : 0.45,
                                            cursor: canAdd ? 'pointer' : 'default',
                                        }}
                                    >
                                        <ShowcaseMount
                                            tier={item.item_type}
                                            name={item.item_name}
                                            src={getShowcaseImageUrl(item)}
                                            size={52}
                                            quiet={!picked}
                                        />
                                        {owned > 1 && (
                                            <span
                                                aria-hidden="true"
                                                style={{
                                                    position: 'absolute', left: '2px', bottom: '2px',
                                                    padding: '0 3px', background: 'rgba(0,0,0,0.72)',
                                                }}
                                            >
                                                <BoardLabel size={12} tone={DECK.inkMid}>×{owned}</BoardLabel>
                                            </span>
                                        )}
                                        {/* How many are IN the showcase, top
                                            right, in the board's own signal. */}
                                        {picked > 0 && (
                                            <span
                                                aria-hidden="true"
                                                style={{
                                                    position: 'absolute', right: '-3px', top: '-3px',
                                                    minWidth: '16px', height: '16px', padding: '0 3px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: DECK.amber,
                                                }}
                                            >
                                                <BoardLabel size={10} tone="#141414">{picked}</BoardLabel>
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </EditorSheet>
            )}

            {showLuckInfoModal && (
                <LuckInfoModal
                    onClose={() => setShowLuckInfoModal(false)}
                    luckRating={luckRating}
                    isMobile={isPhone}
                />
            )}

            {showAchievements && (
                <Achievements
                    onClose={() => setShowAchievements(false)}
                    userId={userId}
                    username={profile.custom_username}
                    isOwnProfile={isOwnProfile}
                />
            )}

            {showCollectionBook && collectionBookData && (
                <CollectionBook
                    collection={collectionBookData.collection}
                    collectionDetails={collectionBookData.collectionDetails}
                    stats={collectionBookData.stats}
                    dryStreaks={collectionBookData.dryStreaks}
                    allItems={collectionBookData.allItems}
                    dynamicItems={collectionBookData.dynamicItems}
                    viewingUser={profile.custom_username}
                    viewingUserId={userId}
                    onClose={() => {
                        setShowCollectionBook(false);
                        setCollectionBookData(null);
                    }}
                />
            )}
        </div>
    );
}

// The head's supporting register: figures about SPINNING at 20px against the collection figures' 27 (the 1.35 ratio).
function SpinRegister({ figures, size = 20, align = 'left' }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
            flex: '0 0 auto',
        }}>
            {figures.map((f, i) => (
                <div
                    key={f.label}
                    style={{
                        padding: i === 0 ? '0 18px 0 0' : '0 18px',
                        boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                        ...(i === figures.length - 1 ? { paddingRight: 0 } : null),
                        textAlign: align === 'right' ? 'right' : 'left',
                    }}
                >
                    <FlapText
                        text={f.value}
                        size={size}
                        tone={DECK.inkMid}
                        weight={700}
                        delay={180 + i * 40}
                        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
                    />
                    <div style={{ marginTop: '6px' }}>
                        <BoardLabel>{f.label}</BoardLabel>
                    </div>
                </div>
            ))}
        </div>
    );
}

// A section of the board: a tracked heading over a seam. Not a card.
function Panel({ title, action, children }) {
    return (
        <section style={{ paddingTop: '22px' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '12px', paddingBottom: '10px',
            }}>
                <BoardLabel>{title}</BoardLabel>
                {action || null}
            </div>
            {children}
        </section>
    );
}

/** A panel's one control. Quiet by default, the board's amber on focus. */
function PanelAction({ onClick, label, children }) {
    return (
        <Plinth
            as="button"
            className="fib-board-hit"
            onClick={onClick}
            aria-label={label}
            style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '0 9px', height: '28px', color: DECK.inkMid,
            }}
        >
            <BoardLabel size={12} tone="currentColor" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {children}
            </BoardLabel>
        </Plinth>
    );
}

// One figure in the record, with the field it stands against.
function RecordFigure({ label, value, note, tone, onInfo, first }) {
    return (
        <div style={{
            padding: '0 18px',
            boxShadow: first ? undefined : `inset 1px 0 0 ${rail(0.07)}`,
            ...(first ? { paddingLeft: 0 } : null),
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FlapText text={value} size={22} tone={tone || DECK.ink} weight={700} plate delay={360} />
                {onInfo && (
                    <button
                        type="button"
                        onClick={onInfo}
                        aria-label="How the luck rating is calculated"
                        className="fib-board-hit"
                        style={{
                            background: 'none', border: 0, padding: '2px',
                            display: 'flex', color: DECK.inkDim, cursor: 'pointer',
                        }}
                    ><HelpCircle size={12} /></button>
                )}
            </div>
            <div style={{ marginTop: '7px', display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <BoardLabel>{label}</BoardLabel>
                {note && <BoardLabel tone={DECK.inkMid}>{note}</BoardLabel>}
            </div>
        </div>
    );
}

// An item in a case: a square mount in a rim of its own tier (DESIGN.md §9). Colour is a custom property and every visual property is a class, since each has a state.
function ShowcaseMount({ tier, name, src, size = 56, empty, onClick, quiet }) {
    if (empty) {
        const Tag = onClick ? 'button' : 'div';
        return (
            <Tag
                onClick={onClick}
                type={onClick ? 'button' : undefined}
                aria-label={onClick ? 'Add an item to your showcase' : undefined}
                className={`fib-mount fib-mount--empty${onClick ? ' fib-board-hit' : ''}`}
                style={{
                    width: `${size}px`, height: `${size}px`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: DECK.inkDim, padding: 0,
                }}
            >
                {onClick ? <Plus size={15} /> : null}
            </Tag>
        );
    }

    const holo = isIridescentRarity(tier);
    const variant = holo ? 'holo'
        : tier === 'mythic' ? 'shimmer'
        : tier === 'legendary' ? 'steady'
        : 'pulse';

    return (
        <span
            className={`fib-mount fib-mount--${variant}${quiet ? ' is-quiet' : ''}`}
            title={`${name} — ${RARITY[tier]?.label || tier}`}
            style={{
                width: `${size}px`, height: `${size}px`,
                '--fib-mount-tone': getRarityColor(tier),
            }}
        >
            <span className="fib-mount-face">
                <img
                    src={src}
                    alt={name}
                    style={{
                        width: `${Math.round(size * 0.7)}px`,
                        height: `${Math.round(size * 0.7)}px`,
                        imageRendering: 'pixelated',
                    }}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `${IMAGE_BASE_URL}/barrier.png`;
                    }}
                />
            </span>
        </span>
    );
}

// A sheet over the board for the two editing tasks (pick up to three of a large set); wears the board's own material.
function EditorSheet({ title, hint, onCancel, onSave, isPhone, children }) {
    // Capture phase, so this listener runs before the board's own window handler and dismisses only the sheet; stopPropagation stops the bubbling one.
    useEffect(() => {
        const onKey = e => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onCancel();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onCancel]);

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onCancel()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1200, padding: isPhone ? 0 : '20px',
            }}
        >
            <div
                style={{
                    width: '100%', maxWidth: '620px',
                    maxHeight: isPhone ? '100%' : 'min(80vh, 640px)',
                    display: 'flex', flexDirection: 'column',
                    backgroundImage: DECK.face,
                    boxShadow: [
                        `inset 0 1px 0 ${rail(0.12)}`,
                        'inset 0 -2px 0 rgba(0,0,0,0.55)',
                        '0 32px 80px rgba(0,0,0,0.65)',
                    ].join(', '),
                    overflow: 'hidden',
                }}
            >
                <div style={{
                    flex: '0 0 auto',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '12px', padding: '18px 20px 14px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', minWidth: 0 }}>
                        <FlapText text={title} size={18} tone={DECK.ink} weight={800} />
                        <BoardLabel tone={DECK.inkMid}>{hint}</BoardLabel>
                    </div>
                    <Plinth
                        as="button"
                        className="fib-board-hit"
                        onClick={onCancel}
                        aria-label="Close without saving"
                        style={{
                            width: '32px', height: '32px', flex: '0 0 auto',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: DECK.inkMid,
                        }}
                    ><X size={15} /></Plinth>
                </div>

                <div
                    className="fib-board-scroll"
                    style={{
                        flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
                        padding: '4px 20px 18px',
                        background: 'rgba(0,0,0,0.30)',
                        boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
                    }}
                >
                    {children}
                </div>

                <div style={{
                    flex: '0 0 auto',
                    display: 'flex', justifyContent: 'flex-end', gap: '8px',
                    padding: '14px 20px',
                }}>
                    <Plinth
                        as="button"
                        className="fib-board-hit"
                        onClick={onCancel}
                        style={{ padding: '0 14px', height: '32px', display: 'flex', alignItems: 'center', color: DECK.inkMid }}
                    ><BoardLabel tone="currentColor">Cancel</BoardLabel></Plinth>
                    <Plinth
                        as="button"
                        className="fib-board-hit"
                        live
                        onClick={onSave}
                        style={{ padding: '0 14px', height: '32px', display: 'flex', alignItems: 'center', color: DECK.amber }}
                    ><BoardLabel tone="currentColor">Save</BoardLabel></Plinth>
                </div>
            </div>
        </div>
    );
}

// "<Tier> Collection Complete!" banner, one per finished tier, driven by `rarity`; colours come from RARITY, never COLORS directly. Kept at the owner's request; the border is a deliberate exception to the no-border rule.
function CompletionBanner({ rarity, total }) {
    const stops = getRarityStops(rarity);
    const color = getRarityColor(rarity);
    const ink = getRarityInk(rarity);

    // An animated tier is painted with its WHOLE ramp, never one sampled point; flat tiers keep the two-step gradient.
    const medallion = stops
        ? `linear-gradient(135deg, ${stops.join(', ')})`
        : `linear-gradient(135deg, ${color}, ${color}bb)`;
    const wash = stops
        ? `linear-gradient(135deg, ${stops.map(stop => `${stop}22`).join(', ')})`
        : `linear-gradient(135deg, ${color}22, ${color}11)`;

    return (
        <div
            className="completion-banner"
            style={{
                background: wash,
                border: `1px solid ${color}55`,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'relative',
                overflow: 'hidden'
            }}
        >
            <div style={{
                width: '34px', height: '34px',
                background: medallion,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 0 15px ${color}66`,
                flex: '0 0 auto',
            }}>
                {/* The trophy sits on the tier's fill, so it takes the on-colour step, not the ink step. */}
                <Trophy size={17} color={getRarityOnColor(rarity)} />
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{
                    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                    color: ink,
                    fontSize: '15px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    textShadow: `0 0 10px ${color}44`
                }}>
                    {RARITY[rarity].label} Collection Complete!
                </div>
                <div style={{ marginTop: '3px' }}>
                    <BoardLabel tone={DECK.inkMid}>
                        All {total} {RARITY[rarity].label.toLowerCase()} items collected
                    </BoardLabel>
                </div>
            </div>
            <div style={{ marginLeft: 'auto', opacity: 0.7, display: 'flex' }}>
                {getRarityIcon(rarity, 16)}
            </div>
        </div>
    );
}
