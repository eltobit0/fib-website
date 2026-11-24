import React, { useMemo, useState } from 'react';
import { idUuid, idLabel, itemKey, itemLabel, matchStandings, ITEM_POOL } from './adapter.js';
import { lifetimeStats, achievementGroups, splitAchievements } from './achievements.js';
import { loadPlayer, loadPlayerMatches, loadCatalogue, loadPlayerAchievements, loadCollection, loadOverview } from './api.js';
import { useAsync } from './useAsync.js';
import { Async, Face, Item, Skin, Sprite, Tier, Who } from './ui.jsx';
import { RARITY } from './statsKit.js';
import * as f from './format.js';

const HISTORY = 50;
const SHOWN_ROUNDS = 10;
const SHOWN_ACHIEVEMENTS = 8;
const SHOWN_ROW = 16;
const times = (n, one, many) => `${f.full(n)} ${n === 1 ? one : many}`;
const show = (v, fmt = f.full) => (v == null ? '-' : fmt(v));
const rate = (won, played) => (played > 0 ? f.pct(f.winRate(won, played)) : '-');
const perItem = (o) => (o?.totalItemsFound > 0 ? f.clock(o.totalTimeSpentOnItems / 1000 / o.totalItemsFound) : '-');
const streakLine = (st) => {
  if (!st) return null;
  if (st.currentWinStreak > 1) return `On a ${st.currentWinStreak} round win streak, best ${st.highestWinStreak}.`;
  if (st.currentWinStreak === 1) return `Won their last round. Best win streak ${st.highestWinStreak}.`;
  return st.highestWinStreak > 0 ? `Best win streak ${st.highestWinStreak}.` : null;
};

function favourites(s, t) {
  const m = new Map();
  [...(s?.topThreeItems ?? []), ...(t?.topThreeItems ?? [])].forEach((x) => m.set(itemKey(x.itemName), (m.get(itemKey(x.itemName)) ?? 0) + x.count));
  return [...m].map(([item, n]) => ({ item, n })).sort((a, b) => b.n - a.n).slice(0, 4);
}

export function PlayerProfile({ uuid, onOpenPlayer, onOpenMatch, onOpenCollection }) {
  const [attempt, setAttempt] = useState(0);
  const profileState = useAsync(() => loadPlayer(uuid), [uuid, attempt]);
  const history = useAsync(() => loadPlayerMatches(uuid, HISTORY), [uuid]).data;
  const catalogue = useAsync(loadCatalogue, []).data;
  const unlocked = useAsync(() => loadPlayerAchievements(uuid), [uuid]).data;
  const collection = useAsync(() => loadCollection(uuid), [uuid]).data;
  const overview = useAsync(loadOverview, []).data;
  const [allAchievements, setAllAchievements] = useState(false);

  const rounds = useMemo(() => (history?.matches ?? []).flatMap((m) => {
    const rows = matchStandings(m);
    const mine = rows.find((r) => r.members.some((p) => idUuid(p) === uuid));
    if (!mine) return [];
    const others = rows.filter((r) => r !== mine);
    return [{ m, mine, others, best: Math.max(0, ...others.map((r) => r.score)) }];
  }), [history, uuid]);

  const rivals = useMemo(() => {
    const h = new Map();
    rounds.forEach(({ mine, others }) => others.forEach((o) => o.members.forEach((p) => {
      const e = h.get(idUuid(p)) ?? { player: p, w: 0, l: 0 };
      if (mine.won && !o.won) e.w += 1;
      else if (o.won && !mine.won) e.l += 1;
      h.set(idUuid(p), e);
    })));
    return [...h.values()].filter((e) => e.w + e.l > 0).sort((a, b) => (b.w + b.l) - (a.w + a.l)).slice(0, 6);
  }, [rounds]);

  const album = useMemo(() => {
    if (!collection) return null;
    const items = collection.items ?? [];
    const got = new Set(items.map((i) => itemKey(i.itemName).toUpperCase()));
    return {
      unique: items.filter((i) => i.playerCount <= 1).map((i) => i.itemName),
      latest: [...items].sort((a, b) => b.firstCollected - a.firstCollected).slice(0, 12),
      most: [...items].sort((a, b) => b.timesCollected - a.timesCollected).slice(0, 8).map((i) => i.itemName),
      missing: ITEM_POOL.filter((k) => !got.has(k)),
    };
  }, [collection]);

  return (
    <Async state={profileState} what="this player" onRetry={() => setAttempt((n) => n + 1)}>
      {(payload) => {
        const { solo: s, team: t, streaks, player } = payload.profile ?? {};
        const rank = payload.rank;
        const name = idLabel(player ?? { uuid });
        const played = (s?.gamesPlayed ?? 0) + (t?.totalGamesPlayed ?? 0);
        const won = (s?.gamesWon ?? 0) + (t?.totalGamesWon ?? 0);
        const items = (s?.totalItemsFound ?? 0) + (t?.totalItemsFound ?? 0);
        const pulls = Object.entries(RARITY).map(([key, r]) => [key, (s?.rarities?.[r.field] ?? 0) + (t?.rarities?.[r.field] ?? 0)]);
        const fav = favourites(s, t);
        const wall = [...new Set([...fav.map((x) => x.item), ...(album?.most ?? []).map(itemKey), ...(album?.latest ?? []).map((i) => itemKey(i.itemName))])];
        const myMoments = (overview?.moments ?? []).filter((m) => [m.player, ...(m.members ?? [])].some((p) => idUuid(p) === uuid));
        const partners = (payload.partners ?? [])
          .map((p) => ({ ...p, other: idUuid(p.player1) === uuid ? p.player2 : p.player1 }))
          .sort((a, b) => b.gamesPlayed - a.gamesPlayed);
        const { earned, chase } = splitAchievements(achievementGroups(catalogue, unlocked, {
          career: lifetimeStats(s, t), streaks: streaks ?? null, collection,
        }));
        const achievements = [...earned, ...chase];
        const solo = s?.gamesPlayed > 0 ? s : null;
        const duo = t?.totalGamesPlayed > 0 ? t : null;
        const record = [
          ['Rounds', show(s?.gamesPlayed ?? 0), show(t?.totalGamesPlayed ?? 0)],
          ['Wins', show(solo?.gamesWon), show(duo?.totalGamesWon)],
          ['Win rate', rate(solo?.gamesWon, solo?.gamesPlayed), rate(duo?.totalGamesWon, duo?.totalGamesPlayed)],
          ['Items found', show(solo?.totalItemsFound), show(duo?.totalItemsFound)],
          ['Best score', show(solo?.highestScore), show(duo?.highestTeamScore)],
          ['Item streak', show(solo?.longestItemStreak), show(duo?.longestTeamItemStreak)],
          ['Back to back streak', show(solo?.highestB2BStreak), show(duo?.highestB2BStreak)],
          ['Time per item', perItem(solo), perItem(duo)],
          ['Blocks travelled', show(solo?.blocksTravelled), show(duo?.blocksTravelled)],
          ['Deaths', show(solo?.deaths), show(duo?.deaths)],
        ];

        return (
          <>
            <section className="banner">
              {wall.length > 0 && (
                <div className="wall" aria-hidden="true">
                  {Array.from({ length: 70 }, (_, i) => <Sprite key={i} name={wall[i % wall.length]} size={42} />)}
                </div>
              )}
              <div>
                <span className="skin"><Skin uuid={uuid} scale={6} /></span>
                <div>
                  <h1>{name}</h1>
                  <p>{times(played, 'round', 'rounds')}, {f.full(won)} won, {times(items, 'item', 'items')} found. {streakLine(streaks)}</p>
                  <span className="rank">
                    <i className={rank?.rank === 1 ? 'g1' : rank?.rank === 3 ? 'g3' : rank?.rank ? '' : 'g0'}>{rank?.rank ?? '-'}</i>
                    {rank?.rank != null ? `Number ${rank.rank} of ${rank.totalRanked} by solo wins` : 'Not ranked in solo yet'}
                  </span>
                </div>
              </div>
            </section>

            <div className="cols">
              <div>
                {fav.length > 0 && (
                  <section className="sec">
                    <div className="sh"><h2>Favourite finds</h2><span className="r">The items they find most</span></div>
                    <div className="shelf">
                      {fav.map((x) => <div key={x.item}><Item name={x.item} size="t84" /><b>{itemLabel(x.item)}</b><small>found {x.n === 1 ? 'once' : `${f.full(x.n)} times`}</small></div>)}
                    </div>
                  </section>
                )}

                <section className="sec">
                  <div className="sh"><h2>Back to backs</h2><span className="r">{f.full(pulls.reduce((n, [, c]) => n + c, 0))} in {f.full(items)} finds</span></div>
                  <p className="tline">{pulls.map(([key, count]) => <span key={key} className={count ? '' : 'quiet'}><b>{f.full(count)}</b><Tier tier={key} /></span>)}</p>
                  {myMoments.length > 0 && (
                    <>
                      <p className="label">Their latest Legendary or better</p>
                      <div className="row">
                        {myMoments.map((m) => (
                          <button key={`${m.matchId}${m.itemName}`} type="button" onClick={() => onOpenMatch(m.matchId)}>
                            <Item name={m.itemName} tier={m.b2bRarity} title={`${itemLabel(m.itemName)}, ${RARITY[m.b2bRarity]?.label}, ${f.date(m.collectedAt)}`} />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </section>

                {collection && album && (
                  <section className="sec">
                    <div className="sh">
                      <h2>Collection</h2>
                      <span className="r"><a href={`?view=collection&uuid=${uuid}`} onClick={(e) => { e.preventDefault(); onOpenCollection(uuid); }}>Open the whole album</a></span>
                    </div>
                    <p><span className="big">{f.full(collection.distinctItems)}</span> <span className="muted">of {f.full(collection.totalItems)} items found at least once</span></p>
                    <div className="meter" style={{ '--w': (collection.distinctItems / Math.max(1, collection.totalItems)) * 100 }}><i /></div>
                    {album.unique.length > 0 && (
                      <>
                        <p className="label">Only {name} has {album.unique.length === 1 ? 'this' : `these ${album.unique.length}`}</p>
                        <div className="row">{album.unique.slice(0, SHOWN_ROW).map((k) => <Item key={k} name={k} />)}</div>
                      </>
                    )}
                    <p className="label">Latest firsts</p>
                    <div className="row">{album.latest.map((i) => <Item key={i.itemName} name={i.itemName} title={`${itemLabel(i.itemName)}, first found ${f.date(i.firstCollected)}`} />)}</div>
                    {album.missing.length > 0 && (
                      <>
                        <p className="label">{f.full(album.missing.length)} still to find</p>
                        <div className="row">{album.missing.slice(0, SHOWN_ROW).map((k) => <Item key={k} name={k} gone title={`${itemLabel(k)}, not found yet`} />)}</div>
                      </>
                    )}
                  </section>
                )}

                {achievements.length > 0 && (
                  <section className="sec">
                    <div className="sh"><h2>Achievements</h2><span className="r">{earned.length} of {achievements.length}</span></div>
                    <ul className="ach">
                      {(allAchievements ? achievements : achievements.slice(0, SHOWN_ACHIEVEMENTS)).map((a) => (
                        <li key={a.id} className={a.unlocked ? 'got' : ''}>
                          <b>{a.plainTitle}</b>
                          <span>{a.plainDescription}</span>
                          <small>
                            {a.unlocked ? f.date(a.earnedAt) : a.progress ? `${f.full(a.progress.current)} of ${f.full(a.progress.target)}` : 'Locked'}
                          </small>
                        </li>
                      ))}
                    </ul>
                    {achievements.length > SHOWN_ACHIEVEMENTS && (
                      <button type="button" className="btn" onClick={() => setAllAchievements((v) => !v)}>
                        {allAchievements ? 'Show fewer' : `Show all ${achievements.length}`}
                      </button>
                    )}
                  </section>
                )}

                {rounds.length > 0 && (
                  <section className="sec">
                    <div className="sh"><h2>{rounds.length === 1 ? 'Their round' : 'Recent rounds'}</h2></div>
                    <div className="tbl">
                      <table>
                        <tbody>
                          {rounds.slice(0, SHOWN_ROUNDS).map(({ m, mine, others, best }) => {
                            const mates = mine.members.filter((p) => idUuid(p) !== uuid);
                            return (
                              <tr
                                key={m.matchId}
                                className="go"
                                tabIndex={0}
                                onClick={() => onOpenMatch(m.matchId)}
                                onKeyDown={(e) => { if (e.key === 'Enter') onOpenMatch(m.matchId); }}
                              >
                                <td className="quiet">{f.date(m.startedAt)}</td>
                                <td className={mine.won ? 'win' : 'quiet'}><b>{mine.won ? 'Win' : 'Loss'}</b></td>
                                <td className="sc"><span className="fig">{mine.score}</span><i>:</i><span className="lose">{best}</span></td>
                                <td>{mates.length ? mates.map((p) => <Who key={idUuid(p)} player={p} onOpen={onOpenPlayer} size={22} />) : <span className="quiet">Solo</span>}</td>
                                <td className="lo muted">
                                  {others.length > 2 ? `${others.length} others` : `against ${others.flatMap((r) => r.members.map(idLabel)).join(' and ')}`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
              </div>

              <aside>
                <section className="sec">
                  <div className="sh"><h2>Record</h2></div>
                  <table>
                    <thead><tr><th /><th className="rt">Solo</th><th className="rt">Duos</th></tr></thead>
                    <tbody>
                      {record.map(([label, a, b]) => (
                        <tr key={label}><td className="muted">{label}</td><td className="rt">{a}</td><td className="rt">{b}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {partners.length > 0 && (
                  <section className="sec">
                    <div className="sh"><h2>Partners</h2></div>
                    <ul className="mates">
                      {partners.slice(0, 6).map((p) => (
                        <li key={idUuid(p.other)}>
                          <Face uuid={idUuid(p.other)} size={32} />
                          <span>
                            <button type="button" className="nm" onClick={() => onOpenPlayer(idUuid(p.other))}>{idLabel(p.other)}</button>
                            <small>{p.gamesWon} won of {p.gamesPlayed}, best score {p.highestScore}</small>
                          </span>
                          <span className="v">{f.pct(f.winRate(p.gamesWon, p.gamesPlayed))}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {rivals.length > 0 && (
                  <section className="sec">
                    <div className="sh"><h2>Head to head</h2><span className="r">{rounds.length === 1 ? 'their only round' : `last ${rounds.length} rounds`}</span></div>
                    <ul className="mates">
                      {rivals.map((r) => (
                        <li key={idUuid(r.player)}>
                          <Face uuid={idUuid(r.player)} size={32} />
                          <button type="button" className="nm" onClick={() => onOpenPlayer(idUuid(r.player))}>{idLabel(r.player)}</button>
                          <span className="v sc"><span className={r.w > r.l ? 'win' : ''}>{r.w}</span><i>:</i><span className="lose">{r.l}</span></span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </aside>
            </div>
          </>
        );
      }}
    </Async>
  );
}
