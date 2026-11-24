import React from 'react';
import { Sparkles } from 'lucide-react';

// Lucky spins you are holding, in the status bar's centre slot (the KOTW standings' slot: standings during, payout after). Deliberately does not name the event that paid out; styled like the standings chips so the slot reads as one thing.

const KOTW_BG_DARK = '#0F172A';
const KOTW_GOLD = '#F59E0B';
const KOTW_TEXT = '#F8FAFC';

export function EventPayout({ luckySpins = 0, isMobile = false }) {
    if (!luckySpins) return null;

    return (
        <div
            title={`${luckySpins} Lucky Spin${luckySpins !== 1 ? 's' : ''}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: isMobile ? '6px' : '10px',
                padding: isMobile ? '4px 8px' : '6px 14px 6px 6px',
                borderRadius: '10px',
                background: `linear-gradient(135deg, ${KOTW_GOLD}26, ${KOTW_BG_DARK}CC)`,
                border: `1px solid ${KOTW_GOLD}88`,
                boxShadow: `0 0 16px -4px ${KOTW_GOLD}`,
                flexShrink: 0,
                // The status bar's own groups handle the centring; this only ever
                // sizes to its content.
                pointerEvents: 'none',
            }}
        >
            <span style={{
                width: isMobile ? '20px' : '30px',
                height: isMobile ? '20px' : '30px',
                borderRadius: '8px',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${KOTW_GOLD}40, ${KOTW_GOLD}18)`,
                border: `1px solid ${KOTW_GOLD}55`,
            }}>
                <Sparkles size={16} color={KOTW_GOLD} />
            </span>

            <span style={{
                fontSize: isMobile ? '14px' : '18px',
                fontWeight: 900,
                fontFamily: 'monospace',
                color: KOTW_GOLD,
                flexShrink: 0,
            }}>
                {luckySpins}
            </span>

            <span className={isMobile ? 'fib-sr-only' : undefined} style={{
                fontSize: isMobile ? '12px' : '14px',
                fontWeight: 600,
                color: KOTW_TEXT,
                whiteSpace: 'nowrap',
                flexShrink: 0,
            }}>
                Lucky Spin{luckySpins !== 1 ? 's' : ''}
            </span>
        </div>
    );
}
