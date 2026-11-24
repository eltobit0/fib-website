/* Hand-built SVG at measured pixel width: scaling a fixed viewBox scales the type with it. */

import React, { useEffect, useId, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { tokens, RARITY_LABEL } from './tokens.js';
import { itemTexture, itemLabel } from './adapter.js';
import { prefersReducedMotion } from './env.js';
import { usePendingReveal } from './useSeen.js';
import * as f from './format.js';

function useWidth(ref, fallback = 720) {
  const [w, setW] = useState(fallback);

  useLayoutEffect(() => {
    if (!ref.current) return undefined;
    const measure = () => setW(ref.current?.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref, fallback]);

  return w;
}

/* Animates the dash offset over the path's measured length; skipped under reduced motion. */
function useDraw(ref, deps = []) {
  useEffect(() => {
    const path = ref.current;
    if (!path || prefersReducedMotion() || typeof path.getTotalLength !== 'function') return;
    const len = path.getTotalLength();
    if (!len) return;
    path.style.transition = 'none';
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    // Force a style flush so the transition below actually has a start value.
    void path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset 900ms ${tokens.motion.ease}`;
    path.style.strokeDashoffset = '0';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const linePath = (pts) =>
  pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

export function ScoreTrend({ points, height = 190, label = 'Score per match' }) {
  const wrapRef = useRef(null);
  const pathRef = useRef(null);
  const width = useWidth(wrapRef);

  /* The average's label sits in the right gutter: inside the plot it collides with the newest point. */
  const pad = { top: 16, right: 52, bottom: 24, left: 40 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  const geometry = useMemo(() => {
    if (!points?.length) return null;
    const values = points.map((p) => p.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    // A flat series would otherwise divide by zero and collapse to the axis.
    const span = max - min || Math.max(1, max || 1);
    const lo = Math.max(0, min - span * 0.15);
    const hi = max + span * 0.15;

    const x = (i) => pad.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;

    return {
      pts: points.map((p, i) => ({ ...p, x: x(i), y: y(p.value) })),
      meanY: y(mean),
      mean, lo, hi,
    };
  }, [points, innerW, innerH, pad.left, pad.top]);

  useDraw(pathRef, [geometry?.pts?.length, width]);

  if (!geometry) return null;
  const { pts, meanY, mean, lo, hi } = geometry;

  const areaD = `${linePath(pts)} L${pts[pts.length - 1].x.toFixed(1)} ${pad.top + innerH} L${pts[0].x.toFixed(1)} ${pad.top + innerH} Z`;

  return (
    <div ref={wrapRef}>
      <svg
        className="fib-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}. ${pts.length} matches, from ${f.num(pts[0].value)} to ${f.num(pts[pts.length - 1].value)}, average ${f.num(Math.round(mean))}.`}
      >
        <defs>
          <linearGradient id="fib-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--fib-diamond)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--fib-diamond)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[lo, (lo + hi) / 2, hi].map((v, i) => {
          const y = pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;
          return (
            <g key={i}>
              <line className="grid" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end">{f.num(Math.round(v))}</text>
            </g>
          );
        })}

        <path className="area" d={areaD} fill="url(#fib-trend-fill)" />

        <line
          className="trace trace--dim"
          x1={pad.left} x2={width - pad.right} y1={meanY} y2={meanY}
          strokeDasharray="3 4"
        />
        <text x={width - pad.right + 8} y={meanY + 3} textAnchor="start">
          avg {f.num(Math.round(mean))}
        </text>

        <path
          ref={pathRef}
          className="trace"
          d={linePath(pts)}
          stroke="var(--fib-diamond)"
        />

        {pts.map((p, i) => (
          <circle
            key={i}
            className="dot"
            cx={p.x} cy={p.y} r={p.won ? 4 : 2.5}
            fill={p.won ? 'var(--fib-gold)' : 'var(--fib-diamond)'}
          >
            <title>{`${p.label ?? `Match ${i + 1}`}: ${f.num(p.value)}${p.won ? ' — won' : ''}`}</title>
          </circle>
        ))}
      </svg>

      {/* Only the swatch takes the series colour: `trace-dim` fails text contrast. */}
      <ul className="fib-chart-legend">
        <li><i style={{ background: 'var(--fib-gold)' }} />Match won</li>
        <li><i style={{ background: 'var(--fib-diamond)' }} />Score</li>
        <li><i style={{ background: 'var(--fib-trace-dim)' }} />Career average</li>
      </ul>
    </div>
  );
}

export function Sparkline({ values, width = 88, height = 24, tone = 'var(--fib-ink-3)' }) {
  if (!values?.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    x: (i / Math.max(1, values.length - 1)) * (width - 2) + 1,
    y: height - 2 - ((v - min) / span) * (height - 4),
  }));

  return (
    <svg className="fib-chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="trace" d={linePath(pts)} stroke={tone} strokeWidth="1.5" />
    </svg>
  );
}

/* Dash patterns per lane so colour is never the only difference; the overview's miniature stays solid on purpose. */
const DASHES = ['', '6 3', '2 3', '10 3 2 3', '4 2', '8 4', '1 3', '12 3'];

/* Axis steps from a fixed vocabulary of human intervals; the first that keeps the axis under `most` labels wins. */
const TIME_STEPS = [30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
const COUNT_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];

const niceStep = (span, steps, most) =>
  steps.find((s) => span / s <= most) ?? steps[steps.length - 1];

/*
 * The pool phases' colours: the fill for bands and lines, and the text-safe
 * step for labels (only LATE needs a lighter one, see tokens.js).
 */
const PHASE_TONE = {
  EARLY: 'var(--fib-phase-early)',
  MID: 'var(--fib-phase-mid)',
  LATE: 'var(--fib-phase-late)',
};
const PHASE_INK = {
  EARLY: 'var(--fib-phase-early)',
  MID: 'var(--fib-phase-mid)',
  LATE: 'var(--fib-phase-late-ink)',
};

/* Running item counts with the gap filled in the leader's colour; the y axis fits the window, not the match.
   With three or more competitors the ribbon runs between the leader and the runner-up. */
const MAIN_TOP = 28;
const MAIN_BOTTOM = 26;
const PACE_H = 104;
const LEFT = 44;
const RIGHT = 56;
const BUCKETS = [60, 120, 180, 300, 600, 900];

const countAt = (entry, t) => {
  let n = 0;
  for (const e of entry.events) { if (e.t <= t) n += 1; else break; }
  return n;
};

export function RibbonRace({
  entries, duration, from = 0, to = duration, onWindow, cursor, onScrub, phases = [], changeTimes = [], labelFor, height: MAIN_H = 380,
}) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const innerW = Math.max(10, width - LEFT - RIGHT);
  const span = Math.max(1, to - from);
  const x = (t) => LEFT + ((Math.min(Math.max(t, from), to) - from) / span) * innerW;
  const xn = (t) => LEFT + (Math.min(Math.max(t, 0), duration) / Math.max(1, duration)) * innerW;
  const tOfN = (px) => Math.max(0, Math.min(duration, ((px - LEFT) / innerW) * duration));

  const times = useMemo(() => {
    const set = new Set([from, to]);
    for (const e of entries) for (const ev of e.events) if (ev.t > from && ev.t < to) set.add(ev.t);
    return [...set].sort((a, b) => a - b);
  }, [entries, from, to]);

  /* The y range fits the window, never under four items tall. */
  const lo0 = Math.min(...entries.map((e) => countAt(e, from)));
  const hi0 = Math.max(...entries.map((e) => countAt(e, to)));
  const range = Math.max(4, hi0 - lo0);
  const lo = Math.max(0, Math.floor(lo0 - range * 0.04));
  const hi = Math.ceil(hi0 + range * 0.06);
  const plotH = MAIN_H - MAIN_TOP - MAIN_BOTTOM;
  const y = (v) => MAIN_TOP + plotH - ((v - lo) / Math.max(1, hi - lo)) * plotH;
  const yStep = niceStep(hi - lo, COUNT_STEPS, 6);
  const yTicks = [];
  for (let v = Math.ceil(lo / yStep) * yStep; v <= hi; v += yStep) yTicks.push(v);

  const stepPath = (entry) => {
    let prev = countAt(entry, from);
    let d = `M${x(from).toFixed(1)} ${y(prev).toFixed(1)}`;
    for (const ev of entry.events) {
      if (ev.t <= from) continue;
      if (ev.t > to) break;
      d += ` L${x(ev.t).toFixed(1)} ${y(prev).toFixed(1)}`;
      prev += 1;
      d += ` L${x(ev.t).toFixed(1)} ${y(prev).toFixed(1)}`;
    }
    return `${d} L${x(to).toFixed(1)} ${y(prev).toFixed(1)}`;
  };

  /* Level intervals draw nothing: a tie has no colour. */
  const ribbon = useMemo(() => {
    const out = [];
    for (let i = 0; i < times.length - 1; i += 1) {
      const t = times[i];
      const ranked = entries
        .map((e, lane) => ({ lane, n: countAt(e, t) }))
        .sort((a, b) => b.n - a.n);
      if (ranked.length < 2 || ranked[0].n === ranked[1].n) continue;
      out.push({ t0: t, t1: times[i + 1], lane: ranked[0].lane, top: ranked[0].n, bottom: ranked[1].n });
    }
    return out;
  }, [entries, times]);

  const ribbonRuns = useMemo(() => {
    const runs = [];
    for (const r of ribbon) {
      const last = runs[runs.length - 1];
      if (last && last[last.length - 1].lane === r.lane && last[last.length - 1].t1 === r.t0) last.push(r);
      else runs.push([r]);
    }
    return runs;
  }, [ribbon]);

  const xStep = niceStep(span, TIME_STEPS, Math.max(2, Math.min(7, Math.floor(innerW / 90))));
  const ticks = [];
  for (let t = Math.ceil(from / xStep) * xStep; t <= to; t += xStep) ticks.push(t);

  const ends = entries
    .map((e, lane) => ({ lane, n: countAt(e, to), yy: y(countAt(e, to)) }))
    .sort((a, b) => a.yy - b.yy);
  for (let i = 1; i < ends.length; i += 1) {
    if (ends[i].yy - ends[i - 1].yy < 15) ends[i].yy = ends[i - 1].yy + 15;
  }

  const bucket = BUCKETS.find((s) => duration / s <= 16) ?? BUCKETS[BUCKETS.length - 1];
  const nBuckets = Math.max(1, Math.ceil(duration / bucket));
  const pace = entries.map((e) => {
    const counts = Array(nBuckets).fill(0);
    for (const ev of e.events) counts[Math.min(nBuckets - 1, Math.floor(ev.t / bucket))] += 1;
    return counts;
  });
  const paceMax = Math.max(1, ...pace.flat());
  const paceTop = 22;
  const paceBase = PACE_H - 22;
  const bw = innerW / nBuckets;
  const barW = Math.max(2, (bw * 0.78) / entries.length);

  /* A drag shorter than a minute is a click and does nothing, so a stray click keeps the view. */
  const [drag, setDrag] = useState(null);
  const onDown = (e) => {
    if (!onWindow) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = tOfN(e.clientX - rect.left);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ a: t, b: t });
  };
  const onMove = (e) => {
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag((d) => ({ ...d, b: tOfN(e.clientX - rect.left) }));
  };
  const onUp = () => {
    if (!drag) return;
    const a = Math.min(drag.a, drag.b);
    const b = Math.max(drag.a, drag.b);
    setDrag(null);
    if (b - a >= 60) onWindow(Math.floor(a), Math.ceil(b));
  };
  const selA = drag ? Math.min(drag.a, drag.b) : from;
  const selB = drag ? Math.max(drag.a, drag.b) : to;
  const zoomed = from > 0 || to < duration;

  const handleMove = onScrub
    ? (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const t = from + ((e.clientX - rect.left - LEFT) / innerW) * span;
        onScrub(Math.round(Math.max(from, Math.min(to, t))));
      }
    : undefined;

  /* Every pool label takes the same form: the longest one that fits wherever a label fits at all. */
  const phaseLabels = (() => {
    const fitted = phases.map((p, i) => {
      if (p.to <= from || p.from >= to) return null;
      const room = (i + 1 < phases.length ? x(phases[i + 1].from) : LEFT + innerW) - x(p.from) - 10;
      const short = p.id.charAt(0) + p.id.slice(1).toLowerCase();
      const opens = p.from > from;
      const forms = [
        opens ? `${p.label} · ${f.clock(p.from)}` : p.from > 0 ? `${short} pool` : p.label,
        opens ? `${short} · ${f.clock(p.from)}` : short,
        short,
      ];
      const fits = forms.map((s) => s.length * 6.6 <= room);
      return fits[2] ? { forms, fits } : null;
    });
    const level = [0, 1, 2].find((l) => fitted.every((p) => !p || p.fits[l])) ?? 2;
    return fitted.map((p) => (p ? p.forms[level] : null));
  })();

  const two = entries.length === 2;

  return (
    <div ref={wrapRef} className="fib-ribbon">
      <svg
        className="fib-chart"
        width={width}
        height={MAIN_H}
        viewBox={`0 0 ${width} ${MAIN_H}`}
        role="img"
        aria-label={`Items found over time for ${entries.length} competitors, ${f.clock(from)} to ${f.clock(to)}, the gap shaded in the leader's colour.`}
        data-scrubbable={onScrub ? 'true' : undefined}
        onPointerMove={handleMove}
        onPointerLeave={onScrub ? () => onScrub(null) : undefined}
      >
        {phases.map((p, i) => {
          if (p.to <= from || p.from >= to) return null;
          const x0 = x(p.from);
          const x1 = x(p.to);
          const text = phaseLabels[i];
          return (
            <g key={p.id}>
              <rect x={x0} y={MAIN_TOP} width={Math.max(0, x1 - x0)} height={plotH} fill={PHASE_TONE[p.id]} opacity="0.04" />
              {p.from > from ? (
                <line x1={x0} x2={x0} y1={MAIN_TOP - 12} y2={MAIN_TOP + plotH} stroke={PHASE_TONE[p.id]} strokeOpacity="0.45" strokeDasharray="3 3" />
              ) : null}
              {text ? <text x={x0 + (p.from > from ? 6 : 2)} y={MAIN_TOP - 10} fill={PHASE_INK[p.id]} className="fib-race-phase-label">{text}</text> : null}
            </g>
          );
        })}

        {yTicks.map((v) => (
          <g key={v}>
            <line className="grid" x1={LEFT} x2={LEFT + innerW} y1={y(v)} y2={y(v)} />
            <text x={LEFT - 8} y={y(v) + 3} textAnchor="end">{v}</text>
          </g>
        ))}

        {/* One shape per run of the same leader: per-interval rects left anti-aliased seams. */}
        {ribbonRuns.map((run, i) => {
          const topEdge = run.map((r) => `L${x(r.t0).toFixed(1)} ${y(r.top).toFixed(1)} L${x(r.t1).toFixed(1)} ${y(r.top).toFixed(1)}`).join(' ');
          const bottomEdge = [...run].reverse().map((r) => `L${x(r.t1).toFixed(1)} ${y(r.bottom).toFixed(1)} L${x(r.t0).toFixed(1)} ${y(r.bottom).toFixed(1)}`).join(' ');
          return (
            <path
              key={i}
              d={`M${x(run[0].t0).toFixed(1)} ${y(run[0].bottom).toFixed(1)} ${topEdge} ${bottomEdge} Z`}
              fill={`var(--fib-race-${run[0].lane % 8})`} fillOpacity="0.2"
            />
          );
        })}

        {entries.map((entry, i) => (
          <path
            key={entry.key}
            className="trace"
            d={stepPath(entry)}
            stroke={`var(--fib-race-${i % 8})`}
            strokeWidth="2.25"
            strokeDasharray={DASHES[i % DASHES.length] || undefined}
          />
        ))}

        {changeTimes.filter((t) => t >= from && t <= to).map((t) => {
          const leader = entries.reduce((a, b) => (countAt(b, t) > countAt(a, t) ? b : a));
          return (
            <circle key={t} cx={x(t)} cy={y(countAt(leader, t))} r="4.5" className="fib-ribbon-turn">
              <title>{`${labelFor(leader)} took the lead at ${f.clock(t)}`}</title>
            </circle>
          );
        })}

        {ends.map((e) => (
          <text key={e.lane} x={LEFT + innerW + 8} y={e.yy + 4} className="fib-ribbon-end" fill={`var(--fib-race-${e.lane % 8})`}>
            {e.n}
          </text>
        ))}

        {ticks.map((t) => {
          const px = x(t);
          const anchor = px < LEFT + 20 ? 'start' : px > LEFT + innerW - 24 ? 'end' : 'middle';
          return <text key={t} x={px} y={MAIN_H - 8} textAnchor={anchor}>{f.clock(t)}</text>;
        })}

        {cursor != null && cursor >= from && cursor <= to ? (
          <g>
            <line className="axis" x1={x(cursor)} x2={x(cursor)} y1={MAIN_TOP} y2={MAIN_TOP + plotH} stroke="var(--fib-ink-2)" strokeWidth="1" strokeDasharray="2 3" />
            {entries.map((e, i) => (
              <circle key={e.key} cx={x(cursor)} cy={y(countAt(e, cursor))} r="3.5" fill={`var(--fib-race-${i % 8})`} />
            ))}
          </g>
        ) : null}
      </svg>

      <ul className="fib-ribbon-key">
        {entries.map((e, i) => (
          <li key={e.key}>
            <i style={{ background: `var(--fib-race-${i % 8})` }} aria-hidden="true" />
            {labelFor(e)}
          </li>
        ))}
        {two ? <li className="fib-meta">the shaded gap is the leader's colour</li> : <li className="fib-meta">shaded: leader over runner-up</li>}
      </ul>

      <svg
        className="fib-chart fib-pace"
        width={width}
        height={PACE_H}
        viewBox={`0 0 ${width} ${PACE_H}`}
        role="img"
        aria-label={`Items found per ${bucket / 60} minutes by each competitor.${onWindow ? ' Drag across it to zoom the chart above.' : ''}`}
        data-brush={onWindow ? 'true' : undefined}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <text x={LEFT} y={12} className="fib-pace-title">Items per {bucket / 60} min</text>
        {zoomed || drag ? (
          <>
            <rect x={LEFT} y={paceTop - 4} width={Math.max(0, xn(selA) - LEFT)} height={paceBase - paceTop + 8} className="fib-pace-dim" />
            <rect x={xn(selB)} y={paceTop - 4} width={Math.max(0, LEFT + innerW - xn(selB))} height={paceBase - paceTop + 8} className="fib-pace-dim" />
            <rect x={xn(selA)} y={paceTop - 4} width={Math.max(1, xn(selB) - xn(selA))} height={paceBase - paceTop + 8} className="fib-pace-sel" />
          </>
        ) : null}
        {pace.map((counts, lane) => counts.map((n, b) => {
          const h = (n / paceMax) * (paceBase - paceTop);
          const bx = LEFT + b * bw + bw * 0.11 + lane * barW;
          return (
            <rect key={`${lane}-${b}`} x={bx} y={paceBase - h} width={Math.max(1, barW - 1)} height={h} rx="1.5" fill={`var(--fib-race-${lane % 8})`} fillOpacity="0.85">
              <title>{`${labelFor(entries[lane])}: ${n} ${n === 1 ? 'item' : 'items'}, ${f.clock(b * bucket)}–${f.clock(Math.min(duration, (b + 1) * bucket))}`}</title>
            </rect>
          );
        }))}
        <line className="grid" x1={LEFT} x2={LEFT + innerW} y1={paceBase} y2={paceBase} />
        {cursor != null ? (
          <line x1={xn(cursor)} x2={xn(cursor)} y1={paceTop - 4} y2={paceBase} stroke="var(--fib-ink-2)" strokeDasharray="2 3" />
        ) : null}
        {[0, duration / 2, duration].map((t) => (
          <text key={t} x={xn(t)} y={PACE_H - 6} textAnchor={t === 0 ? 'start' : t === duration ? 'end' : 'middle'}>{f.clock(t)}</text>
        ))}
      </svg>
    </div>
  );
}

/* One wipe across all lanes, not a per-lane dash draw: a dash draw advances by path length, so lanes would
   desynchronise from match time. The baseline is outside the clip on purpose. */
/* `finish` is the winner's last find; it sits inside the wipe so it is revealed last. */
const FINISH_PX = 32;

export function RaceMini({ entries, duration, height = 132, markers = [], label = 'Score over time', finish }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const width = useWidth(wrapRef);
  usePendingReveal(svgRef, 'wipe');

  /* Colons are legal in an id but not in a url(#…) reference without escaping,
     and React's generated ids contain them. */
  const clipId = `fib-wipe-${useId().replace(/:/g, '')}`;

  const pad = { top: 10, right: finish ? FINISH_PX + 18 : 12, bottom: 12, left: 6 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = Math.max(10, height - pad.top - pad.bottom);

  const maxScore = Math.max(1, ...entries.map((e) => e.events.length));
  const x = (t) => pad.left + (Math.min(t, duration) / Math.max(1, duration)) * innerW;
  const y = (s) => pad.top + innerH - (s / maxScore) * innerH;

  const stepPath = (entry) => {
    let d = `M${pad.left.toFixed(1)} ${y(0).toFixed(1)}`;
    entry.events.forEach((ev, i) => {
      d += ` L${x(ev.t).toFixed(1)} ${y(i).toFixed(1)} L${x(ev.t).toFixed(1)} ${y(i + 1).toFixed(1)}`;
    });
    const last = entry.events.length;
    d += ` L${x(duration).toFixed(1)} ${y(last).toFixed(1)}`;
    return d;
  };

  return (
    <div ref={wrapRef}>
      <svg
        ref={svgRef}
        className="fib-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label} for ${entries.length} competitors across ${f.duration(duration)}.`}
      >
        <defs>
          <clipPath id={clipId}>
            {/* Collapses to its own left edge, which sits on t=0. */}
            <rect
              className="fib-wipe-rect"
              x={pad.left}
              y={0}
              width={Math.max(1, width - pad.left)}
              height={height}
            />
          </clipPath>
        </defs>

        <line className="grid" x1={pad.left} x2={width - pad.right} y1={pad.top + innerH} y2={pad.top + innerH} />

        <g clipPath={`url(#${clipId})`}>
          {markers.map((t) => (
            <line key={t} className="tick" x1={x(t)} x2={x(t)} y1={pad.top + innerH - 4} y2={pad.top + innerH + 4} />
          ))}

          {entries.map((entry, i) => (
            <path
              key={entry.key}
              className="trace"
              d={stepPath(entry)}
              stroke={`var(--fib-race-${i % 8})`}
              strokeWidth="1.6"
              opacity="0.9"
            />
          ))}

          {entries.map((entry, i) => (
            <circle
              key={`${entry.key}-end`}
              className="enddot"
              cx={x(duration)}
              cy={y(entry.events.length)}
              r="2.6"
              fill={`var(--fib-race-${i % 8})`}
            />
          ))}

          {finish && entries[0] ? (
            <image
              className="fib-race-finish"
              href={itemTexture(finish)}
              x={x(duration) + 8}
              y={Math.max(0, Math.min(height - FINISH_PX, y(entries[0].events.length) - FINISH_PX / 2))}
              width={FINISH_PX}
              height={FINISH_PX}
            >
              <title>{`Last find: ${itemLabel(finish)}`}</title>
            </image>
          ) : null}
        </g>
      </svg>
    </div>
  );
}

export function RankedBars({ rows, tone = 'var(--fib-ink-3)', format = f.num, max: maxProp }) {
  const max = maxProp ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div
          key={r.key}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 'var(--fib-space-3)', alignItems: 'center' }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 'var(--fib-text-sm)', marginBottom: 5,
            }}>
              {r.icon}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
            </div>
            <div className="fib-ramp-track" style={{ height: 6, color: r.tone ?? tone }}>
              <i style={{ '--fill': r.value / max }} />
            </div>
          </div>
          <em style={{
            fontFamily: 'var(--fib-font-mono)', fontStyle: 'normal',
            fontSize: 'var(--fib-text-sm)', fontVariantNumeric: 'tabular-nums',
            color: 'var(--fib-ink-2)',
          }}>
            {format(r.value)}
          </em>
        </div>
      ))}
    </div>
  );
}
