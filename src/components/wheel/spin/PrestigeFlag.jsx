// The prestige flag on a spin result. During a run the green NEW and the count both go dead (you prestige with a complete collection, so every pull is a main-collection duplicate); this answers "first of these in the run I am filling".
// A sibling of the green badge (same pill, size and position), coloured by the prestige level from the shared ladder via `prestigeHelpers`, with the level's tier mark (the crown only at level 5). Level 5 takes the whole slick through `.fib-holo`, since a sampled point is a lower tier two thirds of the time.

import React from 'react';
import { prestigeColor, prestigeInk, prestigeLabel, prestigeIcon, isIridescentPrestige } from '../../../utils/prestigeHelpers.js';

export function PrestigeFlag({ pull, compact = false, itemName }) {
    if (!pull?.isNew) return null;

    const iridescent = isIridescentPrestige(pull.level);
    const tone = prestigeColor(pull.level);

    return (
        <span
            className={iridescent ? 'fib-holo' : undefined}
            title={`First ${itemName || 'one'} of your ${prestigeLabel(pull.level)}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                fontWeight: 800,
                letterSpacing: '0.1em',
                padding: compact ? '2px 6px' : '3px 7px',
                borderRadius: '5px',
                background: iridescent ? undefined : `${tone}22`,
                border: iridescent ? 'none' : `1px solid ${tone}55`,
                // Dark ink on the slick, which is bright across its whole ramp;
                // the lifted ink step everywhere else, because this is text.
                color: iridescent ? '#1a1a1a' : prestigeInk(pull.level),
            }}
        >
            {prestigeIcon(pull.level, compact ? 10 : 11)}
            NEW
        </span>
    );
}

// The run's count for this item, shown from the second copy onward: on the first the flag already said it.
export function PrestigeCount({ pull, style }) {
    if (!pull || pull.count < 2) return null;

    return (
        <span style={{ color: prestigeInk(pull.level), ...style }}>
            {pull.count} in prestige
        </span>
    );
}
