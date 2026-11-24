import React, { useMemo, useState } from 'react';
import { matchStandings, idLabel } from './adapter.js';
import { loadMatches } from './api.js';
import { useAsync } from './useAsync.js';
import { Async, Faces, Tog } from './ui.jsx';
import { numbered } from './statsKit.js';
import * as f from './format.js';

const PAGE = 20;
const HISTORY_PAGE = 100;
const MODES = [{ id: 'all', label: 'All rounds' }, { id: 'SOLO', label: 'Solo' }, { id: 'TEAM', label: 'Duos' }];
const SORTS = [{ id: 'recent', label: 'Newest' }, { id: 'score', label: 'Highest score' }];
const MODE_WORD = { all: 'rounds', SOLO: 'solo rounds', TEAM: 'duo rounds' };

/* A filter or a ranking over part of the feed would be wrong, so both read every round. */
async function loadWholeHistory() {
  const all = [];
  const seen = new Set();
  let total = Infinity;
  for (let page = 0; all.length < total; page += 1) {
    const { data } = await loadMatches(page, HISTORY_PAGE);
    const rows = data?.matches ?? [];
    total = data?.totalCount ?? 0;
    rows.forEach((m) => { if (!seen.has(m.matchId)) { seen.add(m.matchId); all.push(m); } });
    if (rows.length < HISTORY_PAGE) break;
  }
  return { data: all };
}

const Team = ({ row }) => row.members.map(idLabel).join(' and ');

export function RoundsTable({ rows, onOpenMatch }) {
  return (
    <div className="tbl">
      <table>
        <thead>
          <tr>
            <th className="lo">Round</th><th>Played</th><th>Winners</th><th className="rt">Score</th>
            <th className="lo">Against</th><th className="lo rt">Lead changes</th><th className="lo rt">Items</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ match: m, no }) => {
            const [win, ...rest] = matchStandings(m);
            const second = rest[0];
            return (
              <tr
                key={m.matchId}
                className="go"
                tabIndex={0}
                onClick={() => onOpenMatch(m.matchId)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpenMatch(m.matchId); }}
              >
                <td className="lo quiet">{no}</td>
                <td className="quiet">{f.date(m.startedAt)}</td>
                <td>{win && <span className="who"><Faces members={win.members} size={22} /><span><Team row={win} /></span></span>}</td>
                <td className="rt sc"><span className="fig win">{win?.score ?? 0}</span>{second && <><i>:</i><span className="lose">{second.score}</span></>}</td>
                <td className="lo muted">
                  {rest.length > 1 ? `${rest.length} others` : second ? <Team row={second} /> : 'Nobody'}
                </td>
                <td className="lo rt quiet">{m.leadChanges ?? 0}</td>
                <td className="lo rt quiet">{m.itemsFound ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const topScore = (m) => matchStandings(m)[0]?.score ?? 0;

export function Matches({ onOpenMatch }) {
  const [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState('all');
  const [sort, setSort] = useState('recent');
  const first = useAsync(() => loadMatches(0, PAGE), [attempt]);
  const [later, setLater] = useState([]);
  const [more, setMore] = useState({ loading: false, error: false });

  const total = first.data?.totalCount ?? 0;
  const paged = useMemo(() => [...(first.data?.matches ?? []), ...later], [first.data, later]);
  const whole = mode !== 'all' || sort === 'score';
  const needsFetch = whole && paged.length < total;
  const history = useAsync(() => (needsFetch ? loadWholeHistory() : Promise.resolve({ data: null })), [needsFetch, attempt]);

  const rows = useMemo(() => {
    const source = needsFetch ? history.data : paged;
    if (!source) return null;
    const list = numbered(source, total).filter(({ match }) => mode === 'all' || match.mode === mode);
    return sort === 'score'
      ? list.sort((a, b) => topScore(b.match) - topScore(a.match) || b.match.endedAt - a.match.endedAt)
      : list;
  }, [needsFetch, history.data, paged, total, mode, sort]);

  const loadMore = async () => {
    setMore({ loading: true, error: false });
    try {
      const { data } = await loadMatches(Math.floor(paged.length / PAGE), PAGE);
      setLater((prev) => [...prev, ...(data?.matches ?? [])]);
      setMore({ loading: false, error: false });
    } catch {
      setMore({ loading: false, error: true });
    }
  };

  const retry = () => { setLater([]); setAttempt((n) => n + 1); };
  const count = whole ? rows?.length : total;
  const order = sort === 'score' ? 'highest score first' : 'newest first';

  return (
    <section className="page">
      <h1>Rounds</h1>
      <p className="lede" aria-live="polite">
        {count != null && total ? `${f.full(count)} ${MODE_WORD[mode]}, ${order}.` : `Every finished round, ${order}.`}
      </p>
      <div className="ctrls">
        <Tog label="Mode" options={MODES} value={mode} onChange={setMode} />
        <Tog label="Order" options={SORTS} value={sort} onChange={setSort} />
      </div>
      <Async state={needsFetch && !first.error ? history : first} what="the rounds" onRetry={retry}>
        {() => {
          if (!rows) return <div className="state" aria-busy="true">Loading the rounds…</div>;
          if (!rows.length) {
            return (
              <div className="state">
                <b>{total ? `No ${MODE_WORD[mode]} yet` : 'No rounds yet'}</b>
                {total ? 'Pick another mode to see the rest.' : 'The first finished round shows up here.'}
              </div>
            );
          }
          return (
            <>
              <div style={{ marginTop: 24 }}><RoundsTable rows={rows} onOpenMatch={onOpenMatch} /></div>
              {!whole && paged.length < total && (
                <button type="button" className="btn" onClick={loadMore} disabled={more.loading}>
                  {more.loading ? 'Loading…' : more.error ? 'That did not load. Try again' : 'Older rounds'}
                </button>
              )}
            </>
          );
        }}
      </Async>
    </section>
  );
}
