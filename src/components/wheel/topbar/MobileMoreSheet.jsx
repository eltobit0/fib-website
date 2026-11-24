import React, { useEffect, useRef } from 'react';
import { COLORS, SURFACE_NOISE, Z } from '../config/constants';

// Everything the phone's topbar cannot hold, in one sheet: the topbar's eleven controls ran off a 390px bar, leaving Settings and Log out unreachable. Split three ways: bottom bar (Collection, Board, Chat, You), topbar (Back, wordmark, Notifications, ⋯) and this sheet. Notifications stays because it is the only control with a count changing while you look elsewhere.
// A sheet, not a menu: full width, rising from the bottom, in the deck's material with 52px full-bleed rows.
export function MobileMoreSheet({ open, onClose, items = [] }) {
    const panelRef = useRef(null);

    // Escape closes it, and focus moves into the sheet when it opens so the
    // keyboard and a screen reader land inside rather than behind it.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        panelRef.current?.focus();
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: Z.modal,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                background: 'rgba(5,6,10,0.62)',
                animation: 'fibSheetScrim 0.18s cubic-bezier(0.22,1,0.36,1) both',
            }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                style={{
                    outline: 'none',
                    backgroundImage: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #080b14 100%)`,
                    boxShadow: 'inset 0 1px 0 rgba(190,198,220,0.14)',
                    borderRadius: 0,
                    paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
                    animation: 'fibSheetRise 0.26s cubic-bezier(0.22,1,0.36,1) both',
                }}
            >
                {items.filter(Boolean).map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        // A row carrying a value is a toggle, and a screen reader must hear the state ("Battery saver, off").
                        aria-pressed={item.value ? Boolean(item.valueActive) : undefined}
                        // A row that goes somewhere dismisses the sheet; a toggle does not (`keepOpen`), so the value changes under the thumb as the only confirmation.
                        onClick={() => { if (!item.keepOpen) onClose?.(); item.onSelect?.(); }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                            width: '100%',
                            minHeight: '52px',
                            padding: '0 20px',
                            border: 'none',
                            borderRadius: 0,
                            background: 'transparent',
                            // The row separator is the deck's hairline, top-weighted
                            // out of the light the way every seam on this surface is.
                            boxShadow: 'inset 0 1px 0 rgba(190,198,220,0.05)',
                            color: item.tone === 'danger' ? COLORS.red : COLORS.text,
                            font: 'inherit',
                            // 15px: a destination label read at arm's length, matching SpinResult's read-me-first step, not the 11px label step.
                            fontSize: '15px',
                            fontWeight: 600,
                            textAlign: 'left',
                            cursor: 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                    >
                        <item.Icon size={19} />
                        <span style={{ flex: 1 }}>{item.label}</span>

                        {/* A row that reports a setting rather than opening a view: the value sits right-aligned in muted ink, lifted to amber when on (the only thing on the row allowed a colour). */}
                        {item.value ? (
                            <span style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                                color: item.valueActive ? COLORS.gold : COLORS.textMuted,
                            }}>
                                {item.value}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default MobileMoreSheet;
