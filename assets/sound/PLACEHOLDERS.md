# Placeholder sounds

Sound names the game already plays through the normal Audio path (`world.sound(name)` / `FOLEY` and `META` in
src/audio/Audio.js) but that have no real recording yet: each is mapped to the closest cut of the recorded foley bank
or kept silent (`[]`). Replace the mapping when the SFX library is bought. One line each: name, trigger, wanted sound.

| name | trigger | wanted sound |
| --- | --- | --- |
| clutterClink | a glass, a shot glass or a pint knocked off a table or the counter that lands whole (systems/Clutter.js) | a small glass clinking on a wooden floor |
| clutterShatter | a glass, a pitcher or a bottle on the furniture shot where it stands, or smashing where it lands (systems/Clutter.js) | a small drinking glass bursting, a splash of drink |
| clutterBottle | a bottle or a pitcher thrown off that lands whole (systems/Clutter.js) | a glass bottle hitting the floor and rolling a moment |
| clutterAshtray | a glass ashtray or a bowl of peanuts knocked off (systems/Clutter.js) | a heavy glass ashtray clunking down, ash and butts scattering |
| clutterChips | poker chips thrown off the card table (systems/Clutter.js) | a handful of clay chips scattering and clicking on the floor |
| clutterTill | the till knocked off the counter (systems/Clutter.js) | a cash register crashing down, its bell and the drawer's coins |
| clutterPaper | cards, a napkin, banknotes blown off a table (systems/Clutter.js) | a soft flutter of paper |
| scrapeWood | a wooden prop (chair, crate, sandwich board) pushed or sliding over the floor (systems/PropPhysics.js, data/physics.js SCRAPE) | wooden legs or a crate juddering and scraping over boards / tiles / concrete, short (0.3 s), loudness by speed and weight |
| scrapeMetal | a metal prop (gas bottle, keg, bin, ash urn, jerrycan) dragged over the floor | a steel base grinding over the floor, a hollow can's rim scraping, short (0.3 s) |
| scrapePlastic | a plastic prop (TV, cash case) dragged over the floor | a plastic case sliding and squeaking on the floor, short |
| scrapeCeramic | a ceramic prop (a potted plant) dragged over the floor | a heavy pot grinding over tiles or concrete, short |
| dragSoft | a soft prop (a bin bag) dragged along (silent for now) | a full plastic bag rustling and dragging over the ground |
| rollMetal | a lying metal can or bottle rolling across the floor (silent for now) | a hollow metal cylinder rolling over concrete, a low rumble with small knocks |
| holster | a guard's hand closes on a pistol or a knife on his hip, or puts it back (Enemy.updateCarry) | leather holster draw / snap, a blade out of a sheath |
| sling | a guard takes a long gun off his back, or slings it back (Enemy.updateCarry) | sling strap and swivel rattle, the gun swung round in the hands |
| doorPush | a hand comes flat against a door leaf and pushes it (Character.updateDoorHand) | a palm on a wooden door, the leaf giving |
| doorLatch | a door comes shut slowly and its latch catches: a closer bringing it back, a hand pulling it to (Door.latchShut) | a door latch clicking home in its strike plate, the leaf settling in the frame (now: the click cut low, a touch of the door) |
| doorCloserHiss | a door's hydraulic closer swinging it back shut (Door.hiss, data/doors.js `closer`) | the soft hydraulic sigh of a door closer, a faint creak of its arm (now: the swish cut slowed right down, very low) |
| lockBeep | the lamp by a lock turns green once a guard's key has turned in it (Door.tickLamp) | a short electronic beep of an access control, or a lock's bolt drawn back with a clack (now: the click cut pitched up) |
| cloth | the shoulders whip round on a quick turn (Character.animate, FACING.cloth) | a short cloth / coat rustle |
| scuff | a foot set down on a pivot step or a hop round (Character.animate) | a shoe scuffing on the floor (per floor if the library has them) |
| curtainBrush | someone walks or runs into a curtain (systems/Curtains.js) | heavy velvet brushing over shoulders, a soft drag of cloth |
| curtainRings | the curtain's rings run along the rod as it parts or falls back | brass rings sliding on a brass rod, a light metallic rattle |
| curtainWhoosh | something fast (a body thrown, a slide) goes through a curtain | a heavy cloth whoosh, the velvet thrown aside |
| kneeShot | a round into a knee, on a man down or from behind (Player.landBeat, landTakedown) | a bullet through a kneecap: a wet crack of bone under the shot |
| boneCrack | a club brought down on a knee, or into the back of one (Player.landBeat, landTakedown) | a long bone or a kneecap breaking under a bat, dry and short |
| stomp | a heel driven down on the head of a man on the floor (finishers `curb`, `heel`) | a boot stamping on a skull against concrete, a crunch under it |
| skullSlam | a head lifted and beaten on the floor, a weapon's butt driven down on it (finishers `fists`, `slam`, `pile`) | a skull hitting the floor, dull and wet, heavier each time |
| throatCut | a blade drawn slowly across a throat (finisher `slit`) | a slow wet cut, a gargle |
| bladeTwist | a blade twisted in a wound, or torn out of it (finisher `gut`, takedown `kidney`) | a knife turned in flesh, then pulled out with a suck |
| handPlant | the speed vault's hand comes down flat on a table, a counter, a crate (Character.updateVault, TRAVERSE.vault.plant) | a palm slapped on wood / metal / stone (per material if the library has them) |
| vaultSwish | the coat swung over the obstacle in the same vault (Character.updateVault) | a quick heavy cloth / coat whoosh |
| landThud | the feet coming down after a vault or a drop (Character.updateVault) | a two-footed landing thud with a shoe scuff, per floor |
| slideScrape | the start of the player's slide (Player.startSlide), over the synthesized slide | denim and a shoe sole scraping along concrete / wood / tiles, falling off in a half second |
| cashFlutter | banknotes lying on the floor lifted by someone running through them, a round passing, a muzzle blast or an explosion (systems/Litter.js) | a few paper bills flipping and fluttering, very soft |
| fluteClink | a champagne flute knocked off a table landing whole, or one lying on the floor kicked (systems/Clutter.js, systems/Litter.js) | a thin crystal flute clinking and rolling on a carpet |
| fluteShatter | a champagne flute shot where it stands or lies, or smashing where it lands (systems/Clutter.js, systems/Litter.js) | a thin crystal flute bursting, a light splash |
| bucketKnock | the champagne bucket knocked off the VIP room's table lands (systems/Clutter.js) | a steel ice bucket clanging down, ice cubes skittering, water sloshing out |
| headSlamWood | a man's face slammed down on a table, a counter, a crate (a takedown with a spot: Player.slamFx) | a skull hitting a wooden table top hard, glasses on it jumping, a grunt knocked out of him |
| headSlamWall | a man's face smashed into a wall (a takedown: WALL SMASH) | a head driven into plaster / brick, a dull crack, plaster crumbling |
| headSlamMetal | a man's face brought down on a steel sink or a stove (a takedown: SINK) | a skull on a steel edge, a dull clang ringing in the basin |
| headSlamPorcelain | a man's face smashed into a urinal (a takedown: URINAL) | a head on porcelain, a hard knock and a crack in it |
| toiletDunk | a man's head dunked into a toilet bowl (a takedown: TOILET) | a head plunged into a toilet, a splash and a knock on the porcelain, a gurgle |
| kickWhoosh | the player pops up out of a slide's end into a kick at a guard ahead (Player.startKick) | a leg whipped through the air, a coat's flap with it |
| kickHit | the foot lands in a guard's head, out of a slide or off a car's hood (Player.footOn) | a boot heel smacking into a jaw, heavy and dry, the man's grunt cut short |
| hoodLean | a guard sits back against a parked car's hood (Enemy.updatePosture, body 'hood') | a body settling on sheet metal, the car's springs giving a little, jeans on paint |
| arsonLaugh | the man who poured the petrol laughs at him before he lights it (systems/Tutorial.js, the prologue's opening) | a man's short hard laugh, three bursts, in a small room |
| fireRun | the fire's front racing along a trail of petrol (systems/FireSpread.js) | a whoosh of petrol catching and running, 0.5 s |
| fireRoar | a room on fire, heard now and then while a lot of it burns (systems/Fires.js) | the low roar and rush of a big indoor fire, loopable |
| heatCrack | a window pane cracking in the heat of the fire before it bursts (systems/FireSpread.js) | glass ticking and cracking under heat, then a sharp crack |
| batSnap | the player's bat (or cue) snaps in two on the blow that uses it up (Character.breakWeapon `snap`) | a wooden baseball bat cracking in two over a skull: a dry splintering crack, the barrel's knock as it flies off |
| knifeSnap | the player's knife breaks at the guard, its blade left in what it struck (Character.breakWeapon `lodge`) | a steel blade snapping at the tang: a sharp metallic ping and the click of the handle letting go |
| snatch | the player takes a dead guard's weapon into his hand as the man goes down (Player.grab) | a hand slapping onto a gun and closing on it, a quick leather-and-steel rattle, a twirl's swish |
| bossCard | a boss's name card slams in the first time he sees the player (entities/Boss.js bossLine, ui/KillFeed.js card) | a heavy cinematic slam / stinger: a low hit with a metallic tail, 0.6 s |
| bossHowl | the boss takes his FIRST hit and is only wounded (entities/Boss.js wound) | a big man's howl of pain, raw and short (0.9 s) |
| bossRoar | wounded, he throws his head back and goes berserk; again with each of his roared lines (Boss.goBerserk, update) | a furious male roar, throat torn, 1 s; two or three takes |
| bossShake | the boss throws the player off when seized from behind while still whole (Boss.shakeOff) | a grunt, cloth yanked, a body shoved hard |
| bossDeath | the boss's second hit: he dies (Boss.kill) | a heavy man's last bellow dying into a groan, then his knees hitting the floor |
| shadesDrop | his shades come off as he dies and skitter over the floor (Boss.kill, the Debris' tick) | plastic sunglasses clattering and skidding on a hard floor |
