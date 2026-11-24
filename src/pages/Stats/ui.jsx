import React, { useState } from 'react';
import { avatarAt, itemTexture, itemKey, itemLabel, idUuid, idLabel, AVATAR_FALLBACK } from './adapter.js';
import { ITEM_TEXTURE_FALLBACK } from './tokens.js';
import { RARITY } from './statsKit.js';

const SIZE = { t28: 22, t48: 40, t84: 60 };

export function Sprite({ name, size = 32 }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className="px"
      src={failed ? `${ITEM_TEXTURE_FALLBACK}/${itemKey(name)}.png` : itemTexture(name)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export function Face({ uuid, size = 32 }) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      className="px face"
      src={failed ? AVATAR_FALLBACK : avatarAt(uuid, size * 2)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* The skin from the front. A failed render leaves the space empty, never a broken image. */
export function Skin({ uuid, scale = 6 }) {
  const [failed, setFailed] = useState(false);
  if (failed || !uuid) return null;
  return (
    <img
      className="px"
      src={`https://api.mineatar.io/body/front/${uuid}?scale=${scale}`}
      width={16 * scale}
      height={32 * scale}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** A player as face and name; opens their profile. */
export function Who({ player, onOpen, size = 28 }) {
  const uuid = idUuid(player);
  return (
    <button type="button" className="who" onClick={(e) => { e.stopPropagation(); onOpen?.(uuid); }}>
      <Face uuid={uuid} size={size} />
      <span className="nm">{idLabel(player)}</span>
    </button>
  );
}

export const Faces = ({ members, size = 24 }) => (
  <span className="faces">{members.map((m) => <Face key={idUuid(m) ?? idLabel(m)} uuid={idUuid(m)} size={size} />)}</span>
);

/** An item on its tile. `tier` rings it in a back to back's rarity; a jokered item sits faded in a dashed outline. */
export function Item({ name, size = 't48', tier, joker, unique, gone, state = '', title }) {
  const r = tier ? RARITY[tier] : null;
  const cls = ['it', size, r && 'r', joker && 'j', unique && 'u', gone && 'gone', state].filter(Boolean).join(' ');
  return (
    <span className={cls} style={r ? { '--r': r.color } : undefined} title={title ?? itemLabel(name)}>
      <Sprite name={name} size={SIZE[size]} />
    </span>
  );
}

/** One find of a round: ringed when it came back to back, dashed when it was jokered. */
export const RoundItem = ({ event, tip, size = 't28', state }) => (
  <Item name={event.itemName} size={size} tier={!event.skipped ? event.b2b : null} joker={event.skipped} state={state} title={tip} />
);

export const Tier = ({ tier }) => <span className="tier" style={{ '--r': RARITY[tier]?.color }}>{RARITY[tier]?.label}</span>;

/** Pick one of N: text tabs, the chosen one underlined. */
export function Tog({ label, options, value, onChange }) {
  return (
    <div className="tog" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export const Pips = ({ slots, label }) => (
  <span className="pips" role="img" aria-label={label}>{slots.map((s, i) => <i key={i} className={s ?? 'o'} />)}</span>
);

/** Loading, failure and success for one section, so a slow or broken call never blanks its neighbours. */
export function Async({ state, what = 'this', onRetry, children }) {
  if (state.error) {
    const missing = state.error.status === 404 || state.error.status === 400;
    return (
      <div className="state" role="alert">
        <b>{missing ? 'Nothing here' : `Couldn’t load ${what}`}</b>
        {missing ? 'That page has not been recorded.' : 'The stats service did not answer. Results are saved the moment a round ends, so they will be here when it does.'}
        {onRetry && !missing && <div><button type="button" className="btn" onClick={onRetry}>Try again</button></div>}
      </div>
    );
  }
  if (state.loading && state.data == null) return <div className="state" aria-busy="true">Loading {what}…</div>;
  return children(state.data);
}
