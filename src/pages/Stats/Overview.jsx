import React, { useMemo, useState } from 'react';
import { loadOverview, loadMatch, loadLeaderboard } from './api.js';
import { useAsync } from './useAsync.js';
import { idLabel, idUuid, itemLabel, matchDuration, matchHeadline, raceEntries, leadChangeTimes } from './adapter.js';
import { Async, Face, Item, Pips, Tier, Tog } from './ui.jsx';
import { RARITY, numbered } from './statsKit.js';
import { RoundLanes, Score } from './Round.jsx';
import { RoundsTable } from './Matches.jsx';
import * as f from './format.js';

const SCOPES = [{ id: 'combined', label: 'Duos' }, { id: 'solo', label: 'Solo' }];
const TOP = 8;
const LATEST = 6;

/* One column per round, oldest first; a player who sat one out keeps the gap so a column stays one round. */
function formGuide(matches) {
  const chrono = [...matches].sort((a, b) => a.endedAt - b.endedAt);
  const rows = new Map();
  chrono.forEach((m, col) => {
    (m.participants ?? []).forEach((p) => {
      const uuid = idUuid(p.player);
      if (!uuid) return;
      if (!rows.has(uuid)) rows.set(uuid, Array(chrono.length).fill(null));
      rows.get(uuid)[col] = p.won ? 'w' : 'l';
    });
  });
  return { rounds: chrono.length, byPlayer: rows };
}

const Link = ({ view, onNavigate, children }) => (
  <a href={`?view=${view}`} onClick={(e) => { e.preventDefault(); onNavigate(view); }}>{children}</a>
);

function LatestRound({ match, number, onOpenMatch, onOpenPlayer }) {
  const headline = useMemo(() => {
    const turns = leadChangeTimes(raceEntries(match));
    return matchHeadline(match, turns.length ? turns[turns.length - 1] : null).text;
  }, [match]);
  const changes = match.leadChanges ?? 0;
  return (
    <section className="page">
      <div className="round-hd">
        <div>
          <h1 className="title">{headline}</h1>
          <p className="lede">
            Round {f.full(number)}, {f.date(match.startedAt)}. {match.mode === 'SOLO' ? 'Solo' : 'Duos'}, {f.duration(matchDuration(match))}, {changes} lead {changes === 1 ? 'change' : 'changes'}.{' '}
            <a href={`?view=match&id=${match.matchId}`} onClick={(e) => { e.preventDefault(); onOpenMatch(match.matchId); }}>Open the round</a>
          </p>
        </div>
        <Score match={match} />
      </div>
      <RoundLanes match={match} onOpenPlayer={onOpenPlayer} />
    </section>
  );
}

export function Overview({ onOpenPlayer, onOpenMatch, onNavigate }) {
  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);
  const overview = useAsync(loadOverview, [attempt]);
  const latestId = overview.data?.activity?.matches?.[0]?.matchId ?? null;
  const round = useAsync(() => (latestId ? loadMatch(latestId) : Promise.resolve({ data: null })), [latestId]);
  const [scope, setScope] = useState('combined');
  const board = useAsync(() => loadLeaderboard(scope, 'GAMES_WON', TOP), [scope, attempt]);

  const recent = useMemo(() => overview.data?.activity?.matches ?? [], [overview.data]);
  const form = useMemo(() => formGuide(recent), [recent]);

  return (
    <Async state={overview} what="the overview" onRetry={retry}>
      {(data) => {
        const g = data.globals ?? {};
        const total = data.activity?.totalCount ?? recent.length;
        const moments = data.moments ?? [];
        return (
          <div className="cols">
            <div>
              {latestId ? (
                <Async state={round} what="the latest round" onRetry={retry}>
                  {(match) => match && <LatestRound match={match} number={total} onOpenMatch={onOpenMatch} onOpenPlayer={onOpenPlayer} />}
                </Async>
              ) : (
                <section className="page"><h1>No rounds yet</h1><p className="lede">The first finished round shows up here.</p></section>
              )}

              {moments.length > 0 && (
                <section className="sec">
                  <div className="sh"><h2>Rarest moments</h2><span className="r">Back to backs, Legendary or better</span></div>
                  <div className="shelf">
                    {moments.map((m) => {
                      const who = (m.members?.length ? m.members : [m.player]).filter(Boolean);
                      return (
                        <button key={`${m.matchId}${m.itemName}${m.collectedAt}`} type="button" onClick={() => onOpenMatch(m.matchId)}>
                          <Item name={m.itemName} size="t84" tier={m.b2bRarity} title={`${itemLabel(m.itemName)}, ${RARITY[m.b2bRarity]?.label ?? ''}`} />
                          <b>{itemLabel(m.itemName)}</b>
                          <Tier tier={m.b2bRarity} />
                          <small>{who.map(idLabel).join(' and ')}, {f.date(m.collectedAt)}</small>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {recent.length > 0 && (
                <section className="sec">
                  <div className="sh"><h2>Latest rounds</h2><span className="r"><Link view="matches" onNavigate={onNavigate}>All {f.full(total)} rounds</Link></span></div>
                  <RoundsTable rows={numbered(recent, total).slice(0, LATEST)} onOpenMatch={onOpenMatch} />
                  <p className="foot">
                    {f.full(g.playersRanked ?? 0)} players have found {f.full(g.itemsFound ?? 0)} items in {f.full(g.matchesPlayed ?? 0)} rounds
                    and earned {f.full(g.achievementsGranted ?? 0)} achievements.
                  </p>
                </section>
              )}
            </div>

            <aside className="page">
              <div className="sh">
                <h2>Who’s on top</h2>
                <span className="r"><Tog label="Wins in" options={SCOPES} value={scope} onChange={setScope} /></span>
              </div>
              <Async state={board} what="the standings" onRetry={retry}>
                {(rows) => (rows?.length ? (
                  <ul className="top-list">
                    {rows.map((row) => {
                      const uuid = idUuid(row.player);
                      const slots = form.byPlayer.get(uuid) ?? Array(form.rounds).fill(null);
                      const played = slots.filter(Boolean).length;
                      const won = slots.filter((s) => s === 'w').length;
                      return (
                        <li key={uuid} className={`p${row.rank}`}>
                          <span className="pos">{row.rank}</span>
                          <Face uuid={uuid} size={32} />
                          <span>
                            <button type="button" className="nm" onClick={() => onOpenPlayer(uuid)}>{idLabel(row.player)}</button>
                            <Pips slots={slots} label={played ? `Won ${won} of the last ${played} rounds they played` : 'No recent rounds'} />
                            <small>{played ? `won ${won} of the last ${played}` : 'no recent rounds'}</small>
                          </span>
                          <span className="v">{f.full(row.value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : <div className="state"><b>Nobody yet</b>The first finished round puts its winner here.</div>)}
              </Async>
              <p className="foot">{scope === 'solo' ? 'Wins in solo rounds.' : 'Wins with any partner.'} Form is the last {form.rounds} rounds, oldest first. <Link view="leaderboards" onNavigate={onNavigate}>The full table</Link></p>
            </aside>
          </div>
        );
      }}
    </Async>
  );
}
