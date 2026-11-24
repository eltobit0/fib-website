import { useEffect, useState } from 'react';

// The wheel surface's breakpoints, written once: one module and one hook, and no component computes a width itself (WheelPage used 1400 and WheelSpinner 600, so 600-1399 got desktop geometry in a shell with no room for it).
// `PHONE_MAX` (900) is where the horizontal reel stops being worth having (it needs ~7 tiles at the 120px pitch); phones in landscape land here too. `FLANKS_MIN` (1200) is measured: two 272px panels, two 96px insets and ~420px of result need ~1156px. Below it the desktop layout simply has no flanks.
export const PHONE_MAX = 900;
export const FLANKS_MIN = 1200;

// The one place a viewport question is answered, via `matchMedia` (fires only when a threshold is crossed, and the first paint is correct) rather than a resize listener. Returns booleans only: handing out a pixel width invites branching on it.
export function useWheelViewport() {
    const read = () => {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return { isPhone: false, hasFlanks: true };
        }
        return {
            isPhone: window.matchMedia(`(max-width: ${PHONE_MAX - 1}px)`).matches,
            hasFlanks: window.matchMedia(`(min-width: ${FLANKS_MIN}px)`).matches,
        };
    };

    const [viewport, setViewport] = useState(read);

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const phone = window.matchMedia(`(max-width: ${PHONE_MAX - 1}px)`);
        const flanks = window.matchMedia(`(min-width: ${FLANKS_MIN}px)`);
        const update = () => setViewport({ isPhone: phone.matches, hasFlanks: flanks.matches });
        update();
        phone.addEventListener('change', update);
        flanks.addEventListener('change', update);
        return () => {
            phone.removeEventListener('change', update);
            flanks.removeEventListener('change', update);
        };
    }, []);

    return viewport;
}
