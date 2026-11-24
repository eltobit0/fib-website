import React, { useRef, useState } from 'react';
import { LEADERBOARD_SCOPES, LEADERBOARD_CATEGORIES, idUuid } from './adapter.js';
import { loadLeaderboard } from './api.js';
import { useAsync } from './useAsync.js';
import { useFlipRows } from './useFlip.js';
import { Async, Tog, Who } from './ui.jsx';
import * as f from './format.js';

const SCOPE_NOTE = {
  solo: 'Solo rounds only.',
  duo: 'Each duo is ranked as its own pair. Playing with someone new starts a separate record.',
  combined: 'Teams adds up every duo a player has been part of.',
};

/* Solo and combined rows carry one player, duo rows two. */
const entrantsOf = (row) => (row.player ? [row.player] : [row.player1, row.player2].filter(Boolean));
const keyOf = (row) => entrantsOf(row).map(idUuid).join('~');

export function Leaderboards({ scope, onScopeChange, onOpenPlayer }) {
  const [category, setCategory] = useState('GAMES_WON');
  const [attempt, setAttempt] = useState(0);
  /* A board keeps the scope and category it was loaded for, so the one on screen never borrows the next one's units. */
  const state = useAsync(
    () => loadLeaderboard(scope, category, 100)
      .then((r) => ({ data: { rows: r.data ?? [], scope, category }, stale: r.stale })),
    [scope, category, attempt],
  );
  const board = state.data;
  const body = useRef(null);
  useFlipRows(body, `${board?.scope}:${board?.category}`);

  return (
    <section className="page">
      <h1>The table</h1>
      <div className="ctrls">
        <Tog label="Scope" options={LEADERBOARD_SCOPES} value={scope} onChange={onScopeChange} />
        <Tog label="Board" options={LEADERBOARD_CATEGORIES} value={category} onChange={setCategory} />
      </div>
      <p className="lede">{SCOPE_NOTE[scope]}</p>
      <Async state={state} what="the table" onRetry={() => setAttempt((n) => n + 1)}>
        {({ rows, category: shown }) => {
          const meta = LEADERBOARD_CATEGORIES.find((c) => c.id === shown);
          const low = meta.sense === 'low';
          const best = rows[0]?.value ?? 0;
          const share = (v) => (low ? (v > 0 ? Math.min(1, best / v) : 0) : best > 0 ? v / best : 0);
          if (!rows.length) return <div className="state"><b>Nothing ranked yet</b>This board fills in after the first round that counts for it.</div>;
          return (
            <div className="tbl" style={{ marginTop: 24 }} aria-busy={state.loading || undefined}>
              <table className="tb">
                <thead>
                  <tr><th style={{ width: 56 }}>No.</th><th>{rows[0].player ? 'Player' : 'Duo'}</th><th className="rt">{meta.label}</th><th className="barc lo" /></tr>
                </thead>
                <tbody ref={body}>
                  {rows.map((row) => {
                    const who = entrantsOf(row);
                    return (
                      <tr key={keyOf(row)} data-flip-key={keyOf(row)} className={`p${row.rank}`}>
                        <td><span className="rk">{row.rank}</span></td>
                        <td>{who.map((p) => <Who key={idUuid(p)} player={p} onOpen={onOpenPlayer} />)}</td>
                        <td className="v">{f.byKind(row.value, meta.format)}</td>
                        <td className="barc lo"><div className="bar" style={{ '--w': share(row.value) * 100 }}><i /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }}
      </Async>
    </section>
  );
}
