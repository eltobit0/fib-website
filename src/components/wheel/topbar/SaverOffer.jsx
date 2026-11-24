import React, { useEffect, useState } from 'react';
import { BatteryLow } from 'lucide-react';
import { COLORS, SURFACE_NOISE, Z } from '../config/constants';
import { shouldOfferSaver, markSaverOffered, setSaverMode } from '../../../config/power.js';

// The one time this site brings up its own power consumption. It asks rather than acts: the device signals behind `shouldOfferSaver` are weak, and saver mode removes the drift, twinkle and slick, so enabling it unasked makes a page the player has seen alive look broken. Not a modal: both answers are correct and the wrong one is undone in two taps from the ⋯ sheet; it does not steal focus.
// Shown once ever, counted from when it is SHOWN, not answered: silence is the commonest response and counting only answers made a one-time offer recurring.
export function SaverOffer({ isMobile }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!isMobile) return undefined;
        let cancelled = false;

        // Deliberately late: during the cold start (atlas decode, first paint, SSE handshake) a performance panel would arrive when the phone can least draw it.
        const timer = setTimeout(async () => {
            const offer = await shouldOfferSaver();
            if (cancelled || !offer) return;
            // Written here, with the panel going up, so the offer is spent
            // whether or not it is ever answered.
            markSaverOffered();
            setVisible(true);
        }, 12000);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [isMobile]);

    if (!visible) return null;

    const answer = (on) => {
        if (on) setSaverMode(true);
        setVisible(false);
    };

    return (
        <div
            role="region"
            aria-label="Battery saver"
            // Announced politely: the panel appears 12 seconds in without taking focus, so a screen-reader user would otherwise never be told. `polite`, not `assertive`, since it is a suggestion.
            aria-live="polite"
            style={{
                position: 'fixed',
                // Clear of the bottom tab bar (68px) and its safe-area inset: a suggestion must not cover the four destinations.
                bottom: 'calc(76px + env(safe-area-inset-bottom, 0px))',
                left: '12px',
                right: '12px',
                zIndex: Z.modal,
                padding: '16px 18px 14px',
                borderRadius: '10px',
                backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, #0f1626 0%, #0a0e18 100%)`,
                // The plinth's own light: a lit top rail and an offset shadow, not a halo.
                boxShadow: 'inset 0 1px 0 rgba(190,198,220,0.16), 0 12px 32px rgba(0,0,0,0.55)',
                animation: 'fibSheetRise 0.3s cubic-bezier(0.22,1,0.36,1) both',
            }}
        >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <BatteryLow size={20} color={COLORS.gold} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: COLORS.text,
                        marginBottom: '4px',
                    }}>
                        This page is working your phone hard
                    </div>
                    {/* Names the trade in the player's terms: the reel stops drifting, not "reduces GPU load". */}
                    <div style={{
                        fontSize: '13px',
                        lineHeight: 1.5,
                        color: COLORS.textMuted,
                    }}>
                        Saver mode stops the reel drifting and the background moving.
                        Spinning still works exactly the same.
                    </div>
                </div>
            </div>

            <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '14px',
                justifyContent: 'flex-end',
            }}>
                <button
                    type="button"
                    onClick={() => answer(false)}
                    style={{
                        minHeight: '40px',
                        padding: '0 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: COLORS.textMuted,
                        font: 'inherit',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    No thanks
                </button>
                <button
                    type="button"
                    onClick={() => answer(true)}
                    style={{
                        minHeight: '40px',
                        padding: '0 18px',
                        borderRadius: '6px',
                        border: 'none',
                        background: COLORS.gold,
                        color: '#100c04',
                        font: 'inherit',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent',
                    }}
                >
                    Turn on
                </button>
            </div>
        </div>
    );
}

export default SaverOffer;
