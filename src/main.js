import Game from './core/Game.js';

const game = new Game(document.getElementById('game'));
game.init();

// handy in the console
window.game = game;
