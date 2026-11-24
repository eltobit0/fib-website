// Spacing scale for the wheel's page shell (HUD rows, gaps between reel, sidebars and stage), ratifying the 8-based rhythm; component interiors are not retrofitted.
export const SPACE = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 40,
};

// Stacking order for the shell and reel. The `effects/` range is deliberately left alone; `banner` and `modal` here document where those live, not a re-basing.
export const Z = {
    base: 0,        // shell background, cosmic canvas
    content: 1,     // topbar, stage, sidebars — normal HUD furniture
    reel: 2,        // the reel row sits above the stage's ambient glow
    pointer: 4,     // centre line and pointers, above the reel's own fades
    overlay: 6,     // full-surface spin-mode washes (recursion, KOTW shimmer)
    banner: 100,    // FirstBlood / CommunityGoal, the better-behaved banners
    modal: 10000,   // EventSelectionWheel and the celebration stack
};

export const COLORS = {
    bg: '#1a1a2e',
    bgLight: '#252542',
    bgLighter: '#2d2d4a',
    text: '#e0e0e0',
    textMuted: '#888',
    border: '#3d3d5c',
    accent: '#5865F2',
    gold: '#FFAA00',
    aqua: '#55FFFF',
    green: '#55FF55',
    yellow: '#FFFF55',
    purple: '#AA00AA',
    red: '#FF5555',
    orange: '#FF8800',
    insane: '#FFD700',  // Bright gold — now spent on LEGENDARY, see rarityHelpers
    recursion: '#00FF00', // Matrix green for recursion
    recursionDark: '#001100', // Dark green/black for recursion

    // Rarity ink steps: Minecraft's chat colours fail AA on the panel steps (#AA00AA is 2.07 on bgLighter), so the hue is kept and the lightness lifted. Use the base colour for fills, borders, dots and glows, and the `*Ink` step the moment it becomes text. Ratios are the worst case, on bgLighter.
    purpleInk: '#DE6BDE',   // Exotic as text — 4.58:1
    redInk: '#FF8A8A',      // Rare as text — 5.84:1
    // Relic: a MOSSY emerald, not lime #55FF55 (COLORS.green; too close to recursion's #00FF00 and reads as the tier just above common). No `relicInk`: the fill clears AA as text on its own (5.61 on bgLighter); dark text on the fill is `lightFill`.
    relic: '#3FBF6F',
    // Common is the old #888 pulled toward the field's hue (it was 3.74:1 on bgLighter, under the floor).
    neutralInk: '#9AA0B4',  // Common as text — 5.08:1

    // Insane is the only tier with no flat colour (every flat one is another tier's); the oil-slick is its identity, and platinum is the fallback where a single hex is unavoidable.
    insaneFlat: '#F2ECFF',
    // Holo sweep stops: magenta is the hot #FF55FF, not exotic's #AA00AA, so the two never read as one tier.
    insaneHolo: ['#FF55FF', '#55FFFF', '#FFD700', '#FF55FF'],

    // Mythic's cycle stays in the cool band no other tier owns (aqua, azure, teal); the old purple and gold stops are exotic and legendary.
    mythicCycle: ['#55FFFF', '#2E86FF', '#3BE8B0', '#55FFFF'],

    // The daily bounty is a MARK on a common, not a tier or a mode, so it takes no saturated hue: a warm near-white. Its identity is the SHAPE (a reticle and a word); keep it apart from insane's platinum (#F2ECFF) and High Roller's brass (#E4C78B).
    bounty: '#FFF1D6',

    // The mystery box: gilt, a three-stop METAL ramp that always travels, never a flat gold (legendary and the chrome own gold). `mystery` is the middle stop for places that cannot take a gradient; tiles on a gilded reel keep their own tier colours.
    mystery: '#F2C14E',
    mysteryGilt: ['#FFF0B8', '#F2C14E', '#B7791F', '#FFF0B8'],
};

// The three bonus events' identities, in one place (the board, plaque and band lamp had drifted). `color` MUST equal the accent the mode executes under; `iconColor` differs only for triple-lucky's gold crown on a green sign. Icons agree by drawing the same shapes: Zap (lucky), Layers (5x), Crown (triple lucky).
export const BONUS_IDENTITY = {
    lucky_spin: { color: COLORS.green, iconColor: COLORS.green },
    triple_spin: { color: COLORS.gold, iconColor: COLORS.gold },
    triple_lucky_spin: { color: COLORS.green, iconColor: COLORS.gold },
    // Recursion is a global event, not a bonus event, but it shares the signboard and lamp, so its identity lives in this table.
    recursion: { color: COLORS.recursion, iconColor: COLORS.recursion },
};

export const BONUS_IDENTITY_FALLBACK = { color: COLORS.orange, iconColor: COLORS.orange };

// THE NOCTURNE's material grain (SVG noise): always at or under 4% baked-in alpha, one URI for the whole surface, and static (the Ambient-Off Rule freezes motion, never material).
export const SURFACE_NOISE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

// THE NOCTURNE's deck tokens. New work takes them; the six files that still spell them by hand are an owed sweep. `rail(alpha)` is a function because the call site is where the edge is described (0.06 seam, 0.10 lit top edge, 0.20 front lip).
export const rail = alpha => `rgba(206,214,236,${alpha})`;

export const DECK = {
    // The band's own ground, top to curb.
    faceTop: '#0d1322',
    faceMid: '#0a0d18',
    faceDeep: '#05060a',

    /** A plinth's material: the deck's ramp under the surface's shared grain. */
    plinth: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #0a0d18 100%)`,
    /** The board's own face — deeper, because things stand on it. */
    face: `${SURFACE_NOISE}, linear-gradient(180deg, #0d1322 0%, #0a0d18 46%, #05060a 100%)`,

    /** Blue-hour sky light, falling from the top of a surface. */
    sky: 'rgba(148,168,212,0.06)',
    /** Station amber pooling up from a floor. */
    amberWash: 'rgba(255,183,94,0.07)',

    // Station amber is the board's one signal colour: COLORS.gold named for its job, so the board and the band's centre line are the same lamp.
    amber: COLORS.gold,

    // The board's ink ladder. Measured on #0a0d18: 15.9:1, 8.6:1, 5.2:1.
    ink: '#E8ECF6',
    inkMid: '#A8B0C6',
    inkDim: '#7C859C',
};

// The five global events: a name and a colour (the icon is a render decision each surface makes, so it is not here). The banners still carry their own `*_PRIMARY` constants. `roulette` is the wheel's rarest pocket green, set as text; it and the Community Goal's teal are the closest pair, so surfaces listing both must separate them by something other than hue.
export const EVENT_IDENTITY = {
    // Station amber rather than the retired Gold Rush's #F59E0B: THE ARRIVAL
    // belongs to THE CONCOURSE, and its whole vocabulary is the platform lamp.
    arrival:        { name: 'THE ARRIVAL',       color: '#FFAA00' },
    king_of_wheel:  { name: 'KING OF THE WHEEL', color: '#F43F5E' },
    first_blood:    { name: 'FIRST BLOOD',       color: '#DC2626' },
    community_goal: { name: 'COMMUNITY GOAL',    color: '#2DD4BF' },
    roulette:       { name: 'THE PARLOUR',       color: '#19B36B' },
    // The table's brass trim, not its teal felt (which would sit on the Community Goal's teal); pale enough to stay apart from the Arrival's amber.
    high_roller:    { name: 'HIGH ROLLER',       color: '#E4C78B' },
};
