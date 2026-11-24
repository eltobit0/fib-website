import React, { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { COLORS, SPACE } from '../config/constants';
import { PrestigeRing } from '../spin/StageFlanks.jsx';
import { prestigeIcon, prestigeInk, prestigeLabel } from '../../../utils/prestigeHelpers.js';

// The topbar's shared control vocabulary: one button for everything in the row. Hover is a background tint and a colour step; nothing moves or casts a shadow into a 56px row (a lifted button next to still ones read as broken hover). `tone` carries the two states that differ in meaning: `attention` (mobile Live, unread bell) and `danger` (logout).

const TONES = {
    // Everything that is just a way in to something else.
    default: { idle: COLORS.textMuted, hover: COLORS.text, wash: 'rgba(255,255,255,0.07)' },
    // Something is waiting for you: unread notifications, live activity on mobile.
    attention: { idle: COLORS.green, hover: COLORS.green, wash: `${COLORS.green}22` },
    // Something is running right now — music playing. Distinct from `attention`
    // because it is not asking for anything.
    active: { idle: COLORS.accent, hover: COLORS.accent, wash: `${COLORS.accent}22` },
    // Something to notice, such as muted sound: coloured at rest, unlike `danger`, so it reads without a pointer.
    muted: { idle: COLORS.red, hover: COLORS.red, wash: `${COLORS.red}22` },
    // Destructive on click, unremarkable until then: logout.
    danger: { idle: COLORS.textMuted, hover: COLORS.red, wash: `${COLORS.red}22` },
};

export const TOPBAR_CONTROL_SIZE = 38;

export function TopbarIconButton({
    onClick,
    icon,
    label,
    tone = 'default',
    badge = null,
    // 'center' hangs the tooltip under the button's middle; 'end' pins its right edge to the button's. The last control sits ~43px from the viewport edge, so a centred tooltip wider than ~86px would hang off the page (see TopbarTooltip).
    align = 'center',
    children,
}) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const palette = TONES[tone] ?? TONES.default;
    const active = hovered || focused;

    return (
        <div style={{ position: 'relative', display: 'flex' }}>
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                // The tooltip is decoration for pointer users; the accessible
                // name has to exist whether or not it is showing.
                aria-label={label}
                style={{
                    width: `${TOPBAR_CONTROL_SIZE}px`,
                    height: `${TOPBAR_CONTROL_SIZE}px`,
                    padding: 0,
                    background: active ? palette.wash : 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '10px',
                    color: active ? palette.hover : palette.idle,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'background 0.18s ease, color 0.18s ease',
                }}
            >
                {icon}
                {badge}
                {children}
            </button>

            {active && label && <TopbarTooltip label={label} align={align} />}
        </div>
    );
}

// Tooltips hang below (nothing is above them but the viewport edge); the arrow and entry animation are geometry for coming down from a button, not up.
function TopbarTooltip({ label, align = 'center' }) {
    const end = align === 'end';

    return (
        <div
            role="tooltip"
            style={{
                position: 'absolute',
                top: '100%',
                marginTop: `${SPACE.sm}px`,
                ...(end
                    ? { right: 0 }
                    : { left: '50%', transform: 'translateX(-50%)' }),
                padding: '6px 12px',
                background: COLORS.bgLighter,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '8px',
                color: COLORS.text,
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
                zIndex: 10,
                // Two keyframes: the centred variant must keep its `translateX(-50%)` throughout and the end-aligned one must not have it.
                animation: `${end ? 'tooltipDropEnd' : 'tooltipDrop'} 0.18s ease-out`,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            }}
        >
            {label}
            <div style={{
                position: 'absolute',
                top: '-5px',
                // Half the control's width, less half the arrow — so the notch
                // still points at the middle of the button it belongs to.
                ...(end
                    ? { right: `${TOPBAR_CONTROL_SIZE / 2 - 4}px`, transform: 'rotate(45deg)' }
                    : { left: '50%', transform: 'translateX(-50%) rotate(45deg)' }),
                width: '8px',
                height: '8px',
                background: COLORS.bgLighter,
                borderLeft: `1px solid ${COLORS.border}`,
                borderTop: `1px solid ${COLORS.border}`,
            }} />
        </div>
    );
}

// The identity control: who you are and the way in to your own board, a wide `TopbarIconButton` (same height, radius and hover as its neighbours). It wears the prestige ring (the player's own face never did) and the level's mark in its tier ink; `prestigeHelpers` maps a level to a rarity and the ladder supplies the rest.
export function TopbarUserChip({ avatarUrl, name, approved, pending, standing, onClick }) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const active = hovered || focused;
    const palette = TONES.default;
    const level = standing?.level || 0;

    return (
        <div style={{ position: 'relative', display: 'flex' }}>
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                // The level rides in the accessible name, not in the tooltip.
                // See the tooltip line at the end of this component for why.
                aria-label={level > 0 ? `Open your profile — ${prestigeLabel(level)}` : 'Open your profile'}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: `${SPACE.sm}px`,
                    height: `${TOPBAR_CONTROL_SIZE}px`,
                    // 4px + a 28px avatar + 4px is the 36px core; the ring spends its 2px inside that gap, so the chip is the same height for everyone and the row does not move when someone earns a level.
                    padding: `0 ${SPACE.md}px 0 ${level ? 3 : 5}px`,
                    background: active ? palette.wash : 'transparent',
                    border: '1px solid transparent',
                    borderRadius: '10px',
                    color: active ? palette.hover : COLORS.text,
                    cursor: 'pointer',
                    flexShrink: 1,
                    minWidth: 0,
                    transition: 'background 0.18s ease, color 0.18s ease',
                }}
            >
                <PrestigeRing standing={standing || { level: 0 }}>
                    <img
                        src={avatarUrl}
                        alt=""
                        width={28}
                        height={28}
                        style={{
                            display: 'block',
                            borderRadius: '50%',
                            background: COLORS.bgLighter,
                        }}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                        }}
                    />
                </PrestigeRing>

                <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 0,
                }}>
                    {name}
                </span>

                {/* The level's mark in its tier's ink, and nothing else: the numeral carried the same one bit (the level picks the icon). The tooltip names it. */}
                {level > 0 && (
                    <span
                        aria-hidden="true"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexShrink: 0,
                            color: prestigeInk(level),
                        }}
                    >
                        {prestigeIcon(level, 13)}
                    </span>
                )}

                {/* Approval state, in the chip because it is a fact about the
                    name rather than an action you can take on it. */}
                {approved && <Check size={15} color={COLORS.green} style={{ flexShrink: 0 }} />}
                {pending && <Clock size={15} color={COLORS.gold} style={{ flexShrink: 0 }} />}
            </button>

            {/* The tooltip names the ACTION, never the status: every tooltip in this row answers "what happens if I click this". The level has three other homes on this control (ring, mark, accessible name). */}
            {active && <TopbarTooltip label="Your profile" align="center" />}
        </div>
    );
}

// A hairline between two groups of controls: it is what makes the right-hand end read as three groups rather than a run of twelve buttons.
export function TopbarDivider() {
    return (
        <div
            aria-hidden="true"
            style={{
                width: '1px',
                alignSelf: 'stretch',
                margin: `${SPACE.xs}px ${SPACE.xs}px`,
                background: COLORS.border,
                opacity: 0.7,
                flexShrink: 0,
            }}
        />
    );
}
