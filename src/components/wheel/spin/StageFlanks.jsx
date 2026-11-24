import { useActivity } from '../../../context/ActivityContext.jsx';
import { KotwArenaStandings } from '../effects/KotwArena.jsx';
import React, { useCallback, useState } from 'react';
import { BookOpen, Trophy } from 'lucide-react';
import { COLORS, SPACE, Z, SURFACE_NOISE } from '../config/constants';
import { getDiscordAvatarUrl } from '../../../utils/helpers.js';
import { RARITY, RARITY_KEYS, getRarityIcon, getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { prestigeColor, prestigeInk, prestigeLabel, isIridescentPrestige, prestigeStanding } from '../../../utils/prestigeHelpers.js';
import { useCollectionLeaderboard } from '../../../hooks/useCollectionLeaderboard.js';

// Which collection the left panel reads, remembered per browser. localStorage can throw (blocked site data, private windows) and the value is validated on read: only these two strings mean anything.
const SCOPE_KEY = 'fib-collection-scope';
const SCOPES = ['main', 'prestige'];

function readScope() {
    try {
        const saved = window.localStorage.getItem(SCOPE_KEY);
        return SCOPES.includes(saved) ? saved : 'main';
    } catch {
        return 'main';
    }
}

function writeScope(scope) {
    try {
        window.localStorage.setItem(SCOPE_KEY, scope);
    } catch {
        // Remembering is a convenience; failing to is not worth a word to anyone.
    }
}

// The panels either side of the stage: your collection and the standings. Each is both a readout and the way in, and they are the primary entry points (the topbar's icon and pill are gone).
// They live in the stage row and never touch the reel; present at idle, mid-spin and at the result.

// Both panels take one width (272) so unequal widths flanking a centred object do not read as a mistake; measured against ~640px free per side at 1920.
const PANEL_WIDTH = 272;

// A plinth you can press, with content that may also be pressable. The press target is a transparent `<button>` overlay beneath the content, not the panel itself: a button cannot contain a button, and an aria-label on a panel-button swallows its numbers. Content above is `pointer-events: none`; interactive children opt back in as siblings.
// Hover is on the container; the lit rail is the focus indicator.
function Panel({ side, label, icon, onClick, actionLabel, children }) {
    const [hovered, setHovered] = React.useState(false);
    const [focused, setFocused] = React.useState(false);
    const active = hovered || focused;

    return (
        <div style={{
            position: 'absolute',
            top: '50%',
            transform: 'translateY(-50%)',
            [side]: 'clamp(20px, 5vw, 96px)',
            width: `${PANEL_WIDTH}px`,
            zIndex: Z.content,
        }}>
            <div
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{
                    position: 'relative',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    textAlign: 'left',
                    padding: `${SPACE.md}px`,
                    // No radius, no ring: the band's deck material at rest, with SURFACE_NOISE grain above the light layers.
                    borderRadius: 0,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundImage: active
                        // Hover is light, not paint: the street glow's amber rises
                        // through the plinth instead of the slab changing colour.
                        ? `${SURFACE_NOISE}, linear-gradient(180deg, rgba(255,183,94,0.05), rgba(255,183,94,0) 55%), linear-gradient(180deg, var(--wheel-panel-top, #0d1322) 0%, var(--wheel-panel-bottom, #0a0d18) 100%)`
                        : `${SURFACE_NOISE}, linear-gradient(180deg, var(--wheel-panel-top, #0d1322) 0%, var(--wheel-panel-bottom, #0a0d18) 100%)`,
                    boxShadow: [
                        `inset 0 1px 0 rgba(var(--wheel-surface-light, 206,214,236),${active ? '0.16' : '0.09'})`,
                        `inset 0 -1px 0 ${COLORS.gold}${active ? '66' : '22'}`,
                    ].join(', '),
                    // No lift. The control is seated in the page the same way the
                    // spin card and the band are; hovering lights it.
                    transition: 'background 0.2s ease-out, box-shadow 0.2s ease-out',
                    color: 'inherit',
                }}
            >
                {/* The press target: first in source order, under the content, carrying the accessible name; the numbers stay readable content. */}
                <button
                    type="button"
                    onClick={onClick}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    aria-label={actionLabel}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 0,
                        border: 'none',
                        borderRadius: 0,
                        background: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        // The lit rail IS the focus indicator (`focused`); a default ring would draw a second inside the edge.
                        outline: 'none',
                    }}
                />

                {/* Content over the hit area; `pointer-events: none` keeps the whole slab clickable. Interactive children opt back in. */}
                <span style={{
                    position: 'relative',
                    zIndex: 1,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    color: active ? COLORS.gold : COLORS.textMuted,
                    transition: 'color 0.2s ease-out',
                }}>
                    {icon}
                    {label}
                </span>

                <div style={{
                    position: 'relative',
                    zIndex: 1,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}>
                    {children}
                </div>
            </div>
        </div>
    );
}

// A player's collection by tier. All five slots always render (a muted dot at zero) so rows line up for comparison. Icons and colour come from the shared ladder; `ink`, not `color`, since a glyph and number at 11px are text.
function RarityTally({ entry }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {RARITY_KEYS
                .filter(key => key !== 'common' && key !== 'event')
                .map(key => {
                    const count = entry[`${key}_count`] || 0;
                    const ink = getRarityInk(key);
                    return (
                        <span
                            key={key}
                            title={`${count} ${RARITY[key]?.label || key}`}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '11px',
                                fontVariantNumeric: 'tabular-nums',
                                color: count > 0 ? ink : COLORS.textMuted,
                                opacity: count > 0 ? 1 : 0.45,
                            }}
                        >
                            {getRarityIcon(key, 10)}
                            {count > 0 ? count : '·'}
                        </span>
                    );
                })}
        </div>
    );
}

// The prestige ring around an avatar: a solid ring in the level's colour with a bloom; earned and in-progress rings look identical by owner's decision (the difference lives in the tooltip and the leaderboard column).
// Never put `opacity` on it: the avatar is its child and would dim with it. Alpha belongs in the colour.
export function PrestigeRing({ standing, children, pad = 2 }) {
    const { level, earned } = standing;
    if (!level) return <>{children}</>;

    const holo = isIridescentPrestige(level);
    const tone = prestigeColor(level);

    return (
        <span
            className={holo ? 'fib-holo' : undefined}
            title={`${prestigeLabel(level)}${earned ? '' : ' — in progress'}`}
            style={{
                position: 'relative',
                zIndex: 2,
                flexShrink: 0,
                display: 'block',
                // `pad` is the ring's thickness, a prop because faces run from 18px (toast) to 68px (player board); a fifth of a face's diameter stops reading as a frame. The bloom scales with it.
                padding: `${pad}px`,
                borderRadius: '50%',
                lineHeight: 0,
                // The ring only ever shows in the padding — the avatar covers the
                // middle — so this background IS the ring.
                background: holo ? undefined : tone,
                boxShadow: `0 0 ${pad * 4}px ${tone}AA`,
            }}
        >
            {children}
        </span>
    );
}

/** One figure and its caption. The figure leads; the caption explains it. */
function Stat({ value, caption, tone }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{
                fontSize: '19px',
                fontWeight: 700,
                lineHeight: 1.1,
                color: tone || COLORS.text,
                fontVariantNumeric: 'tabular-nums',
            }}>
                {value}
            </span>
            <span style={{ fontSize: '11px', color: COLORS.textMuted }}>
                {caption}
            </span>
        </div>
    );
}

export function StageFlanks({
    // Result context — present only while a spin's result is on screen.
    showResultLine,
    isNewItem,
    owned,
    tierInk,
    // Always available.
    collectedCount,
    poolSize,
    prestige,
    userId,
    isMobile,
    onOpenCollection,
    onOpenLeaderboard,
}) {
    const { leaderboard, myRank } = useCollectionLeaderboard(userId);
    const { globalEventStatus, kotwWinnerPending } = useActivity();
    const arenaActive = (globalEventStatus?.type === 'king_of_wheel' && (globalEventStatus.active || globalEventStatus.pending)) || kotwWinnerPending;
    // Which collection the counter reads; offered only with a run open, default `main`.
    // Persisted in localStorage, not state: this component UNMOUNTS during the 3x/5x takeover and across the `hasFlanks` breakpoint, which reset it. `showing` falls back to `main` with no run open, so a stale preference is safe.
    const [scope, setScope] = useState(readScope);
    const chooseScope = useCallback((next) => {
        setScope(next);
        writeScope(next);
    }, []);
    const run = prestige?.activeRun || null;
    const showing = scope === 'prestige' && run ? 'prestige' : 'main';

    // Never on mobile. These exist because a wide stage has room beside a centred
    // panel; a phone has none, and the topbar keeps its own entry points there.
    if (isMobile) return null;

    const held = showing === 'prestige' ? (run?.held ?? 0) : collectedCount;
    const total = showing === 'prestige' ? (run?.total ?? poolSize) : poolSize;
    const tone = showing === 'prestige' ? prestigeColor(run.level) : COLORS.gold;
    const pct = total > 0 ? Math.min(100, (held / total) * 100) : 0;
    const topFive = leaderboard.slice(0, 5);

    return (
        <>
            <Panel
                side="left"
                label="Collection"
                icon={<BookOpen size={13} />}
                onClick={onOpenCollection}
                actionLabel="Open your collection book"
            >
                {/* Only the result line comes and goes; it sits above the standing figures so nothing below moves. */}
                {showResultLine && (
                    <Stat
                        value={isNewItem ? 'New' : 'Duplicate'}
                        caption={isNewItem ? 'first one you own' : `you now hold ${owned}`}
                        tone={isNewItem ? tierInk : COLORS.text}
                    />
                )}

                <Stat
                    value={`${held.toLocaleString('en-US')} / ${total.toLocaleString('en-US')}`}
                    caption={showing === 'prestige' ? `${prestigeLabel(run.level)?.toLowerCase()} items` : 'items collected'}
                    tone={showing === 'prestige' ? prestigeInk(run.level) : undefined}
                />

                {/* The lens, only with a run open. `pointer-events: auto` opts it out of the content layer's pass-through; it is a sibling of the press target, so no stopPropagation is needed. */}
                {run && (
                    <div
                        style={{
                            position: 'relative',
                            zIndex: 1,
                            pointerEvents: 'auto',
                            display: 'flex',
                            gap: '10px',
                            marginTop: '2px',
                        }}
                    >
                        {[['main', 'Collection'], ['prestige', 'Prestige']].map(([id, text]) => {
                            const active = showing === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => chooseScope(id)}
                                    aria-pressed={active}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        padding: '2px 0',
                                        cursor: 'pointer',
                                        font: 'inherit',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        letterSpacing: '0.12em',
                                        textTransform: 'uppercase',
                                        color: active
                                            ? (id === 'prestige' ? prestigeInk(run.level) : COLORS.gold)
                                            : COLORS.textMuted,
                                        boxShadow: active
                                            ? `inset 0 -2px 0 ${id === 'prestige' ? prestigeColor(run.level) : COLORS.gold}`
                                            : 'none',
                                    }}
                                >
                                    {text}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={showing === 'prestige' ? 'Prestige run completion' : 'Collection completion'}
                    style={{
                        width: '100%',
                        height: '3px',
                        borderRadius: '999px',
                        background: 'rgba(var(--wheel-surface-light, 206,214,236),0.10)',
                        overflow: 'hidden',
                    }}
                >
                    <div style={{
                        height: '100%',
                        width: '100%',
                        transformOrigin: 'left center',
                        transform: `scaleX(${pct / 100})`,
                        borderRadius: '999px',
                        // The bar follows the lens, so the number and its
                        // measure are never in two different colours.
                        background: tone,
                        transition: 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }} />
                </div>
            </Panel>

            {arenaActive ? <KotwArenaStandings onOpenLeaderboard={onOpenLeaderboard} /> : <Panel
                side="right"
                label="Standings"
                icon={<Trophy size={13} />}
                onClick={onOpenLeaderboard}
                actionLabel="Open the full leaderboard"
            >
                {/* Five rows by collection size, the board's default sort; ranks beyond are for the full board. */}
                {topFive.map((entry, i) => {
                    const isMe = userId != null && entry.id === userId;
                    return (
                        <div key={entry.id} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '7px',
                            minWidth: 0,
                        }}>
                            <span style={{
                                width: '13px',
                                flexShrink: 0,
                                fontSize: '11px',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                color: i === 0 ? COLORS.gold : COLORS.textMuted,
                            }}>
                                {i + 1}
                            </span>
                            {/* The prestige ring in the tier's own colour from the ladder; level 5 takes the full holo sweep via `.fib-holo`, never a sampled point (insane's ramp passes through three other tiers' hues). Prestige is status, not standing: the board's ORDER is untouched. */}
                            <PrestigeRing standing={prestigeStanding(entry)}>
                                <img
                                    src={getDiscordAvatarUrl(entry.discord_id, entry.discord_avatar)}
                                    alt=""
                                    width={18}
                                    height={18}
                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                    style={{ borderRadius: '50%', flexShrink: 0, display: 'block' }}
                                />
                            </PrestigeRing>
                            <span style={{
                                flex: 1,
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                fontSize: '12px',
                                // Your own row is the one you are looking for, so it
                                // is the one that is not muted.
                                color: isMe ? COLORS.text : COLORS.textMuted,
                                fontWeight: isMe ? 700 : 400,
                            }}>
                                {entry.custom_username || 'Unknown'}
                            </span>
                            <span style={{
                                flexShrink: 0,
                                fontSize: '11px',
                                color: COLORS.textMuted,
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {entry.unique_items?.toLocaleString('en-US')}
                            </span>
                        </div>

                        {/* Indented under the name so the tallies form their own column. */}
                        <div style={{ paddingLeft: '38px' }}>
                            <RarityTally entry={entry} />
                        </div>
                        </div>
                    );
                })}

                {/* Your own rank, only when you are not already in the five above. */}
                {myRank && myRank > 5 && (
                    <span style={{
                        fontSize: '11px',
                        color: COLORS.textMuted,
                        borderTop: '1px solid rgba(var(--wheel-surface-light, 206,214,236),0.08)',
                        paddingTop: '7px',
                    }}>
                        You are <strong style={{ color: COLORS.text, fontWeight: 700 }}>#{myRank}</strong>
                    </span>
                )}
            </Panel>}
        </>
    );
}

export default StageFlanks;
