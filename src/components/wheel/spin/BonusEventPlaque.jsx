import React from 'react';
import { Crown, Layers, Repeat, Zap } from 'lucide-react';
import { COLORS, SURFACE_NOISE, BONUS_IDENTITY, BONUS_IDENTITY_FALLBACK } from '../config/constants';

// The event the bonus board just selected, as a signboard on the stage: square, deck grain, a lit rail in the event's identity colour. Each event owns one icon, the board's own: Zap (lucky family), Layers (5x), Crown (triple lucky), Repeat (recursion, which the board never draws because a pull triggers it).
// Only the glyph lives here; colours come from BONUS_IDENTITY in config/constants, shared with the board and the lamp.
const EVENT_ICON = {
    lucky_spin: Zap,
    triple_spin: Layers,
    triple_lucky_spin: Crown,
    // Recursion's own glyph: the wheel inside the wheel, which is a loop.
    recursion: Repeat,
};

export function BonusEventPlaque({ event, isMobile = false }) {
    if (!event) return null;

    const identity = BONUS_IDENTITY[event.id] || BONUS_IDENTITY_FALLBACK;
    const Icon = EVENT_ICON[event.id] || Zap;

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: isMobile ? '320px' : '420px',
            padding: isMobile ? '24px 20px' : '32px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            borderRadius: 0,
            backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, rgba(148,168,212,0.05) 0%, rgba(148,168,212,0) 38%), linear-gradient(180deg, #0d1322 0%, #0a0d18 100%)`,
            boxShadow: `inset 0 1px 0 ${identity.color}55, inset 0 0 34px ${identity.color}12, 0 18px 40px -24px rgba(0,0,0,0.8)`,
            animation: 'textFadeUp 0.45s cubic-bezier(0.25,0.46,0.45,0.94) both',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '56px' : '64px',
                height: isMobile ? '56px' : '64px',
                borderRadius: 0,
                // The icon seat takes the icon's colour, not the sign's: triple-lucky's gold crown sits in gold light on a green plaque, as the board draws it.
                background: `${identity.iconColor}10`,
                boxShadow: `inset 0 1px 0 ${identity.iconColor}40`,
            }}>
                <Icon size={isMobile ? 28 : 32} style={{
                    color: identity.iconColor,
                    filter: `drop-shadow(0 0 12px ${identity.iconColor}66)`,
                }} />
            </div>

            <div style={{
                fontSize: isMobile ? '16px' : '18px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                textAlign: 'center',
                color: identity.color,
                textShadow: `0 0 22px ${identity.color}44`,
            }}>
                {event.name}
            </div>

            <div style={{
                fontSize: isMobile ? '12px' : '13px',
                color: COLORS.textMuted,
                textAlign: 'center',
                maxWidth: isMobile ? '260px' : '340px',
                lineHeight: 1.45,
            }}>
                {event.description}
            </div>
        </div>
    );
}

export default BonusEventPlaque;