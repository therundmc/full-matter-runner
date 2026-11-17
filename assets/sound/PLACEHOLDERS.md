# Placeholder sounds

Sound names the game already plays through the normal Audio path (`world.sound(name)`, mix in `META` of
src/audio/Audio.js) but that have no real recording yet: each is mapped to the closest cut of the foley bank
(`FOLEY` in Audio.js) or kept silent (`[]`). Replace the mapping when the SFX library comes in.

| name | trigger | wanted sound |
| --- | --- | --- |
| scrapeWood | a wooden prop (chair, crate, sandwich board) pushed or sliding over the floor (systems/PropPhysics.js, data/physics.js SCRAPE) | wooden legs or a crate juddering and scraping over boards / tiles / concrete, short (0.3 s), loudness by speed and weight |
| scrapeMetal | a metal prop (gas bottle, keg, bin, ash urn, jerrycan) dragged over the floor | a steel base grinding over the floor, a hollow can's rim scraping, short (0.3 s) |
| scrapePlastic | a plastic prop (TV, cash case) dragged over the floor | a plastic case sliding and squeaking on the floor, short |
| scrapeCeramic | a ceramic prop (a potted plant) dragged over the floor | a heavy pot grinding over tiles or concrete, short |
| dragSoft | a soft prop (a bin bag) dragged along (silent for now) | a full plastic bag rustling and dragging over the ground |
| rollMetal | a lying metal can or bottle rolling across the floor (silent for now) | a hollow metal cylinder rolling over concrete, a low rumble with small knocks |
