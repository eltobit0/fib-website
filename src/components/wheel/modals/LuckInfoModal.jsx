// THE CONCOURSE: the luck record, a departure board (deck ground, ruled registers, amber as the only signal, rarity hue only where the subject IS a tier), like features/Achievements.jsx.
// Two windows printed side by side with equal weight and never reconciled: THE RUN is the 5,000-spin peak (endurance) and THE CLUSTER the 50-500 spin window; each is blind to the other and they routinely disagree by orders of magnitude. The odds (`peakWindowOneIn`, `tightestCluster.oneIn`) are the headline and come from the server, one log-improbability printed two ways.
// The caveat stays under the figure, not in a tooltip: a cluster's odds are those of ONE window the server found by trying thousands, so they describe a window, never a person.

import React, { useEffect } from 'react';
import { DECK, rail } from '../config/constants';
import { getRarityInk } from '../../../utils/rarityHelpers.jsx';
import { FlapText } from '../features/collection/FlapBoard.jsx';
import { X } from 'lucide-react';

// Rarest first, matching the ladder everywhere else on the surface.
const TIERS = ['insane', 'mythic', 'legendary', 'relic', 'exotic', 'rare'];
const TIER_LABEL = {
    insane: 'Insane', mythic: 'Mythic', legendary: 'Legendary',
    relic: 'Relic', exotic: 'Exotic', rare: 'Rare'
};

const num = n => (typeof n === 'number' ? n.toLocaleString() : '—');

/** A ruled register row: label on the left, figure on the right. */
function Row({ label, value, tone = DECK.ink, note, last }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            padding: '9px 14px',
            borderBottom: last ? 'none' : `1px solid ${rail(0.07)}`
        }}>
            <span style={{
                color: DECK.inkMid, fontSize: 12, letterSpacing: '0.02em',
                display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0
            }}>
                {label}
                {note && <span style={{ color: DECK.inkDim, fontSize: 11 }}>{note}</span>}
            </span>
            <span style={{
                color: tone, fontSize: 13, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap'
            }}>
                {value}
            </span>
        </div>
    );
}

/** A section head — Barlow Condensed, per the refresh correction. */
function Head({ children, tone = DECK.inkDim }) {
    return (
        <div style={{
            fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            fontSize: 13, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: tone, margin: '0 0 8px'
        }}>
            {children}
        </div>
    );
}

// One of the two windows; both share the same furniture (span, odds headline, tiers) so they compare directly.
function WindowCard({ title, span, oneIn, basis, pulls, lucky, footnote, isMobile }) {
    const tiers = TIERS.filter(t => (pulls?.[t] || 0) > 0);
    const totalPulls = TIERS.reduce((n, t) => n + (pulls?.[t] || 0), 0);
    const luckyPulls = lucky?.pulls || 0;
    // Flagged from the first lucky pull: the odds already price these correctly, so this is context, not a correction.
    const luckyDriven = luckyPulls > 0;
    return (
        <div style={{
            background: DECK.plinth,
            border: `1px solid ${rail(0.09)}`,
            borderTop: `1px solid ${DECK.amber}55`,
            padding: '12px 14px 13px'
        }}>
            <Head tone={DECK.amber}>{title}</Head>

            <div style={{ color: DECK.inkDim, fontSize: 11, marginBottom: 8 }}>
                {span}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: tiers.length ? 10 : 0 }}>
                <span style={{ color: DECK.inkDim, fontSize: 11 }}>≈ 1 in</span>
                <FlapText
                    text={num(oneIn)}
                    size={isMobile ? 20 : 23}
                    tone={DECK.amber}
                    weight={800}
                    digits
                />
            </div>

            {/* The two cards are measured on different bases and must not be read against each other; each states its basis. */}
            {basis && (
                <div style={{ color: DECK.inkDim, fontSize: 10.5, marginBottom: 10 }}>
                    {basis}
                </div>
            )}

            {tiers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                    {tiers.map(t => (
                        <span key={t} style={{
                            color: getRarityInk(t), fontSize: 12, fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            {pulls[t]}× {TIER_LABEL[t]}
                        </span>
                    ))}
                </div>
            )}

            {luckyDriven && (
                <div style={{
                    marginTop: 10,
                    padding: '6px 8px',
                    background: 'rgba(148,168,212,0.06)',
                    borderLeft: `2px solid ${getRarityInk('mythic')}`,
                    color: DECK.inkMid, fontSize: 10.5, lineHeight: 1.5
                }}>
                    <b style={{ color: DECK.ink }}>Lucky-driven</b> — {luckyPulls} of {totalPulls}{' '}
                    {totalPulls === 1 ? 'pull' : 'pulls'} came from lucky spins, where every item is
                    equally likely. Counted at those odds.
                </div>
            )}

            {footnote && (
                <div style={{ color: DECK.inkDim, fontSize: 10.5, lineHeight: 1.5, marginTop: 10 }}>
                    {footnote}
                </div>
            )}
        </div>
    );
}

export function LuckInfoModal({ onClose, luckRating, isMobile }) {
    // Escape closes it: UserProfile stands down while any child is open (`childOpen` lists this modal), so this modal must handle the key itself. Capture phase plus stopPropagation, like the item plaque in CollectionBook.jsx: bubble-phase `window` listeners would all run.
    useEffect(() => {
        const onKey = e => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const cluster = luckRating?.tightestCluster;
    const stats = luckRating?.stats;
    const hasPulls = stats && TIERS.some(t => (stats[t] || 0) > 0);

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(3,5,10,0.88)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 10000, padding: 16, boxSizing: 'border-box'
            }}
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Luck rating"
                style={{
                    background: DECK.face,
                    border: `1px solid ${rail(0.12)}`,
                    maxWidth: 520, width: '100%', maxHeight: '90vh',
                    overflow: 'auto', boxSizing: 'border-box'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Board head. Amber underline, no gradient, no radius. */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderBottom: `1px solid ${DECK.amber}44`,
                    background: DECK.amberWash
                }}>
                    <div style={{
                        fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                        fontSize: 20, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: DECK.ink
                    }}>
                        Luck Record
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            background: 'transparent', border: `1px solid ${rail(0.12)}`,
                            color: DECK.inkMid, cursor: 'pointer', padding: 6,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: isMobile ? 14 : 16, display: 'grid', gap: 18 }}>

                    {/* ── THE RATING ─────────────────────────────────────── */}
                    {luckRating && (
                        <section>
                            <Head>The Rating</Head>
                            <div style={{ background: DECK.plinth, border: `1px solid ${rail(0.09)}` }}>
                                <Row label="Lifetime" note="× 0.3" value={luckRating.lifetimeRating ?? '—'} />
                                <Row label="Best run" note="× 0.7" value={luckRating.peakWindowRating ?? '—'} tone={DECK.amber} />
                                <Row label="Final" value={luckRating.rating ?? '—'} tone={DECK.amber} last />
                            </div>
                            {luckRating.message && (
                                <div style={{ color: DECK.inkDim, fontSize: 11, marginTop: 7 }}>
                                    {luckRating.message}
                                    {typeof luckRating.percentile === 'number' && ` · luckier than ${luckRating.percentile}% of players`}
                                </div>
                            )}
                        </section>
                    )}

                    {/* ── THE TWO WINDOWS ────────────────────────────────── */}
                    {(luckRating?.peakWindowRange || cluster) && (
                        <section>
                            <Head>The Windows</Head>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                gap: 10
                            }}>
                                {luckRating?.peakWindowRange && (
                                    <WindowCard
                                        title="The Run"
                                        span={`5,000 spins · #${num(luckRating.peakWindowRange.start)} – #${num(luckRating.peakWindowRange.end)}`}
                                        oneIn={luckRating.peakWindowOneIn}
                                        basis="its strongest tier alone"
                                        pulls={luckRating.peakWindowPulls}
                                        lucky={luckRating.peakWindowLucky}
                                        footnote="Sustained luck — your best long stretch."
                                        isMobile={isMobile}
                                    />
                                )}
                                {cluster && (
                                    <WindowCard
                                        title="The Cluster"
                                        span={`${num(cluster.window)} spins · #${num(cluster.windowStart)} – #${num(cluster.windowEnd)}`}
                                        oneIn={cluster.oneIn}
                                        basis="everything in it, together"
                                        pulls={cluster.windowPulls}
                                        lucky={{ spins: cluster.luckySpins, pulls: cluster.luckyPulls }}
                                        footnote="Density — specials landing on top of each other."
                                        isMobile={isMobile}
                                    />
                                )}
                            </div>
                            <div style={{ color: DECK.inkDim, fontSize: 10.5, lineHeight: 1.6, marginTop: 9 }}>
                                The two numbers are measured differently and are not meant to be
                                compared — the run is priced on its strongest tier, the cluster on
                                everything in it at once, and a longer window always accumulates more.
                                Both describe <em>one</em> window turning out that way, and thousands
                                were searched to find them. Over a long history a very improbable window
                                is roughly what you should expect to exist, so these are facts about a
                                stretch of spins, not about you.
                            </div>
                        </section>
                    )}

                    {/* ── LIFETIME PULLS ─────────────────────────────────── */}
                    {hasPulls && (
                        <section>
                            <Head>Lifetime Pulls</Head>
                            <div style={{ background: DECK.plinth, border: `1px solid ${rail(0.09)}` }}>
                                {TIERS.map((t, i) => (
                                    <Row
                                        key={t}
                                        label={<span style={{ color: getRarityInk(t) }}>{TIER_LABEL[t]}</span>}
                                        value={num(stats[t] || 0)}
                                        tone={getRarityInk(t)}
                                        last={i === TIERS.length - 1}
                                    />
                                ))}
                            </div>
                            {typeof stats.totalSpins === 'number' && (
                                <div style={{ color: DECK.inkDim, fontSize: 11, marginTop: 7 }}>
                                    {num(stats.totalSpins)} spins
                                    {typeof stats.luckySpins === 'number' && `, ${num(stats.luckySpins)} of them lucky`}
                                </div>
                            )}
                        </section>
                    )}

                    {/* ── HOW IT READS ───────────────────────────────────── */}
                    <section>
                        <Head>How It Reads</Head>
                        <div style={{
                            background: DECK.plinth,
                            border: `1px solid ${rail(0.09)}`,
                            padding: '12px 14px',
                            color: DECK.inkMid, fontSize: 11.5, lineHeight: 1.65,
                            display: 'grid', gap: 8
                        }}>
                            <div>
                                <b style={{ color: DECK.ink }}>Lifetime</b> weighs every spin you have ever
                                taken. It moves slowly and sits near 100 for almost everyone.
                            </div>
                            <div>
                                <b style={{ color: DECK.amber }}>Best run</b> takes your luckiest
                                5,000-spin stretch, so one good evening can carry it.
                            </div>
                            <div>
                                <b style={{ color: DECK.ink }}>Clusters count double.</b> Four mythics
                                together beat one insane, because together they are rarer.
                            </div>
                            <div>
                                <b style={{ color: DECK.ink }}>Lucky spins are priced differently.</b>
                                {' '}A normal spin uses the weighted table; a lucky spin gives every item an
                                equal chance, which makes the top tiers hundreds of times likelier. Both
                                are counted, each at its own odds.
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

export default LuckInfoModal;
