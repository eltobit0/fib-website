import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  matchStandings, matchDuration, raceEntries, standingsAt, leadChanges, leadChangeTimes, idUuid, idLabel, matchHeadline,
} from './adapter.js';
import { loadMatch } from './api.js';
import { useAsync } from './useAsync.js';
import { useFlipRows } from './useFlip.js';
import { labelFor, phaseSchedule, runOf, TIER_RANK, huntedFind } from './matchModel.js';
import { RARITY_KEYS } from './tokens.js';
import { RibbonRace } from './Charts.jsx';
import { Async, Item, RoundItem, Tier, Tog, Who } from './ui.jsx';
import { RARITY } from './statsKit.js';
import { RoundLanes, Score } from './Round.jsx';
import * as f from './format.js';

const TABS = [
  { id: 'items', label: 'Items' },
  { id: 'race', label: 'Race' },
  { id: 'runs', label: 'Runs' },
  { id: 'records', label: 'Records' },
  { id: 'settings', label: 'Settings' },
];

const yesNo = (on, off) => (v) => (v === 'true' ? on : off);
const SETTING_GROUPS = [
  { id: 'mode', name: 'Game mode' },
  { id: 'pool', name: 'Item pool' },
  { id: 'survival', name: 'Survival' },
  { id: 'gameplay', name: 'Gameplay' },
  { id: 'progression', name: 'Progression' },
  { id: 'other', name: 'Other' },
];
const SETTINGS = {
  TEAM: { group: 'mode', label: 'Format', value: yesNo('Teams', 'Solo') },
  RUN: { group: 'mode', label: 'RunBattle', value: yesNo('Only the first finder scores', 'Everyone can score the same item') },
  CHAIN: { group: 'mode', label: 'ForceChain', value: yesNo('Current + next item shown', 'Only the current item shown') },
  TEAM_CHAT: { group: 'mode', label: 'Team Chat', value: yesNo('Visible to teammates only', 'All chat is global') },
  HARD: { group: 'pool', label: 'Hard', value: yesNo('Late items included', 'Late items excluded') },
  NETHER: { group: 'pool', label: 'Nether', value: yesNo('Portal open, nether items in the pool', 'Disabled') },
  END: { group: 'pool', label: 'End', value: yesNo('Portal open, end items in the pool', 'Disabled') },
  EXTREME: { group: 'pool', label: 'Extreme', value: yesNo('All obtainable items', 'Only reasonably obtainable items') },
  QUICKIE: { group: 'pool', label: 'Quickie', value: (v) => ['Disabled', 'Early only', 'Early + Mid'][Number(v)] ?? v },
  PVP: { group: 'survival', label: 'PvP', value: yesNo('Players can attack each other', 'No player damage') },
  FOOD: { group: 'survival', label: 'Food', value: yesNo('Normal hunger', 'No hunger drain') },
  KEEP_INVENTORY: { group: 'survival', label: 'KeepInventory', value: yesNo('Items kept on death', 'Items dropped on death') },
  BACKPACK: { group: 'gameplay', label: 'Backpack', value: yesNo('Extra inventory slots', 'Standard 36 slots') },
  BACKPACKSIZE: { group: 'gameplay', label: 'Backpack Rows', value: (v) => (v === '0' ? 'None' : `${v} ${Number(v) === 1 ? 'row' : 'rows'}`) },
  POSITIONS: { group: 'gameplay', label: 'Position System', value: yesNo('Positions can be shared', '/pos is disabled') },
  ELYTRA: { group: 'gameplay', label: 'Elytra Gliding', value: yesNo('Gliding allowed', 'Gliding disabled') },
  HARDER_TRACKERS: { group: 'gameplay', label: 'Harder Trackers', value: yesNo('Harder tracker recipes', 'Standard tracker recipes') },
  FASTER_RANDOM_TICK: { group: 'gameplay', label: 'Faster Plants', value: yesNo('Crops and trees grow faster', 'Vanilla growth speeds') },
  TRADING: { group: 'gameplay', label: 'Player Trading', value: yesNo('Players can trade items', 'Trading disabled') },
  TRADING_COOLDOWN: { group: 'gameplay', label: 'Trading Cooldown', value: (v) => (v === '0' ? 'None' : `${v} min`) },
  RANDOM_EVENTS: { group: 'gameplay', label: 'Random Events', value: yesNo('Fires 3 to 4 times an hour', 'No random events') },
  EVENT: { group: 'gameplay', label: 'Event Modifiers', value: yesNo('Tournament rules', 'Standard rules') },
  STATS: { group: 'progression', label: 'Stats', value: yesNo('Counted towards the leaderboards', 'Not recorded') },
  SCORE: { group: 'progression', label: 'Score', value: yesNo('Visible to all players', 'Hidden until the round ends') },
  ACHIEVEMENTS: { group: 'progression', label: 'Achievements', value: yesNo('Earned this round', 'Not tracked') },
};
const settingLabel = (key) =>
  SETTINGS[key]?.label ?? key.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
const settingValue = (key, raw) =>
  SETTINGS[key]?.value(String(raw)) ?? (raw === 'true' ? 'On' : raw === 'false' ? 'Off' : String(raw));
function groupSettings(settings = {}) {
  const buckets = new Map(SETTING_GROUPS.map((g) => [g.id, []]));
  Object.keys(SETTINGS).filter((k) => k in settings).forEach((k) => buckets.get(SETTINGS[k].group).push(k));
  /* A rule the server knows and this file does not is still a rule the match was played under. */
  Object.keys(settings).filter((k) => !(k in SETTINGS)).forEach((k) => buckets.get('other').push(k));
  return SETTING_GROUPS.map((g) => ({ ...g, keys: buckets.get(g.id) })).filter((g) => g.keys.length > 0);
}

/* A whole match replays in 10 to 24 seconds, scaled to its length. */

const replayMs = (matchSecs) => Math.min(24000, Math.max(10000, (matchSecs * 1000) / 120));

const Chips = ({ members, onOpenPlayer, size = 28 }) => members.map((m) => (
  <Who key={idUuid(m) ?? idLabel(m)} player={m} onOpen={onOpenPlayer} size={size} />
));

export function MatchDetail({ matchId, onBack, onOpenPlayer }) {
  const [attempt, setAttempt] = useState(0);
  const state = useAsync(() => loadMatch(matchId), [matchId, attempt]);
  const match = state.data ?? null;
  const [tab, setTab] = useState('items');

  const [cursor, setCursor] = useState(null);
  const [hover, setHover] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [range, setRange] = useState({ from: 0, to: Infinity });

  const model = useMemo(() => {
    if (!match?.items) return null;
    const entries = raceEntries(match);
    const changeTimes = leadChangeTimes(entries);
    const duration = matchDuration(match);
    return {
      entries,
      duration,
      changes: leadChanges(entries),
      changeTimes,
      finalStandings: matchStandings(match),
      runs: entries.map(runOf),
      phases: phaseSchedule(duration, match.settings ?? {}),
      headline: matchHeadline(match, changeTimes.length ? changeTimes[changeTimes.length - 1] : null).text,
    };
  }, [match]);

  const duration = model?.duration ?? 0;
  const t = hover ?? cursor ?? duration;
  const scrubbing = hover != null || cursor != null;
  const live = useMemo(() => (model ? standingsAt(model.entries, t) : []), [model, t]);

  const win = { from: Math.max(0, range.from), to: Math.min(duration, range.to) };
  const replayLength = replayMs(Math.max(1, win.to - win.from));
  useEffect(() => {
    if (!playing || !model) return undefined;
    let raf = 0;
    let start = 0;
    const from = cursor != null && cursor >= win.from && cursor < win.to ? cursor : win.from;
    const tick = (now) => {
      if (!start) start = now;
      const next = from + ((now - start) / replayLength) * (win.to - win.from);
      if (next >= win.to) {
        setPlaying(false);
        setCursor(win.to >= duration ? null : win.to);
        return;
      }
      setCursor(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, model, win.from, win.to]);

  const replay = () => {
    if (playing) return setPlaying(false);
    if (cursor != null && (cursor >= win.to || cursor < win.from)) setCursor(null);
    return setPlaying(true);
  };
  const rest = () => {
    setPlaying(false);
    setHover(null);
    setCursor(null);
  };

  const finalLead = model?.finalStandings?.[0]?.score ?? 0;
  const board = live.map((row) => ({
    entry: row.entry,
    place: scrubbing || !(row.entry.placement > 0) ? row.pos : row.entry.placement,
    score: scrubbing ? row.score : row.entry.score,
    gap: scrubbing ? row.gap : row.entry.score - finalLead,
  }));
  const separated = new Set(board.map((r) => r.place)).size > 1;

  if (match && !model) {
    return (
      <div className="state"><b>Nothing here</b>That round is not on record.
        <div><button type="button" className="btn" onClick={onBack}>All rounds</button></div>
      </div>
    );
  }

  return (
    <Async state={state} what="this round" onRetry={() => setAttempt((n) => n + 1)}>
      {() => (
        <section className="page">
          <button type="button" className="back" onClick={onBack}>All rounds</button>
          <div className="round-hd">
            <div>
              <h1 className="title">{model.headline}</h1>
              <p className="lede">
                {f.stamp(match.endedAt)}. {match.mode === 'SOLO' ? 'Solo' : 'Duos'}, {f.duration(duration)}.{' '}
                {match.items.filter((i) => !i.skipped).length} items found, {match.items.filter((i) => i.skipped).length} jokers,{' '}
                {model.runs.reduce((n, r) => n + r.pulls.length, 0)} back to backs, {model.changes} lead {model.changes === 1 ? 'change' : 'changes'}.
              </p>
            </div>
            <Score match={match} />
          </div>
          <div className="ctrls"><Tog label="Section" options={TABS} value={tab} onChange={setTab} /></div>

          {tab === 'items' && <RoundLanes match={match} onOpenPlayer={onOpenPlayer} />}
          {tab === 'race' && (
            <Race
              model={model} t={t} win={win} setRange={setRange} cursor={hover ?? cursor}
              scrubbing={scrubbing} playing={playing} replay={replay} rest={rest} replayLength={replayLength}
              onHover={playing ? undefined : setHover}
              onSeek={(v) => {
                if (playing) setPlaying(false);
                setHover(null);
                setCursor(v);
              }}
              board={board} separated={separated} onOpenPlayer={onOpenPlayer}
            />
          )}
          {tab === 'runs' && <Runs model={model} at={scrubbing ? t : null} finalLead={finalLead} onOpenPlayer={onOpenPlayer} />}
          {tab === 'records' && <Records entries={model.entries} runs={model.runs} />}
          {tab === 'settings' && <Settings match={match} />}
        </section>
      )}
    </Async>
  );
}

function Race({
  model, t, win, setRange, cursor, scrubbing, playing, replay, rest, replayLength, onHover, onSeek, board, separated, onOpenPlayer,
}) {
  const { entries, duration, changeTimes, phases } = model;
  const lastTurn = changeTimes.length ? changeTimes[changeTimes.length - 1] : duration;
  const finishFrom = Math.max(0, Math.floor(Math.min(duration * 0.75, lastTurn - 300) / 60) * 60);
  const rangeId = win.from === 0 && win.to === duration ? 'all'
    : win.from === finishFrom && win.to === duration ? 'finish' : 'custom';
  const ranges = [
    { id: 'all', label: 'Whole round' },
    { id: 'finish', label: `The finish, ${f.clock(finishFrom)} to ${f.clock(duration)}` },
    ...(rangeId === 'custom' ? [{ id: 'custom', label: `${f.clock(win.from)} to ${f.clock(win.to)}` }] : []),
  ];

  const boardRef = useRef(null);
  useFlipRows(boardRef, board.map((r) => r.entry.key).join('|'));

  const laneAt = (entry) => {
    const done = entry.events.filter((e) => e.t <= t);
    const next = entry.events.find((e) => e.t > t);
    if (scrubbing && next) return { verb: `hunting for ${f.clock(Math.max(0, t - (done.length ? done[done.length - 1].t : 0)))}`, item: next.itemName };
    return { verb: 'last find', item: [...done].reverse().find((e) => !e.skipped)?.itemName ?? null };
  };

  return (
    <>
      <div className="ctrls">
        <Tog
          label="Chart range"
          options={ranges}
          value={rangeId}
          onChange={(id) => {
            if (id === 'all') setRange({ from: 0, to: duration });
            if (id === 'finish') setRange({ from: finishFrom, to: duration });
          }}
        />
        <span className="quiet">Drag across the pace bars to zoom in.</span>
      </div>

      <div className="chart fib">
        <RibbonRace
          entries={entries}
          duration={duration}
          from={win.from}
          to={win.to}
          onWindow={(from, to) => setRange({ from, to })}
          cursor={cursor}
          phases={phases}
          changeTimes={changeTimes}
          labelFor={labelFor}
          onScrub={onHover}
          height={280}
        />
      </div>

      <div className="scrub">
        <button
          type="button"
          className="btn go"
          onClick={replay}
          aria-pressed={playing}
          aria-label={playing ? 'Pause the replay' : `Replay in ${Math.round(replayLength / 1000)} seconds`}
        >
          {playing ? 'Pause' : 'Replay'}
        </button>
        <input
          type="range"
          min={0}
          max={duration}
          step={5}
          value={t}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Round time"
          aria-valuetext={`${f.clock(t)} of ${f.clock(duration)}`}
        />
        <span className="fig">{f.clock(t)} / {f.clock(duration)}</span>
        {scrubbing && <button type="button" className="btn" onClick={rest}>Final result</button>}
      </div>

      <section className="sec">
        <div className="sh"><h2>{scrubbing ? `Standings at ${f.clock(t)}` : 'Final standings'}{scrubbing && !separated ? ', everyone level' : ''}</h2></div>
        <div className="tbl">
          <table className="tb">
            <tbody ref={boardRef}>
              {board.map(({ entry, place, score, gap }) => {
                const lane = laneAt(entry);
                return (
                  <tr key={entry.key} data-flip-key={entry.key} className={separated ? `p${place}` : ''}>
                    <td style={{ width: 40 }}><span className="rk">{separated ? place : '-'}</span></td>
                    <td><Chips members={entry.members} onOpenPlayer={onOpenPlayer} /></td>
                    <td className="lo">
                      <span className="now">
                        {lane.item && <Item name={lane.item} size="t28" />}
                        <span><small>{lane.verb}</small>{lane.item ? f.itemLabel(lane.item) : 'nothing yet'}</span>
                      </span>
                    </td>
                    <td className="v">{score}</td>
                    <td className="rt quiet">{gap !== 0 ? gap : !separated ? 'level' : scrubbing ? 'leading' : 'won'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Runs({ model, at, finalLead, onOpenPlayer }) {
  const { entries, runs, finalStandings } = model;
  return (
    <div className="runs">
      {finalStandings.map((row, i) => {
        const entry = entries.find((e) => e.key === row.key) ?? entries[i];
        return (
          <Report
            key={row.key}
            entry={entry}
            run={runs[entries.indexOf(entry)]}
            place={row.placement > 0 ? row.placement : i + 1}
            lead={finalLead}
            won={row.won}
            at={at}
            onOpenPlayer={onOpenPlayer}
          />
        );
      })}
    </div>
  );
}

function Report({ entry, run, place, lead, won, at, onOpenPlayer }) {
  const hunting = at == null ? null : run.segments.find((s) => s.t > at)?.order ?? null;
  const facts = [
    ['Found', `${run.found}, plus ${run.skipped} ${run.skipped === 1 ? 'joker' : 'jokers'}`],
    ['Per item', run.perItem != null ? f.duration(run.perItem) : '-'],
    ['Pools', `${run.phases.EARLY} early, ${run.phases.MID} mid, ${run.phases.LATE} late`],
  ];
  const note = (seg) => {
    if (seg.skipped) return 'jokered';
    const parts = [];
    if (seg.b2b) parts.push(<Tier key="t" tier={seg.b2b} />);
    if (seg === run.fastest) parts.push('fastest find');
    if (seg === run.longest) parts.push('longest hunt');
    return parts.length ? parts.reduce((acc, p, k) => (k ? [...acc, ', ', p] : [p]), []) : null;
  };

  return (
    <article className={`run p${place}`}>
      <header>
        <span className="pos">{place}</span>
        <Chips members={entry.members} onOpenPlayer={onOpenPlayer} />
        <b className="v">{entry.score}</b>
        <span className="quiet">{won ? 'won' : entry.score === lead ? 'level' : `${lead - entry.score} behind`}</span>
      </header>
      <ul className="lines">
        {facts.map(([label, value]) => <li key={label}><span>{label}</span><span>{value}</span></li>)}
        <li>
          <span>Back to backs</span>
          <span>
            {run.pulls.length}
            {RARITY_KEYS.filter((k) => run.tiers[k] > 0).map((k) => (
              <span key={k} style={{ marginLeft: 12 }}>{run.tiers[k]} <Tier tier={k} /></span>
            ))}
          </span>
        </li>
      </ul>
      <ol className="finds" aria-label={`${labelFor(entry)}, ${run.segments.length} items in the order they came`}>
        {run.segments.map((seg) => {
          const n = note(seg);
          const state = seg.order === hunting ? 'cur' : at != null && seg.t > at ? 'ahead' : '';
          return (
            <li key={seg.order} className={[seg.skipped && 'j', state].filter(Boolean).join(' ')}>
              <span className="no">{seg.order}</span>
              <RoundItem event={seg} tip={f.itemLabel(seg.itemName)} />
              <span><b>{f.itemLabel(seg.itemName)}</b>{n && <small>{n}</small>}</span>
              <span className="when">{f.clock(seg.t)}<small>after {f.duration(seg.took)}</small></span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function Records({ entries, runs }) {
  const records = useMemo(() => {
    const all = entries.flatMap((entry, i) => runs[i].segments.map((s) => ({ ...s, entry })));
    const finds = all.filter((s) => !s.skipped);
    const pick = (list, better) => list.reduce((a, b) => (a == null || better(b, a) ? b : a), null);
    const out = [];
    const fastest = pick(finds.filter(huntedFind), (b, a) => b.took < a.took);
    if (fastest) out.push({ id: 'fastest', title: 'Fastest find', s: fastest, figure: f.duration(fastest.took) });
    const longest = pick(all, (b, a) => b.took > a.took);
    if (longest) out.push({ id: 'longest', title: 'Longest hunt', s: longest, figure: `${f.duration(longest.took)}${longest.skipped ? ', then a joker' : ''}` });
    const first = pick(finds, (b, a) => b.t < a.t);
    if (first) out.push({ id: 'first', title: 'First find', s: first, figure: `at ${f.clock(first.t)}` });
    const rarest = pick(
      all.filter((s) => s.b2b),
      (b, a) => TIER_RANK[b.b2b] > TIER_RANK[a.b2b] || (TIER_RANK[b.b2b] === TIER_RANK[a.b2b] && b.t < a.t),
    );
    if (rarest) out.push({ id: 'rarest', title: 'Rarest pull', s: rarest, figure: RARITY[rarest.b2b]?.label, tier: rarest.b2b });
    return out;
  }, [entries, runs]);

  if (records.length === 0) return <div className="state"><b>No records</b>Nothing was found in this round.</div>;
  return (
    <div className="shelf" style={{ marginTop: 28 }}>
      {records.map((r) => (
        <div key={r.id}>
          <Item name={r.s.itemName} size="t84" tier={r.tier} />
          <b>{f.itemLabel(r.s.itemName)}</b>
          <span className="figure">{r.tier ? <Tier tier={r.tier} /> : r.figure}</span>
          <small>{r.title}, {labelFor(r.s.entry)}, at {f.clock(r.s.t)}</small>
        </div>
      ))}
    </div>
  );
}

function Settings({ match }) {
  return groupSettings(match.settings).map((group) => (
    <section key={group.id} className="sec">
      <div className="sh"><h2>{group.name}</h2></div>
      <ul className="lines" style={{ maxWidth: 720 }}>
        {group.keys.map((k) => (
          <li key={k}><span>{settingLabel(k)}</span><span>{settingValue(k, match.settings[k])}</span></li>
        ))}
      </ul>
    </section>
  ));
}
