import React from 'react';
import { COLORS } from '../config/constants';

// MYSTERY: the mark on a pull from the daily bounty's box, in place of the LUCKY badge (a box pull is written is_lucky = 1, so callers show this INSTEAD of LUCKY, never beside it). One component because the LUCKY badge drifted into three greens across five files. Gilt per COLORS.mysteryGilt; 10px at the ticker's badge scale, 11px where a surface's badges run larger.
export function MysteryTag({ size = 10, title = 'Pulled from a mystery box' }) {
    const [pale, mid, deep] = COLORS.mysteryGilt;
    return (
        <span
            title={title}
            style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: `${size}px`,
                fontWeight: 800,
                lineHeight: 1,
                padding: '2px 5px',
                borderRadius: '4px',
                border: `1px solid ${mid}66`,
                background: `linear-gradient(135deg, ${deep}33, ${mid}14)`,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}
        >
            <span style={{
                background: `linear-gradient(100deg, ${pale}, ${mid} 55%, ${deep})`,
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                WebkitTextFillColor: 'transparent',
            }}>
                Mystery
            </span>
        </span>
    );
}

export default MysteryTag;
