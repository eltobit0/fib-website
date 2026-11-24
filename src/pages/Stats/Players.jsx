import React, { useMemo, useState } from 'react';
import { loadPlayerIndex } from './api.js';
import { useAsync } from './useAsync.js';
import { Async, Face } from './ui.jsx';
import * as f from './format.js';

/* Two weeks: a weekend player is still a regular, someone who played once in July is not. */
const AROUND_MS = 14 * 24 * 3600 * 1000;

export function Players({ onOpenPlayer }) {
  const state = useAsync(loadPlayerIndex, []);
  const [query, setQuery] = useState('');
  const [now] = useState(() => Date.now());
  const q = query.trim().toLowerCase();

  const groups = useMemo(() => {
    const all = (state.data?.players ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
    const around = all.filter((p) => p.lastSeen != null && now - p.lastSeen < AROUND_MS)
      .sort((a, b) => b.lastSeen - a.lastSeen);
    return [
      { title: 'Playing lately', players: around },
      { title: around.length ? 'Not seen for a while' : 'Everyone', players: all.filter((p) => !around.includes(p)) },
    ].filter((g) => g.players.length);
  }, [state.data, q, now]);

  const line = (p) => [
    p.itemsFound != null ? `${f.full(p.itemsFound)} items` : 'No items yet',
    p.played ? `${f.full(p.wins ?? 0)} won of ${f.full(p.played)}` : null,
    p.lastSeen != null ? `seen ${f.timeAgo(p.lastSeen)}` : null,
  ].filter(Boolean).join(', ');

  return (
    <section className="page">
      <h1>Players</h1>
      {state.data?.players?.length > 0 && <p className="lede">{f.full(state.data.players.length)} players have a record.</p>}
      <div className="ctrls">
        <input
          className="search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a player"
          aria-label="Find a player"
        />
      </div>
      <Async state={state} what="the players">
        {() => (groups.length ? groups.map((g) => (
          <section key={g.title} className="sec">
            {groups.length > 1 && <div className="sh"><h2>{g.title}</h2></div>}
            <div className="people">
              {g.players.map((p) => (
                <button key={p.uuid} type="button" onClick={() => onOpenPlayer(p.uuid)}>
                  <Face uuid={p.uuid} size={48} />
                  <span><b>{p.name}</b><small>{line(p)}</small></span>
                </button>
              ))}
            </div>
          </section>
        )) : <div className="state"><b>Nobody by that name</b>Check the spelling, or clear the search.</div>)}
      </Async>
    </section>
  );
}
