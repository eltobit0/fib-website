import React from 'react';
import { COLORS, SPACE, Z } from '../config/constants';
import { formatChance, getItemRarity, getItemImageUrl } from '../../../utils/helpers.js';
import {
    RARITY,
    getRarityColor,
    getRarityInk,
    getRarityIcon,
    isIridescentRarity,
} from '../../../utils/rarityHelpers.jsx';
import { LANE_SEAM } from './SpinLanes.jsx';

// A common in a triple-lucky spin is green, as the reel paints it (`isLuckySpin` makes every tile in a lucky strip worth the same); the answer must keep the mode's identity. Only the triple applies it: the 5x's commons are genuinely grey in the band.
function modeCommonColor(rarity, isTripleLucky) {
    return rarity === 'common' && isTripleLucky ? COLORS.green : null;
}

// The 5x / triple readout: one answer per track, standing under its own track. The plaques share the tracks' grid (one column per track, the same `flex: 1` and seam width) so answer N is under track N and no re-pairing by colour is needed. Each is SpinResult's shaft of tier light at track scale, not a box; DESIGN.md §8's signboard register still applies to the bonus board's answer.
// Mobile is full-width rows in lane order, each led by a tick of its track's light: a ~70px column cannot carry an item name above the 10px floor.
export function LaneResultsRow({
    items = [],
    isTripleLucky = false,
    isMobile = false,
    isNew = [],
    laneCount = 5,
}) {
    const present = items.filter(Boolean);
    if (present.length === 0) return null;

    if (isMobile) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                gap: `${SPACE.sm}px`,
                paddingTop: `${SPACE.sm}px`,
            }}>
                {present.map((item, idx) => (
                    <LaneAnswerRow
                        key={idx}
                        item={item}
                        index={idx}
                        isNewItem={isNew[idx] === true}
                        isTripleLucky={isTripleLucky}
                    />
                ))}
            </div>
        );
    }

    const seam = LANE_SEAM(false);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'stretch',
            width: '100%',
            // No padding-top: the shafts start at this row's top edge (the band's underside), so the light is continuous across the seam; the breathing room is inside each column.
        }}>
            {present.map((item, idx) => (
                <React.Fragment key={idx}>
                    <LaneAnswerColumn
                        item={item}
                        index={idx}
                        isNewItem={isNew[idx] === true}
                        isTripleLucky={isTripleLucky}
                        laneCount={laneCount}
                    />
                    {idx < present.length - 1 && (
                        // The track seam continuing past the deck and dying: the mirror of the band's seam, full at the top and gone a third of the way down. It holds the columns in register.
                        <div aria-hidden="true" style={{
                            alignSelf: 'stretch',
                            flex: `0 0 ${seam}px`,
                            width: `${seam}px`,
                            // Built from `seam`, not hardcoded stops: the channel widened from 3px to 7px and a fixed gradient left transparent pixels in the cut.
                            background: `linear-gradient(90deg, rgba(0,0,0,0.42) 0 1px, rgba(0,0,0,0.58) 1px ${seam - 1}px, rgba(190,198,220,0.14) ${seam - 1}px ${seam}px)`,
                            WebkitMaskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.3) 22%, transparent 44%)',
                            maskImage: 'linear-gradient(180deg, #000 0%, rgba(0,0,0,0.3) 22%, transparent 44%)',
                        }} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

// One track's answer, desktop, sized by track count (~638px at 1920 for three, ~381px for five), so the triple runs a step larger.
function LaneAnswerColumn({ item, index, isNewItem, isTripleLucky, laneCount }) {
    const rarity = getItemRarity(item);
    const iridescent = isIridescentRarity(rarity);
    const modeCommon = modeCommonColor(rarity, isTripleLucky);
    const tierColor = modeCommon || getRarityColor(rarity);
    const tierInk = modeCommon || getRarityInk(rarity);
    // The flat hue for pieces that cannot take a gradient: insane borrows the slick's opening stop, as SpinResult does.
    const tierGlow = iridescent ? COLORS.insaneHolo[0] : tierColor;

    const wide = laneCount <= 3;
    const itemPx = wide ? 84 : 64;
    // Item names run from "Dirt" to "Waxed Oxidized Cut Copper Stairs"; the narrow column wraps (two balanced lines beat one of 11px type).
    const nameSize = wide ? '19px' : '15px';

    // Only the 5x shows a drop rate: the triple lucky is an equal-chance roll, and the pool's own odds would answer a different question.
    const chance = !isTripleLucky && item.chance != null ? formatChance(item.chance) : null;

    return (
        <div style={{
            position: 'relative',
            flex: '1 1 0',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            paddingTop: `${SPACE.md}px`,
            paddingLeft: '10px',
            paddingRight: '10px',
            paddingBottom: `${SPACE.sm}px`,
            // Lane order, at the cadence the lanes themselves landed in.
            animation: `textFadeUp 0.42s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.07}s both`,
        }}>
            {/* The shaft, continuing out of this column's track: widest where it leaves the band and thinning into the page. */}
            <div
                aria-hidden="true"
                className={iridescent ? 'fib-holo' : undefined}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '112%',
                    height: wide ? '190px' : '150px',
                    ...(iridescent
                        ? {
                            opacity: 0.3,
                            WebkitMaskImage: 'radial-gradient(ellipse 56% 100% at 50% 0%, #000 0%, rgba(0,0,0,0.32) 45%, transparent 78%)',
                            maskImage: 'radial-gradient(ellipse 56% 100% at 50% 0%, #000 0%, rgba(0,0,0,0.32) 45%, transparent 78%)',
                        }
                        : { background: `radial-gradient(ellipse 56% 100% at 50% 0%, ${tierColor}33 0%, ${tierColor}12 45%, transparent 78%)` }),
                    filter: 'blur(1px)',
                    pointerEvents: 'none',
                    zIndex: Z.base,
                }}
            />

            {/* Tier line. One row, and the only place the tier is named. */}
            <div style={{
                position: 'relative',
                zIndex: Z.content,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                    {getRarityIcon(rarity, wide ? 14 : 12)}
                </span>
                <span
                    className={iridescent ? 'fib-holo' : undefined}
                    style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        ...(iridescent
                            ? {
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                color: 'transparent',
                                WebkitTextFillColor: 'transparent',
                            }
                            : { color: tierInk }),
                    }}
                >
                    {(RARITY[rarity] || RARITY.common).label}
                </span>
            </div>

            {/* The item, standing in its own light. */}
            <div style={{
                position: 'relative',
                zIndex: Z.content,
                width: `${itemPx}px`,
                height: `${itemPx}px`,
                display: 'grid',
                placeItems: 'center',
            }}>
                <div
                    aria-hidden="true"
                    className={iridescent ? 'fib-holo' : undefined}
                    style={{
                        position: 'absolute',
                        inset: '-16%',
                        borderRadius: '50%',
                        opacity: iridescent ? 0.8 : 0.4,
                        filter: iridescent ? 'blur(8px)' : 'blur(12px)',
                        ...(iridescent
                            ? {
                                WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                                maskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                            }
                            : { background: `radial-gradient(circle, ${tierColor} 0%, transparent 68%)` }),
                        pointerEvents: 'none',
                    }}
                />
                <img
                    src={getItemImageUrl(item)}
                    alt={item.name}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        imageRendering: 'pixelated',
                        filter: `drop-shadow(0 0 14px ${tierGlow}99) drop-shadow(0 5px 8px rgba(0,0,0,0.55))`,
                    }}
                />
            </div>

            {/* Floor. The pool the item stands in, so it is grounded in this
                column rather than floating in the middle of it. */}
            <div
                aria-hidden="true"
                className={iridescent ? 'fib-holo' : undefined}
                style={{
                    width: `${Math.round(itemPx * 1.5)}px`,
                    maxWidth: '100%',
                    height: wide ? '10px' : '8px',
                    marginTop: '-4px',
                    borderRadius: '50%',
                    ...(iridescent
                        ? {
                            WebkitMaskImage: 'radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.33) 38%, transparent 72%)',
                            maskImage: 'radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.33) 38%, transparent 72%)',
                        }
                        : { background: `radial-gradient(ellipse at center, ${tierColor} 0%, ${tierColor}55 38%, transparent 72%)` }),
                    boxShadow: `0 0 20px ${tierGlow}55`,
                    pointerEvents: 'none',
                }}
            />

            {/* Name: two balanced lines at most; a long name wraps rather than being cut. */}
            <div style={{
                position: 'relative',
                zIndex: Z.content,
                marginTop: '4px',
                fontSize: nameSize,
                fontWeight: 800,
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                textAlign: 'center',
                color: COLORS.text,
                textShadow: `0 0 24px ${tierGlow}55`,
                textWrap: 'balance',
                maxWidth: '100%',
            }}>
                {item.name}
            </div>

            {(chance || isNewItem) && (
                <div style={{
                    position: 'relative',
                    zIndex: Z.content,
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${SPACE.sm}px`,
                    marginTop: '2px',
                }}>
                    {/* The rate as type, not a chip: five of SpinResult's 999px pills would turn the readout back into a pill rack. Tier ink because it is text. */}
                    {chance && (
                        <span style={{
                            fontSize: wide ? '13px' : '12px',
                            fontWeight: 700,
                            color: tierInk,
                            fontVariantNumeric: 'tabular-nums',
                            textShadow: `0 0 14px ${tierGlow}44`,
                        }}>
                            {chance}%
                        </span>
                    )}
                    {isNewItem && <NewFlag />}
                </div>
            )}
        </div>
    );
}

/** One track's answer, mobile: a full-width row led by its track's light. */
function LaneAnswerRow({ item, index, isNewItem, isTripleLucky }) {
    const rarity = getItemRarity(item);
    const iridescent = isIridescentRarity(rarity);
    const modeCommon = modeCommonColor(rarity, isTripleLucky);
    const tierColor = modeCommon || getRarityColor(rarity);
    const tierInk = modeCommon || getRarityInk(rarity);
    const tierGlow = iridescent ? COLORS.insaneHolo[0] : tierColor;
    const chance = !isTripleLucky && item.chance != null ? formatChance(item.chance) : null;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            paddingRight: '4px',
            animation: `textFadeUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) ${index * 0.07}s both`,
        }}>
            {/* The track's tick: the row's link back to its lane, in that lane's light (the shaft seen end-on, not a card accent). */}
            <div
                aria-hidden="true"
                className={iridescent ? 'fib-holo' : undefined}
                style={{
                    flex: '0 0 3px',
                    width: '3px',
                    alignSelf: 'stretch',
                    minHeight: '34px',
                    ...(iridescent ? {} : { background: tierColor }),
                    boxShadow: `0 0 10px ${tierGlow}88`,
                }}
            />

            <div style={{
                position: 'relative',
                flex: '0 0 34px',
                width: '34px',
                height: '34px',
                display: 'grid',
                placeItems: 'center',
            }}>
                <div
                    aria-hidden="true"
                    className={iridescent ? 'fib-holo' : undefined}
                    style={{
                        position: 'absolute',
                        inset: '-14%',
                        borderRadius: '50%',
                        opacity: iridescent ? 0.75 : 0.36,
                        filter: 'blur(8px)',
                        ...(iridescent
                            ? {
                                WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                                maskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                            }
                            : { background: `radial-gradient(circle, ${tierColor} 0%, transparent 68%)` }),
                        pointerEvents: 'none',
                    }}
                />
                <img
                    src={getItemImageUrl(item)}
                    alt={item.name}
                    style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        imageRendering: 'pixelated',
                        filter: `drop-shadow(0 0 8px ${tierGlow}88)`,
                    }}
                />
            </div>

            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: COLORS.text,
                    lineHeight: 1.25,
                }}>
                    {item.name}
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '2px',
                }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                        {getRarityIcon(rarity, 11)}
                    </span>
                    <span
                        className={iridescent ? 'fib-holo' : undefined}
                        style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            ...(iridescent
                                ? {
                                    WebkitBackgroundClip: 'text',
                                    backgroundClip: 'text',
                                    color: 'transparent',
                                    WebkitTextFillColor: 'transparent',
                                }
                                : { color: tierInk }),
                        }}
                    >
                        {(RARITY[rarity] || RARITY.common).label}
                    </span>
                    {chance && (
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: tierInk,
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {chance}%
                        </span>
                    )}
                </div>
            </div>

            {isNewItem && <NewFlag />}
        </div>
    );
}

/** The same NEW marker the payoff panel uses, so the flag means one thing. */
function NewFlag() {
    return (
        <span style={{
            flex: '0 0 auto',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.1em',
            padding: '3px 7px',
            borderRadius: '5px',
            background: `${COLORS.green}22`,
            border: `1px solid ${COLORS.green}55`,
            color: COLORS.green,
        }}>
            NEW
        </span>
    );
}

export default LaneResultsRow;
