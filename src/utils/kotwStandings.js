// A board sorts by the numbers it is showing: while this client's spin resolves, its frozen total is the sort key,
// so placement never gives a result away early. Both live boards (KotwReelBoard, the sidebar) use this; do not fork it.

// Returns entries with `points` replaced by the value to display and `rank` renumbered to match.
export function kotwStandings(leaderboard, { userId = null, pending = false, confirmedPoints = null } = {}) {
    if (!Array.isArray(leaderboard) || leaderboard.length === 0) return [];

    // Freeze only when there is a confirmed total; otherwise the server's value, never zero.
    const holding = pending && userId != null && confirmedPoints != null;

    return leaderboard
        .map((entry, seq) => ({
            entry,
            // Stable tiebreak on the server's order, or level players swap and fire the overtake animation on every broadcast.
            seq,
            points: (holding && entry.userId === userId) ? confirmedPoints : entry.points,
        }))
        .sort((a, b) => b.points - a.points || a.seq - b.seq)
        // `points` and `rank` are overwritten so no caller can pair the server's number with this order.
        .map(({ entry, points }, index) => ({ ...entry, points, rank: index + 1 }));
}
