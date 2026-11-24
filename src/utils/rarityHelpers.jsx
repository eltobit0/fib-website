import React from 'react';
import { Sparkles, Star, Diamond, Circle, Zap, Crown, Gem, Map } from 'lucide-react';
// The wheel's palette, not the wiki's oklch tokens: '../config/constants' gave legendary the wrong purple.
import { COLORS } from '../components/wheel/config/constants';

// THE RARITY LADDER: the single definition for the whole wheel; import it, never fork a copy.
// `color` is for fills/borders/glows; `ink` is the hue lifted to clear WCAG AA as text (absent = fill already clears it).
export const RARITY = {
    insane: {
        order: 0,
        label: 'Insane',
        color: COLORS.insaneFlat,
        // The only tier painted as a moving gradient rather than a colour.
        stops: COLORS.insaneHolo,
        // Separate from `stops`: mythic has stops too but keeps a flat colour; insane has none to fall back to.
        iridescent: true,
    },
    mythic: { order: 1, label: 'Mythic', color: COLORS.aqua, stops: COLORS.mythicCycle, lightFill: true },
    legendary: { order: 2, label: 'Legendary', color: COLORS.insane, lightFill: true },
    relic: { order: 3, label: 'Relic', color: COLORS.relic, lightFill: true },
    exotic: { order: 4, label: 'Exotic', color: COLORS.purple, ink: COLORS.purpleInk },
    rare: { order: 5, label: 'Rare', color: COLORS.red, ink: COLORS.redInk, lightFill: true },
    event: { order: 6, label: 'Event', color: COLORS.orange, lightFill: true },
    common: { order: 99, label: 'Common', color: COLORS.neutralInk },
};

// `lightFill`: fills where dark text (#1a1a1a) beats white on the worst gradient stop. Only exotic (#AA00AA) wants white.

export const RARITY_KEYS = Object.keys(RARITY).sort((a, b) => RARITY[a].order - RARITY[b].order);

const tier = rarity => RARITY[rarity] || RARITY.common;

export function getRarityColor(rarity) {
    return tier(rarity).color;
}

// For text rendered in the rarity's colour; getRarityColor is for the swatch beside it.
export function getRarityInk(rarity) {
    const t = tier(rarity);
    return t.ink || t.color;
}

// Text ON the tier's fill (the inverse of getRarityInk).
export function getRarityOnColor(rarity) {
    return tier(rarity).lightFill ? '#1a1a1a' : '#fff';
}

// Only insane, and only one tier ever should be.
export function isIridescentRarity(rarity) {
    return Boolean(tier(rarity).iridescent);
}

export function getRarityStops(rarity) {
    return tier(rarity).stops || null;
}

// Canvas twin of .fib-holo (canvas can't use CSS classes). Flat colour only where a gradient can't go, e.g. shadowColor.
export function sampleHolo(t) {
    return sampleRamp(RARITY.insane.stops, t);
}

// The one interpolator for animated tiers; `t` wraps, so repeat the first stop last for a seamless loop.
export function sampleRamp(stops, t) {
    const segments = stops.length - 1;
    const pos = (((t % 1) + 1) % 1) * segments;
    const i = Math.floor(pos);
    const f = pos - i;
    const parse = hex => [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16));
    const [ar, ag, ab] = parse(stops[i]);
    const [br, bg, bb] = parse(stops[Math.min(i + 1, segments)]);
    return {
        r: Math.round(ar + (br - ar) * f),
        g: Math.round(ag + (bg - ag) * f),
        b: Math.round(ab + (bb - ab) * f),
    };
}

// Canvas twin of .fib-holo. Use for any fill or stroke: paint animated tiers with the whole gradient, never one sampled point.
// Stops are walked three times and clamped to [0,1]; the naive `(i/n + phase) % 1` flashes a seam at the wrap.
export function createHoloGradient(ctx, x, width, phase) {
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    const stops = RARITY.insane.stops;
    const span = 1 / (stops.length - 1);

    for (let pass = -1; pass <= 1; pass++) {
        for (let i = 0; i < stops.length; i++) {
            const offset = i * span + phase + pass;
            if (offset < 0 || offset > 1) continue;
            gradient.addColorStop(offset, stops[i]);
        }
    }
    return gradient;
}

export function getRarityIcon(rarity, size = 14, colored = true) {
    // Icons count as text, so they take the ink step.
    const color = colored ? getRarityInk(rarity) : undefined;

    switch (rarity) {
        // Stroked with the shared SVG gradient; flat platinum at icon size reads as white.
        case 'insane': return colored
            // `style` color is the CSS fallback for `stroke: url(...) currentColor` when the <defs> isn't mounted.
            ? <Crown size={size} color={color} style={{ color }} className="fib-holo-icon" />
            : <Crown size={size} />;
        case 'mythic': return <Sparkles size={size} color={color} />;
        case 'legendary': return <Star size={size} color={color} />;
        case 'relic': return <Map size={size} color={color} />;
        case 'exotic': return <Gem size={size} color={color} />;
        case 'rare': return <Diamond size={size} color={color} />;
        case 'event': return <Zap size={size} color={color} />;
        default: return null;
    }
}

export function getRarityBadge(rarity, iconSize = 10) {
    const t = tier(rarity);
    const color = t.ink || t.color;

    switch (rarity) {
        case 'insane':
            return { label: t.label, color, icon: <Crown size={iconSize} /> };
        case 'mythic':
            return { label: t.label, color, icon: <Sparkles size={iconSize} /> };
        case 'legendary':
            return { label: t.label, color, icon: <Star size={iconSize} /> };
        // Without this branch a relic fell to `default` and was labelled Common.
        case 'relic':
            return { label: t.label, color, icon: <Map size={iconSize} /> };
        case 'exotic':
            return { label: t.label, color, icon: <Gem size={iconSize} /> };
        case 'rare':
            return { label: t.label, color, icon: <Diamond size={iconSize} /> };
        case 'event':
            return { label: t.label, color, icon: <Zap size={iconSize} /> };
        default:
            return { label: RARITY.common.label, color: RARITY.common.color, icon: <Circle size={iconSize} /> };
    }
}

export function getRarityEmoji(rarity, size = 14) {
    return getRarityIcon(rarity, size, false) || <Circle size={size} />;
}

export function getRarityGradient(rarity, opacity = 0.1) {
    const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, '0');
    const stops = getRarityStops(rarity);

    // Keeps the full stop sequence even as a wash, so insane stays recognisable at 10%.
    if (stops) {
        const washed = stops.map((c, i) => `${c}${alphaHex} ${(i / (stops.length - 1) * 100).toFixed(0)}%`);
        return `linear-gradient(135deg, ${washed.join(', ')})`;
    }

    return `linear-gradient(135deg, ${getRarityColor(rarity)}${alphaHex} 0%, transparent 100%)`;
}

export function getRarityOrder(rarity) {
    return tier(rarity).order;
}
