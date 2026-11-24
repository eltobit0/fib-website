// Checked against the plugin's registrations; vendor-pool.mjs warns when the names differ, so deliberate omissions go in UNLISTED.
// `says` is the plugin's own MiniMessage ({item:MATERIAL} is an item glyph); 'info' comes from info.data.js (generated).

export const GROUPS = [
    { key: 'item', name: 'Your item' },
    { key: 'moving', name: 'Getting around' },
    { key: 'kit', name: 'Your kit' },
    { key: 'people', name: 'Talking and teams' },
    { key: 'records', name: 'Stats and collection', note: 'These read and write the FIB service, which only runs on McPlayHD.net. On a server you host yourself they have nothing to connect to, and nothing in a self-hosted round is recorded.' },
    { key: 'round', name: 'Running a round', note: 'For the operators running the game.' },
];

export const COMMANDS = [
    { name: 'info', group: 'item', who: 'all', forms: [
        { args: '', text: 'During a round: the item you are hunting, its /info description and its recipes. Otherwise: the item in your hand.' },
        { args: '<item>', text: 'The same for any item.', example: '/info sniffer_egg', says: 'info', then: 'Then its recipes open.' },
    ] },
    { name: 'infowiki', group: 'item', who: 'all', forms: [
        { args: '', text: 'A link to the Minecraft Wiki page for your current item.', example: '/infowiki',
          says: ['<gray>Check out the minecraft wiki for <green>Sniffer Egg <white>[<aqua>Click here<white>]'] },
    ] },

    { name: 'spawn', group: 'moving', who: 'all', when: ['Not while paused'], forms: [
        { args: '', text: 'Teleports you to the round\'s spawn.' },
    ] },
    { name: 'bed', group: 'moving', who: 'all', when: ['Not while paused'], forms: [
        { args: '', text: 'Teleports you to your bed, if you have set one.' },
    ] },
    { name: 'pos', group: 'moving', who: 'event', when: ['With Positions on', 'Players in the round'], forms: [
        { args: '<name>', text: 'Saves where you stand under that name, for everyone. If the name is already saved, it points you to it instead.', example: '/pos village' ,
          says: ['<dark_gray>» <gold>Position <dark_gray>┃ <green>Steve <gray>added location of <dark_aqua>village <gray>at <dark_aqua>-212<gray>, <dark_aqua>71<gray>, <dark_aqua>388 <gray>in the <green>overworld'], heard: 'everyone' },
        { args: '', text: 'Lists every saved position. /pos list does the same.', example: '/pos',
          says: ['<dark_gray>» <gold>Position <dark_gray>┃ <white>All saved locations',
              '<dark_gray>» <dark_aqua>village <gray>located at <dark_aqua>-212<gray>, <dark_aqua>71<gray>, <dark_aqua>388 <green>(143 blocks away)',
              '<dark_gray>» <dark_aqua>fortress <gray>located at <dark_aqua>41<gray>, <dark_aqua>64<gray>, <dark_aqua>-96 <gray>in the <red>nether'] },
        { args: 'remove <name>', text: 'Removes a saved position. remove all removes every one.', who: 'op', example: '/pos remove village',
          says: ['<dark_gray>» <gold>Position <dark_gray>┃ <gray>Position <dark_aqua>village <gray>has been removed.'] },
    ] },
    { name: 'help', group: 'moving', who: 'all', forms: [
        { args: '', text: 'Lists every command you can use.' },
    ] },
    { name: 'ping', group: 'moving', who: 'all', forms: [
        { args: '', text: 'Shows your ping.', example: '/ping', says: ['<green>Your ping: <yellow>38ms'] },
    ] },

    { name: 'bp', group: 'kit', who: 'all', when: ['During a round'], forms: [
        { args: '', text: 'Opens your backpack (your team\'s, in a team round).' },
    ] },
    { name: 'fixskips', group: 'kit', who: 'all', when: ['During a round'], forms: [
        { args: '', text: 'Gives you back the jokers you have left, if the stack went missing.', example: '/fixskips',
          says: ['<yellow>Removed all duplicate jokers and gave you <white>5<yellow> jokers.'] },
    ] },
    { name: 'fixlocate', group: 'kit', who: 'all', forms: [
        { args: '[name | all]', text: 'Dismisses a locator\'s bossbar and trail, or all of them.', example: '/fixlocate all' ,
          says: ['<dark_gray>» <dark_purple>Locator <dark_gray>┃ <gray>Dismissed <dark_aqua>2 <gray>locators.'] },
    ] },

    { name: 'shout', group: 'people', who: 'all', forms: [
        { args: '<message>', text: 'Sends one message to everyone, when chat would otherwise go to your team.', example: '/shout anyone got string?' ,
          says: ['<gold>Steve <dark_gray>» <white>anyone got string?'], heard: 'everyone' },
        { args: '', text: 'Turns shout mode on or off: while it is on, everything you say goes to everyone.', example: '/shout',
          says: ['<gray>Shout mode: <green>ON'] },
    ] },
    { name: 'teams', group: 'people', who: 'all', when: ['With Teams on'], forms: [
        { args: 'invite <player>', text: 'Asks a player to team up.', example: '/teams invite Alex',
          says: ['<dark_aqua>You invited <yellow>Alex <dark_aqua>to your team'] },
        { args: 'accept <player>', text: 'Accepts an invitation.', example: '/teams accept Steve',
          says: ['<dark_aqua>You <green>accepted <dark_aqua>the invite from <yellow>Steve'] },
        { args: 'decline <player>', text: 'Declines one.', example: '/teams decline Steve',
          says: ['<dark_aqua>You <red>declined <dark_aqua>the invite from <yellow>Steve'] },
        { args: 'leave', text: 'Leaves your team.', example: '/teams leave', says: ['<dark_aqua>You <red>left <dark_aqua>the team'] },
        { args: 'list', text: 'Lists the teams.' },
    ] },
    { name: 'voteskip', group: 'people', who: 'all', when: ['During a round', 'In Run Battle', 'Needs a joker'], forms: [
        { args: '', text: 'Puts the current item to a vote of everyone playing. If it carries, the item is skipped for the whole server and you pay a joker; a tie is a coin flip.' , example: '/voteskip',
          says: ['', '<gray>A skip voting has been started by <green>Steve<gray>.', '  <dark_gray>● <gray>Duration <dark_gray>» <gold>60 seconds',
              '  <dark_gray>● <gray>Item <dark_gray>» <reset>{item:SNIFFER_EGG} <gold>Sniffer Egg', '',
              '                  <dark_gray>[<green><b>YES</b><dark_gray>]          <dark_gray>[<red><b>NO</b><dark_gray>]', ''], heard: 'everyone' },
    ] },
    { name: 'vote', group: 'people', who: 'all', when: ['During a round'], forms: [
        { args: 'yes | no', text: 'Votes in a skip vote that is open.', example: '/vote yes', says: ['<gray>You voted for <green><b>YES</b><gray>!'] },
        { args: 'cancel', text: 'Cancels the vote.', who: 'op', example: '/vote cancel',
          says: ['<gray>You cancelled the vote.', '<red><b>The vote has been cancelled by an operator!</b>'] },
    ] },

    { name: 'stats', group: 'records', who: 'all', service: true, forms: [
        { args: '', text: 'Lists the ways to ask for stats.', example: '/stats',
          says: ['', '<dark_gray>» <gold><b>Stats</b> <dark_gray>«', '',
              '  <dark_gray>● <yellow>/stats solo <dark_gray>» <gray>Your solo stats',
              '  <dark_gray>● <yellow>/stats solo <player> <dark_gray>» <gray>Solo stats of a player',
              '  <dark_gray>● <yellow>/stats team <dark_gray>» <gray>Your overall team stats',
              '  <dark_gray>● <yellow>/stats team <player> <dark_gray>» <gray>Overall team stats of a player',
              '  <dark_gray>● <yellow>/stats duo <teammate> <dark_gray>» <gray>Your stats with a teammate',
              '  <dark_gray>● <yellow>/stats duo <p1> <p2> <dark_gray>» <gray>Duo stats between two players', ''] },
        { args: 'solo [player]', text: 'Your solo stats across every recorded round, or another player\'s.', example: '/stats solo Steve',
          says: ['', '<dark_gray>» <gold><b>Solo Stats</b> <dark_gray>● <green>Steve <dark_gray>«', '',
              '  <dark_gray>● <gray>Total items found <dark_gray>» <dark_aqua>214',
              '    <dark_gray>» <reset>{item:OAK_LOG} <gray>Oak Log <dark_gray>× <dark_aqua>9',
              '    <dark_gray>» <reset>{item:CRAFTING_TABLE} <gray>Crafting Table <dark_gray>× <dark_aqua>8',
              '    <dark_gray>» <reset>{item:TORCH} <gray>Torch <dark_gray>× <dark_aqua>7',
              '  <dark_gray>● <gray>Travelled <dark_gray>» <dark_aqua>184213 blocks',
              '  <dark_gray>● <gray>Highest score <dark_gray>» <dark_aqua>31',
              '  <dark_gray>● <gray>Back-to-Back streak <dark_gray>» <dark_aqua>4',
              '  <dark_gray>● <gray>Rarities <dark_gray>»',
              '    <dark_gray>» <blue>Rare <dark_gray>× <dark_aqua>31',
              '    <dark_gray>» <dark_purple>Epic <dark_gray>× <dark_aqua>6',
              '  <dark_gray>● <gray>Games played <dark_gray>» <dark_aqua>12',
              '  <dark_gray>● <gray>Games won <dark_gray>» <dark_aqua>5',
              '  <dark_gray>● <gray>Win percentage <dark_gray>» <dark_aqua>41.7%',
              '  <dark_gray>● <gray>Avg. items / game <dark_gray>» <dark_aqua>17.8',
              '  <dark_gray>● <gray>Avg. time per item <dark_gray>» <dark_aqua>3m 12s', ''] },
        { args: 'team [player]', text: 'The same for team rounds.' },
        { args: 'duo <teammate>', text: 'Your stats with one teammate. duo <player> <player> asks for any two.', example: '/stats duo Alex' },
        { args: 'reset <solo | team> <player>', text: 'Wipes a player\'s recorded stats, after a confirmation.', who: 'op' },
    ] },
    { name: 'top', group: 'records', who: 'all', service: true, forms: [
        { args: '[solo | duo | teams | achievements] [stat]', text: 'The leaderboards. The stat is highest_score (the default), total_items, games_won, back_to_back_streak or blocks_travelled.', example: '/top solo total_items',
          says: ['', '<dark_gray>» <gold><b>Leaderboard</b> <dark_gray>● <green>Total Items <dark_gray>«', '',
              '  <dark_gray>● <gold>1<white>. <green>Steve <dark_gray>» <dark_aqua>214',
              '  <dark_gray>● <gray>2<white>. <green>Alex <dark_gray>» <dark_aqua>198',
              '  <dark_gray>● <dark_gray>3<white>. <green>Noor <dark_gray>» <dark_aqua>176', ''] },
    ] },
    { name: 'collection', group: 'records', who: 'all', service: true, forms: [
        { args: '[player]', text: 'Opens your collection book, or another player\'s.' },
    ] },
    { name: 'achievements', group: 'records', who: 'all', service: true, forms: [
        { args: '', text: 'Opens the achievements menu with your progress.' },
        { args: 'grant | revoke | reset <player> [achievement]', text: 'Hands out or takes back achievements.', example: '/achievements grant Steve b2b_king', who: 'op' },
    ] },

    { name: 'start', group: 'round', who: 'op', when: ['Before a round'], forms: [
        { args: '<minutes> <jokers>', text: 'Starts a round of that length, with that many jokers each.', example: '/start 60 7' },
        { args: '<preset>', text: 'Starts a round from a saved preset of settings.' },
    ] },
    { name: 'settings', group: 'round', who: 'op', forms: [
        { args: '', text: 'Opens the settings menu.' },
    ] },
    { name: 'pause', group: 'round', who: 'event', when: ['During a round'], forms: [
        { args: '', text: 'Freezes every player and the timer.', example: '/pause', says: ['<gold>The game has been paused!'], heard: 'everyone' },
    ] },
    { name: 'resume', group: 'round', who: 'event', when: ['While paused'], forms: [
        { args: '', text: 'Unfreezes them.', example: '/resume', says: ['<gold>The timer has been resumed!'], heard: 'everyone' },
    ] },
    { name: 'stoptimer', group: 'round', who: 'op', when: ['During a round'], forms: [
        { args: '', text: 'Ends the round now.' },
    ] },
    { name: 'skip', group: 'round', who: 'op', when: ['During a round'], forms: [
        { args: '<player>', text: 'Skips a player\'s current item. In Run Battle, it skips it for everyone.', example: '/skip Steve' ,
          says: ['<gray>Skipped this item for Steve'] },
    ] },
    { name: 'randomevent', group: 'round', who: 'op', when: ['During a round'], forms: [
        { args: '<event>', text: 'Starts a random event now: item_hunt, point_hunt or special_trader.', example: '/randomevent item_hunt' ,
          says: ['<dark_gray>» <light_purple>Event <dark_gray>┃ <gold><b>Item Hunt</b><reset><gray> has begun!', '<dark_gray>» <light_purple>Event <dark_gray>┃ <gray>First to collect their current item <red>without skipping <gray>wins <yellow>1-3 Wheels of Fortune<gray>!'], heard: 'everyone' },
    ] },
    { name: 'forceteam', group: 'round', who: 'op', when: ['Before a round', 'With Teams on'], forms: [
        { args: '<team> <player> [player]', text: 'Puts players in a team.', example: '/forceteam blue Steve Alex' ,
          says: ['<dark_aqua>Successfully created team <green>blue'] },
    ] },
    { name: 'forceitem', group: 'round', who: 'op', when: ['During a round', 'Players in the round'], forms: [
        { args: '<item> [item] …', text: 'Sets your current item and the ones after it. A tool for testing.', example: '/forceitem diamond emerald' ,
          says: ['<gray>Forced item <dark_gray>» <green>Diamond <gray>then <white>Emerald'] },
    ] },
    { name: 'items', group: 'round', who: 'op', forms: [
        { args: '', text: 'Shows every item the pool can hand out.' },
    ] },
    { name: 'reset', group: 'round', who: 'op', forms: [
        { args: '[biome]', text: 'Restarts the server into a new world with a new seed, optionally starting in a given biome. This is also when the worldgen datapack is copied in.' },
    ] },
    { name: 'result', group: 'round', who: 'op', when: ['After a round'], forms: [
        { args: '', text: 'Shows the next player\'s result on the results screen.' },
    ] },
    { name: 'spectate', group: 'round', who: 'all', when: ['After a round'], forms: [
        { args: '', text: 'Takes you out of spectator mode, into creative.', example: '/spectate', says: ['<gray>You are <red>no longer<gray> spectating.'] },
    ] },
];

// Operator tooling left off on purpose (DESIGN.md Rules). Never rendered.
export const UNLISTED = ['checkmods'];
