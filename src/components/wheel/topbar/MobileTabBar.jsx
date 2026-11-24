import React from 'react';
import { BookOpen, Trophy, Activity, MessageSquare, User } from 'lucide-react';
import { COLORS, SURFACE_NOISE, Z } from '../config/constants';

// The phone's four destinations, in the thumb zone: the topbar's ten controls ran off a 390px bar (settings and logout were unreachable) and the stage flanks cannot exist on a phone, so they become destinations rather than readouts. A bar, not a drawer: everything is one tap from the reel.
// Deck, not chrome: the band's ground, `SURFACE_NOISE`, a lit top rail and station amber rising under the active tab. `env(safe-area-inset-bottom)` goes on the padding, not the height, so touch targets do not move.
// Five tabs, since the live-drops ticker left the phone (it is the Live destination now, and the reel gets its 68px). 78px each at 390px clears the 44px touch floor, and "Collection" at 11px is ~58px.
const TABS = [
    { id: 'collection', label: 'Collection', Icon: BookOpen },
    { id: 'leaderboard', label: 'Board', Icon: Trophy },
    { id: 'activity', label: 'Live', Icon: Activity },
    { id: 'chat', label: 'Chat', Icon: MessageSquare },
    { id: 'profile', label: 'You', Icon: User },
];

export function MobileTabBar({ onSelect, active = null, unreadChat = 0 }) {
    return (
        <nav
            aria-label="Wheel sections"
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: Z.banner,
                display: 'grid',
                gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
                // The rail where the deck meets the page; no border, radius or shadow.
                boxShadow: 'inset 0 1px 0 rgba(190,198,220,0.12)',
                backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #080b14 100%)`,
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
        >
            {TABS.map((tab) => {
                const { id, label } = tab;
                const isActive = active === id;
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onSelect?.(id)}
                        // aria-pressed, not aria-current="page": these buttons toggle an overlay rather than navigate, and pressed/unpressed is reportable when nothing is open.
                        aria-pressed={isActive}
                        style={{
                            position: 'relative',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            // 56px, comfortably past the 44px floor, and the label
                            // sits inside the target rather than beside it.
                            minHeight: '56px',
                            padding: '8px 4px',
                            border: 'none',
                            borderRadius: 0,
                            background: 'transparent',
                            color: isActive ? COLORS.gold : COLORS.textMuted,
                            cursor: 'pointer',
                            font: 'inherit',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        {/* Station amber rising through the active destination: the stage flanks' hover gesture promoted to a selected state, since a phone has no hover. */}
                        {isActive && (
                            <span
                                aria-hidden="true"
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(0deg, rgba(255,183,94,0.10) 0%, rgba(255,183,94,0) 72%)',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                        <span style={{ position: 'relative', display: 'flex' }}>
                            <tab.Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                            {id === 'chat' && unreadChat > 0 && (
                                <span
                                    aria-hidden="true"
                                    style={{
                                        position: 'absolute',
                                        top: '-4px',
                                        right: '-8px',
                                        // 10px, not 9: the surface's floor for anything a player reads (a digit is read, so the badge grows to fit the type).
                                        minWidth: '16px',
                                        height: '16px',
                                        padding: '0 4px',
                                        borderRadius: '999px',
                                        background: COLORS.red,
                                        color: '#fff',
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        lineHeight: '16px',
                                        textAlign: 'center',
                                    }}
                                >
                                    {unreadChat > 9 ? '9+' : unreadChat}
                                </span>
                            )}
                        </span>
                        <span style={{
                            position: 'relative',
                            // 11px is the system's label step; the tab label names an icon that already carries the meaning.
                            fontSize: '11px',
                            fontWeight: isActive ? 700 : 600,
                            letterSpacing: '0.02em',
                        }}>
                            {label}
                        </span>
                        {unreadChat > 0 && id === 'chat' && (
                            // fib-sr-only, not sr-only: there is no Tailwind and index.css defines only the prefixed class.
                            <span className="fib-sr-only">{unreadChat} unread messages</span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
}

export default MobileTabBar;
