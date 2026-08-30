// 4D-MC :: entry point ----------------------------------------------------

import { Game } from './game/game.js';

const dom = {
  glCanvas: document.getElementById('gl'),
  hudCanvas: document.getElementById('hud'),
  menuRoot: document.getElementById('menu'),
  invRoot: document.getElementById('inventory'),
  loadingRoot: document.getElementById('loading'),
};

const game = new Game(dom);
window.__game = game;

game.boot().catch((err) => {
  console.error(err);
  const f = document.getElementById('fatal');
  f.innerHTML = `<div>
    <h2>4D-MC could not start</h2>
    <p>This game needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari.</p>
    <pre>${(err && err.stack) || err}</pre></div>`;
  f.classList.add('visible');
});

window.addEventListener('beforeunload', () => {
  try { if (game.inGame) game.saveGame(); } catch (_) { /* best effort */ }
});
