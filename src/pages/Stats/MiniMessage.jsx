/* Renders only named colours and the common decorations; an unknown tag is dropped, never shown raw.
   Colours map to design tokens rather than vanilla hex so a title sits in the palette. */

import React from 'react';

/* Existing tokens where the meaning fits; the rest are OKLCH renderings of the vanilla colours. */
const NAMED_COLORS = {
    black: 'oklch(0.15 0 0)',
    dark_blue: 'oklch(0.35 0.13 265)',
    dark_green: 'oklch(0.50 0.13 150)',
    dark_aqua: 'oklch(0.55 0.08 210)',
    dark_red: 'oklch(0.45 0.18 27)',
    dark_purple: 'oklch(0.45 0.16 310)',
    gold: 'var(--fib-gold)',            // prestige — the one colour the system reserves
    gray: 'oklch(0.72 0 0)',
    dark_gray: 'oklch(0.52 0 0)',
    blue: 'oklch(0.62 0.16 265)',
    green: 'oklch(0.72 0.17 150)',
    aqua: 'oklch(0.80 0.10 210)',
    red: 'oklch(0.62 0.20 27)',
    light_purple: 'oklch(0.70 0.20 330)',
    yellow: 'oklch(0.86 0.15 95)',
    white: 'oklch(0.98 0 0)',
};

const DECORATIONS = {
    bold: { fontWeight: 700 },
    b: { fontWeight: 700 },
    italic: { fontStyle: 'italic' },
    i: { fontStyle: 'italic' },
    underlined: { textDecoration: 'underline' },
    u: { textDecoration: 'underline' },
    strikethrough: { textDecoration: 'line-through' },
    st: { textDecoration: 'line-through' },
};

/* Not validating: an unbalanced close is ignored rather than failing a profile render. */
const TAG = /<(\/?)([a-z_]+)(?::[^>]*)?>/gi;

export function renderMiniMessage(input) {
    if (input == null || input === '') return null;
    const text = String(input);

    const out = [];
    const stack = [];      // [{ tag, style }]
    let cursor = 0;
    let key = 0;

    const mergedStyle = () => Object.assign({}, ...stack.map((s) => s.style));

    const emit = (slice) => {
        if (!slice) return;
        const style = mergedStyle();
        out.push(
            Object.keys(style).length
                ? <span key={key++} style={style}>{slice}</span>
                : <React.Fragment key={key++}>{slice}</React.Fragment>,
        );
    };

    let match;
    TAG.lastIndex = 0;
    while ((match = TAG.exec(text)) !== null) {
        emit(text.slice(cursor, match.index));
        cursor = match.index + match[0].length;

        const closing = match[1] === '/';
        const name = match[2].toLowerCase();

        const style =
            name === 'color' || name === 'c'
                ? null // <color:name> form is uncommon in titles; the bare <name> form is handled below
                : NAMED_COLORS[name]
                    ? { color: NAMED_COLORS[name] }
                    : DECORATIONS[name] ?? null;

        if (!style) {
            // Unrecognised tags are dropped; <reset> also clears the stack, since titles use it to end a run of colour.
            if (name === 'reset' || name === 'r') stack.length = 0;
            continue;
        }

        if (closing) {
            for (let i = stack.length - 1; i >= 0; i--) {
                if (stack[i].tag === name) {
                    stack.splice(i, 1);
                    break;
                }
            }
        } else {
            stack.push({ tag: name, style });
        }
    }

    emit(text.slice(cursor));
    return out;
}

export function stripMiniMessage(input) {
    if (input == null) return '';
    return String(input).replace(TAG, '');
}
