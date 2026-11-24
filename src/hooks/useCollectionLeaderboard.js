import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/constants';
import { visibleInterval } from '../config/power.js';

// Shared by the topbar pill and the result flanks so they never poll on two timers and disagree.
export function useCollectionLeaderboard(userId) {
    const [leaderboard, setLeaderboard] = useState([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/leaderboard?sort=collection`);
            if (!res.ok) throw new Error(`leaderboard HTTP ${res.status}`);
            const data = await res.json();
            setLeaderboard(data.leaderboard || []);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        return visibleInterval(refresh, 5 * 60 * 1000, { stretch: true });
    }, [refresh]);

    const myIndex = userId == null ? -1 : leaderboard.findIndex(e => e.id === userId);

    return {
        leaderboard,
        loading,
        refresh,
        // null, not zero, when unranked.
        myRank: myIndex >= 0 ? myIndex + 1 : null,
        me: myIndex >= 0 ? leaderboard[myIndex] : null,
    };
}

export default useCollectionLeaderboard;
