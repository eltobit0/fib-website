import React, { useState, useMemo } from 'react';
import { Sparkles, Zap, Crown, Star, Gem, Diamond, Map, AlertTriangle, Gift } from 'lucide-react';
import { COLORS } from '../config/constants';
import { WHEEL_TEXTURE_URL } from '../../../config/constants.js';
import { RARITY, RARITY_KEYS, getRarityInk } from '../../../utils/rarityHelpers.jsx';

// RarityIndicator takes an icon component, so it cannot use getRarityIcon; label and colour come from the shared ladder.
const RARITY_ICON = {
    insane: Crown,
    mythic: Sparkles,
    legendary: Star,
    relic: Map,
    exotic: Gem,
    rare: Diamond,
};

/** A concentric rule around the card. Static: motion here belongs to the reel. */
const OrbitalRing = ({ size, color, opacity = 0.3 }) => (
    <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        border: `1px solid ${color}`,
        borderRadius: '50%',
        opacity,
        pointerEvents: 'none',
    }} />
);

/** One mote in the ring of eight. Values derive from `index`, not Math.random, so motes do not reshuffle when the accent changes. */
const FloatingParticle = ({ index, color }) => {
    const style = useMemo(() => {
        const angle = (index / 8) * Math.PI * 2;
        const jitter = (index * 0.618034) % 1;
        const radius = 80 + jitter * 40;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const size = 2 + ((index * 0.381966) % 1) * 4;

        return {
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 ${size * 2}px ${color}`,
            transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
            pointerEvents: 'none',
        };
    }, [index, color]);

    return <div style={style} />;
};

const RarityIndicator = ({ color, label, icon: Icon, delay }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        animation: `fadeIn 0.5s ease-out ${delay}s both`,
    }}>
        <Icon
            size={12}
            color={color}
            style={{
                filter: `drop-shadow(0 0 4px ${color})`,
            }}
        />
        <span style={{
            fontSize: '11px',
            color: color,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontWeight: '500',
        }}>{label}</span>
    </div>
);

/** The rarity key; stays visible through the spin. Uses getRarityInk, not getRarityColor: these are labels, and icons count as text. */
const RarityLegend = ({ style }) => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '16px',
        ...style,
    }}>
        {RARITY_KEYS
            .filter(key => key !== 'common' && key !== 'event')
            .map((key, index) => (
                <RarityIndicator
                    key={key}
                    color={getRarityInk(key)}
                    label={RARITY[key].label}
                    icon={RARITY_ICON[key]}
                    delay={index * 0.1}
                />
            ))}
    </div>
);

/** The `SPACE to spin` hint. No wrapper opacity: it multiplies contrast, and muted ink alone already sits near the floor. */
const KeyboardHint = () => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '8px',
    }}>
        <kbd style={{
            padding: '4px 10px',
            background: COLORS.bgLighter,
            borderRadius: '6px',
            border: `1px solid ${COLORS.border}`,
            fontSize: '11px',
            fontWeight: '600',
            fontFamily: 'monospace',
            color: COLORS.text,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        }}>
            SPACE
        </kbd>
        <span style={{ fontSize: '11px', color: COLORS.textMuted }}>to spin</span>
    </div>
);

export function EnhancedWheelIdleState({
                                           user,
                                           allItems,
                                           totalItemCount,
                                           recursionActive,
                                           recursionSpinsRemaining,
                                           kotwLuckySpins = 0,
                                           // A daily bounty box is waiting: the next spin opens it.
                                           mysteryBox = false,
                                           error,
                                           onSpin,
                                           isMobile,
                                           isLoading = false,
                                           loadingProgress = 0,
                                           // Kept mounted while spinning (button disabled), so the stage row keeps its height.
                                           isSpinning = false,
                                       }) {
    const [isHovered, setIsHovered] = useState(false);
    // `active` unites hover and keyboard focus, so a keyboard user gets the same affordance.
    const [isFocused, setIsFocused] = useState(false);
    // Held rather than left to `:active`, because the depression has to survive a
    // pointer that slides off mid-press and has to be releasable by the blur below.
    const [isPressed, setIsPressed] = useState(false);
    // `ready`: the player could spin if the button were free; `isDisabled`: it is not free. The secondary lines key on `ready`.
    const ready = !!user && allItems.length > 0 && !isLoading;
    const isDisabled = !ready || isSpinning;
    const active = (isHovered || isFocused) && !isDisabled;
    const pressed = isPressed && !isDisabled;
    // WheelSpinner passes `mysteryBox` only when no recursion window is open, so the box outranks banked lucky spins as on the reel.
    const showRecursionEffects = recursionActive && recursionSpinsRemaining > 0;
    const showKotwLuckyEffects = kotwLuckySpins > 0 && !showRecursionEffects && !mysteryBox;
    const showAnyLuckyEffects = showRecursionEffects || showKotwLuckyEffects;

    const KOTW_CRIMSON = '#F43F5E';
    const KOTW_GOLD = '#F59E0B';

    const particleColor = showRecursionEffects ? COLORS.recursion : showKotwLuckyEffects ? KOTW_GOLD : COLORS.gold;
    const accentColor = particleColor;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: isMobile ? '8px' : '14px',
            position: 'relative',
            // No minHeight: the grid row owns the height, and a floor here pushes it past the viewport on short screens.
            justifyContent: 'center',
            padding: isMobile ? '8px 12px' : '16px 20px',
        }}>
            {/* Sized by the card (fit-content, no height); the rings are positioned against this box. */}
            {/* Desktop only: on a phone the reel is already the spin control, and the card would be a second one. */}
            {!isMobile && <div style={{
                position: 'relative',
                width: 'fit-content',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: showAnyLuckyEffects ? (isMobile ? '200px' : '280px') : (isMobile ? '190px' : '260px'),
                    height: showAnyLuckyEffects ? (isMobile ? '200px' : '280px') : (isMobile ? '190px' : '260px'),
                    background: showRecursionEffects
                        ? `radial-gradient(circle, ${COLORS.recursion}40 0%, ${COLORS.recursion}15 40%, transparent 70%)`
                        : showKotwLuckyEffects
                            ? `radial-gradient(circle, ${KOTW_CRIMSON}30 0%, ${KOTW_GOLD}15 30%, transparent 70%)`
                            : `radial-gradient(circle, ${COLORS.gold}25 0%, ${COLORS.orange}10 40%, transparent 70%)`,
                    borderRadius: '50%',
                    // Transform only: repainting a radial this large on hover is the expensive thing in this block.
                    scale: active ? '1.06' : '1',
                    transition: 'scale 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
                    pointerEvents: 'none',
                }} />

                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: isMobile ? '150px' : '200px',
                    height: isMobile ? '150px' : '200px',
                    background: showRecursionEffects
                        ? `radial-gradient(circle, transparent 60%, ${COLORS.recursion}15 80%, transparent 100%)`
                        : showKotwLuckyEffects
                            ? `radial-gradient(circle, transparent 60%, ${KOTW_CRIMSON}12 70%, ${KOTW_GOLD}10 85%, transparent 100%)`
                            : `radial-gradient(circle, transparent 60%, ${COLORS.gold}10 80%, transparent 100%)`,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }} />

                {!isMobile && (
                    <>
                        <OrbitalRing
                            size="220px"
                            color={showRecursionEffects ? COLORS.recursion : showKotwLuckyEffects ? KOTW_CRIMSON : COLORS.gold}
                            opacity={active ? 0.3 : 0.2}
                        />
                        <OrbitalRing
                            size="260px"
                            color={showRecursionEffects ? COLORS.recursion : showKotwLuckyEffects ? KOTW_GOLD : COLORS.purple}
                            opacity={active ? 0.22 : 0.15}
                        />
                        <OrbitalRing
                            size="300px"
                            color={showRecursionEffects ? COLORS.recursion : showKotwLuckyEffects ? KOTW_CRIMSON : COLORS.aqua}
                            opacity={active ? 0.16 : 0.1}
                        />
                    </>
                )}

                {!isMobile && Array.from({ length: 8 }).map((_, i) => (
                    <FloatingParticle key={i} index={i} color={particleColor} />
                ))}

                <button
                    onClick={onSpin}
                    disabled={isDisabled}
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => { setIsFocused(false); setIsPressed(false); }}
                    onMouseDown={() => setIsPressed(true)}
                    onMouseUp={() => setIsPressed(false)}
                    aria-label={isLoading ? 'Loading items' : isSpinning ? 'Spinning' : 'Spin the wheel'}
                    style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        position: 'relative',
                        zIndex: 2,
                        lineHeight: 0,
                        outline: 'none',
                        // Lift and press share one transform so they cannot fight.
                        transform: pressed
                            ? 'scale(0.97) translateY(1px)'
                            : active ? 'scale(1.05)' : 'scale(1)',
                        transition: 'transform 0.26s cubic-bezier(0.22, 1, 0.36, 1), filter 0.26s, opacity 0.26s',
                        filter: isDisabled
                            ? 'grayscale(0.7) brightness(0.6)'
                            : active
                                ? `drop-shadow(0 6px 22px ${accentColor}66) drop-shadow(0 0 10px ${accentColor}55)`
                                : `drop-shadow(0 4px 14px ${accentColor}33)`,
                        opacity: isDisabled ? 0.6 : 1,
                    }}
                >
                    <img
                        src={WHEEL_TEXTURE_URL}
                        alt=""
                        aria-hidden="true"
                        draggable={false}
                        style={{
                            // Sized to fit the stage row: larger pushes the keyboard hint off the viewport on desktop and overflows the phone's apron.
                            width: isMobile ? '108px' : '150px',
                            height: 'auto',
                            display: 'block',
                            // Pixel art upscaled, so nearest neighbour: interpolate when shrinking, never when enlarging.
                            imageRendering: 'pixelated',
                            userSelect: 'none',
                        }}
                    />
                </button>
            </div>}

            <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                {isLoading ? (() => {
                    const clampedProgress = Math.min(100, Math.max(0, loadingProgress));
                    return (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: isMobile ? '4px' : '8px',
                        }}>
                            <div style={{
                                color: COLORS.gold,
                                fontSize: isMobile ? '13px' : '14px',
                                fontWeight: 600,
                            }}>
                                Loading items... {clampedProgress}%
                            </div>
                            <div
                                role="progressbar"
                                aria-valuenow={clampedProgress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label="Loading items"
                                style={{
                                    width: isMobile ? '140px' : '120px',
                                    height: '6px',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '999px',
                                    overflow: 'hidden',
                                }}>
                                <div style={{
                                    // Scaled with a transform rather than `width`, so progress ticks cost no layout while ~1,500 sprites load.
                                    width: '100%',
                                    height: '100%',
                                    transformOrigin: 'left center',
                                    transform: `scaleX(${clampedProgress / 100})`,
                                    background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.orange})`,
                                    borderRadius: '999px',
                                    transition: 'transform 0.15s ease-out',
                                    boxShadow: `0 0 8px ${COLORS.gold}66`,
                                }} />
                            </div>
                        </div>
                    );
                })() : (
                    <div style={{
                        color: showRecursionEffects ? COLORS.recursion : showKotwLuckyEffects ? '#F8FAFC' : COLORS.gold,
                        fontSize: isMobile ? '15px' : '18px',
                        fontWeight: '700',
                        marginBottom: isMobile ? '4px' : '8px',
                        textShadow: showRecursionEffects
                            ? `0 0 20px ${COLORS.recursion}`
                            : showKotwLuckyEffects
                                ? `0 0 15px ${KOTW_CRIMSON}88`
                                : `0 0 20px ${COLORS.gold}44`,
                        letterSpacing: showAnyLuckyEffects ? '2px' : '0.5px',
                        animation: 'none',
                    }}>
                        {!user ? 'Login to spin!'
                            : allItems.length === 0 ? 'Fetching item pool...'
                                : mysteryBox
                                    ? (
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                                            letterSpacing: '2px', textTransform: 'uppercase',
                                            background: `linear-gradient(100deg, ${COLORS.mysteryGilt[0]}, ${COLORS.mysteryGilt[1]} 55%, ${COLORS.mysteryGilt[2]})`,
                                            WebkitBackgroundClip: 'text', backgroundClip: 'text',
                                            color: 'transparent', WebkitTextFillColor: 'transparent',
                                        }}>
                                            <Gift size={isMobile ? 16 : 18} color={COLORS.mystery} /> Mystery box
                                        </span>
                                    )
                                : showRecursionEffects
                                    ? (
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                            <Zap size={isMobile ? 16 : 18} /> {recursionSpinsRemaining} LUCKY SPIN{recursionSpinsRemaining !== 1 ? 'S' : ''}! <Zap size={isMobile ? 16 : 18} />
                                        </span>
                                    )
                                    : showKotwLuckyEffects
                                        ? null
                                        // Nothing here on desktop, where the button already says "Spin". On a phone the reel is the control, so this names the gesture.
                                        : isMobile ? 'Tap the reel to spin' : null}
                    </div>
                )}

                <div style={{
                    color: COLORS.textMuted,
                    fontSize: isMobile ? '11px' : '13px',
                    marginBottom: isMobile ? '8px' : '12px',
                }}>
                    {mysteryBox && user ? (
                        <span style={{ color: COLORS.mystery, fontWeight: '600' }}>
                            One special · every one at equal odds
                        </span>
                    ) : showRecursionEffects ? (
                        <span style={{
                            color: COLORS.recursion,
                            fontWeight: '500',
                        }}>
                            Equal chance for ALL items!
                        </span>
                    ) : showKotwLuckyEffects ? (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                        }}>
                            <span style={{ color: KOTW_GOLD, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><Sparkles size={14} /> Equal odds!</span>
                            <span style={{
                                color: KOTW_CRIMSON,
                                fontSize: isMobile ? '9px' : '10px',
                                fontWeight: '700',
                                background: `${KOTW_CRIMSON}22`,
                                padding: '2px 6px',
                                borderRadius: '4px',
                            }}>KING OF THE WHEEL</span>
                        </span>
                    ) : null}
                    {/* Held with `visibility` rather than a conditional, so the line never collapses and moves the legend. */}
                    {!showAnyLuckyEffects && (
                        <span style={{
                            visibility: ready ? 'visible' : 'hidden',
                            fontVariantNumeric: 'tabular-nums',
                        }}>
                            {/* Explicitly en-US: the site is English-only, and a German locale renders 1,559 as "1.559". */}
                            {totalItemCount
                                ? `Win one of ${totalItemCount.toLocaleString('en-US')} items`
                                : 'Good luck'}
                        </span>
                    )}
                </div>

                {!showAnyLuckyEffects && allItems.length > 0 && !isMobile && (
                    <RarityLegend style={{ marginBottom: '12px' }} />
                )}

                {!isMobile && user && allItems.length > 0 && <KeyboardHint />}

                {error && (
                    <div role="alert" style={{
                        marginTop: '16px',
                        padding: '12px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: `linear-gradient(135deg, ${COLORS.red}22 0%, ${COLORS.red}11 100%)`,
                        border: `1px solid ${COLORS.red}44`,
                        borderRadius: '10px',
                        color: COLORS.red,
                        fontSize: '13px',
                        fontWeight: '500',
                        animation: 'slideUp 0.3s ease-out',
                    }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

            </div>
        </div>
    );
}
