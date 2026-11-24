// One entry per release, newest first; a visitor sees LATEST_VERSION's entry once. Bump `version` only for things worth interrupting for.
// Figures are frozen on purpose: never derive them from the live roster, or old entries would rewrite their history.

// Block kinds: rationale, tier, ladder, changes, notes, feature (`accent` is a key the modal maps, so this file never spells a colour).
// Never delete old releases; they stay readable in the modal.
export const CHANGELOG = [
    {
        version: '2.3',
        date: '2026-09-26',
        title: 'The Lucky Book',
        tagline: 'Every special your lucky spins ever landed, and how often they landed one.',
        blocks: [
            {
                kind: 'feature',
                accent: 'lucky',
                heading: 'New in the collection book',
                title: 'Lucky',
                body: [
                    'The collection book has a third view beside Collection and Prestige. ' +
                    'It shows every special you have ever pulled on a lucky spin, how many ' +
                    'times, and when the last one landed - going back to your very first ' +
                    'lucky spin, not just from today.',
                    'Above it are your lucky spin stats: how many you have taken, how many ' +
                    'hit a special, and your hit rate. Each tier also ' +
                    'counts how many lucky spins it has been since you last hit it.',
                ],
                facts: [
                    { label: 'Where', value: 'Collection book - switch to Lucky at the top' },
                    { label: 'Counts', value: 'Lucky spins only - mystery box pulls are left out' },
                    { label: 'Profiles', value: 'Works on other players\' collections too' },
                ],
            },
        ],
    },
    {
        version: '2.2',
        date: '2026-09-24',
        title: 'Five Bounties a Day',
        tagline: 'The bounty no longer belongs to whoever is up at 2am.',
        blocks: [
            {
                kind: 'rationale',
                heading: 'Why',
                paragraphs: [
                    'One bounty a day, drawn at midnight UTC, usually fell within a couple ' +
                    'of hours - so it went to whoever was spinning in the small hours, and ' +
                    'everyone who came by later found it already claimed.',
                ],
            },
            {
                kind: 'feature',
                accent: 'bounty',
                heading: 'Changed',
                title: 'Five Bounties a Day',
                body: [
                    'There are now five bounties a day, each opening at a random time - one ' +
                    'somewhere in every fifth of the day, never two close together. The ' +
                    'plaque above the reel counts down to the next one, but what it is stays ' +
                    'a secret until the moment it opens.',
                    'Each bounty is only open until the next one opens - then it is gone, ' +
                    'claimed or not - so there is always exactly one to hunt, and the ' +
                    'plaque shows how long it has left. The last of the day runs to ' +
                    'midnight. Every one still pays a full mystery box.',
                ],
                facts: [
                    { label: 'Per day', value: 'Five, each at a random time' },
                    { label: 'Open for', value: 'Until the next one opens - the last one until midnight' },
                    { label: 'Per player', value: 'Two a day - pull a third and it stays open for someone else' },
                    { label: 'Announced', value: 'The next opening is counted down above the reel' },
                    { label: 'Prize', value: 'A mystery box, every time' },
                ],
            },
        ],
    },
    {
        version: '2.1',
        date: '2026-09-23',
        title: 'High Roller & the Daily Bounty',
        tagline: 'A blackjack table, a hunt that resets every day, and a box that can hold any special.',
        blocks: [
            {
                kind: 'feature',
                accent: 'high_roller',
                heading: 'New global event',
                title: 'High Roller',
                body: [
                    'Jimbo deals blackjack. Everyone on the wheel when the table opens is ' +
                    'dealt one hand against his, and you play it out with Hit or Stand. ' +
                    'When every seat is done, or the clock runs out, he turns his hole ' +
                    'card over and plays his own hand - then everyone is paid at once.',
                ],
                facts: [
                    { label: 'Pays', value: 'Blackjack +50 · Win +30 · Push +10 lucky spins' },
                    { label: 'Rules', value: 'Dealer stands on every 17. Hit or stand - no doubling or splitting.' },
                    { label: 'Clock', value: '30 seconds to play your hand' },
                    { label: 'When', value: 'Drawn like any global event - and it only deals if someone is here to play' },
                ],
            },
            {
                kind: 'feature',
                accent: 'bounty',
                heading: 'New every day',
                title: 'The Daily Bounty',
                body: [
                    'Each day one item is the bounty - and it can be any item on the wheel, ' +
                    'from a block of dirt to the Insane. The first player to pull it wins ' +
                    'the day\'s prize. Then it is claimed until midnight, when a new one is drawn.',
                    'Most days it is a common, and it falls within hours. Some days it is ' +
                    'a special, and then it drops at that special\'s own odds - a Mythic ' +
                    'bounty may well survive the day. Today\'s is shown above the reel, and ' +
                    'marked on the reel itself when it goes past.',
                ],
                facts: [
                    { label: 'Resets', value: '00:00 UTC, every day' },
                    { label: 'Who wins', value: 'The first player to pull it - one winner a day' },
                    { label: 'Prize', value: 'A mystery box' },
                    { label: 'Special days', value: 'About one day in 45 the bounty is a special' },
                ],
            },
            {
                kind: 'feature',
                accent: 'mystery',
                heading: 'The prize',
                title: 'Mystery Box',
                body: [
                    'One special item - any of them. Every special on the wheel, from the ' +
                    'commonest Rare to the Insane, has exactly the same chance of being in it.',
                    'While you hold a box the wheel is gilded, and your next spin opens it on ' +
                    'a reel made of nothing but specials. What comes out carries a MYSTERY ' +
                    'tag wherever a pull is shown, the way a lucky spin carries LUCKY.',
                ],
                facts: [
                    { label: 'Contents', value: 'Any of 37 specials, each 1 in 37' },
                    { label: 'The Insane', value: '1 in 37 per box - about 2.7%' },
                    { label: 'Opens', value: 'On your next spin' },
                ],
            },
            {
                kind: 'notes',
                heading: 'Good to know',
                items: [
                    {
                        label: 'It waits',
                        body:
                            'A box will not open during a global event or a recursion window - ' +
                            'it would score for neither and eat your time. It waits, gilding ' +
                            'and all, until the moment is free. It never expires.',
                    },
                    {
                        label: 'Lucky spins',
                        body:
                            'A lucky spin draws every item at the same odds, so on a special ' +
                            'bounty day it is by far the best way to chase it.',
                    },
                    {
                        label: 'Not a spin',
                        body:
                            'Opening a box adds the item to your collection and history, but ' +
                            'it does not count as a spin, reset a dry streak, score for any ' +
                            'event, or claim the bounty.',
                    },
                    {
                        label: 'Luck stats',
                        body:
                            'Box pulls are counted apart from ordinary pulls, like lucky spins ' +
                            'are, so a guaranteed special never shows up as a lucky streak.',
                    },
                ],
            },
        ],
    },
    {
        version: '2.0',
        date: '2026-09-20',
        title: 'The Relic Update',
        tagline: 'A seventh rarity, and the odds around it rebuilt to make room.',
        blocks: [
            {
                kind: 'rationale',
                heading: 'Why the odds changed',
                paragraphs: [
                    'The ladder had names that did not mean anything. A single Legendary ' +
                    'dropped at 0.050% and a single Exotic at 0.055% - two tiers, different ' +
                    'colours, all but identical odds. You could not tell from the word which ' +
                    'was the harder pull, because in practice neither was.',

                    'That also left nowhere to put anything new: the gap between the two ' +
                    'tiers was half a basis point wide with five items already standing in it.',

                    'So Legendary was spread out to open that gap, Relic was given the room ' +
                    'it made, and the tiers around them were re-spaced. Each step up the ' +
                    'ladder is now roughly twice as rare as the one below it - so a tier\'s ' +
                    'name finally tells you something about what it took to get.',
                ],
            },
            {
                kind: 'tier',
                rarity: 'relic',
                heading: 'A new rarity',
                rate: '1 in 439',
                body:
                    'Relics are places. Every other tier on the wheel is a person or an ' +
                    'object - Relic is seven of the server\'s own structures, and they drop ' +
                    'like any other special.',
            },
            {
                kind: 'tier',
                rarity: 'mythic',
                heading: 'And one more, further up',
                rate: '0.005% - same chance as the old Wandering Trader',
                // Written out, not filtered from MYTHIC_ITEMS, so it never grows with the tier.
                roster: [
                    { texture: 'mythic_special_trader', name: 'Special Trader', imageUrl: '/special_trader.png' },
                ],
                body:
                    'The Special Trader joins Mythic. It is the rarer of the two traders in ' +
                    'game and it is the rarer of the two here - same head, purple cloth, the ' +
                    'colour the server already gives it.',
            },
            {
                kind: 'tier',
                rarity: 'rare',
                heading: 'And a new face at the bottom of the ladder',
                rate: '1 in 1,563',
                // Own roster, not the whole tier (see TIER_ROSTERS in ChangelogModal).
                roster: [
                    { texture: 'rare_rzem', name: 'rzem', imageUrl: 'https://minotar.net/helm/rzem/64' },
                ],
                body:
                    'rzem joins Rare, the eleventh head in the tier. Rare is the ' +
                    'wheel\'s widest tier and the one most people meet first, so this ' +
                    'is the pull you are most likely to see of everything in this ' +
                    'release - and the tier was re-dealt around it, so every head in ' +
                    'it now drops at a rate of its own.',
            },
            {
                kind: 'ladder',
                heading: 'Where it sits',
                note: 'Bar length is how often a tier drops, log-scaled - a linear scale would render everything above Legendary as a dot.',
                rows: [
                    { rarity: 'insane', label: 'Insane', rate: '1 in 1,000,000', oneIn: 1000000 },
                    { rarity: 'mythic', label: 'Mythic', rate: '1 in 7,143', oneIn: 7143 },
                    { rarity: 'legendary', label: 'Legendary', rate: '1 in 870', oneIn: 870 },
                    { rarity: 'relic', label: 'Relic', rate: '1 in 439', oneIn: 439, isNew: true },
                    { rarity: 'exotic', label: 'Exotic', rate: '1 in 227', oneIn: 227 },
                    { rarity: 'rare', label: 'Rare', rate: '1 in 137', oneIn: 137 },
                ],
            },
            {
                kind: 'changes',
                heading: 'Also changed',
                rows: [
                    {
                        label: 'Legendary',
                        from: '1 in 645',
                        to: '1 in 870',
                        note: 'Spread out to open the band Relic now occupies. apppaa is untouched at 0.010%.',
                    },
                    {
                        label: 'Wandering Trader',
                        from: '1 in 20,000',
                        to: '1 in 6,667',
                        note: 'Three times commoner, and staying in Legendary. It was the tier\'s rarest pull by a distance; now it is second, behind apppaa.',
                    },
                    {
                        label: 'Mythic',
                        from: '1 in 11,111',
                        to: '1 in 7,143',
                        note: 'The Special Trader joins at 0.005%. Nothing already in the tier moved.',
                    },
                    {
                        label: 'Rare',
                        from: '10 heads',
                        to: '11 heads',
                        note: 'rzem joins - see above. The tier was re-dealt at the same time: every head in it now has odds of its own, where two pairs used to share a weight.',
                    },
                ],
            },
            {
                kind: 'notes',
                heading: 'For collectors',
                items: [
                    {
                        label: 'Cartographer',
                        body: 'A new achievement for collecting all seven Relics.',
                    },
                    {
                        label: 'Two to hunt, not one',
                        body:
                            'The Special Trader is a separate entry in the book from the ' +
                            'Wandering Trader, a tier above it. Owning one says nothing ' +
                            'about the other.',
                    },
                    {
                        label: 'Full House',
                        body: 'Now wants a duplicate of every Relic and every Exotic too, counted against the live roster.',
                    },
                    {
                        label: 'Prestige',
                        body:
                            'Relic takes level III, so Legendary, Mythic and Insane each move up one. ' +
                            'Levels you have already earned keep the name you earned them under.',
                    },
                ],
            },
        ],
    },
];

export const LATEST_VERSION = CHANGELOG[0].version;

// Per-browser, not per-account: /wheel is readable signed out.
const SEEN_KEY = 'fib:changelog:seen';

// Wrapped: localStorage throws in private windows with site data blocked.
export function readSeenVersion() {
    try {
        return window.localStorage.getItem(SEEN_KEY);
    } catch {
        return null;
    }
}

export function markVersionSeen(version) {
    try {
        window.localStorage.setItem(SEEN_KEY, version);
    } catch {
        // No storage: the popup shows again next load, by design.
    }
}
