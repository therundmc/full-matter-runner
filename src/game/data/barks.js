// What the guards say (data only): short lines floating over their heads, by occasion. Enemy.say names the
// occasion, Director.bark picks the line (never one the squad has just used) and shows it.
export const BARKS = {
  // calm, then looking for something
  sight: ['HUH?', "WHO'S THERE?", 'SOMEBODY THERE?', 'YOU SEE THAT?'],
  noise: ['WHAT WAS THAT?', 'HUH?', 'YOU HEAR THAT?', 'WHAT THE HELL?'],
  damage: ['WHAT THE...', 'WHO DID THIS?', "THAT WASN'T LIKE THAT."],
  missing: ["WHERE'D HE GO?", "HE'S NOT AT HIS POST."],
  clear: ['...NOTHING.', 'MUST BE RATS.', 'ALL CLEAR.', 'JUMPING AT SHADOWS.', 'FORGET IT.'],
  tracks: ['FOOTPRINTS...', 'WET TRACKS.', 'SOMEONE CAME THROUGH HERE.', 'FRESH TRACKS.'],
  blood: ['BLOOD...', 'BLOODY FOOTPRINTS!', "THAT'S BLOOD. THIS WAY."],
  search: ["I'LL FIND YOU.", 'COME OUT, COME OUT...', "HE'S CLOSE.", 'CHECK THE CORNERS!', "YOU'RE NOT LEAVING ALIVE."],
  // a stranger hanging about (Enemy.mind)
  shoo: ['BEAT IT.', 'KEEP WALKING.', 'GET LOST, PAL.', 'MOVE ALONG.', "WHAT'RE YOU LOOKING AT?", 'NOTHING TO SEE HERE.'],
  warn: ['LAST WARNING!', 'I SAID MOVE!', 'YOU DEAF? WALK!', 'BACK OFF. NOW!'],
  snap: ["THAT'S IT!", 'YOU ASKED FOR IT!', 'I WARNED YOU!'],
  // the fight
  contact: ['HEY!', 'OVER HERE!', 'THERE HE IS!', "IT'S HIM!", 'GOT HIM!'],
  shots: ['SHOTS FIRED!', 'GUNFIRE!'],
  threat: ["YOU'RE DEAD!", "I'LL KILL YOU!", 'DIE, YOU BASTARD!', "I'LL BURY YOU!", "YOU'RE A DEAD MAN!", 'BLEED!', 'EAT THIS!', "I'LL PUT YOU DOWN!"],
  brawl: ["I'LL GUT YOU!", 'COME HERE!', "I'LL BREAK YOUR SKULL!", "I'LL CUT YOU OPEN!", "I'LL RIP YOUR HEAD OFF!", 'COME ON, THEN!'],
  revenge: ['YOU KILLED HIM!', 'YOU SON OF A BITCH!', "YOU'LL PAY FOR THAT!", "I'LL TEAR YOU APART!", 'HE WAS MY FRIEND!', 'MURDERER!'],
  flush: ['COME OUT, COWARD!', 'SHOW YOUR FACE!', "I KNOW YOU'RE THERE!", "YOU CAN'T HIDE!", 'COME OUT AND DIE!'],
  hunt: ['AFTER HIM!', "DON'T LET HIM RUN!", 'GET HIM!', 'HE WENT THAT WAY!'],
  lost: ['WHERE IS HE?', 'SPREAD OUT!', 'FIND HIM!'],
  reload: ['RELOADING!', 'COVER ME!'],
  dry: ["I'M OUT!"],
  body: ['MAN DOWN!', 'OH GOD...', "HE'S DEAD!", 'JESUS...'],
  wake: ['GET UP!', 'ON YOUR FEET!'],
  help: ['HELP!', 'I NEED A HAND!'],
  panic: ['AAAH!', "HE'S CRAZY!", "HE'S NOT HUMAN!", 'NO NO NO!'],
  // the last man standing gives up (Enemy.surrender), then begs for as long as the killer stands over him
  yield: ["DON'T SHOOT!", 'I GIVE UP!', "I'M DONE! I'M DONE!"],
  beg: ['PLEASE!', "DON'T KILL ME!", 'I GOT KIDS, MAN!', 'I NEVER SAW YOU!', 'TAKE WHATEVER YOU WANT!', 'NOT LIKE THIS...', "I'M BEGGING YOU!"],
};

// occasions yelled out loud (a recorded shout goes with the line)
export const SHOUTED = new Set([
  'shots', 'panic', 'body', 'lost', 'help', 'dry', 'reload', 'wake', 'warn', 'threat', 'brawl', 'revenge', 'flush', 'hunt',
]);

// occasions not written in white (PALETTE keys)
export const BARK_TONE = {
  contact: 'pink', panic: 'pink', snap: 'pink', threat: 'pink', brawl: 'pink', revenge: 'pink',
  body: 'orange', help: 'orange', warn: 'orange', flush: 'orange', yield: 'yellow', beg: 'yellow',
};
