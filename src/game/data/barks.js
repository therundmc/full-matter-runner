// What the guards say (data only): short lines floating over their heads, by occasion. Enemy.say names the
// occasion (and what fills its blanks), Director.bark picks the line (ai/Barks.js: never one the squad has just used,
// the most telling one it can fill) and shows it.
// Blanks: {N} a mate's name (NAMES; the boss is 'BOSS'), {AT} where the player is ('IN THE TOILETS'), {P} a place
// ('THE TOILETS'), both from PLACES / LANDMARKS. A line with a blank nothing fills is left out.
export const BARKS = {
  // two of them killing time (Enemy.chatWith)
  chat: ['QUIET NIGHT.', 'BOSS IS IN A MOOD.', 'GOT A LIGHT?', 'MY FEET ARE KILLING ME.', 'YOU OWE ME TWENTY.',
    'SEEN THE NEW GIRL?', 'I HATE THE NIGHT SHIFT.', 'SO I TOLD HIM: NO.', 'YOU CATCH THE FIGHT?', 'HE PAYS LATE. AGAIN.',
    'HA! NO WAY.', 'THIS PLACE, MAN...', 'ANOTHER HOUR OF THIS.', 'RAIN AGAIN TOMORROW.'],
  // at their post (data/posts.js): the boss to his men, a joke on the couch and the other one laughing
  boss: ['TURN THAT DOWN.', 'WHERE IS MY MONEY?', 'COUNT IT AGAIN.', 'NOBODY GETS IN.', 'GOOD NIGHT, BOYS.'],
  // CUEBALL at his desk (data/posts.js `cueball`), to the two on the couch
  cueball: ['COUNT IT AGAIN. SLOWER.', 'WHO TOUCHED MY SHADES?', 'THE BOSS CALLS AT TWO.', 'I HATE THIS SONG.',
    'NOBODY GETS IN. NOBODY.', 'SIT UP STRAIGHT.'],
  joke: ['SO THE PRIEST SAYS...', 'GET THIS ONE.', 'AND HER HUSBAND WALKS IN.', 'HE SAYS: WHAT DOG?', 'GUESS WHO PUKED.'],
  laugh: ['HA HA HA!', 'HA! GOOD ONE.', 'STOP IT, MAN.', 'HAH!'],
  // calm, then looking for something
  sight: ['HUH?', "WHO'S THERE?", 'SOMEBODY THERE?', 'YOU SEE THAT?'],
  dark: ['WHO KILLED THE LIGHTS?', 'THE FUSES AGAIN?', 'SOMEBODY CHECK THE BOX!', "CAN'T SEE A THING."],
  noise: ['WHAT WAS THAT?', 'HUH?', 'YOU HEAR THAT?', 'WHAT THE HELL?'],
  // what was found wrecked (Enemy.check): a wall, a window, a door, the fuse box
  damage: ['WHAT THE...', 'WHO DID THIS?', "THAT WASN'T LIKE THAT."],
  window: ["WINDOW'S SMASHED!", 'WHO BROKE THE GLASS?', 'GLASS ALL OVER...', 'CAME IN THE WINDOW...'],
  door: ["DOOR'S BUSTED!", 'SOMEBODY FORCED THIS!', 'WHO KICKED THIS IN?', 'LOOK AT THIS DOOR...'],
  fuse: ['THE BOX IS SMASHED!', 'SOMEBODY CUT THE POWER!', "IT WASN'T THE FUSES..."],
  missing: ["WHERE'D HE GO?", "HE'S NOT AT HIS POST."],
  // the level's devices (data/devices.js): down on a slick floor, the fire alarm going off, the
  // jukebox turned up, the gas smelt
  slip: ['WHOA-', 'AGH! MY BACK...', 'WHO SPILLED...', 'UGH...'],
  sprinkler: ['WHO PULLED THE ALARM?', 'FIRE? WHERE?', 'MY SHOES, MAN!', 'SHUT THAT THING OFF!'],
  loud: ['TURN IT DOWN!', 'WHO PUT THAT ON?', "CAN'T HEAR MYSELF THINK!"],
  clear: ['...NOTHING.', 'MUST BE RATS.', 'ALL CLEAR.', 'JUMPING AT SHADOWS.', 'FORGET IT.'],
  tracks: ['FOOTPRINTS...', 'WET TRACKS.', 'SOMEONE CAME THROUGH HERE.', 'FRESH TRACKS.'],
  blood: ['BLOOD...', 'BLOODY FOOTPRINTS!', "THAT'S BLOOD. THIS WAY."],
  search: ["I'LL FIND YOU.", 'COME OUT, COME OUT...', "HE'S CLOSE.", 'CHECK THE CORNERS!', "YOU'RE NOT LEAVING ALIVE."],
  // off to a spot of the sweep (Enemy.doSearch), and curses thrown into the dark while hunting him (Enemy.taunt)
  sweep: ['CHECK {P}!', "I'LL DO {P}.", 'I GOT {P}.'],
  taunt: ['HERE, KITTY KITTY...', "WE'LL FIND YOU, PAL.", 'NOWHERE TO RUN!', 'I CAN SMELL YOU...', "YOU'RE ALREADY DEAD!",
    'COME SAY HELLO!', "IT'S OVER, FRIEND."],
  snap: ["THAT'S IT!", 'YOU ASKED FOR IT!', 'I WARNED YOU!'],
  // a word with a stranger caught at something odd (Enemy.doChallenge, data/conduct.js ACTS): calling him on the way
  // over, telling him (by what he did), warning him, shoving him, letting him off, letting it go once he is gone
  hey: ['HEY! YOU!', 'HEY, PAL!', 'YOU! HOLD IT.', 'HEY! OVER HERE.', 'WHOA, WHOA. YOU.'],
  out: ['OUT. NOW.', "YOU CAN'T BE BACK HERE.", 'PRIVATE. OUT.', 'WRONG DOOR, PAL. OUT.', 'STAFF ONLY. MOVE.'],
  drop: ['PUT THAT DOWN.', 'DROP IT, PAL.', "WHAT'S THAT FOR? DROP IT.", 'LOSE THE HARDWARE.'],
  cut: ['HEY! CUT THAT OUT.', 'KNOCK IT OFF.', 'WHAT ARE YOU DOING?', 'YOU DRUNK OR WHAT?'],
  what: ['WHAT ARE YOU DOING?', 'WHAT THE HELL WAS THAT?', 'YOU BREAK IT, YOU PAY.', 'YOU GOT A PROBLEM?'],
  staff: ['STAFF ONLY, PAL.', 'NOTHING BACK THERE.', 'AWAY FROM THE DOOR.', 'LOOKING FOR SOMETHING?'],
  watch: ['WATCH IT!', 'HEY! EYES OPEN, PAL.', 'YOU BLIND?'],
  press: ['LAST WARNING.', "DON'T MAKE ME ASK AGAIN.", "I WON'T SAY IT TWICE.", 'YOU DEAF? NOW!'],
  shove: ['GET OUT OF HERE!', 'MOVE IT!', 'OUT!', 'BEAT IT!'],
  settle: ["THAT'S RIGHT.", 'SMART MAN.', 'KEEP IT THAT WAY.', "DON'T DO THAT AGAIN."],
  letgo: ['PUNK.', 'YEAH, YOU BETTER RUN.', 'WHATEVER.', 'TOURISTS...'],
  // the fight
  contact: ['HEY!', 'OVER HERE!', 'THERE HE IS!', "IT'S HIM!", 'GOT HIM!'],
  // contact, calling by his name a mate the shout sends in (Director.shout)
  call: ['{N}! OVER HERE!', '{N}! WITH ME!', "{N}! HE'S HERE!", 'COME ON, {N}!', '{N}! GET OVER HERE!'],
  // where the player is, called out for the squad when he shows up somewhere new (Director.report)
  where: ["HE'S {AT}!", '{AT}! GO!', '{AT}! MOVE!', '{AT}! NOW!'],
  shots: ['SHOTS FIRED!', 'GUNFIRE!'],
  threat: ["YOU'RE DEAD!", "I'LL KILL YOU!", 'DIE, YOU BASTARD!', "I'LL BURY YOU!", "YOU'RE A DEAD MAN!", 'BLEED!', 'EAT THIS!', "I'LL PUT YOU DOWN!"],
  brawl: ["I'LL GUT YOU!", 'COME HERE!', "I'LL BREAK YOUR SKULL!", "I'LL CUT YOU OPEN!", "I'LL RIP YOUR HEAD OFF!", 'COME ON, THEN!'],
  revenge: ['YOU KILLED HIM!', 'YOU SON OF A BITCH!', "YOU'LL PAY FOR THAT!", "I'LL TEAR YOU APART!", 'HE WAS MY FRIEND!', 'MURDERER!'],
  flush: ['COME OUT, COWARD!', 'SHOW YOUR FACE!', "I KNOW YOU'RE THERE!", "YOU CAN'T HIDE!", 'COME OUT AND DIE!'],
  hunt: ['AFTER HIM!', "DON'T LET HIM RUN!", 'GET HIM!', 'HE WENT THAT WAY!'],
  lost: ['WHERE IS HE?', 'SPREAD OUT!', 'FIND HIM!'],
  reload: ['RELOADING!', 'COVER ME!'],
  dry: ["I'M OUT!"],
  // bare-handed, off at a run for his weapon where it is kept (Enemy.armUp)
  arm: ['STAY RIGHT THERE!', "YOU'RE GONNA GET IT!", "DON'T YOU MOVE!"],
  body: ['MAN DOWN!', 'OH GOD...', "HE'S DEAD!", 'JESUS...'],
  // a mate killed in front of him (Enemy.witnessKill) / found dead (Enemy.doCheck), by name; the boss
  down: ["{N}'S DOWN!", 'THEY GOT {N}!', '{N}! NO!', 'HE KILLED {N}!', '{N}! OH GOD!'],
  found: ["IT'S {N}...", '{N}? JESUS...', 'THEY DID {N}...', "{N}'S DEAD!", 'OH NO... {N}.'],
  chief: ['THE BOSS IS DOWN!', 'THEY GOT THE BOSS!', 'BOSS? BOSS!', 'THE BOSS IS DEAD!'],
  wake: ['GET UP!', 'ON YOUR FEET!', '{N}! GET UP!', 'COME ON, {N}, UP!'],
  help: ['HELP!', 'I NEED A HAND!', '{N}! HELP ME!'],
  panic: ['AAAH!', "HE'S CRAZY!", "HE'S NOT HUMAN!", 'NO NO NO!'],
  // one of the last two of a real squad, the others dead (Director.onKill): {N} one who just fell
  alone: ['WHERE IS EVERYBODY?', "IT'S JUST ME...", '{N}? ANSWER ME!', '{N}? {N}!', 'I NEED HELP HERE!', "THIS AIN'T WORTH IT!"],
  // alone or outgunned, he runs for the others (Enemy.doBackup): as he goes, at the room he fetches them from, and
  // the answer of one of them
  run: ["I'M GETTING THE BOYS!", 'I NEED BACKUP!', 'HOLD ON! HOLD ON!'],
  backup: ["HE'S HERE! COME ON!", '{N}! I NEED YOU!', 'GRAB YOUR STUFF!', "{N}! HE'S BACK THERE!", 'EVERYBODY, MOVE!'],
  rally: ['SHOW ME!', "LET'S GET HIM!", 'MOVE IT!', 'RIGHT BEHIND YOU!'],
  // the prologue: the first of the men coming up the stairs to the landing (systems/Tutorial.js)
  stairs: ["HE'S UP HERE!", 'UP! UP!', 'ON THE LANDING!', 'GO, GO, GO!'],
  // he gives up (Enemy.surrender), then begs for as long as the killer stands over him ...
  yield: ["DON'T SHOOT!", 'I GIVE UP!', "I'M DONE! I'M DONE!"],
  // a guard held as a shield by the player, to his own men; and one of them, his gun on the two (Enemy.holdsFire)
  hostage: ["DON'T SHOOT!", "IT'S ME! DON'T SHOOT!", 'HOLD YOUR FIRE!'],
  release: ['LET HIM GO!', 'LET GO OF HIM!', 'DROP HIM!'],
  beg: ['PLEASE!', "DON'T KILL ME!", 'I GOT KIDS, MAN!', 'I NEVER SAW YOU!', 'TAKE WHATEVER YOU WANT!', 'NOT LIKE THIS...', "I'M BEGGING YOU!"],
  // ... unless the killer turns his back on him with a gun lying at hand: he has it (Enemy.updateYield)
  turn: ['SUCKER!', 'BIG MISTAKE, PAL!', 'NOW YOU DIE!'],
};

// occasions yelled out loud (a recorded shout goes with the line), and those only muttered
export const SHOUTED = new Set([
  'shots', 'panic', 'body', 'lost', 'help', 'dry', 'arm', 'reload', 'wake', 'threat', 'brawl', 'revenge', 'flush', 'hunt',
  'call', 'where', 'down', 'chief', 'alone', 'run', 'backup', 'rally', 'taunt', 'turn', 'stairs', 'sprinkler', 'loud',
  'hey', 'press', 'shove', 'cut', 'what', 'watch', 'hostage', 'release',
]);
export const MUTTERED = new Set(['found', 'window', 'door', 'fuse', 'damage', 'sweep', 'tracks', 'blood', 'slip', 'out', 'drop',
  'staff', 'settle', 'letgo']);
// occasions said at once, over the squad's turn to speak (AI.barkGap): the first call of a contact, a mate killed
// before his eyes, a man giving up, one getting up off his knees with a gun
// and the lines of a word with a stranger (one guard at a time has one)
export const URGENT = new Set(['contact', 'call', 'down', 'chief', 'yield', 'turn', 'hey', 'out', 'drop', 'cut', 'what', 'staff',
  'watch', 'press', 'shove', 'hostage', 'release']);

// occasions not written in white (PALETTE keys)
export const BARK_TONE = {
  contact: 'pink', panic: 'pink', snap: 'pink', threat: 'pink', brawl: 'pink', revenge: 'pink',
  body: 'orange', help: 'orange', flush: 'orange', yield: 'yellow', beg: 'yellow',
  call: 'pink', where: 'pink', turn: 'pink', down: 'orange', found: 'orange', chief: 'orange', run: 'orange',
  backup: 'orange', alone: 'yellow', stairs: 'pink',
  hey: 'orange', out: 'orange', drop: 'orange', cut: 'orange', what: 'orange', staff: 'orange', watch: 'orange',
  press: 'orange', shove: 'pink',
};

// what the guards call one another: one each, never twice in a level (Director.nickOf); the boss is 'BOSS'
export const NAMES = ['MIKEY', 'SAL', 'VINNIE', 'TONY', 'RICO', 'JOEY', 'FRANKIE', 'LOU', 'NICKY', 'BENNY', 'EDDIE', 'DOM',
  'PAULIE', 'GUS', 'RAY', 'CARL', 'TEDDY', 'MANNY', 'LEO', 'SONNY'];

// Where somebody is, said two ways: [AT ("HE'S {AT}!"), P ('CHECK {P}!')]. PLACES by the kind of the level's
// soundscape zone he stands in (or the place given as the zone's 6th element: a kind of place under several names),
// 'roof' on a roof tile, 'street' on open ground outside the zones; LANDMARKS by prop type, within AI.barks.landmark
// px of the thing, win over the place.
export const PLACES = {
  bar: ['IN THE BAR', 'THE BAR'],
  vip: ['IN THE VIP ROOM', 'THE VIP ROOM'],
  toilets: ['IN THE TOILETS', 'THE TOILETS'],
  office: ['IN THE BACK ROOM', 'THE BACK ROOM'],
  kitchen: ['IN THE STOREROOM', 'THE STOREROOM'],
  lot: ['OUT BACK', 'THE BACK LOT'],
  service: ['IN THE SIDE ALLEY', 'THE SIDE ALLEY'],
  gap: ['IN THE PASSAGE', 'THE PASSAGE'],
  shop: ['IN THE SHOP', 'THE SHOP'],
  liquor: ['IN THE LIQUOR STORE', 'THE LIQUOR STORE'],
  tvshop: ['IN THE TV SHOP', 'THE TV SHOP'],
  laundry: ['IN THE LAUNDROMAT', 'THE LAUNDROMAT'],
  alley: ['IN THE ALLEY', 'THE ALLEY'],
  roof: ['ON THE ROOF', 'THE ROOF'],
  street: ['OUT FRONT', 'THE STREET'],
};
export const LANDMARKS = {
  pool_table: ['BY THE POOL TABLE', 'THE POOL TABLE'],
  jukebox: ['BY THE JUKEBOX', 'THE JUKEBOX'],
  bar_counter: ['AT THE COUNTER', 'THE COUNTER'],
  van: ['BY THE VAN', 'THE VAN'],
  dumpster: ['BY THE DUMPSTER', 'THE DUMPSTERS'],
};

// The boss sees him for the first time (Enemy.spot): one of these, big over his head in a bubble for `dur` s, the
// game slowed down (slowmo: [scale, s]); he holds his fire `hold` s while he says it.
export const BOSS = {
  lines: ["YOU SHOULD'VE STAYED DOWN, KID.", 'MY BOYS SAID YOU WERE DEAD.',
    'YOU WALKED IN HERE? GOOD.', 'ALL THIS WAY TO DIE IN MY BAR?'],
  slowmo: [0.3, 1.1],
  hold: 1.5,
  dur: 2.6,
};
