import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.boot();
window.game = game; // console di sviluppo