# FULL MATTER RUNNER

Top-down, ultra-violent, one-hit-kill action game in the browser.
Physics by [matter.js](https://brm.io/matter-js/), rendering on a custom Canvas2D pipeline.

## Run

ES modules need an HTTP server:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Controls

| Key | Action |
|---|---|
| WASD / ZQSD | Move |
| Mouse | Aim |
| Left click | Shoot / swing / punch |
| Right click | Throw the weapon (knocks enemies down), or pick one up |
| E | Pick up / swap weapons |
| Space | Execute a knocked-out enemy |
| Shift | Look further ahead |
| R | Reload (restart once dead) |
| Backspace | Instant restart |
| Esc | Pause |
| M | Music on/off |
| F2 / F3 | Debug: enemy vision cones / whole-level overview |

## Rules

- One hit kills, for you and for them.
- Guns have magazines. R reloads; clicking on an empty gun reloads it, or, with no spare rounds left,
  hurls it at the enemy John Wick style. Walk over ammo boxes (and what guards drop) to refill.
- Punches, thrown weapons and doors slammed into enemies knock them out. Finish them with Space.
- Your gunshots alert guards nearby. The silenced uzi doesn't.
- Red barrels explode and set off other barrels.
- Cars: shoot the tyres flat, crack then smash the windows, puncture the tank (fuel leak), set off the alarm
  (it draws the guards), then the engine smokes, catches fire and the car blows up into a burning wreck.
- Dead bodies are ragdolls: shoot or blast them and limbs come off.
- Everything breaks: walls crack then collapse (bullets, melee, explosions), doors get ripped off their hinges,
  furniture splinters, fences and windows shatter.
- Debris is dangerous: shoot a window and the shards slice whoever stands behind it; blast debris knocks guards out.
- Clear the floor, then get back to the car.

## Project layout

```
src/
  core/      Game loop & state machine, Input, Camera, Audio (WebAudio SFX), Music (procedural synthwave),
             Assets, Raycast, Pathfinding (A*), Config (tuning)
  world/     World (simulation, bullet tracing, explosions, scoring), TileMap (ASCII map, decals), Level (loader)
  entities/  Character, Player, Enemy (AI), Projectile, WeaponItem, Prop, Door, Window, Debris, Corpse
  fx/        Particles, Gore
  ui/        HUD, Screens, Text
  data/      weapons.js, props.js, levels/level1.js
tools/
  generate_assets.py   regenerates every sprite in assets/sprites (Pillow, deterministic)
```

## Making levels

A level is a JS module (see `src/data/levels/level1.js`) with three layers:

- **tiles**: one char per 32 px tile.
  - Walls: `#` interior wall, `X` brick wall, space = void (solid).
  - Floors: `.` wood, `,` checker, `+` blue tile, `:` red carpet, `;` purple carpet, `_` concrete, `"` grass, `=` asphalt, `-` road line, `~` dirt, `s` sidewalk, `*` neon dancefloor.
  - Structure: `D` door (a 2-tile run becomes double doors), `G` window, `F` fence.
- **actors**: same grid.
  - `@` is the player.
  - Enemies: `p` pistol, `u` uzi, `s` silenced uzi, `h` shotgun, `r` rifle, `b` bat, `k` knife. Uppercase makes the enemy patrol.
  - Weapons on the floor: `1`–`9`, see `WEAPON_CHARS` in `src/data/weapons.js`.
  - Ammo boxes: `n` 9mm, `g` 12 gauge, `v` 7.62, `q` rockets.
  - Small props: `x` barrel, `c` crate, `t` trash can.
- **props**: `[type, x, y, rotationDeg]` in tile units, where a tile's centre is `n + 0.5`.
  Vehicles (`car`, `car2`, `van`) go in this list too.

Also set `exit`, and optionally `facing` overrides for guards (`"col,row": degrees`).

## Credits

Gun sounds (c) Michel Baradari, apollo-music.de, CC BY 3.0 (opengameart.org).
All other sounds and the music are synthesized at runtime.
