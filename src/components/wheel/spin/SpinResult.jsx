import { Crown, Crosshair } from 'lucide-react';
import { KotwPoints } from './KotwSpinControl.jsx';
import { ARENA } from '../config/arenaTheme.js';
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
import { PrestigeFlag, PrestigeCount } from './PrestigeFlag.jsx';
import { MysteryTag } from './MysteryTag.jsx';

// The payoff panel: what you just won. It continues the reel's light language (the winner's column carries on downward) rather than being a receipt, and reads every tier from RARITY via the shared helpers so a tier is defined in one place.
export function SpinResult({
    result,
    isNewItem,
    prestigePull,
    collection,
    resultWasRecursionSpin,
    resultWasKotwLuckySpin,
    isMobile,
    arena = false,
    firstBlood = false,
    forge = false,
    kotwPoints = null,
}) {
    if (!result) return null;

    const KOTW_CRIMSON = '#F43F5E';

    // Recursion and KOTW are spin *modes*, not tiers: they colour the panel without claiming a rung on RARITY.
    const rarity = getItemRarity(result);
    const tierColor = arena ? (rarity === "common" ? ARENA.gold : getRarityColor(rarity)) : resultWasRecursionSpin
        ? COLORS.recursion
        : resultWasKotwLuckySpin
            ? KOTW_CRIMSON
            : getRarityColor(rarity);
    const tierInk = arena ? (rarity === "common" ? ARENA.ink : getRarityInk(rarity)) : resultWasRecursionSpin
        ? COLORS.recursion
        : resultWasKotwLuckySpin
            ? KOTW_CRIMSON
            : getRarityInk(rarity);
    const label = (RARITY[rarity] || RARITY.common).label;
    const iridescent = isIridescentRarity(rarity) && !resultWasRecursionSpin && !resultWasKotwLuckySpin;

    // The flat hue for where this panel cannot take a gradient (text-shadow, border, tinted fill). Insane's `color` is the near-white platinum fallback, right for a badge and useless as light, so it uses the slick's opening magenta (the sprite's drop-shadow borrows it too) or the rarest pull lands duller than an exotic.
    const tierGlow = iridescent ? COLORS.insaneHolo[0] : tierColor;

    // Fixed steps, not a clamp() on viewport width: the constraint is the name's length ("Dirt" to "Waxed Oxidized Cut Copper Stairs"). It must stay one line: the stage row fits exactly and a second line would bring back the internal scrollbar.
    const nameLength = (result.name || '').length;
    const nameSize = isMobile
        ? (nameLength > 24 ? '17px' : nameLength > 16 ? '20px' : '22px')
        : (nameLength > 30 ? '22px' : nameLength > 22 ? '25px' : '30px');

    const itemPx = isMobile ? '92px' : forge ? '90px' : firstBlood ? 'var(--fb-result-item-size, 108px)' : arena ? 'var(--kotw-result-item-size, 108px)' : '118px';

    const owned = collection?.[result.texture];
    const chance = result.equalChance != null
        ? `${formatChance(result.equalChance)}% · equal chance`
        : result.chance != null
            ? `${formatChance(result.chance)}% drop rate`
            : null;

    return (
        <div className={forge ? 'cg-forge-result' : firstBlood ? 'fb-result' : arena ? "kotw-result" : undefined} style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: arena || firstBlood || forge ? '0px' : isMobile ? `${SPACE.md}px` : `${SPACE.lg}px`,
            animation: 'textFadeUp 0.45s cubic-bezier(0.25,0.46,0.45,0.94) both',
        }}>
            {arena && <Crown className="kotw-result-crown" strokeWidth={0.8} aria-hidden="true"/>}
            {firstBlood && <><Crosshair className="fb-result-mark" strokeWidth={.6} aria-hidden="true"/><div className="fb-result-caption">Last pull</div></>}
            {/* The winner's column, continuing from the underside of the reel: widest at the top and fading out, the mirror of the column above. */}
            <div
                aria-hidden="true"
                // Insane takes the whole slick, masked into the same top-down falloff; a sampled point spends two thirds of the cycle impersonating mythic or legendary.
                className={iridescent ? 'fib-holo' : undefined}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    // Wide enough to sit behind the name, not just the item: the beam has to be the widest thing here.
                    width: isMobile ? '92vw' : '620px',
                    maxWidth: '96vw',
                    height: isMobile ? '150px' : '210px',
                    // An ellipse anchored on the top edge, not a linear fade down a rectangle (which read as a grey box on a common pull); rarity is light, not a container.
                    ...(iridescent
                        ? {
                            opacity: 0.34,
                            WebkitMaskImage: 'radial-gradient(ellipse 58% 100% at 50% 0%, #000 0%, rgba(0,0,0,0.34) 45%, transparent 78%)',
                            maskImage: 'radial-gradient(ellipse 58% 100% at 50% 0%, #000 0%, rgba(0,0,0,0.34) 45%, transparent 78%)',
                        }
                        : { background: `radial-gradient(ellipse 58% 100% at 50% 0%, ${tierColor}3D 0%, ${tierColor}14 45%, transparent 78%)` }),
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
                gap: `${SPACE.sm}px`,
                marginBottom: arena ? '8px' : isMobile ? '10px' : '14px',
            }}>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                    {getRarityIcon(rarity, isMobile ? 13 : 15)}
                </span>
                <span
                    className={iridescent ? 'fib-holo' : undefined}
                    style={{
                        fontSize: isMobile ? '12px' : '13px',
                        fontWeight: 800,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        // Insane has no flat colour, so its label takes the whole slick via the shared .fib-holo class.
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
                    {/* "Lucky Spin", not an event's name: KOTW, First Blood and the Community Goal all pay into `users.lucky_spins` and none records the source. Naming the source needs a column or ledger on `users`. */}
                    {resultWasRecursionSpin ? 'Recursion' : resultWasKotwLuckySpin ? 'Lucky Spin' : label}
                </span>
                {/* Beside the tier, never in place of it: the item keeps its
                    own rarity colour, and the box is how it arrived. */}
                {!!result.isMystery &&<MysteryTag size={11} />}
                {isNewItem && (
                    <span style={{
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
                )}
                {/* The prestige twin: during a run the green NEW can never light (every pull is a main-collection duplicate), so this badge carries the meaning. */}
                <PrestigeFlag pull={prestigePull} itemName={result.name} />
            </div>

            {/* The item standing in the light: no frame (CanvasResultItem's boxes stay for the 3x/5x grids). A pool of tier light on the floor; insane keeps its slick via .fib-holo, which also brings the reduced-motion behaviour. */}
            <div style={{
                position: 'relative',
                zIndex: Z.content,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                animation: 'itemBoxReveal 0.5s cubic-bezier(0.25,0.46,0.45,0.94) 0.1s both',
            }}>
                <div style={{
                    position: 'relative',
                    width: itemPx,
                    height: itemPx,
                    display: 'grid',
                    placeItems: 'center',
                }}>
                    {/* The tier's light behind the item; for insane the drifting slick, masked to a soft disc. */}
                    <div
                        aria-hidden="true"
                        className={iridescent ? 'fib-holo' : undefined}
                        style={{
                            position: 'absolute',
                            inset: '-18%',
                            borderRadius: '50%',
                            // Insane runs hotter and tighter: its `color` is the platinum fallback, useless as a glow, so the light comes from the slick with enough opacity and little enough blur to stay magenta/cyan/gold.
                            opacity: iridescent ? 0.85 : 0.42,
                            filter: iridescent ? 'blur(9px)' : 'blur(14px)',
                            ...(iridescent ? {} : { background: `radial-gradient(circle, ${tierColor} 0%, transparent 68%)` }),
                            ...(iridescent ? {
                                WebkitMaskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                                maskImage: 'radial-gradient(circle, #000 0%, transparent 68%)',
                            } : {}),
                            pointerEvents: 'none',
                        }}
                    />

                    <img
                        src={getItemImageUrl(result)}
                        alt={result.name}
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            imageRendering: 'pixelated',
                            // CSS drop-shadow cannot take a gradient, so the halo borrows the slick's magenta while the disc supplies the rest of the cycle.
                            filter: `drop-shadow(0 0 18px ${iridescent ? COLORS.insaneHolo[0] : tierColor}AA) drop-shadow(0 6px 10px rgba(0,0,0,0.55))`,
                        }}
                    />
                </div>

                {/* Floor: an elliptical pool, since this is one object standing on its own rather than a column in a row. */}
                <div
                    aria-hidden="true"
                    className={iridescent ? 'fib-holo' : undefined}
                    style={{
                        width: isMobile ? '132px' : '178px',
                        height: isMobile ? '10px' : '13px',
                        marginTop: isMobile ? '2px' : '4px',
                        borderRadius: '50%',
                        // Same split as the beam: the slick masked into the pool's
                        // shape for insane, a flat radial for every other tier.
                        ...(iridescent
                            ? {
                                WebkitMaskImage: 'radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.33) 38%, transparent 72%)',
                                maskImage: 'radial-gradient(ellipse at center, #000 0%, rgba(0,0,0,0.33) 38%, transparent 72%)',
                            }
                            : { background: `radial-gradient(ellipse at center, ${tierColor} 0%, ${tierColor}55 38%, transparent 72%)` }),
                        boxShadow: `0 0 26px ${tierGlow}66`,
                        pointerEvents: 'none',
                    }}
                />

            </div>

            {/* Name. The largest text on the page at this moment, which is correct
                — it is the answer to the only question the spin asked. */}
            <h2 style={{
                position: 'relative',
                zIndex: Z.content,
                margin: `${arena || forge ? 8 : isMobile ? 12 : 16}px 0 0`,
                fontSize: nameSize,
                fontWeight: 800,
                letterSpacing: '-0.01em',
                lineHeight: 1.15,
                textAlign: 'center',
                color: COLORS.text,
                textShadow: `0 0 30px ${tierGlow}55`,
                // Bounded so a long name wraps rather than widening the stage, and balanced so the two lines come out even.
                maxWidth: isMobile ? '90vw' : '600px',
                textWrap: 'balance',
            }}>
                {result.name}
            </h2>

            {/* The drop rate gets its own chip in the tier's ink (the number a player screenshots); the collection count stays quiet beside it. `ink`, not the flat tier colour, because this is text. */}
            {arena && <KotwPoints points={kotwPoints}/>}
            {(!arena || kotwPoints == null) && (chance || owned > 1 || (prestigePull && prestigePull.count > 1)) && (
                <div style={{
                    position: 'relative',
                    zIndex: Z.content,
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${SPACE.sm}px`,
                    marginTop: '12px',
                }}>
                    {chance && (
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: isMobile ? '5px 11px' : '6px 14px',
                            borderRadius: '999px',
                            background: `${tierGlow}1A`,
                            border: `1px solid ${tierGlow}4D`,
                            color: tierInk,
                            fontSize: isMobile ? '13px' : '15px',
                            fontWeight: 700,
                            letterSpacing: '0.01em',
                            fontVariantNumeric: 'tabular-nums',
                            textShadow: `0 0 16px ${tierGlow}44`,
                        }}>
                            {chance}
                        </span>
                    )}
                    {owned > 1 && (
                        <span style={{
                            fontSize: isMobile ? '11px' : '12px',
                            color: COLORS.textMuted,
                        }}>
                            {owned} in collection
                        </span>
                    )}
                    <PrestigeCount
                        pull={prestigePull}
                        style={{ fontSize: isMobile ? '11px' : '12px' }}
                    />
                </div>
            )}
        </div>
    );
}
