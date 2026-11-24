import React, { useState } from 'react';
import { COLORS, SPACE } from '../config/constants';
import { Trophy } from 'lucide-react';
import { getDiscordAvatarUrl } from '../../../utils/helpers.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useCollectionLeaderboard } from '../../../hooks/useCollectionLeaderboard.js';

// The leaderboard reduced to the permanent minimum: your own row and the podium, with everything else in the full Leaderboard modal. `sort=collection` is hardcoded: it is the board's default and the one the pill's "#n" is meaningful for.
export function LeaderboardPill({ onOpenFull }) {
    const [hovered, setHovered] = useState(false);
    const { user } = useAuth();

    // The fetch, 5-minute poll and rank lookup live in `useCollectionLeaderboard`, shared with the result flanks: two timers on one endpoint would disagree about your rank for up to five minutes.
    const { leaderboard, loading, myRank } = useCollectionLeaderboard(user?.id);
    const topThree = leaderboard.slice(0, 3);

    if (loading && leaderboard.length === 0) return null;

    return (
        <button
            onClick={onOpenFull}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            title={myRank ? `You are #${myRank} — open the full leaderboard` : 'Open the full leaderboard'}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: `${SPACE.sm}px`,
                // Matches the topbar's control height: at its natural 34px it sat on a different baseline.
                height: '38px',
                boxSizing: 'border-box',
                padding: `0 ${SPACE.md}px 0 12px`,
                borderRadius: '999px',
                background: hovered ? COLORS.bgLighter : 'rgba(255,255,255,0.03)',
                border: `1px solid ${hovered ? COLORS.gold + '55' : COLORS.border}`,
                color: COLORS.text,
                cursor: 'pointer',
                transition: 'all 0.2s',
                flexShrink: 0,
            }}
        >
            <Trophy size={14} style={{ color: COLORS.gold, flexShrink: 0 }} />

            {/* Your own rank. Absent rather than zero when you are unranked — a
                "#—" reads as a broken value, while nothing reads as "not yet". */}
            {myRank && (
                <span style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    color: COLORS.gold,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    #{myRank}
                </span>
            )}

            {/* The podium as avatars only: names would double the pill's width. */}
            <span style={{ display: 'flex', alignItems: 'center' }}>
                {topThree.map((entry, i) => (
                    <img
                        key={entry.id}
                        src={getDiscordAvatarUrl(entry.discordId ?? entry.discord_id, entry.avatar ?? entry.discord_avatar)}
                        alt=""
                        width={20}
                        height={20}
                        title={`#${i + 1} ${entry.username || ''}`}
                        style={{
                            borderRadius: '50%',
                            // Overlap so three avatars read as one podium group
                            // rather than three separate controls.
                            marginLeft: i === 0 ? 0 : '-6px',
                            border: `1.5px solid ${i === 0 ? COLORS.gold : COLORS.bg}`,
                            position: 'relative',
                            zIndex: 3 - i,
                        }}
                    />
                ))}
            </span>
        </button>
    );
}
