import React, { useMemo } from 'react';
import { raceEntries, idUuid, idLabel } from './adapter.js';
import { Faces, RoundItem } from './ui.jsx';
import { itemTip, roundClock } from './statsKit.js';

export function RoundLanes({ match, onOpenPlayer }) {
  const rows = useMemo(() => raceEntries(match), [match]);
  const clock = useMemo(() => roundClock(match), [match]);
  const many = rows.length > 2;
  return (
    <>
      {rows.map((row, i) => {
        const place = row.placement > 0 ? row.placement : i + 1;
        const found = row.events.filter((e) => !e.skipped).length;
        return (
          <div key={row.key} className={`lane p${place}`}>
            <header>
              {many && <span className="pos">{place}</span>}
              <Faces members={row.members} />
              <b>
                {row.members.map((m, j) => (
                  <React.Fragment key={idUuid(m) ?? j}>
                    {j > 0 && ' & '}
                    <button type="button" className="link-plain" onClick={() => onOpenPlayer?.(idUuid(m))}>{idLabel(m)}</button>
                  </React.Fragment>
                ))}
              </b>
              <span className="quiet">{found} found, {row.events.length - found} jokers</span>
              <span className={`n ${place === 1 ? 'win' : 'lose'}`}>{row.score}</span>
            </header>
            <div className="strip">
              {row.events.map((e, k) => <RoundItem key={k} event={e} tip={itemTip(e, clock)} />)}
            </div>
          </div>
        );
      })}
      <p className="legend">A ringed item came back to back, in its rarity’s colour. A faded item in a dashed outline was jokered.</p>
    </>
  );
}

/** The score of a duel; a bigger round shows its scores lane by lane instead. */
export function Score({ match }) {
  const rows = raceEntries(match);
  if (rows.length !== 2) return null;
  return (
    <div className="score" role="img" aria-label={`${rows[0].score} to ${rows[1].score}`}>
      <span className="win">{rows[0].score}</span><i>:</i><span className="lose">{rows[1].score}</span>
    </div>
  );
}
