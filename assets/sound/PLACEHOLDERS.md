# Placeholder sounds

Sounds the game already plays through the normal Audio path (`world.sound(name)`, mix in `META`, layers in `FOLEY`
of src/audio/Audio.js) but stands in for with the nearest cut of the foley bank, until the bought SFX library.
One line each: name, when it plays, the sound wanted.

- `holster`: a guard's hand closes on a pistol or a knife on his hip, or puts it back (Enemy.updateCarry); wanted: leather holster draw / snap, a blade out of a sheath.
- `sling`: a guard takes a long gun off his back, or slings it back (Enemy.updateCarry); wanted: sling strap and swivel rattle, the gun swung round in the hands.
- `doorPush`: a hand comes flat against a door leaf and pushes it (Character.updateDoorHand); wanted: a palm on a wooden door, the leaf giving.
- `cloth`: the shoulders whip round on a quick turn (Character.animate, FACING.cloth); wanted: a short cloth / coat rustle.
- `scuff`: a foot set down on a pivot step or a hop round (Character.animate); wanted: a shoe scuffing on the floor (per floor if the library has them).
- `handPlant`: the speed vault's hand comes down flat on a table, a counter, a crate (Character.updateVault, TRAVERSE.vault.plant); wanted: a palm slapped on wood / metal / stone (per material if the library has them).
- `vaultSwish`: the coat swung over the obstacle in the same vault (Character.updateVault); wanted: a quick heavy cloth / coat whoosh.
- `landThud`: the feet coming down after a vault or a drop (Character.updateVault); wanted: a two-footed landing thud with a shoe scuff, per floor.
- `slideScrape`: the start of the player's slide (Player.startSlide), over the synthesized slide; wanted: denim and a shoe sole scraping along concrete / wood / tiles, falling off in a half second.
