import React, { useMemo, useState } from 'react';
import { idLabel, itemKey, itemLabel, itemSearchText, ITEM_POOL, ITEM_STATE } from './adapter.js';
import { loadCollection } from './api.js';
import { useAsync } from './useAsync.js';
import { Async, Item, Tog } from './ui.jsx';
import * as f from './format.js';

const PHASE = { EARLY: 'Early', MID: 'Mid', LATE: 'Late' };
const SHOW = [{ id: 'all', label: 'Every item' }, { id: 'missing', label: 'Still to find' }, { id: 'got', label: 'Found' }];
const PHASES = [{ id: 'all', label: 'All pools' }, ...Object.entries(PHASE).map(([id, label]) => ({ id, label }))];

export function Collection({ uuid, onBack }) {
  const state = useAsync(() => loadCollection(uuid), [uuid]);
  const [showing, setShowing] = useState('all');
  const [phase, setPhase] = useState('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const slots = useMemo(() => {
    const got = new Map((state.data?.items ?? []).map((i) => [itemKey(i.itemName).toUpperCase(), i]));
    return ITEM_POOL.map((k, i) => ({ k, no: i + 1, phase: ITEM_STATE[k] ?? 'EARLY', got: got.get(k) ?? null }));
  }, [state.data]);

  const shown = slots.filter((x) =>
    (showing === 'all' || (showing === 'got') === !!x.got)
    && (phase === 'all' || x.phase === phase)
    && (!q || itemSearchText(x.k).toLowerCase().includes(q)));

  return (
    <Async state={state} what="this album">
      {(data) => (
        <section className="page">
          <button type="button" className="back" onClick={onBack}>Back to {idLabel(data.player)}</button>
          <h1>{f.full(data.distinctItems)} of {f.full(data.totalItems)}</h1>
          <div className="meter" style={{ '--w': (data.distinctItems / Math.max(1, data.totalItems)) * 100 }}><i /></div>
          <p className="lede">
            {idLabel(data.player)}’s collection: every item in the pool, the ones they have found on a tile. A white ring marks an item no other player has found.
          </p>
          <div className="ctrls">
            <Tog label="Show" options={SHOW} value={showing} onChange={setShowing} />
            <Tog label="Pool" options={PHASES} value={phase} onChange={setPhase} />
            <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an item" aria-label="Find an item" />
          </div>
          {shown.length ? (
            <div className="slots">
              {shown.map((x) => (x.got ? (
                <div key={x.k} title={`First found ${f.date(x.got.firstCollected)}. ${x.got.playerCount} of ${data.totalPlayers} players have it.`}>
                  <Item name={x.k} unique={x.got.playerCount <= 1} title={itemLabel(x.k)} />
                  <span>{itemLabel(x.k)}</span>
                  <small>No. {x.no}, {PHASE[x.phase]}{x.got.timesCollected > 1 ? `, found ${x.got.timesCollected} times` : ''}</small>
                </div>
              ) : (
                <div key={x.k} className="gone">
                  <Item name={x.k} gone title={`${itemLabel(x.k)}, not found yet`} />
                  <span>{itemLabel(x.k)}</span>
                  <small>No. {x.no}, {PHASE[x.phase]}</small>
                </div>
              )))}
            </div>
          ) : <div className="state"><b>Nothing matches</b>Clear the search or pick another filter.</div>}
        </section>
      )}
    </Async>
  );
}
