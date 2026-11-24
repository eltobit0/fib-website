/* Every ink and accent clears WCAG AA (4.5:1) as text on all four surface steps; the floor is `ink-3` at 5.00:1
   on `plinth-2`. Re-check before lowering an ink or raising a surface lightness. */

export const tokens = {
  color: {
    sunk: 'oklch(0.148 0.005 250)',
    void: 'oklch(0.178 0.005 250)',
    plinth: 'oklch(0.228 0.006 250)',
    plinth2: 'oklch(0.272 0.007 250)',
    line: 'oklch(0.320 0.008 250)',
    lineSoft: 'oklch(0.262 0.007 250)',

    ink: 'oklch(0.970 0.002 250)',
    ink2: 'oklch(0.780 0.012 260)',
    ink3: 'oklch(0.670 0.013 255)',

    /* Accents. One meaning each, no exceptions. */
    gold: 'oklch(0.800 0.140 85)',       // rank, victory, prestige. Podium only.
    diamond: 'oklch(0.830 0.100 200)',   // rarity, exceptional, the top of a ramp
    emerald: 'oklch(0.780 0.130 155)',   // wins, positive delta
    netherite: 'oklch(0.672 0.016 285)', // technical metadata: seeds, IDs, timestamps

    /* Dark ink for use ON gold/diamond/emerald fills. */
    onAccent: 'oklch(0.140 0.010 250)',
    diamondHi: 'oklch(0.870 0.100 200)',

    /* Blue means only "interactive"; `blueInk` is its text step, since the fill does not clear 4.5:1 as text. */
    blue: 'oklch(0.585 0.20 258)',
    blueHi: 'oklch(0.655 0.185 258)',
    blueInk: 'oklch(0.720 0.150 250)',
    blueTint: 'oklch(0.585 0.20 258 / 0.15)',
    focus: 'oklch(0.585 0.20 258)',

    /* Glass is allowed only for floating controls over sprite art, never as a decorative panel. */
    glassBg: 'oklch(0.210 0.006 250 / 0.55)',
    glassBorder: 'oklch(1 0 0 / 0.12)',
    glossTop: 'oklch(1 0 0 / 0.06)',

    negative: 'oklch(0.720 0.110 25)',

    /* The same EARLY/MID/LATE ramp as the ItemPools pages, assigned from ITEM_STATE. */
    phaseEarly: 'oklch(0.720 0.170 148)',
    phaseMid: 'oklch(0.830 0.150 95)',
    phaseLate: 'oklch(0.640 0.200 27)',
    /* LATE's fill only clears ~4.05:1 as text on plinth-2; this lighter step passes (4.67:1). */
    phaseLateInk: 'oklch(0.675 0.190 27)',

    /* `medalGold` equals `gold` by construction: first place and the rank accent are the same idea. */
    medalGold: 'oklch(0.800 0.140 85)',
    medalSilver: 'oklch(0.780 0.008 250)',
    medalBronze: 'oklch(0.660 0.075 55)',

    shadowSoft: 'oklch(0 0 0 / 0.40)',
    shadowMid: 'oklch(0 0 0 / 0.50)',
    shadowDeep: 'oklch(0 0 0 / 0.60)',

    edge: 'oklch(1 0 0 / 0.055)',
    edgeStrong: 'oklch(1 0 0 / 0.11)',

    /* Still >=3:1 on `void`: a chart line has a non-text contrast floor. */
    traceDim: 'oklch(0.520 0.012 250)',
  },

  /* Hues are the plugin's Rarity.java colours (gradient tiers take their first stop). Lightness climbs monotonically
     so rarity survives greyscale, and every tier clears 5.0:1 as text on all four surfaces. */
  rarity: {
    RARE: 'oklch(0.690 0.150 275)',
    EPIC: 'oklch(0.740 0.220 328)',
    LEGENDARY: 'oklch(0.802 0.168 73)',
    RNGESUS: 'oklch(0.845 0.112 339)',
    EXTRAORDINARY: 'oklch(0.886 0.250 137)',
  },

  /* Lanes sit at L 0.70-0.82 to read equally on the dark track; dash patterns pair with them so colour is never the only cue. */
  race: [
    'oklch(0.80 0.10 200)', // diamond
    'oklch(0.80 0.14 85)',  // gold
    'oklch(0.78 0.13 155)', // emerald
    'oklch(0.74 0.14 300)', // violet
    'oklch(0.76 0.15 30)',  // ember
    'oklch(0.78 0.09 250)', // steel
    'oklch(0.82 0.11 130)', // lime
    'oklch(0.74 0.12 340)', // rose
  ],

  font: {
    sans: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    /* Loaded, not merely stacked: the fallbacks' metrics differ enough to change layout. */
    mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    /* Single weight: never set font-weight, bolding smears the pixel grid. */
    display: '"Jersey 10", "JetBrains Mono", ui-monospace, monospace',
  },

  size: {
    '2xs': '0.6875rem',  // 11px — micro labels, table units
    xs: '0.75rem',       // 12px — labels, metadata
    sm: '0.8125rem',     // 13px — dense table body
    md: '0.875rem',      // 14px — secondary body
    base: '0.9375rem',   // 15px — body
    lg: '1.125rem',      // 18px — card titles
    xl: '1.375rem',      // 22px — section headings
    '2xl': '1.75rem',    // 28px — small figures
    '3xl': '2.25rem',    // 36px — figures
    '4xl': '3rem',       // 48px — large figures
    '5xl': '4.25rem',    // 68px — the hero figure. The ceiling.
  },

  /* Low x-height, so each step sits well above the grotesk size it replaced. */
  display: {
    sm: '1.625rem',     // 26px — card and podium names
    md: '2.25rem',      // 36px — section headings
    mark: '2.75rem',    // 44px — the rail's "FIB" wordmark, and nothing else
    lg: '3.25rem',      // 52px — page titles
    xl: '4.5rem',       // 72px — the overview's headline
  },

  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '32px', 7: '48px', 8: '72px' },
  radius: { sm: '3px', md: '6px', lg: '10px', xl: '16px', pill: '999px' },

  z: { base: 0, sticky: 10, rail: 20, dropdown: 30, backdrop: 40, modal: 50, toast: 60, tooltip: 70 },

  motion: {
    fast: '120ms',
    base: '180ms',
    slow: '260ms',
    count: 640,                                // ms, JS-driven count-ups
    ease: 'cubic-bezier(0.22, 1, 0.36, 1)',    // ease-out-quint
  },
};

/* `data.js` folds member rarities in this order and casing; treat both as a contract. */
export const RARITY_KEYS = ['RARE', 'EPIC', 'LEGENDARY', 'RNGESUS', 'EXTRAORDINARY'];

export const RARITY_FIELDS = {
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
  RNGESUS: 'rngesus',
  EXTRAORDINARY: 'extraordinary',
};

export const RARITY_ORDER = RARITY_KEYS;

export const rarityColor = (tier) => `var(--fib-rarity-${String(tier).toLowerCase()})`;

export const RARITY_LABEL = {
  RARE: 'Rare',
  EPIC: 'Epic',
  LEGENDARY: 'Legendary',
  RNGESUS: 'RNGesus',
  EXTRAORDINARY: 'Extraordinary',
};

/* Vendored into public/fib-items/ by scripts/vendor-textures.mjs, not hot-linked: raw.githubusercontent throttles.
   Re-run it after adding items to the pool. */
export const ITEM_TEXTURE_BASE = '/fib-items';

export const ITEM_TEXTURE_FALLBACK =
  'https://raw.githubusercontent.com/eltobit0/fib-resources/main/ForceItemBattle/assets/minecraft/textures/fib';

/* Whole multiples of the 16px original only: a fractional nearest-neighbour downscale chews the pixel art. */
export const SPRITE_SIZES = [16, 32, 48, 64, 128];

export const spriteSize = (px) =>
  SPRITE_SIZES.reduce((best, s) => (Math.abs(s - px) < Math.abs(best - px) ? s : best), 128);

/** Emitted once into :root by styles.js. */
export function cssVariables() {
  const lines = [
    ...Object.entries(tokens.color).map(([k, v]) => `  --fib-${kebab(k)}: ${v};`),
    ...Object.entries(tokens.rarity).map(([k, v]) => `  --fib-rarity-${k.toLowerCase()}: ${v};`),
    ...tokens.race.map((v, i) => `  --fib-race-${i}: ${v};`),
    `  --fib-font-sans: ${tokens.font.sans};`,
    `  --fib-font-mono: ${tokens.font.mono};`,
    `  --fib-font-display: ${tokens.font.display};`,
    ...Object.entries(tokens.size).map(([k, v]) => `  --fib-text-${k}: ${v};`),
    ...Object.entries(tokens.display).map(([k, v]) => `  --fib-display-${k}: ${v};`),
    ...Object.entries(tokens.space).map(([k, v]) => `  --fib-space-${k}: ${v};`),
    ...Object.entries(tokens.radius).map(([k, v]) => `  --fib-radius-${k}: ${v};`),
    ...Object.entries(tokens.z).map(([k, v]) => `  --fib-z-${k}: ${v};`),
    `  --fib-motion-fast: ${tokens.motion.fast};`,
    `  --fib-motion-base: ${tokens.motion.base};`,
    `  --fib-motion-slow: ${tokens.motion.slow};`,
    `  --fib-ease: ${tokens.motion.ease};`,
  ];
  return lines.join('\n');
}

/* `ink2` must emit `--fib-ink-2`: breaking only on capitals produced names no stylesheet referenced. */
function kebab(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}
