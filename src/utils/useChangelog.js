// Separate from ChangelogModal so fast refresh works. `isOpen` is derived during render, never synced from an effect.

import { useCallback, useState } from 'react';
import { LATEST_VERSION, readSeenVersion, markVersionSeen } from '../config/changelog.js';

// `enabled: false` makes the popup wait, not skip, so a first-time player still sees it after the username modal.
export function useChangelog({ enabled = true } = {}) {
    const [hasUnseen, setHasUnseen] = useState(() => readSeenVersion() !== LATEST_VERSION);
    const [dismissed, setDismissed] = useState(false);
    const [manuallyOpen, setManuallyOpen] = useState(false);

    const isOpen = manuallyOpen || (enabled && hasUnseen && !dismissed);

    const openChangelog = useCallback(() => setManuallyOpen(true), []);

    // Closing marks it read however it was opened, or the topbar dot stays lit forever.
    const closeChangelog = useCallback(() => {
        setManuallyOpen(false);
        setDismissed(true);
        markVersionSeen(LATEST_VERSION);
        setHasUnseen(false);
    }, []);

    return { isOpen, hasUnseen, openChangelog, closeChangelog };
}
