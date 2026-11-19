// What kind of build this is. release: flip to true for a shipped build (the demo): the developer's tools then do
// nothing (the F1-F7 debug keys, window.game, the URL switches ?level= ?killcam= ?mark= ?post=), unless the page is
// opened with ?dev=1. The QA robot and tools/shot.mjs drive window.game: they run on a build with release false.
export const BUILD = { release: false };

// the debug keys a release build ignores (Game.advance drops their presses)
export const DEV_KEYS = ['F1', 'F2', 'F3', 'F4', 'F6', 'F7'];

const here = () => globalThis.location?.search ?? '';

// the developer's tools are on: any build but a release, or a release opened with ?dev=1
export const devMode = (search = here(), build = BUILD) => !build.release || new URLSearchParams(search).get('dev') === '1';

// a developer's URL switch (?level=lab, ?killcam=off...): its value, null when absent or when the tools are off
export const devParam = (name, search = here(), build = BUILD) => (devMode(search, build) ? new URLSearchParams(search).get(name) : null);
