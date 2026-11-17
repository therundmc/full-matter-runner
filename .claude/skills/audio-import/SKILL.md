---
name: audio-import
description: Bring a bought (paid) sound-effect or music pack into FULL MATTER RUNNER - keep its files out of the
  repo, read its licence, build sounds through tools/sounds.json + tools/build_sounds.mjs, wire music stems behind
  the Music.js API, credit it in assets/sound/CREDITS.md, run the audio tests and listen in game. Use when the user
  has purchased a pack or asks to replace a synthesized sound or the synthesized music. FIRST DRAFT: refine it on
  the first real pack.
---

# audio-import: a bought pack into the game

Direction: sounds and music come from paid packs; no new synthesized sound. What is synthesized today is temporary
(sounds: src/audio/Foley.js, Synth.js, Beds.js, the synthesized part of Audio.js; music: Synthwave.js, groove/,
score.js, tracks/). NOTE: this skill was written before any paid pack came in; update it with what the first one
teaches (folder layout, file names, licence wording, loudness).

## 1. Where the pack lives

- Unzip it OUTSIDE the repo, or in a folder listed in .gitignore (add one, e.g. `packs/`, if needed).
- Paid source files are usually NOT redistributable: never commit them. Only the cuts the game ships (foley.wav,
  shots, music files) go in assets/sound/, and only if the licence allows shipping them inside a game.

## 2. Licence

Read the licence file / the vendor page. Note: title, author, vendor, licence name, URL, whether redistribution in a
game build is allowed, whether credit is required. Unclear or forbidding: stop and ask the user.

## 3a. Sound effects

tools/build_sounds.mjs (usage: `node tools/build_sounds.mjs <packs-dir> [browser]`) reads tools/sounds.json:
- `packs`: folder name under <packs-dir> -> author. It walks each folder recursively and finds files by STEM
  (name without extension; wav / ogg / mp3 / flac, best format kept). A stem found in two packs is an error.
- `sets`: game sound name -> list of stems, or `[stem, start, end]` (seconds) to cut a piece.
It decodes in headless Edge, cuts, cleans, levels, and rewrites assets/sound/foley.wav and src/audio/bank.js
(generated: never edit). Every pack listed must be present in <packs-dir> at build time, the old CC0 packs too.
A paid pack is not an opengameart folder: give it a folder name of its own under <packs-dir>, check its stems do not
clash, and adapt build_sounds.mjs only if its layout needs it (say so in the report).
Gunshots are separate files in assets/sound/shots/ (paths in Audio.js).

Replacing a synthesized sound: find where Audio.js / Foley.js plays it, point it at a bank set instead, and remove
the synthesis once the recording is liked. Before blaming a sound's level, check voice admission (`_admit`).

## 3b. Music

Keep the public API of src/audio/Music.js: setTrack, start, stop, setIntensity(0..1), setCombat(on), setCombo(n),
setJukebox(0..1). A recorded track needs stems / layers by intensity: calm, tension, fight, kill chain (combo
stages), looped on bar lines. Plan: a new engine beside Synthwave and Groove, chosen in `Music._player` from the
track's `engine` in src/audio/tracks/index.js, that crossfades its stems from those calls. Design it with the user
on the first real pack before writing it.

## 4. Credits

Add the pack to assets/sound/CREDITS.md: title, author, vendor, licence (and URL), what it is used for. Update the
README's Credits paragraph if what is synthesized changes.

## 5. Tests

```
node --test tests/audio.test.mjs tests/groove.test.mjs tests/ambience.test.mjs tests/motor.test.mjs
npm test
```

audio.test.mjs checks that every sound the game asks for plays from a cut inside the foley bank.

## 6. Listen

`npm start`, play the situations that use the new sounds (or `?level=lab`, F1 sandbox). Ask the user how it
sounds: nobody else can judge it. Then the `check` skill (bank.js changed WITH sounds.json / build_sounds.mjs).
