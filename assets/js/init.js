import { initGame } from './game.js';
import { initGUI } from './gui.js';
import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-compat';


window.addEventListener('DOMContentLoaded', () => {
  initGUI();
  if (typeof RAPIER !== 'undefined') {
    RAPIER.init().then(() => initGame(RAPIER));
  } else {
    console.warn('RAPIER not loaded, retrying…');
    setTimeout(() => window.location.reload(), 100);
  }
});
