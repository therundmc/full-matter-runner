// Loads the vendored Matter.js (UMD) as a global, like the browser <script> tag, before importing game modules.
// The package is "type": "module", so evaluate the UMD bundle by hand with a CommonJS-style module object.
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../libraries/matter.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'exports', code)(mod, mod.exports);
globalThis.Matter = mod.exports;

export const load = (path) => import(new URL(`../src/${path}`, import.meta.url));
