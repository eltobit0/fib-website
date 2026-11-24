// Changelog, "What's new": fires once per release and is reachable from the topbar; entries live in config/changelog.js and this file draws the four block kinds, so a release writes data and no JSX.
// Its own modal, not a notification: `notifications.content` is TEXT and cannot draw the ladder, and the bell needs an account while /wheel is readable signed out.

import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Spade, Crosshair, Gift, ChevronLeft, ChevronRight } from 'lucide-react';
import { COLORS, EVENT_IDENTITY } from '../config/constants';
import { CHANGELOG } from '../../../config/changelog.js';
import { RELIC_ITEMS } from '../../../config/constants.js';
import { getRarityColor, getRarityIcon, getRarityOnColor } from '../../../utils/rarityHelpers.jsx';

// Whole-tier rosters a `tier` block draws without listing them; a rarity not listed renders heading and body with no grid. A block may carry its own `roster` instead: an entry announcing ONE addition must not draw the whole tier.
const TIER_ROSTERS = { relic: RELIC_ITEMS };

/* ── Blocks ──────────────────────────────────────────────────────────────── */

// Body text takes COLORS.neutralInk, never COLORS.textMuted: #888 is 4.81:1 on the modal's ground and 4.17:1 on inner panels, under AA, while neutralInk measures 6.55 / 5.67. textMuted survives for chrome only (the version stamp). Anything a player reads holds the 11px floor (DESIGN.md §8).
function SectionHeading({ children }) {
    return (
        <div style={{
            color: COLORS.neutralInk,
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            marginBottom: '10px',
        }}>
            {children}
        </div>
    );
}

function RationaleBlock({ block }) {
    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>
            {block.paragraphs.map((text, i) => (
                <p
                    key={i}
                    style={{
                        // The one piece of sustained prose in the modal: body colour and a reading measure.
                        color: COLORS.text,
                        fontSize: '13px',
                        lineHeight: 1.6,
                        margin: i === 0 ? '0 0 10px' : '0 0 10px',
                    }}
                >
                    {text}
                </p>
            ))}
        </section>
    );
}

function gridColumns(count, ceiling) {
    if (count <= ceiling) return count;
    const rows = Math.ceil(count / ceiling);
    return Math.ceil(count / rows);
}

function TierBlock({ block, isMobile }) {
    const color = getRarityColor(block.rarity);
    const roster = block.roster || TIER_ROSTERS[block.rarity] || [];

    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>

            {/* The tier's own name, worn in its own colour and at its own rate.
                This is the one place in the modal that gets to be loud. */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexWrap: 'wrap',
                marginBottom: '10px',
            }}>
                <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: color,
                    color: getRarityOnColor(block.rarity),
                    padding: '4px 10px',
                    borderRadius: '5px',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                }}>
                    {getRarityIcon(block.rarity, 14, false)}
                    {block.rarity}
                </span>
                <span style={{
                    color,
                    fontFamily: 'monospace',
                    fontSize: '15px',
                    fontWeight: 700,
                }}>
                    {block.rate}
                </span>
            </div>

            <p style={{ color: COLORS.text, fontSize: '13px', lineHeight: 1.55, margin: '0 0 14px' }}>
                {block.body}
            </p>

            {roster.length > 0 && (
                <div style={{
                    display: 'grid',
                    // Three across on a phone, six on desktop; the count is a CEILING. A roster shorter than it takes its own length, and a longer one balances its rows (seven at four columns is 4 + 3, not a full row and an orphan).
                    gridTemplateColumns: `repeat(${gridColumns(roster.length, isMobile ? 3 : 6)}, 1fr)`,
                    gap: '8px',
                }}>
                    {/* No tile, no radius, no shadow: the renders are cut-out builds that need a ground, not a box (DESIGN.md: no cards, no frames). */}
                    {roster.map(item => (
                        <div key={item.texture} style={{ textAlign: 'center' }}>
                            <img
                                src={item.imageUrl}
                                alt=""
                                loading="lazy"
                                style={{
                                    width: '100%',
                                    maxWidth: '62px',
                                    aspectRatio: '1 / 1',
                                    objectFit: 'contain',
                                    display: 'block',
                                    margin: '0 auto 6px',
                                }}
                            />
                            <div style={{
                                color: COLORS.text,
                                fontSize: '11px',
                                lineHeight: 1.3,
                                fontWeight: 600,
                            }}>
                                {item.name}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

function LadderBlock({ block }) {
    // Bar length is FREQUENCY (how often you see the tier), so the ladder widens as it gets commoner and Insane is the sliver: a bar reads as an amount. Log-scaled (1 in 137 to 1 in 1,000,000) between the block's own extremes.
    const logs = block.rows.map(r => Math.log10(r.oneIn));
    const min = Math.min(...logs);
    const max = Math.max(...logs);
    const width = (oneIn) => {
        if (max === min) return 100;
        // Inverted, and floored at 8% so the rarest tier is still a bar rather than
        // nothing at all — a row with no mark reads as missing data.
        return 8 + ((max - Math.log10(oneIn)) / (max - min)) * 92;
    };

    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {block.rows.map(row => {
                    const color = getRarityColor(row.rarity);
                    return (
                        <div
                            key={row.rarity}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '84px 1fr auto',
                                alignItems: 'center',
                                gap: '10px',
                            }}
                        >
                            <span style={{
                                color,
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}>
                                {row.label}
                                {/* The badge is 10px, not 9: a word has to be read (DESIGN.md §8). 5px is `wheel-badge`, the ratified badge corner. */}
                                {row.isNew && (
                                    <span style={{
                                        background: color,
                                        color: getRarityOnColor(row.rarity),
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        padding: '1px 4px',
                                        borderRadius: '5px',
                                        letterSpacing: '0.06em',
                                    }}>
                                        NEW
                                    </span>
                                )}
                            </span>

                            <span style={{ display: 'block', height: '6px', position: 'relative' }}>
                                <span style={{
                                    display: 'block',
                                    height: '100%',
                                    width: `${width(row.oneIn)}%`,
                                    background: color,
                                    borderRadius: '2px',
                                    // The new tier is the only row that glows. Every
                                    // other row is the same bar it would have been.
                                    boxShadow: row.isNew ? `0 0 10px ${color}` : 'none',
                                    opacity: row.isNew ? 1 : 0.75,
                                }} />
                            </span>

                            <span style={{
                                color: row.isNew ? color : COLORS.neutralInk,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                fontWeight: row.isNew ? 700 : 500,
                                whiteSpace: 'nowrap',
                            }}>
                                {row.rate}
                            </span>
                        </div>
                    );
                })}
            </div>

            {block.note && (
                <p style={{ color: COLORS.neutralInk, fontSize: '11px', lineHeight: 1.5, margin: '10px 0 0' }}>
                    {block.note}
                </p>
            )}
        </section>
    );
}

function ChangesBlock({ block }) {
    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {block.rows.map(row => (
                    <div key={row.label} style={{ background: COLORS.bgLight, borderRadius: '6px', padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ color: COLORS.text, fontSize: '12px', fontWeight: 700 }}>
                                {row.label}
                            </span>
                            <span style={{ color: COLORS.neutralInk, fontFamily: 'monospace', fontSize: '12px' }}>
                                {row.from}
                            </span>
                            <span style={{ color: COLORS.neutralInk, fontSize: '12px' }}>→</span>
                            <span style={{ color: COLORS.gold, fontFamily: 'monospace', fontSize: '11px', fontWeight: 700 }}>
                                {row.to}
                            </span>
                        </div>
                        <div style={{ color: COLORS.neutralInk, fontSize: '12px', lineHeight: 1.55 }}>
                            {row.note}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function NotesBlock({ block }) {
    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {block.items.map(item => (
                    <div key={item.label} style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                        <span style={{
                            color: COLORS.gold,
                            fontSize: '12px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                        }}>
                            {item.label}
                        </span>
                        <span style={{ color: COLORS.neutralInk, fontSize: '12px', lineHeight: 1.55 }}>
                            {item.body}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

// A `feature` block's identity, by key: the data file names a feature, never a colour (owned by EVENT_IDENTITY, COLORS.bounty, COLORS.mysteryGilt). `gilt` marks the mystery box, a metal: its title takes the ramp and its facts' labels the middle stop.
const FEATURE_IDENTITY = {
    high_roller: { color: EVENT_IDENTITY.high_roller.color, Icon: Spade },
    bounty: { color: COLORS.bounty, Icon: Crosshair },
    mystery: { color: COLORS.mystery, Icon: Gift, gilt: true },
    // The lucky family's own mark and colour, as the plaque and the feed wear them.
    lucky: { color: COLORS.green, Icon: Sparkles },
};

function FeatureBlock({ block }) {
    const identity = FEATURE_IDENTITY[block.accent] || { color: COLORS.gold, Icon: Sparkles };
    const { color, Icon, gilt } = identity;
    const [pale, mid, deep] = COLORS.mysteryGilt;

    return (
        <section style={{ marginBottom: '26px' }}>
            <SectionHeading>{block.heading}</SectionHeading>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Icon size={18} color={color} strokeWidth={2} />
                <span style={{
                    fontSize: '17px',
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    ...(gilt
                        ? {
                            background: `linear-gradient(100deg, ${pale}, ${mid} 55%, ${deep})`,
                            WebkitBackgroundClip: 'text',
                            backgroundClip: 'text',
                            color: 'transparent',
                            WebkitTextFillColor: 'transparent',
                        }
                        : { color }),
                }}>
                    {block.title}
                </span>
            </div>

            {block.body.map((text, i) => (
                <p key={i} style={{ color: COLORS.text, fontSize: '13px', lineHeight: 1.55, margin: '0 0 10px' }}>
                    {text}
                </p>
            ))}

            {block.facts?.length > 0 && (
                // A definition list, because that is what it is: a few named facts,
                // label beside value, no table chrome.
                <dl style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    columnGap: '12px',
                    rowGap: '5px',
                    margin: '4px 0 0',
                }}>
                    {block.facts.map(fact => (
                        <React.Fragment key={fact.label}>
                            <dt style={{ color, fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {fact.label}
                            </dt>
                            <dd style={{ color: COLORS.neutralInk, fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
                                {fact.value}
                            </dd>
                        </React.Fragment>
                    ))}
                </dl>
            )}
        </section>
    );
}

const BLOCKS = {
    rationale: RationaleBlock,
    tier: TierBlock,
    ladder: LadderBlock,
    changes: ChangesBlock,
    notes: NotesBlock,
    feature: FeatureBlock,
};

/** A release's date as the header prints it. */
function formatReleaseDate(date) {
    // timeZone: 'UTC' because changelog.js dates are bare 'YYYY-MM-DD', which Date parses as UTC midnight; local formatting shows the 19th west of UTC for a release dated the 20th.
    return new Date(date).toLocaleDateString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
    });
}

// The older releases, listed under the one being read; each row opens its entry in full in this modal.
function EarlierReleases({ current, onSelect }) {
    const others = CHANGELOG.map((entry, index) => ({ entry, index })).filter(({ index }) => index !== current);
    if (others.length === 0) return null;

    return (
        <section style={{ marginBottom: '22px', paddingTop: '14px', borderTop: `1px solid ${COLORS.border}` }}>
            <SectionHeading>{current === 0 ? 'Earlier releases' : 'Other releases'}</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {others.map(({ entry, index }) => (
                    <button
                        key={entry.version}
                        onClick={() => onSelect(index)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            width: '100%',
                            textAlign: 'left',
                            background: COLORS.bgLight,
                            border: 'none',
                            borderRadius: '6px',
                            padding: '10px 12px',
                            cursor: 'pointer',
                            font: 'inherit',
                        }}
                    >
                        <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', color: COLORS.text, fontSize: '13px', fontWeight: 700 }}>
                                {entry.title}
                                {index === 0 && <span style={{ color: COLORS.gold, fontSize: '11px', marginLeft: '8px' }}>Latest</span>}
                            </span>
                            <span style={{ display: 'block', color: COLORS.neutralInk, fontSize: '12px', marginTop: '2px' }}>
                                v{entry.version} · {formatReleaseDate(entry.date)}
                            </span>
                        </span>
                        <ChevronRight size={16} color={COLORS.neutralInk} />
                    </button>
                ))}
            </div>
        </section>
    );
}

/* ── The modal ───────────────────────────────────────────────────────────── */

export function ChangelogModal({ onClose, isMobile }) {
    // Escape closes it, like every other overlay on this surface. A release note
    // that traps you is a release note you resent.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    // Which release is open. Always the newest when the modal opens - that is the
    // one it is announcing - and any older one from the list at the bottom.
    const [current, setCurrent] = useState(0);
    const bodyRef = useRef(null);
    const selectRelease = (index) => {
        setCurrent(index);
        // A new entry starts at its top, not wherever the last one was scrolled to.
        if (bodyRef.current) bodyRef.current.scrollTop = 0;
    };

    const entry = CHANGELOG[current];
    const dated = formatReleaseDate(entry.date);

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={`What's new — ${entry.title}`}
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                padding: '16px',
                boxSizing: 'border-box',
            }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: COLORS.bg,
                    // wheel-card, the ratified radius for a centred card that owns
                    // the screen. See DESIGN.md's `rounded` scale.
                    borderRadius: '20px',
                    border: `1px solid ${COLORS.border}`,
                    width: '100%',
                    maxWidth: '560px',
                    maxHeight: '88vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header. Sticky by virtue of being outside the scroller, so the
                    close control never scrolls away from a long release. */}
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: isMobile ? '18px 18px 12px' : '22px 24px 14px',
                }}>
                    <div>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '6px',
                        }}>
                            <Sparkles size={16} color={COLORS.gold} />
                            <span style={{
                                color: COLORS.neutralInk,
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.09em',
                            }}>
                                What&rsquo;s new
                            </span>
                            {/* The one place textMuted survives: a version stamp is chrome and sits on the card's ground where #888 clears AA. */}
                            <span style={{
                                color: COLORS.textMuted,
                                fontFamily: 'monospace',
                                fontSize: '11px',
                            }}>
                                v{entry.version} · {dated}
                            </span>
                        </div>
                        <div style={{ color: COLORS.text, fontSize: isMobile ? '17px' : '18px', fontWeight: 700 }}>
                            {entry.title}
                        </div>
                        <div style={{ color: COLORS.neutralInk, fontSize: '12px', marginTop: '3px', lineHeight: 1.5 }}>
                            {entry.tagline}
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            color: COLORS.textMuted,
                            cursor: 'pointer',
                            padding: '8px',
                            borderRadius: '8px',
                            display: 'flex',
                            flexShrink: 0,
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div ref={bodyRef} style={{
                    overflowY: 'auto',
                    padding: isMobile ? '6px 18px 0' : '8px 24px 0',
                }}>
                    {current !== 0 && (
                        <button
                            onClick={() => selectRelease(0)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'none',
                                border: 'none',
                                font: 'inherit',
                                padding: '0 0 14px',
                                color: COLORS.gold,
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            <ChevronLeft size={14} /> Back to the latest release
                        </button>
                    )}
                    {entry.blocks.map((block, i) => {
                        const Block = BLOCKS[block.kind];
                        // An unknown kind is skipped, not thrown: a data file one release ahead should degrade, not white-screen the wheel.
                        return Block ? <Block key={`${current}-${i}`} block={block} isMobile={isMobile} /> : null;
                    })}
                    <EarlierReleases current={current} onSelect={selectRelease} />
                </div>

                {/* Footer */}
                <div style={{
                    padding: isMobile ? '12px 18px 18px' : '14px 24px 20px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: COLORS.gold,
                            color: '#1a1a1a',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 20px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            letterSpacing: '0.02em',
                        }}
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
