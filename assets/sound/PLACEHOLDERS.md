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
| cloth | the shoulders whip round on a quick turn (Character.animate, FACING.cloth) | a short cloth / coat rustle |
| scuff | a foot set down on a pivot step or a hop round (Character.animate) | a shoe scuffing on the floor (per floor if the library has them) |
| curtainBrush | someone walks or runs into a curtain (systems/Curtains.js) | heavy velvet brushing over shoulders, a soft drag of cloth |
| curtainRings | the curtain's rings run along the rod as it parts or falls back | brass rings sliding on a brass rod, a light metallic rattle |
| curtainWhoosh | something fast (a body thrown, a slide) goes through a curtain | a heavy cloth whoosh, the velvet thrown aside |
| handPlant | the speed vault's hand comes down flat on a table, a counter, a crate (Character.updateVault, TRAVERSE.vault.plant) | a palm slapped on wood / metal / stone (per material if the library has them) |
| vaultSwish | the coat swung over the obstacle in the same vault (Character.updateVault) | a quick heavy cloth / coat whoosh |
| landThud | the feet coming down after a vault or a drop (Character.updateVault) | a two-footed landing thud with a shoe scuff, per floor |
| slideScrape | the start of the player's slide (Player.startSlide), over the synthesized slide | denim and a shoe sole scraping along concrete / wood / tiles, falling off in a half second |
| cashFlutter | banknotes lying on the floor lifted by someone running through them, a round passing, a muzzle blast or an explosion (systems/Litter.js) | a few paper bills flipping and fluttering, very soft |
| fluteClink | a champagne flute knocked off a table landing whole, or one lying on the floor kicked (systems/Clutter.js, systems/Litter.js) | a thin crystal flute clinking and rolling on a carpet |
| fluteShatter | a champagne flute shot where it stands or lies, or smashing where it lands (systems/Clutter.js, systems/Litter.js) | a thin crystal flute bursting, a light splash |
| bucketKnock | the champagne bucket knocked off the VIP room's table lands (systems/Clutter.js) | a steel ice bucket clanging down, ice cubes skittering, water sloshing out |
| arsonLaugh | the man who poured the petrol laughs at him before he lights it (systems/Tutorial.js, the prologue's opening) | a man's short hard laugh, three bursts, in a small room |
| fireRun | the fire's front racing along a trail of petrol (systems/FireSpread.js) | a whoosh of petrol catching and running, 0.5 s |
| fireRoar | a room on fire, heard now and then while a lot of it burns (systems/Fires.js) | the low roar and rush of a big indoor fire, loopable |
| heatCrack | a window pane cracking in the heat of the fire before it bursts (systems/FireSpread.js) | glass ticking and cracking under heat, then a sharp crack |
