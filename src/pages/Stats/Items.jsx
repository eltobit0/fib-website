import React, { useEffect, useMemo, useRef, useState } from 'react';
import { loadItems } from './api.js';
import { useAsync } from './useAsync.js';
import { canObserve } from './env.js';
import { itemKey, ITEM_STATE } from './adapter.js';
import { Async, Item, Tog } from './ui.jsx';
import * as f from './format.js';

const PHASES = [
  { id: 'EARLY', label: 'Early' },
  { id: 'MID', label: 'Mid' },
  { id: 'LATE', label: 'Late' },
  { id: 'NONE', label: 'Unassigned' },
];
const phaseOf = (itemName) => ITEM_STATE[itemKey(itemName).toUpperCase()] ?? 'NONE';

/* The active sort is a card's headline; the other two ride along underneath as their `brief`. */
const found = (r) => r.seen > r.skips;
const SORTS = [
  {
    id: 'seen', label: 'Most common', pick: (r) => r.seen,
    figure: (r) => f.num(r.seen), unit: () => 'times seen', brief: (r) => `seen ${f.num(r.seen)} times`,
  },
  {
    id: 'slow', label: 'Biggest time sink', pick: (r) => r.avgSeconds,
    figure: (r) => (found(r) ? f.duration(r.avgSeconds) : 'Never'), unit: (r) => (found(r) ? 'on average' : 'found'),
    brief: (r) => (found(r) ? `${f.duration(r.avgSeconds)} on average` : 'never found'),
  },
  {
    id: 'skipped', label: 'Most jokered', pick: (r) => r.skipRate,
    figure: (r) => f.pct(r.skipRate, 0), unit: () => 'jokered', brief: (r) => `${f.pct(r.skipRate, 0)} jokered`,
  },
];

const PAGE = 60;
/* An average or a share over fewer appearances than this is one unlucky round, not a record. */
const RECORD_MIN_SEEN = 5;
const NO_RANGES = { seenMin: '', seenMax: '', skipMin: '', skipMax: '' };

/* seen is every appearance, found or skipped; skipRate is the share given up on, 0 to 100. */
function toItemRow(r) {
  const skips = r.totalSkips ?? 0;
  const seen = (r.totalFinds ?? 0) + skips;
  return {
    itemName: r.itemName,
    phase: phaseOf(r.itemName),
    seen,
    skips,
    avgSeconds: r.avgSeconds ?? 0,
    skipRate: seen > 0 ? (skips / seen) * 100 : 0,
  };
}

function itemRecords(items) {
  const sampled = items.filter((r) => r.seen >= RECORD_MIN_SEEN);
  const top = (list, key) => list.reduce((best, r) => (best == null || key(r) > key(best) ? r : best), null);
  const common = top(items, (r) => r.seen);
  const slow = top(sampled, (r) => r.avgSeconds);
  const skipped = top(sampled, (r) => r.skipRate);
  return [
    common && { sort: 'seen', title: 'Comes up most', item: common, figure: `${f.num(common.seen)} times` },
    slow && { sort: 'slow', title: 'Biggest time sink', item: slow, figure: `${f.duration(slow.avgSeconds)} on average` },
    skipped && skipped.skips > 0 && {
      sort: 'skipped', title: 'Most given up on', item: skipped, figure: `${f.pct(skipped.skipRate, 0)} jokered`,
    },
  ].filter(Boolean);
}

/* An empty box means no bound. */
const bound = (s) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

export function Items() {
  const [attempt, setAttempt] = useState(0);
  const state = useAsync(loadItems, [attempt]);
  const items = useMemo(() => {
    const list = state.data?.items ?? state.data;
    return Array.isArray(list) ? list.map(toItemRow) : [];
  }, [state.data]);

  const [sort, setSort] = useState('seen');
  const [query, setQuery] = useState('');
  const [phases, setPhases] = useState([]);
  const [ranges, setRanges] = useState(NO_RANGES);
  const active = SORTS.find((s) => s.id === sort);
  const narrowed = phases.length > 0 || Object.values(ranges).some((v) => v !== '');
  const clear = () => {
    setPhases([]);
    setRanges(NO_RANGES);
  };

  const searchRef = useRef(null);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* Counted over the whole index, so a phase's count does not change as its own box is ticked. */
  const phaseCounts = useMemo(() => {
    const counts = {};
    items.forEach((r) => { counts[r.phase] = (counts[r.phase] ?? 0) + 1; });
    return counts;
  }, [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [seenMin, seenMax, skipMin, skipMax] = [ranges.seenMin, ranges.seenMax, ranges.skipMin, ranges.skipMax].map(bound);
    return items
      .filter((r) => {
        if (q && !f.itemSearchText(r.itemName).toLowerCase().includes(q)) return false;
        if (phases.length > 0 && !phases.includes(r.phase)) return false;
        if (seenMin != null && r.seen < seenMin) return false;
        if (seenMax != null && r.seen > seenMax) return false;
        if (skipMin != null && r.skipRate < skipMin) return false;
        if (skipMax != null && r.skipRate > skipMax) return false;
        return true;
      })
      .sort((a, b) => active.pick(b) - active.pick(a));
  }, [items, active, query, phases, ranges]);

  const records = useMemo(() => itemRecords(items), [items]);
  const best = useMemo(() => Math.max(1, ...items.map(active.pick)), [items, active]);
  const totalSeen = items.reduce((sum, r) => sum + r.seen, 0);

  /* Only a window of the rows is mounted; a sentinel under the table grows it. Without an observer, all of them are. */
  const windowed = canObserve();
  const [visible, setVisible] = useState(PAGE);
  const sentinelRef = useRef(null);
  const filterKey = `${sort} ${query.trim().toLowerCase()} ${phases} ${JSON.stringify(ranges)}`;
  const [windowKey, setWindowKey] = useState(filterKey);
  if (windowKey !== filterKey) {
    setWindowKey(filterKey);
    setVisible(PAGE);
  }
  useEffect(() => {
    if (!windowed || visible >= rows.length || !sentinelRef.current) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => Math.min(rows.length, v + PAGE));
    }, { rootMargin: '800px' });
    io.observe(sentinelRef.current);
    return () => io.disconnect();
  }, [windowed, visible, rows.length]);
  const shown = windowed ? rows.slice(0, visible) : rows;

  const range = (label, minKey, maxKey, unit) => (
    <div role="group" aria-label={label} className="rng">
      <span>{label}</span>
      <input
        className="search num"
        type="number"
        min="0"
        placeholder="min"
        aria-label={`${label}, at least`}
        value={ranges[minKey]}
        onChange={(e) => setRanges((prev) => ({ ...prev, [minKey]: e.target.value }))}
      />
      <span>to</span>
      <input
        className="search num"
        type="number"
        min="0"
        placeholder="max"
        aria-label={`${label}, at most`}
        value={ranges[maxKey]}
        onChange={(e) => setRanges((prev) => ({ ...prev, [maxKey]: e.target.value }))}
      />
      {unit && <span>{unit}</span>}
    </div>
  );

  let status = `${f.full(items.length)} items have come up, ${f.full(totalSeen)} times in all.`;
  if (rows.length < items.length) status = `${f.full(rows.length)} of ${f.full(items.length)} items match.`;

  return (
    <section className="page">
      <h1>Items</h1>
      <p className="lede" aria-live="polite">{items.length ? status : 'Every item that comes up in a round is listed here once the round ends.'}</p>
      <Async state={state} what="the items" onRetry={() => setAttempt((n) => n + 1)}>
        {() => (items.length === 0 ? <div className="state"><b>No items yet</b>The first finished round fills this in.</div> : (
          <>
            <section className="sec">
              <div className="sh"><h2>Records</h2><span className="r">Pick one to sort the index by it</span></div>
              <div className="shelf">
                {records.map((rec) => (
                  <button key={rec.sort} type="button" aria-pressed={sort === rec.sort} onClick={() => setSort(rec.sort)}>
                    <Item name={rec.item.itemName} size="t84" />
                    <b>{f.itemLabel(rec.item.itemName)}</b>
                    <span className="figure">{rec.figure}</span>
                    <small>{rec.title}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="sec">
              <div className="ctrls" style={{ marginTop: 0 }}>
                <input
                  ref={searchRef}
                  className="search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find an item"
                  aria-label="Find an item"
                />
                <Tog label="Sort items" options={SORTS} value={sort} onChange={setSort} />
              </div>
              <div className="ctrls">
                <div className="tog" role="group" aria-label="Item pool">
                  {PHASES.map((p) => {
                    const on = phases.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPhases((prev) => (on ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                      >
                        {p.label} <span className="quiet">{f.num(phaseCounts[p.id] ?? 0)}</span>
                      </button>
                    );
                  })}
                </div>
                {range('Seen', 'seenMin', 'seenMax')}
                {range('Jokered', 'skipMin', 'skipMax', '%')}
                {narrowed && <button type="button" className="link" onClick={clear}>Clear filters</button>}
              </div>

              {rows.length === 0 ? (
                <div className="state">
                  <b>{query.trim() ? `No item matches “${query.trim()}”` : 'No item matches those filters'}</b>
                  {narrowed ? 'Every item falls outside the filters set above.' : 'Only items that have come up in a round are listed.'}
                </div>
              ) : (
                <ul className="grid">
                  {shown.map((r) => {
                    const share = active.pick(r) / best;
                    return (
                      <li key={r.itemName}>
                        <Item name={r.itemName} size="t84" />
                        <b>{f.itemLabel(r.itemName)}</b>
                        <span className="figure">{active.figure(r)}<small>{active.unit(r)}</small></span>
                        <div className="bar" role="img" aria-label={`${Math.round(share * 100)}% of the highest in the index`} style={{ '--w': share * 100 }}><i /></div>
                        <small>
                          {SORTS.filter((other) => other.id !== sort).map((other) => other.brief(r)).join(', ')}
                          {r.phase !== 'NONE' ? `, ${PHASES.find((p) => p.id === r.phase).label.toLowerCase()} pool` : ''}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              )}
              {shown.length < rows.length && <div ref={sentinelRef} style={{ height: 1 }} />}
            </section>
          </>
        ))}
      </Async>
    </section>
  );
}
