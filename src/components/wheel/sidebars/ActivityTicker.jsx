import React, { useEffect, useMemo, useReducer } from 'react';
import { COLORS, SPACE } from '../config/constants';
import { Radio } from 'lucide-react';
import { formatTimeAgo, parseServerDate, getItemImageUrl, getDiscordAvatarUrl } from '../../../utils/helpers.js';
import { getRarityIcon, getRarityColor, getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { prestigeStanding } from '../../../utils/prestigeHelpers.js';
import { PrestigeRing } from '../spin/StageFlanks.jsx';
import { useActivity } from '../../../context/ActivityContext.jsx';
import { visibleInterval } from '../../../config/power.js';
import { MysteryTag } from '../spin/MysteryTag.jsx';

// Live drops as a horizontal strip above the reel: the desktop presentation, while the vertical `ActivityFeedSidebar` stays for the mobile drawer (a 380px column is width the reel cannot have). Glanced at, so text is cut back and the tier carries the weight; a compact relative age stays so a quiet server shows how old the strip is.
// Deliberately NOT auto-scrolling: a marquee makes the newest drop a moving target and needs a reduced-motion alternative that ends up being this.

// Per-tier presentation ported from the sidebar's rows (a flat fill made an insane pull look like a common in another hue): slick and `.fib-holo` for insane, cool-band gradient for mythic, tier glow on the avatar, name in `ink` with a text-shadow. The sidebar's per-tier geometry is NOT ported: varying heights make tiles that do not line up.
function tierStyle(rarity) {
    const color = getRarityColor(rarity);
    const isInsane = rarity === 'insane';
    const isMythic = rarity === 'mythic';

    return {
        color,
        // `ink` for anything that is text: several tier colours fail contrast on these panels. Icons count as text.
        ink: getRarityInk(rarity),
        isInsane,
        isMythic,
        // Insane carries all three slick hues even at ~7% alpha, so the tile is
        // identifiable as top tier before you read the icon.
        background: isInsane
            ? `linear-gradient(135deg, ${COLORS.insaneHolo[0]}1E, ${COLORS.insaneHolo[1]}12, ${COLORS.insaneHolo[2]}1E)`
            : isMythic
                ? `linear-gradient(135deg, ${COLORS.mythicCycle[0]}18, ${COLORS.mythicCycle[1]}0C)`
                : `linear-gradient(135deg, ${color}14, ${color}08)`,
        border: `1px solid ${color}${isInsane ? '55' : isMythic ? '45' : '30'}`,
        boxShadow: isInsane
            ? `0 4px 20px ${COLORS.insaneHolo[0]}28, inset 0 1px 0 ${COLORS.insaneFlat}25`
            : isMythic
                ? `0 4px 16px ${COLORS.aqua}18, inset 0 1px 0 ${COLORS.aqua}14`
                : `inset 0 1px 0 ${color}10`,
    };
}

// An age in the fewest characters (`now`, `4m`, `2h`, `3d`); `formatTimeAgo` is too wide here. Parsing is shared (`parseServerDate`) so the two never disagree about when. No seconds: they would demand a re-render per second and pull the eye from the reel.
function compactAge(dateString) {
    const date = parseServerDate(dateString);
    if (!date) return null;

    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'now';              // covers clock skew (negative) too
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

/** How often the ages are recomputed. Half the smallest unit they display. */
const AGE_REFRESH_MS = 30_000;

export function ActivityTicker({ onOpenFull }) {
    const { feed, initialized } = useActivity();

    // A relative time that never recomputes is a stopped clock: the feed only re-renders on a new drop, so half the display resolution keeps an age from being wrong by a whole minute.
    const [, tickAges] = useReducer(n => n + 1, 0);
    useEffect(() => {
        // Not stretched in saver mode: a stretched timer would let an age be wrong by a minute. Visibility is the saving; one catch-up tick on return fixes all ages.
        return visibleInterval(tickAges, AGE_REFRESH_MS);
    }, []);

    // Newest first, achievements excluded (no item to show). Capped at 10: beyond that they are off the right edge.
    const entries = useMemo(() => (
        (feed || [])
            .filter(e => e.event_type !== 'achievement_unlock')
            .slice(0, 10)
    ), [feed]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: `${SPACE.md}px`,
            padding: `${SPACE.sm}px ${SPACE.lg}px`,
            minWidth: 0,
        }}>
            {/* Label — fixed, so the strip reads as a labelled rail rather than a
                loose row of chips that happens to start with an icon. */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                color: COLORS.textMuted,
            }}>
                <Radio size={14} style={{ color: COLORS.green }} />
                <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                }}>
                    Live
                </span>
            </div>

            {/* `overflow: hidden`, not `auto`: a glance surface needs no scrollbar. The mask fades the right edge so tiles look like they continue. */}
            <div style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: '10px',
                overflow: 'hidden',
                flex: 1,
                minWidth: 0,
                maskImage: 'linear-gradient(90deg, #000 0%, #000 90%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(90deg, #000 0%, #000 90%, transparent 100%)',
            }}>
                {!initialized && (
                    <span style={{ fontSize: '12px', color: COLORS.textMuted, alignSelf: 'center' }}>
                        Connecting…
                    </span>
                )}
                {initialized && entries.length === 0 && (
                    <span style={{ fontSize: '12px', color: COLORS.textMuted, alignSelf: 'center' }}>
                        No drops yet — be the first.
                    </span>
                )}
                {entries.map(item => {
                    const t = tierStyle(item.item_rarity);
                    const age = compactAge(item.created_at);
                    return (
                        <div
                            key={item.id}
                            title={`${item.custom_username || 'Unknown'} got ${item.item_name} — ${formatTimeAgo(item.created_at)}`}
                            style={{
                                position: 'relative',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '9px',
                                padding: '8px 12px',
                                borderRadius: '12px',
                                background: t.background,
                                border: t.border,
                                boxShadow: t.boxShadow,
                                flexShrink: 0,
                                // No maxWidth, deliberately: at 230px the item name got ~128px and ellipsised the longer-named, rarer items. Tiles size to their content; the newest is leftmost and never pushed out.
                            }}
                        >
                            {/* The oil-slick on an insane tile uses the shared `.fib-holo` class, which brings the reduced-motion path (the gradient stays, the drift stops). */}
                            {t.isInsane && (
                                <div className="fib-holo" style={{
                                    position: 'absolute',
                                    inset: 0,
                                    opacity: 0.16,
                                    mixBlendMode: 'screen',
                                    pointerEvents: 'none',
                                }} />
                            )}

                            {/* THE RING ON A FACE MEANS PRESTIGE, NOT THE ITEM: everywhere else on the site a ring around a player's face is their prestige level, so this avatar must not be ringed in the item's tier. The tile already states the tier through fill, border, glow and name ink. No prestige renders no ring (`PrestigeRing` with level 0). */}
                            <PrestigeRing standing={prestigeStanding(item)}>
                            <img
                                src={getDiscordAvatarUrl(item.discord_id, item.discord_avatar)}
                                alt=""
                                width={28}
                                height={28}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png'; }}
                                style={{
                                    borderRadius: '50%',
                                    flexShrink: 0,
                                    display: 'block',
                                    position: 'relative',
                                    zIndex: 1,
                                }}
                            />
                            </PrestigeRing>

                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {/* Who and when on one line: this muted context line already exists and costs no height. It is the line that may truncate (Discord names run to 32 characters), so the item never gives way. */}
                                <span style={{
                                    display: 'flex',
                                    // Centre, not baseline: a padded pill sitting on
                                    // a text baseline hangs below the line it is on.
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '11px',
                                    color: COLORS.textMuted,
                                    minWidth: 0,
                                }}>
                                    <span style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '116px',
                                    }}>
                                        {item.custom_username || 'Unknown'}
                                    </span>
                                    {/* Same muted step as the username: no dimmer step exists on this palette, and a new one would break PRODUCT.md's 4.5:1 floor at 11px. The separator does the demoting. */}
                                    {age && (
                                        <span style={{
                                            flexShrink: 0,
                                            whiteSpace: 'nowrap',
                                            color: COLORS.textMuted,
                                            fontVariantNumeric: 'tabular-nums',
                                        }}>
                                            · {age}
                                        </span>
                                    )}

                                    {/* Lucky drops say so in words, on the context line (a condition of the drop). The badge keeps `COLORS.green`, what the reel paints a lucky common; the sidebar's `#00FF00` is recursion's matrix green, a spin mode. */}
                                    {item.is_mystery === 1 ? <MysteryTag /> : item.is_lucky === 1 && (
                                        <span style={{
                                            flexShrink: 0,
                                            // 10px, one step above the sidebar's 9px: DESIGN.md §8 tolerates 9px only for a glyph with no text beside it, and this is a word.
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            lineHeight: 1,
                                            padding: '2px 5px',
                                            borderRadius: '4px',
                                            background: `linear-gradient(135deg, ${COLORS.green}33, ${COLORS.green}18)`,
                                            border: `1px solid ${COLORS.green}44`,
                                            color: COLORS.green,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.4px',
                                            textShadow: `0 0 6px ${COLORS.green}55`,
                                            whiteSpace: 'nowrap',
                                        }}>
                                            Lucky
                                        </span>
                                    )}
                                </span>
                                <span style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    fontSize: '12.5px',
                                    fontWeight: t.isInsane ? 700 : 600,
                                    color: t.ink,
                                    textShadow: t.isInsane
                                        ? `0 0 10px ${t.color}66`
                                        : t.isMythic
                                            ? `0 0 8px ${t.color}55`
                                            : 'none',
                                    // One line, never clipped. The tile is what
                                    // gives now that it has no maxWidth.
                                    whiteSpace: 'nowrap',
                                }}>
                                    {getRarityIcon(item.item_rarity, 12)}
                                    <span>{item.item_name}</span>
                                </span>
                            </div>

                            <img
                                src={getItemImageUrl(item)}
                                alt=""
                                width={32}
                                height={32}
                                style={{
                                    imageRendering: 'pixelated',
                                    flexShrink: 0,
                                    position: 'relative',
                                    zIndex: 1,
                                    filter: t.isInsane
                                        ? `drop-shadow(0 0 8px ${COLORS.insaneHolo[1]}88)`
                                        : t.isMythic
                                            ? `drop-shadow(0 0 6px ${t.color}66)`
                                            : 'none',
                                }}
                            />
                        </div>
                    );
                })}
            </div>

            <button
                onClick={onOpenFull}
                style={{
                    flexShrink: 0,
                    alignSelf: 'center',
                    background: 'transparent',
                    // Signboard, not a box (the Nocturne has no frames): one line of amber type that lights on hover keeps the affordance.
                    border: 'none',
                    color: COLORS.textMuted,
                    fontSize: '11px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    padding: '7px 4px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = COLORS.gold; }}
                onMouseLeave={e => { e.currentTarget.style.color = COLORS.textMuted; }}
            >
                All drops
            </button>
        </div>
    );
}
