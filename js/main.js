// econhub · main.js — punto de entrada: inicializa todos los módulos
import { initApp, store } from './app.js';
window.store = store;
import { initAgenda } from './agenda.js';
import { initChat } from './chat.js';
import { initLinks } from './links.js';
import { initMusic } from './music.js';
import { initUdea } from './udea.js';
import { initPdfEditor } from './pdf-editor.js';
import { initTools } from './tools.js';
import { initOcr } from './ocr.js';
import { initToolsEcon } from './tools-econ.js';
import { initCalc } from './calc.js';
import { initPlotter } from './plotter.js';
import { initGameTree } from './game-tree.js';
import { initGrades } from './grades.js';
import { initRepaso } from './repaso.js';
import { initWhiteboard } from './whiteboard.js';

await initApp();

const inits = [
  initPdfEditor, initTools, initOcr, initUdea, initAgenda,
  initChat, initLinks, initMusic, initToolsEcon, initCalc,
  initPlotter, initGameTree, initGrades, initRepaso, initWhiteboard
];
inits.forEach(fn => {
  try { fn(); }
  catch(e) { console.error('[init]', fn.name, e.message || e); }
});
