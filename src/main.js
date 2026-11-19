import Game from './game/Game.js';
import { devMode } from './game/data/build.js';

const game = new Game(document.getElementById('game'));
game.init();

// handy in the console (and what the QA robot and tools/shot.mjs drive): not in a release build
if (devMode()) window.game = game;
