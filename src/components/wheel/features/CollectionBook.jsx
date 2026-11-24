// THE CONCOURSE: the collection board, a departure board rather than a card of tiles. The register (held, missing, how long since, overdue) is the chase; the platform below it is the case.
// A row lamp goes amber when a tier is OVERDUE, computed not felt: the reciprocal of the tier's summed chance is the expected wait, and a dry streak past it is overdue; both numbers are in the row title. Insane is exempt (its expectation exceeds any lifetime spin count).

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { IMAGE_BASE_URL, INSANE_ITEMS, MYTHIC_ITEMS, TEAM_MEMBERS, EXOTIC_ITEMS, RELIC_ITEMS, RARE_MEMBERS, API_BASE_URL } from '../../../config/constants.js';
import { COLORS, DECK, rail, SURFACE_NOISE } from '../config/constants';
import { formatChance, getItemImageUrl } from '../../../utils/helpers.js';
import { RARITY, getRarityColor, getRarityInk, getRarityOrder } from '../../../utils/rarityHelpers.jsx';
import { X, Search, Sparkles, Coins, Crown, Gift } from 'lucide-react';
import { CanvasCollectionGrid } from '../canvas/CanvasCollectionGrid.jsx';
import { FlapText, BoardLabel, RowLamp, BoardMeter, Plinth, Segmented } from './collection/FlapBoard.jsx';
import { prestigeLabel, prestigeName, prestigeColor, prestigeInk, prestigeIcon, isIridescentPrestige, MAX_PRESTIGE_LEVEL } from '../../../utils/prestigeHelpers.js';
import { PrestigeAscension } from './collection/PrestigeAscension.jsx';
import { useWheelViewport } from '../config/breakpoints.js';

// Register order. Common is included: it is 1,536 of 1,559 items.
const REGISTER_ORDER = ['insane', 'mythic', 'legendary', 'relic', 'exotic', 'rare', 'common'];

/* A prestige level is worn as a numeral, not a digit: "II" reads as a rank where
   "2" reads as a quantity, and the badge sits beside counts that are quantities. */
/* One frozen empty object, so "no prestige data yet" has a stable identity and
   does not invalidate a memo simply by being absent. */
const EMPTY = Object.freeze({});

// Tiers that count as a special pull, spelled out: 'regular' (wheel tables) and 'common' (this board's roster) both name commons.
const SPECIAL_TYPES = new Set(['insane', 'mythic', 'legendary', 'relic', 'exotic', 'rare']);

// Tiers with no dry streak: insane (the streak is the whole spin count) and common (the backend tracks none).
const NO_STREAK = new Set(['insane', 'common']);

function fmt(n) {
    return typeof n === 'number' && isFinite(n) ? n.toLocaleString('en-US') : '0';
}

function fmtDate(dateStr, withTime = false) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    const date = d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
    if (!withTime) return date;
    return `${date} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

// THE PLAQUE: one item on a lit plinth with its tier light rising from the floor, as on the reel; facts in the register's ruled columns.
function ItemPlaque({ item, details, onClose, lucky = false, luckyOdds = null }) {
    const collected = details && details.count > 0;
    const tone = getRarityColor(item.type);
    const ink = getRarityInk(item.type);
    const isSpecial = item.type && item.type !== 'common';
    const label = (RARITY[item.type] || RARITY.common).label;
    const imageUrl = getItemImageUrl(item);

    useEffect(() => {
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // On the Lucky lens all three facts change subject: the count is lucky pulls, and the drop rate is the flat table's (an insane's weighted rate would be wrong by six orders of magnitude).
    const facts = lucky
        ? [
            { label: 'Lucky pulls', value: collected ? String(details.count) : '0', tone: collected ? DECK.ink : DECK.inkDim },
            { label: 'Lucky odds', value: luckyOdds ? `${formatChance(luckyOdds)}%` : '—', tone: isSpecial ? ink : DECK.inkMid },
            { label: 'Last lucky pull', value: collected ? (fmtDate(details?.lastPulled, true) || '—') : '—', tone: DECK.inkMid },
        ]
        : [
            { label: 'Copies held', value: collected ? String(details.count) : '0', tone: collected ? DECK.ink : DECK.inkDim },
            { label: 'Drop rate', value: item.chance ? `${formatChance(item.chance)}%` : '—', tone: isSpecial ? ink : DECK.inkMid },
            { label: 'First pull', value: collected ? (fmtDate(details?.firstObtained, true) || '—') : '—', tone: DECK.inkMid },
        ];

    return (
        <div
            onClick={e => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-label={`${item.name} details`}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1100, padding: '20px', animation: 'fadeIn 0.2s ease-out',
            }}
        >
            <div style={{
                width: '100%', maxWidth: '380px',
                backgroundImage: DECK.face,
                boxShadow: `inset 0 1px 0 ${rail(0.12)}, 0 24px 60px rgba(0,0,0,0.6)`,
                animation: 'slideUp 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
            }}>
                {/* The tier light rises from the floor line like a reel slot; a common gets none. */}
                <div style={{
                    position: 'relative', height: '162px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                }}>
                    {isSpecial && collected && (
                        <>
                            {/* A radial, not a linear wash: a one-axis gradient ends in two hard vertical edges. */}
                            <div aria-hidden="true" style={{
                                position: 'absolute', inset: 0,
                                background: `radial-gradient(ellipse 58% 78% at 50% 100%, ${tone}5E 0%, ${tone}1C 46%, ${tone}00 78%)`,
                            }} />
                            {/* The emitter is the width of the light it throws, never the full plaque. */}
                            <div aria-hidden="true" style={{
                                position: 'absolute', left: '22%', right: '22%', bottom: 0, height: '2px',
                                background: tone, boxShadow: `0 0 16px ${tone}`,
                            }} />
                        </>
                    )}
                    <img
                        src={imageUrl}
                        alt=""
                        style={{
                            position: 'relative', width: '84px', height: '84px',
                            imageRendering: item.username ? 'auto' : 'pixelated',
                            opacity: collected ? 1 : 0.22,
                            filter: collected ? 'none' : 'grayscale(100%)',
                        }}
                        onError={e => { e.target.onerror = null; e.target.src = `${IMAGE_BASE_URL}/barrier.png`; }}
                    />
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="fib-board-hit"
                        style={{
                            position: 'absolute', top: 0, right: 0, width: '34px', height: '34px',
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: DECK.inkDim, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    ><X size={15} /></button>
                </div>

                <div style={{ padding: '14px 18px 18px', boxShadow: `inset 0 1px 0 ${rail(0.07)}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '2px' }}>
                        <FlapText
                            text={item.name}
                            size={16}
                            tone={collected ? DECK.ink : DECK.inkDim}
                            weight={700}
                            style={{ minWidth: 0, overflow: 'hidden' }}
                        />
                    </div>
                    <BoardLabel tone={isSpecial ? ink : DECK.inkDim}>
                        {label}{!collected && (lucky ? ' - not landed on a lucky spin' : ' — not collected')}
                    </BoardLabel>

                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                        marginTop: '16px',
                    }}>
                        {facts.map((f, i) => (
                            <div key={f.label} style={{
                                padding: '0 12px',
                                // Cells are divided by a rule, never boxed.
                                boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                                ...(i === 0 ? { paddingLeft: 0 } : null),
                            }}>
                                <FlapText text={f.value} size={16} tone={f.tone} digits={false} />
                                <div style={{ marginTop: '5px' }}>
                                    <BoardLabel>{f.label}</BoardLabel>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Two lamps rather than chips: a tinted pill would be the one boxed object on the surface. */}
                    {collected && (details?.isLucky || details?.is_lucky === 1 || details?.isGoldRush || details?.is_gold_rush === 1) && (
                        <div style={{ display: 'flex', gap: '16px', marginTop: '16px', paddingTop: '12px', boxShadow: `inset 0 1px 0 ${rail(0.07)}` }}>
                            {/* A box pull is lucky too (is_lucky = 1, for the luck statistics), so the box is named instead of the spin, never beside it. */}
                            {(details?.isMystery || details?.is_mystery === 1) ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: COLORS.mystery }}>
                                    <Gift size={12} />
                                    <BoardLabel tone={COLORS.mystery}>Mystery box</BoardLabel>
                                </span>
                            ) : (details?.isLucky || details?.is_lucky === 1) && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: COLORS.green }}>
                                    <Sparkles size={12} />
                                    <BoardLabel tone={COLORS.green}>Lucky spin</BoardLabel>
                                </span>
                            )}
                            {(details?.isGoldRush || details?.is_gold_rush === 1) && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: DECK.amber }}>
                                    <Coins size={12} />
                                    <BoardLabel tone={DECK.amber}>Gold rush</BoardLabel>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function CollectionBook({ collection, collectionDetails, stats, dryStreaks: dryStreaksProp, allItems, dynamicItems, onClose, viewingUser, viewingUserId }) {
    const [tierFilter, setTierFilter] = useState(null);
    const [have, setHave] = useState('all');
    const [sort, setSort] = useState('rarity');
    const [search, setSearch] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    // The canvas calls up only when the index changes, so this is a few renders per sweep.
    const [readout, setReadout] = useState(null);

    // `scope` is which collection the register and platform read: a lens over the same board, not a second board.
    const [prestige, setPrestige] = useState(null);
    const [scope, setScope] = useState('main');
    const [prestigeData, setPrestigeData] = useState(null);
    const [viewLevel, setViewLevel] = useState(null);
    // The level currently detonating, or null; the register behind the overlay is already the new one.
    const [ascending, setAscending] = useState(null);
    const [starting, setStarting] = useState(false);
    // `null` until the fetch answers (and on failure), never zeros: zeros read as 'just pulled one' and no tier could be overdue.
    const [ownDryStreaks, setOwnDryStreaks] = useState(null);
    // The Lucky ledger (GET /api/lucky): every lucky spin's outcome, rolled up.
    // `null` until it answers, and the lens is not offered until it does.
    const [luckyData, setLuckyData] = useState(null);
    const { isPhone } = useWheelViewport();
    const platformRef = useRef(null);
    const [platformHeight, setPlatformHeight] = useState(360);

    // The lens: everything below reads `activeCollection`, so register, platform, head, search and sort work on whichever collection is in view.
    const prestigeView = scope === 'prestige';
    // LUCKY, the third lens: counts are lucky pulls, streaks are in lucky spins, expectations use the flat table a lucky spin draws from. Commons are off this board (1,500 tiles of misses); their count is the hit rate's denominator in the head.
    const luckyView = scope === 'lucky';
    // Memoised: the `|| {}` fallback mints a new object each render and three memos key off it (the sort over 1,559 items would rerun per keystroke).
    // The ledger arrives keyed by texture with its own field names; shaped once into the board's collection/details pair.
    const luckyCollection = useMemo(() => {
        const counts = {};
        const details = {};
        for (const [texture, i] of Object.entries(luckyData?.items || EMPTY)) {
            counts[texture] = i.count;
            details[texture] = { count: i.count, name: i.name, type: i.type, firstObtained: i.first, lastPulled: i.last };
        }
        return { counts, details };
    }, [luckyData]);
    const activeCollection = useMemo(
        () => (prestigeView ? (prestigeData?.collection || EMPTY)
            : luckyView ? luckyCollection.counts
            : collection),
        [prestigeView, prestigeData, luckyView, luckyCollection, collection],
    );
    const activeDetails = useMemo(
        () => (prestigeView ? (prestigeData?.collectionDetails || EMPTY)
            : luckyView ? luckyCollection.details
            : collectionDetails),
        [prestigeView, prestigeData, luckyView, luckyCollection, collectionDetails],
    );

    // On someone else's board their streaks arrive as a prop (/api/dry-streaks answers only for the session); when absent the answer is nothing, not zeros: a wrong number is worse than a dash.
    const dryStreaks = dryStreaksProp || (viewingUser ? null : ownDryStreaks);

    useEffect(() => {
        // Never fetch for someone else: /api/dry-streaks answers for the session and would show the viewer's own streaks.
        if (viewingUser || dryStreaksProp) return;

        async function fetchDryStreaks() {
            try {
                const res = await fetch(`${API_BASE_URL}/api/dry-streaks`, { credentials: 'include' });
                if (res.ok) setOwnDryStreaks(await res.json());
            } catch (err) {
                // Left null on purpose: the register prints an absence as a dash.
                console.error('Failed to fetch dry streaks:', err);
            }
        }
        fetchDryStreaks();
    }, [viewingUser, dryStreaksProp]);

    // Prestige state for this board's player; every prestige control is gated on it, so failure leaves the pre-feature surface.
    const loadPrestige = useCallback(async () => {
        try {
            const url = viewingUserId
                ? `${API_BASE_URL}/api/prestige/user/${viewingUserId}`
                : `${API_BASE_URL}/api/prestige`;
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return null;
            const data = await res.json();
            setPrestige(data);
            return data;
        } catch (err) {
            console.error('Failed to load prestige state:', err);
            return null;
        }
    }, [viewingUserId]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const url = viewingUserId
                ? `${API_BASE_URL}/api/prestige/user/${viewingUserId}`
                : `${API_BASE_URL}/api/prestige`;
            try {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) setPrestige(data);
            } catch (err) {
                console.error('Failed to load prestige state:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [viewingUserId]);

    // Lucky ledger fetched up front: whether to offer the lens depends on it, so there is no empty third option.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const url = viewingUserId
                ? `${API_BASE_URL}/api/user/${viewingUserId}/lucky`
                : `${API_BASE_URL}/api/lucky`;
            try {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) setLuckyData(data);
            } catch (err) {
                // Left null: the board is simply the board without the lens.
                console.error('Failed to load lucky ledger:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [viewingUserId]);

    // The run's own collection, whenever the lens is on it.
    useEffect(() => {
        if (scope !== 'prestige' || !prestige) return undefined;
        const level = viewLevel || prestige.activeRun?.level || prestige.level;
        if (!level) return undefined;

        let cancelled = false;
        (async () => {
            try {
                const url = viewingUserId
                    ? `${API_BASE_URL}/api/prestige/collection/${viewingUserId}?level=${level}`
                    : `${API_BASE_URL}/api/prestige/collection?level=${level}`;
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (!cancelled) setPrestigeData(data);
            } catch (err) {
                console.error('Failed to load prestige collection:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [scope, prestige, viewLevel, viewingUserId]);

    useEffect(() => {
        // Escape closes the board, except during the prestige ceremony, where closing IS skipping it; the overlay swallows the key too (a second lock, since the handlers are on different elements).
        const onKey = e => { if (e.key === 'Escape' && !ascending) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, ascending]);

    // Measured, not declared: the canvas needs a pixel height and its mount flexes (DESIGN.md §8).
    useEffect(() => {
        const el = platformRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(entries => {
            for (const e of entries) setPlatformHeight(Math.max(160, e.contentRect.height));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Memoize special items list - only recalculate when dynamicItems changes
    const { tierItems, allItemsWithSpecial } = useMemo(() => {
        const hasApiData = dynamicItems && dynamicItems.length > 0;

        // One mapper per source instead of four near-identical filter/map pairs.
        const fromApi = tier => dynamicItems.filter(i => i.rarity === tier).map(i => ({
            name: i.name, texture: i.texture, type: tier,
            chance: i.display_chance || i.chance,
            username: i.username, imageUrl: i.image_url || i.imageUrl
        }));
        // `m.texture ||` is not padding: ChromaRGBDirt and the Wandering Trader have no username, so the template built `special_null` for both. Prefer the real texture from constants.js.
        const fromMembers = (members, tier, prefix) => members.map(m => ({
            name: m.name, texture: m.texture || `${prefix}_${m.username}`, type: tier,
            username: m.username, chance: m.chance, imageUrl: m.imageUrl
        }));

        let insane, mythic, legendary, relic, exotic, rare;

        if (hasApiData) {
            insane = fromApi('insane');
            mythic = fromApi('mythic');
            legendary = fromApi('legendary');
            relic = fromApi('relic');
            exotic = fromApi('exotic');
            rare = fromApi('rare');
        } else {
            insane = INSANE_ITEMS.map(i => ({ ...i, texture: i.texture, type: 'insane' }));
            mythic = MYTHIC_ITEMS.map(m => ({ ...m, texture: m.texture }));
            legendary = fromMembers(TEAM_MEMBERS, 'legendary', 'special');
            // Exotic is a list of items, not members — its textures are already
            // whole, so it maps like INSANE_ITEMS rather than through fromMembers.
            exotic = EXOTIC_ITEMS.map(i => ({ ...i, type: 'exotic' }));
            // Same shape as exotic: whole textures, not member names.
            relic = RELIC_ITEMS.map(i => ({ ...i, type: 'relic' }));
            rare = fromMembers(RARE_MEMBERS, 'rare', 'rare');
        }

        // The pool's items carry no `type`, and the register needs one — a common
        // is a tier like any other on this board, not the absence of a tier.
        const commons = allItems.map(i => (i.type ? i : { ...i, type: 'common' }));

        return {
            tierItems: { insane, mythic, legendary, relic, exotic, rare, common: commons },
            allItemsWithSpecial: [...insane, ...mythic, ...legendary, ...relic, ...exotic, ...rare, ...commons],
        };
    }, [dynamicItems, allItems]);

    // What the platform and the totals count over: every item on the main and
    // prestige boards, only the specials on the Lucky lens (see its note above).
    const rosterItems = useMemo(
        () => (luckyView ? allItemsWithSpecial.filter(i => i.type !== 'common') : allItemsWithSpecial),
        [luckyView, allItemsWithSpecial],
    );
    // The flat table's size: a lucky spin picks uniformly from every collectible,
    // so one item's chance is one over this, and a tier's is its size over this.
    const luckyPoolSize = allItemsWithSpecial.length;

    const register = useMemo(() => REGISTER_ORDER
        .map(key => {
            const items = tierItems[key] || [];
            if (items.length === 0) return null;
            if (luckyView && key === 'common') return null;

            const held = items.filter(i => activeCollection[i.texture] > 0).length;
            const missing = items.length - held;

            // Only the signed-in player's payload carries first_obtained; another player's details have no timestamps, so this is absent, not wrong.
            let last = null;
            for (const i of items) {
                const at = activeDetails?.[i.texture]?.firstObtained;
                if (at && (!last || new Date(at) > new Date(last))) last = at;
            }
            // On the Lucky lens "last pull" is the last time a lucky spin landed
            // this tier, repeats included - the ledger carries it per tier.
            if (luckyView) last = luckyData?.tiers?.[key]?.last || null;

            // Expected spins between pulls = 1 / the tier's summed chance. `chance` is a FRACTION, not a percentage (`formatChance` multiplies by 100). A lucky spin ignores `chance`: odds are the tier's size over the pool, counted in lucky spins, and insane is no longer exempt.
            const chanceSum = luckyView
                ? (luckyPoolSize > 0 ? items.length / luckyPoolSize : 0)
                : items.reduce((sum, i) => sum + (Number(i.chance) || 0), 0);
            const expected = chanceSum > 0 ? Math.round(1 / chanceSum) : null;
            // `?? null`, not `?? 0`: a missing key is an absence the register prints as a dash; a real streak of 0 still prints 0. A tier the ledger never saw has waited every lucky spin taken.
            const since = luckyView
                ? (luckyData ? (luckyData.tiers?.[key]?.since ?? luckyData.spins) : null)
                : NO_STREAK.has(key) ? null : (dryStreaks?.[key] ?? null);
            const overdue = expected != null && since != null && since > expected;

            // Complete outranks overdue: the status column has room for one word, so the wait is marked on SINCE; `overdue` travels separately from `status`.
            const status = held === 0 ? 'empty'
                : missing === 0 ? 'complete'
                : overdue ? 'overdue'
                : 'tracking';

            return {
                key, items, held, missing, total: items.length, last, since, expected, status, overdue,
                tone: getRarityColor(key),
                ink: getRarityInk(key),
                label: RARITY[key].label,
            };
        })
        .filter(Boolean), [tierItems, activeCollection, activeDetails, dryStreaks, luckyView, luckyData, luckyPoolSize]);

    const totals = useMemo(() => {
        const total = rosterItems.length;
        const held = rosterItems.filter(i => activeCollection[i.texture] > 0).length;
        const specials = ['insane', 'mythic', 'legendary', 'relic', 'exotic', 'rare']
            .reduce((sum, k) => sum + (stats?.[`${k}Count`] || 0), 0);
        return {
            held,
            total,
            missing: total - held,
            pct: total > 0 ? (held / total) * 100 : 0,
            spins: stats?.totalSpins || 0,
            dupes: stats?.totalDuplicates || 0,
            // Every tier the label calls a special, exotic included: leaving one out inflated the average.
            perSpecial: specials > 0 ? (stats.totalSpins / specials).toFixed(1) : null,
        };
    }, [rosterItems, activeCollection, stats]);

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = rosterItems.filter(item => {
            if (q && !item.name.toLowerCase().includes(q)) return false;
            const count = activeCollection[item.texture] || 0;
            if (have === 'held' && count === 0) return false;
            if (have === 'missing' && count > 0) return false;
            if (tierFilter && item.type !== tierFilter) return false;
            return true;
        });

        // `lastPulled` exists only on the Lucky lens, where "recent" means the
        // latest lucky pull rather than the first copy ever held.
        const at = item => {
            const d = activeDetails?.[item.texture]?.lastPulled || activeDetails?.[item.texture]?.firstObtained;
            return d ? new Date(d).getTime() : 0;
        };

        return filtered.sort((a, b) => {
            if (sort === 'recent') {
                const diff = at(b) - at(a);
                if (diff !== 0) return diff;
            }
            if (sort === 'count') {
                const diff = (activeCollection[b.texture] || 0) - (activeCollection[a.texture] || 0);
                if (diff !== 0) return diff;
            }
            const order = getRarityOrder(a.type) - getRarityOrder(b.type);
            if (order !== 0) return order;
            const counts = (activeCollection[b.texture] || 0) - (activeCollection[a.texture] || 0);
            if (counts !== 0) return counts;
            return a.name.localeCompare(b.name);
        });
    }, [rosterItems, activeCollection, activeDetails, have, tierFilter, search, sort]);

    const clearFilters = useCallback(() => {
        setTierFilter(null); setHave('all'); setSearch('');
    }, []);

    /* ── Prestige, resolved for the render ────────────────────────────────── */
    const hasPrestige = Boolean(prestige && (prestige.level > 0 || prestige.activeRun));
    const nextLevel = (prestige?.level || 0) + 1;
    // The button is the player's own, and only when the server says so. Viewing
    // someone else's board never offers it, whatever their state.
    const canPrestige = Boolean(!viewingUser && prestige?.eligible && nextLevel <= MAX_PRESTIGE_LEVEL);
    const shownLevel = viewLevel || prestige?.activeRun?.level || prestige?.level || 0;
    // Every level that exists to look at: the finished ones plus the one running.
    const selectableLevels = prestige
        ? Array.from(new Set([
            ...Array.from({ length: prestige.level }, (_, i) => i + 1),
            ...(prestige.activeRun ? [prestige.activeRun.level] : []),
        ])).sort((a, b) => a - b)
        : [];

    // Starting a run: the server decides (services/prestige.js); the disabled button is a courtesy, and a 409 means state moved, so re-read.
    const handleStartPrestige = useCallback(async () => {
        if (starting) return;
        setStarting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/prestige/start`, {
                method: 'POST',
                credentials: 'include',
            });
            if (!res.ok) {
                await loadPrestige();
                return;
            }
            const data = await res.json();
            setPrestige(data.state);
            setViewLevel(data.level);
            setPrestigeData(null);

            // The board switches underneath first so there is nothing left to animate when the convergence clears.
            setScope('prestige');
            setTierFilter(null);
            setHave('all');
            setSearch('');
            setAscending(data.level);
        } catch (err) {
            console.error('Failed to start prestige:', err);
            await loadPrestige();
        } finally {
            setStarting(false);
        }
    }, [starting, loadPrestige]);

    const filtered = Boolean(tierFilter) || have !== 'all' || search.trim().length > 0;
    // The phone drops the word "Prestige": "LEGENDARY PRESTIGE" is ~324px of drum in a 358px board and overflowed onto the level badge; the lens beneath the title already says it.
    const boardTitle = prestigeView
        ? ((isPhone ? prestigeName(shownLevel) : prestigeLabel(shownLevel)) || 'Prestige')
        : luckyView ? (isPhone ? 'Lucky' : 'Lucky spins')
        : (viewingUser ? `${viewingUser}` : 'Collection');

    // Offered once the ledger has a lucky spin; a board with nothing to say gets no door onto it.
    const hasLucky = (luckyData?.spins || 0) > 0;
    const lensOptions = [
        ['main', 'Collection'],
        ...(hasPrestige ? [['prestige', 'Prestige']] : []),
        ...(hasLucky ? [['lucky', 'Lucky']] : []),
    ];
    const changeScope = useCallback(next => {
        setScope(next);
        // Common has no row on the Lucky lens, so a common filter carried into it
        // would leave the platform empty for no visible reason.
        if (next === 'lucky') setTierFilter(f => (f === 'common' ? null : f));
    }, []);

    // The lens's own facts. No 'fair odds' figure, by owner's call: it was priced on today's roster while the hit rate spans a history in which relic and exotic did not exist.
    const luckyFacts = useMemo(() => {
        if (!luckyView || !luckyData) return null;
        const spins = luckyData.spins || 0;
        const specials = luckyData.specials || 0;
        let last = null;
        for (const d of Object.values(luckyCollection.details)) {
            if (d.lastPulled && (!last || new Date(d.lastPulled) > new Date(last))) last = d.lastPulled;
        }
        return {
            spins,
            specials,
            hitRate: spins > 0 ? (specials / spins) * 100 : null,
            perSpecial: specials > 0 ? (spins / specials).toFixed(1) : null,
            last,
        };
    }, [luckyView, luckyData, luckyCollection]);

    // The head's figures. Fixed columns, divided by rules, label under value —
    // the register's own grammar one size up, not a row of stat cards.
    // The second register follows the lens: on a prestige board career figures would sit beside run figures. Derived from the run's own rows; nothing new is fetched.
    const runFacts = useMemo(() => {
        if (!prestigeView) return null;
        const counts = Object.values(activeCollection);
        const unique = counts.length;
        const dupes = counts.reduce((sum, n) => sum + n, 0) - unique;
        // Tested against the ladder, NOT 'common': pool items are stored as `item_type = 'regular'` and only normalised to 'common' when this board builds its roster.
        const specials = Object.entries(activeCollection)
            .filter(([texture, n]) => n > 0 && SPECIAL_TYPES.has(activeDetails[texture]?.type))
            .length;
        const run = prestige?.runs?.find(r => r.level === shownLevel);
        return { dupes, specials, startedAt: run?.startedAt || null };
    }, [prestigeView, activeCollection, activeDetails, prestige, shownLevel]);

    const headFigures = luckyView
        ? [
            { label: 'Lucky spins', value: fmt(luckyFacts?.spins || 0), tone: DECK.ink, title: 'Every lucky spin that landed an item. Mystery box pulls are not counted' },
            { label: 'Specials', value: fmt(luckyFacts?.specials || 0), tone: COLORS.green, title: 'Lucky spins that landed a Rare-or-better item' },
            {
                label: 'Hit rate',
                value: luckyFacts?.hitRate != null ? `${luckyFacts.hitRate.toFixed(2)}%` : '—',
                tone: DECK.ink,
                title: 'Specials divided by lucky spins',
            },
            {
                label: isPhone ? 'Per special' : 'Lucky per special',
                value: luckyFacts?.perSpecial ?? '—',
                tone: DECK.inkMid,
                title: 'Lucky spins taken for every special they landed',
            },
            {
                label: 'Last special',
                value: fmtDate(luckyFacts?.last) || '—',
                tone: DECK.inkMid,
                title: 'The most recent special a lucky spin landed',
            },
        ]
        : prestigeView
        ? [
            { label: 'Held', value: fmt(totals.held), tone: DECK.ink },
            { label: 'Missing', value: fmt(totals.missing), tone: totals.missing > 0 ? DECK.amber : DECK.inkDim },
            { label: 'Complete', value: `${totals.pct.toFixed(1)}%`, tone: DECK.ink },
            {
                label: 'Duplicates',
                value: fmt(runFacts?.dupes || 0),
                tone: DECK.inkMid,
                title: 'Duplicates pulled during this prestige run',
            },
            {
                label: 'Specials',
                value: fmt(runFacts?.specials || 0),
                tone: DECK.inkMid,
                title: 'Rare-and-above items held in this run',
            },
            {
                label: 'Started',
                value: fmtDate(runFacts?.startedAt) || '—',
                tone: DECK.inkMid,
                title: 'When this prestige run was opened',
            },
        ]
        : [
            { label: 'Held', value: fmt(totals.held), tone: DECK.ink },
            { label: 'Missing', value: fmt(totals.missing), tone: totals.missing > 0 ? DECK.amber : DECK.inkDim },
            { label: 'Complete', value: `${totals.pct.toFixed(1)}%`, tone: DECK.ink },
            { label: 'Spins', value: fmt(totals.spins), tone: DECK.inkMid },
            { label: 'Duplicates', value: fmt(totals.dupes), tone: DECK.inkMid },
            {
                // The long form drives this column ~115px wide and strands a figure on a second line on the phone; the title carries the full sentence.
                label: isPhone ? 'Per special' : 'Spins per special',
                value: totals.perSpecial ?? '—',
                tone: DECK.inkMid,
                title: 'Total spins divided by every Rare-and-above pull on record',
            },
        ];

    // Keep the register compact: owned / total, progress, then pull history.
    const gridTemplate = isPhone
        ? '8px minmax(68px, 1fr) 86px 48px 72px'
        : '10px minmax(120px, 0.85fr) 110px minmax(100px, 1fr) 90px 88px 92px';

    return (
        <div
            // The backdrop closes the board, and while the ceremony is running
            // that would be a skip button in everything but name.
            onClick={e => { if (e.target === e.currentTarget && !ascending) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label={viewingUser ? `${viewingUser}'s collection` : 'Your collection'}
            className="fib-collection-book"
            style={{
                position: 'fixed', inset: 0,
                // Scrim ladder's middle step: pushes the stage back behind a plaque.
                background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000, padding: isPhone ? '0' : '24px',
                animation: 'fadeIn 0.2s ease-out',
            }}
        >
            <div style={{
                position: 'relative',
                width: '100%', maxWidth: '1180px',
                height: isPhone ? '100%' : 'min(88vh, 860px)',
                display: 'flex', flexDirection: 'column',
                backgroundImage: DECK.face,
                // Edges of light, not a border: a lit top rail and a front lip at the bottom (a board with no bottom edge reads as a region); the outer shadow seats it over the scrim.
                boxShadow: [
                    `inset 0 1px 0 ${rail(0.12)}`,
                    `inset 0 -2px 0 rgba(0,0,0,0.55)`,
                    `inset 0 -3px 0 ${rail(0.09)}`,
                    '0 32px 80px rgba(0,0,0,0.65)',
                ].join(', '),
                animation: 'slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                overflow: 'hidden',
            }}>

                {/* Upper deck (head and register) scrolls only when it has to: on a phone the platform keeps a 322px floor and the upper deck gives way. */}
                <div
                    className={isPhone ? 'fib-board-scroll' : undefined}
                    style={{
                        flex: isPhone ? '0 1 auto' : '0 0 auto',
                        minHeight: 0,
                        overflowY: isPhone ? 'auto' : 'visible',
                    }}
                >
                {/* The deck's top face, as in the band's status console. */}
                <div style={{
                    position: 'relative', flex: '0 0 auto',
                    padding: isPhone ? '16px 16px 0' : '24px 26px 0',
                    backgroundImage: `linear-gradient(180deg, ${DECK.sky} 0%, transparent 78%)`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', minWidth: 0 }}>
                            <FlapText
                                text={boardTitle}
                                size={isPhone ? 28 : 36}
                                tone={DECK.ink}
                                weight={800}
                                plate
                            />

                            {/* The lens, not a tab bar: this board already has one 'pick one of N' control. Prestige and Lucky are options, each offered only when its collection exists, so the lens vanishes for players with neither. */}
                            {lensOptions.length > 1 && (
                                <Segmented
                                    value={scope}
                                    onChange={changeScope}
                                    options={lensOptions}
                                    label="Which collection to show"
                                />
                            )}

                            {/* Past levels stay browsable (the prestige collection is keyed by level); shown only with more than one. */}
                            {prestigeView && selectableLevels.length > 1 && (
                                // Labelled like SHOW and SORT, with the levels' NAMES as options: bare numerals are the least self-describing set on the board.
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <BoardLabel>Level</BoardLabel>
                                    <Segmented
                                        value={String(shownLevel)}
                                        onChange={v => setViewLevel(Number(v))}
                                        options={selectableLevels.map(l => [String(l), prestigeName(l) || String(l)])}
                                        label="Prestige level"
                                    />
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
                            {/* The unlock is station amber (the board talking); the level's rarity colour belongs to the badge you earn, not the button. */}
                            {canPrestige && (
                                <Plinth
                                    as="button"
                                    className="fib-board-hit"
                                    onClick={handleStartPrestige}
                                    live
                                    disabled={starting}
                                    aria-label={`Prestige your collection — start ${prestigeLabel(nextLevel)}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '0 14px', height: '36px',
                                        color: DECK.amber,
                                        opacity: starting ? 0.6 : 1,
                                    }}
                                >
                                    <Crown size={14} />
                                    <BoardLabel tone={DECK.amber}>
                                        {starting ? 'Starting…' : 'Prestige'}
                                    </BoardLabel>
                                </Plinth>
                            )}

                            {/* The badge, worn at every level and iridescent at the top like insane; spelled out on a desktop head, a bare mark on a phone. */}
                            {prestige?.level > 0 && (
                                <span
                                    className={isIridescentPrestige(prestige.level) ? 'fib-holo' : undefined}
                                    title={prestigeLabel(prestige.level)}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                                        height: '36px', flex: '0 0 auto',
                                        padding: isPhone ? 0 : '0 12px',
                                        width: isPhone ? '36px' : undefined,
                                        background: isIridescentPrestige(prestige.level)
                                            ? undefined
                                            : `${prestigeColor(prestige.level)}22`,
                                        boxShadow: `inset 0 -2px 0 ${prestigeColor(prestige.level)}`,
                                        color: isIridescentPrestige(prestige.level)
                                            ? '#1a1a1a'
                                            : prestigeInk(prestige.level),
                                    }}
                                >
                                    {/* The level's own tier mark; the Crown stays on the ACTION button below. */}
                                    {isPhone && <span className="fib-sr-only">{prestigeLabel(prestige.level)}</span>}
                                    {prestigeIcon(prestige.level, 13)}
                                    {!isPhone && (
                                        <BoardLabel tone="currentColor">
                                            {prestigeLabel(prestige.level)}
                                        </BoardLabel>
                                    )}
                                </span>
                            )}

                            <Plinth
                                as="button"
                                className="fib-board-hit"
                                onClick={onClose}
                                aria-label="Close the collection board"
                                style={{
                                    width: '36px', height: '36px', flex: '0 0 auto',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: DECK.inkMid,
                                }}
                            ><X size={16} /></Plinth>
                        </div>
                    </div>

                    {/* The figures: six on drums on desktop; on a phone the three spin figures fold into one tracked line under the platform line (667px cannot carry six drums, six rows and a usable grid). */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        gap: '24px',
                        margin: isPhone ? '14px 0 8px' : '20px 0 8px',
                    }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isPhone ? 'repeat(3, 1fr)' : 'repeat(3, auto)',
                        justifyContent: 'start',
                        gap: 0,
                        flex: isPhone ? '1 1 auto' : '0 0 auto',
                    }}>
                        {headFigures.slice(0, 3).map((f, i) => (
                            <div
                                key={f.label}
                                title={f.title}
                                style={{
                                    paddingTop: 0, paddingBottom: 0,
                                    paddingRight: isPhone ? '12px' : '26px',
                                    paddingLeft: i === 0 ? 0 : isPhone ? '12px' : '26px',
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
                    {!isPhone && <SpinRegister figures={headFigures.slice(3)} align="right" />}
                    </div>

                    {/* The platform line: the baseline, filled to completion; no label, HELD and COMPLETE stand above it. */}
                    {/* The baseline takes the level's colour on a prestige board; station amber is the main board's signal. */}
                    {/* On the Lucky lens the line measures how much of the special roster lucky spins landed, in lucky green. */}
                    <div
                        role="progressbar"
                        aria-label={luckyView ? 'Specials landed on a lucky spin' : 'Collection completion'}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(totals.pct.toFixed(1))}
                        aria-valuetext={luckyView
                            ? `${fmt(totals.held)} of ${fmt(totals.held + totals.missing)} specials landed on a lucky spin`
                            : `${fmt(totals.held)} of ${fmt(totals.held + totals.missing)} items held`}
                    >
                    <BoardMeter
                        value={totals.pct / 100}
                        tone={(prestigeView && prestigeColor(shownLevel)) || (luckyView && COLORS.green) || DECK.amber}
                        height={3}
                    />
                    </div>

                    {/* The spin figures, folded into one tracked line: a different register (spinning, not holding) from the collection's three. */}
                    {isPhone && (
                        <div style={{ padding: '14px 0 2px' }}>
                            <SpinRegister figures={headFigures.slice(3)} size={17} />
                        </div>
                    )}
                </div>

                {/* ── THE REGISTER ─────────────────────────────────────────── */}
                <div style={{ flex: '0 0 auto', padding: isPhone ? '0 16px' : '0 26px' }}>
                    {/* 22px above the headings, 8px under the meter: at 11px the meter read as the register's top rule, the one full-bleed line on a no-border surface. */}
                    <div style={{
                        display: 'grid', gridTemplateColumns: gridTemplate,
                        alignItems: 'center', gap: isPhone ? '0 6px' : '0 14px',
                        padding: isPhone ? '20px 0 6px' : '24px 0 8px',
                    }}>
                        <span />
                        <BoardLabel>Tier</BoardLabel>
                        <BoardLabel style={{ textAlign: 'right' }}>{luckyView ? 'Landed / total' : 'Held / total'}</BoardLabel>
                        {!isPhone && <span />}
                        {!isPhone && <BoardLabel style={{ textAlign: 'right' }}>Last pull</BoardLabel>}
                        <BoardLabel style={{ textAlign: 'right' }}>Since</BoardLabel>
                        <BoardLabel style={{ textAlign: 'right' }}>Status</BoardLabel>
                    </div>

                    <div role="group" aria-label="Filter the platform by tier">
                        {register.map((row, i) => {
                            const active = tierFilter === row.key;
                            const statusWord = { complete: 'Complete', overdue: 'Overdue', empty: luckyView ? 'None yet' : 'None held', tracking: 'Collecting' }[row.status];
                            const statusTone = row.status === 'complete' ? row.ink
                                : row.status === 'overdue' ? DECK.amber
                                : row.status === 'empty' ? DECK.inkMid
                                : DECK.inkMid;

                            // The whole claim as one sentence on the row: a `title` alone is unreachable on a phone and leaves a bare run of numerals as the accessible name.
                            const unit = luckyView ? 'lucky spins' : 'spins';
                            const waitSentence = row.expected != null && row.since != null
                                ? `${fmt(row.since)} ${unit} since your last ${row.label}; one costs about ${fmt(row.expected)} ${unit} on average`
                                : null;

                            return (
                                <button
                                    key={row.key}
                                    className={`fib-board-hit fib-register-row${active ? ' is-active' : ''}`}
                                    onClick={() => setTierFilter(active ? null : row.key)}
                                    aria-pressed={active}
                                    aria-label={[
                                        row.label,
                                        luckyView
                                            ? `${fmt(row.held)} of ${fmt(row.total)} landed on a lucky spin`
                                            : `${fmt(row.held)} of ${fmt(row.total)} held`,
                                        row.missing > 0 ? `${fmt(row.missing)} missing` : null,
                                        waitSentence,
                                        statusWord,
                                    ].filter(Boolean).join('. ')}
                                    // No `title`: the sentence is the accessible name and the DUE label says it on screen.
                                    style={{
                                        display: 'grid', gridTemplateColumns: gridTemplate,
                                        alignItems: 'center', gap: isPhone ? '0 6px' : '0 14px',
                                        width: '100%', padding: isPhone ? '7px 0' : '12px 0',
                                        border: 'none', textAlign: 'left', font: 'inherit',
                                        // Only the tier's wash and base bar are per-tier values; the states live in index.css.
                                        '--fib-row-wash': `${row.tone}14`,
                                        '--fib-row-tone': row.tone,
                                    }}
                                >
                                    <RowLamp
                                        state={row.status === 'complete' ? 'lit' : row.overdue ? 'due' : 'dark'}
                                        tone={row.tone}
                                    />
                                    {/* A tier with nothing held keeps its ink: it has everything left to do. */}
                                    <FlapText
                                        text={row.label}
                                        size={isPhone ? 15 : 16}
                                        tone={row.held > 0 ? row.ink : DECK.ink}
                                        weight={700}
                                        delay={280 + i * 55}
                                    />
                                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', system-ui, sans-serif", fontSize: isPhone ? '15px' : '16px', fontWeight: 600, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                        <span style={{ color: DECK.ink }}>{fmt(row.held)}</span>
                                        <span style={{ color: DECK.inkMid }}> / {fmt(row.total)}</span>
                                    </span>
                                    {!isPhone && (
                                        <BoardMeter
                                            value={row.held / row.total}
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
                                    {/* The wait as a number. No 'DUE' badge, by owner's call: a word in a column of figures breaks a register read down; the amber is the signal and the accessible name carries the sentence. */}
                                    <FlapText
                                        text={row.since == null ? '—' : fmt(row.since)}
                                        digits={row.since != null} size={16}
                                        tone={row.overdue ? DECK.amber : DECK.inkMid}
                                        delay={345 + i * 55}
                                        style={{ justifyContent: 'flex-end' }}
                                    />
                                    <BoardLabel size={12} tone={statusTone} style={{ textAlign: 'right' }}>
                                        {statusWord}
                                    </BoardLabel>
                                </button>
                            );
                        })}
                    </div>
                </div>
                </div>

                {/* ── THE PLATFORM ─────────────────────────────────────────── */}
                <div style={{
                    flex: '1 1 auto',
                    minHeight: isPhone ? '322px' : 0,
                    display: 'flex', flexDirection: 'column',
                    marginTop: isPhone ? '10px' : '14px',
                    // The platform is cut one step deeper than the board it sits
                    // in — a recess, with the board's own edge as its top seam.
                    background: 'rgba(0,0,0,0.30)',
                    boxShadow: `inset 0 1px 0 ${rail(0.08)}`,
                }}>
                    <div style={{
                        flex: '0 0 auto',
                        display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                        padding: isPhone ? '10px 16px' : '12px 26px',
                    }}>
                        <FlapText
                            text={tierFilter ? RARITY[tierFilter].label : 'All items'}
                            size={16}
                            tone={tierFilter ? getRarityInk(tierFilter) : DECK.ink}
                        />
                        <BoardLabel tone={DECK.inkDim}>
                            {fmt(shown.length)} shown
                        </BoardLabel>

                        {/* A floating readout identifies the hovered or focused item without
                            changing the toolbar layout or the compact canvas geometry. */}
                        {readout && (
                            <span
                                role="status"
                                aria-live="polite"
                                style={{
                                    position: 'fixed', zIndex: 1200, pointerEvents: 'none',
                                    left: readout.left, top: readout.top,
                                    display: 'flex', flexDirection: 'column', gap: '6px',
                                    maxWidth: '260px', padding: '10px 12px',
                                    background: DECK.faceMid, boxShadow: `inset 2px 0 0 ${getRarityColor(readout.type)}, 0 4px 16px rgba(0,0,0,0.6)`,
                                }}
                            >
                                <BoardLabel
                                    size={15}
                                    tone={DECK.ink}
                                    style={{ letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {readout.name}
                                </BoardLabel>
                                <BoardLabel tone={readout.type === 'common' ? DECK.inkDim : getRarityInk(readout.type)}>
                                    {(RARITY[readout.type] || RARITY.common).label}
                                </BoardLabel>
                                <BoardLabel tone={DECK.inkDim}>
                                    {luckyView
                                        ? (readout.held ? `Lucky pulls: ${fmt(readout.held)}` : 'Not landed on a lucky spin')
                                        : (readout.held ? `Owned: ${fmt(readout.held)}` : 'Not collected')}
                                </BoardLabel>
                            </span>
                        )}

                        <div style={{ flex: '1 1 auto', minWidth: '12px' }} />

                        {/* Two radiogroups, not one six-way control: adjacent identical plinths read as one set. */}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BoardLabel>Show</BoardLabel>
                            <Segmented
                                value={have}
                                onChange={setHave}
                                options={[['all', 'All'], ['held', luckyView ? 'Landed' : 'Held'], ['missing', 'Missing']]}
                                label="Show"
                            />
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BoardLabel>Sort</BoardLabel>
                            <Segmented
                                value={sort}
                                onChange={setSort}
                                options={[['rarity', 'Rarity'], ['recent', 'Recent'], ['count', 'Count']]}
                                label="Sort"
                            />
                        </span>

                        <Plinth className="fib-board-search" style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            padding: '0 4px 0 10px', height: '32px',
                        }}>
                            <Search size={14} color={DECK.inkMid} />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="SEARCH ITEMS"
                                aria-label="Search items by name"
                                style={{
                                    width: isPhone ? '100px' : '128px',
                                    background: 'transparent', border: 'none', outline: 'none',
                                    color: DECK.ink,
                                    fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                                    fontSize: '14px', fontWeight: 600, letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                }}
                            />
                            {/* Holds its space when hidden so the control bar does not resize as you type. */}
                            <button
                                onClick={() => setSearch('')}
                                aria-label="Clear the search"
                                tabIndex={search ? 0 : -1}
                                style={{
                                    width: '22px', height: '30px', flex: '0 0 auto',
                                    background: 'transparent', border: 'none',
                                    cursor: 'pointer', color: DECK.inkDim,
                                    visibility: search ? 'visible' : 'hidden',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            ><X size={12} /></button>
                        </Plinth>
                    </div>

                    <div ref={platformRef} className="fib-board-scroll" style={{ flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
                        {shown.length === 0 ? (
                            <div style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center', gap: '12px',
                            }}>
                                <FlapText text="No items on this board" size={16} tone={DECK.inkMid} />
                                <BoardLabel tone={DECK.inkDim}>
                                    {search.trim() ? `Nothing matches "${search.trim()}"` : 'Nothing matches these filters'}
                                </BoardLabel>
                                {filtered && (
                                    <Plinth
                                        as="button"
                                        className="fib-board-hit"
                                        onClick={clearFilters}
                                        style={{ marginTop: '4px', padding: '8px 16px', color: DECK.amber }}
                                    >
                                        <BoardLabel tone={DECK.amber}>Clear filters</BoardLabel>
                                    </Plinth>
                                )}
                            </div>
                        ) : (
                            <CanvasCollectionGrid
                                items={shown}
                                collection={activeCollection}
                                onItemClick={setSelectedItem}
                                onItemFocus={setReadout}
                                containerHeight={platformHeight}
                            />
                        )}
                    </div>
                </div>

                {/* THE CONVERGENCE, mounted inside the board so the deck's edges frame it. `mainCollection`, not the lens: the items committed are the ones you had. */}
                {ascending && (
                    <PrestigeAscension
                        level={ascending}
                        items={allItemsWithSpecial}
                        collection={collection}
                        onDone={() => setAscending(null)}
                    />
                )}
            </div>

            {selectedItem && (
                <ItemPlaque
                    item={selectedItem}
                    details={activeDetails?.[selectedItem.texture]}
                    onClose={() => setSelectedItem(null)}
                    lucky={luckyView}
                    luckyOdds={luckyPoolSize > 0 ? 1 / luckyPoolSize : null}
                />
            )}
        </div>
    );
}

// The spin register: three figures about spinning, one drum step down (20px against 27, a 1.35 ratio) so the two registers read as headline and supporting.
function SpinRegister({ figures, align, size = 20 }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}>
            {figures.map((f, i) => (
                <div
                    key={f.label}
                    title={f.title}
                    style={{
                        padding: size >= 20 ? '0 18px' : '0 12px',
                        // Divided by a rule like every other figure group on the
                        // board, never boxed.
                        boxShadow: i > 0 ? `inset 1px 0 0 ${rail(0.07)}` : undefined,
                        ...(i === 0 ? { paddingLeft: 0 } : null),
                        ...(i === figures.length - 1 && align === 'right' ? { paddingRight: 0 } : null),
                    }}
                >
                    <FlapText text={f.value} size={size} tone={DECK.inkMid} weight={700} plate delay={180 + i * 40} />
                    <div style={{ marginTop: '6px' }}>
                        <BoardLabel>{f.label}</BoardLabel>
                    </div>
                </div>
            ))}
        </div>
    );
}
