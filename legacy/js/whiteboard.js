// econhub · whiteboard.js — Tablero estilo hand-drawn (Excalidraw embebido, sin build)
// Sin colaborativo. Carga bajo demanda desde CDN, tematizado econhub,
// multi-tablero con IndexedDB, LaTeX (KaTeX→imagen), importación de la
// graficadora y plantillas de economía.
import { $, store, toast, bus } from './app.js';
import { PALETTE, uid } from './data.js';
import { BOARD_TEMPLATES } from './whiteboard-templates.js';

const EXC_VER = '0.18.1';
const EXC_BASE = `https://esm.sh/@excalidraw/excalidraw@${EXC_VER}`;
const EXC_CSS = `${EXC_BASE}/dist/prod/index.css`;
const EXC_ASSETS = `${EXC_BASE}/dist/prod/`;
const REACT_VER = '19';
const KATEX_VER = '0.16.21';
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/katex.min.css`;
const KATEX_JS = `https://esm.sh/katex@${KATEX_VER}`;
const KATEX_FONT_BASE = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VER}/dist/fonts/`;

let Ex = null;
let React = null;
let ReactDOMClient = null;
let katexMod = null;
let api = null;
let reactRoot = null;
let mounted = false;
// El panel de herramienta se abre solo (como el nativo al seleccionar),
// salvo que el usuario lo cierre explícitamente.
let propsClosedByUser = false;
let lastSelKey = '';
let lastToolType = '';
let mountPromise = null;
let applyingRemote = false;
let saveTimer = null;
let currentTheme = document.documentElement.getAttribute('data-theme') || 'oscuro';
let toolbarCollapsed = !!store.get('econhub:boardToolbarCollapsed');

let libraryItemsMath = [];
let libraryItemsTeacher = [];
let importedLibraries = [];
let activeLibFilter = 'all';
let presetSearchQuery = '';

// Tableros en memoria + IndexedDB propia (no toca econhub_db)
let boards = [];
let activeId = null;

const DB_NAME = 'econhub_boards';
const DB_STORE = 'boards';

function openBoardsDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB no soportado'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('No se pudo abrir la base de tableros'));
  });
}

async function idbAll() {
  try {
    const db = await openBoardsDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const rq = tx.objectStore(DB_STORE).getAll();
      rq.onsuccess = () => resolve(rq.result || []);
      rq.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function idbPut(record) {
  try {
    const db = await openBoardsDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

async function idbDel(id) {
  try {
    const db = await openBoardsDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

function currentSiteTheme() {
  return document.documentElement.getAttribute('data-theme') || currentTheme || 'oscuro';
}

function boardTheme() {
  const t = currentSiteTheme();
  return (t === 'claro' || t === 'cafe') ? 'light' : 'dark';
}

function isBoardDark() {
  return boardTheme() === 'dark';
}


// Fondo del lienzo = fondo suave del tema en vivo (siempre afín a la página).
// El lienzo Excalidraw va transparente; el PNG exportado hornea este color.
function boardBackground() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--bg-soft').trim();
    if (v) return v;
  } catch {}
  return '#14161b';
}

function ensureCss(href) {
  return new Promise((resolve) => {
    let link = document.querySelector(`link[href="${href}"]`);
    if (link && link.dataset.loaded) return resolve();
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    const done = () => { link.dataset.loaded = '1'; resolve(); };
    link.addEventListener('load', done, { once: true });
    link.addEventListener('error', done, { once: true });
    setTimeout(resolve, 2500);
  });
}

async function loadVendor() {
  if (Ex && React && ReactDOMClient) return;
  ensureCss(EXC_CSS);
  window.EXCALIDRAW_ASSET_PATH = EXC_ASSETS;
  const [exMod, reactMod, rdomMod] = await Promise.all([
    import(/* @vite-ignore */ EXC_BASE),
    import(/* @vite-ignore */ `https://esm.sh/react@${REACT_VER}`),
    import(/* @vite-ignore */ `https://esm.sh/react-dom@${REACT_VER}/client`),
  ]);
  Ex = exMod;
  React = reactMod.default || reactMod;
  ReactDOMClient = rdomMod;
}

async function loadBoards() {
  const rows = await idbAll();
  boards = rows.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  if (!boards.length) {
    const b = {
      id: uid(), name: 'Mi primer tablero',
      elements: [], appState: null, files: {},
      updatedAt: Date.now(),
    };
    boards = [b];
    await idbPut(b);
  }
  const last = store.get('econhub:boardActive', null);
  activeId = boards.some((b) => b.id === last) ? last : boards[boards.length - 1].id;
}

function activeBoard() {
  return boards.find((b) => b.id === activeId) || boards[0] || null;
}

// Copia profunda: NUNCA guardar referencias vivas de Excalidraw.
// Si se guardaran, sus mutaciones internas (drag/resize) alterarían el
// tablero guardado y al volver verías geometría inconsistente.
const deepClone = (v) => { try { return JSON.parse(JSON.stringify(v ?? null)); } catch { return null; } };

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { persistActive().catch(() => {}); }, 900);
}

function cancelPendingSave() { clearTimeout(saveTimer); saveTimer = null; }

async function persistActive() {
  if (!api) return;
  const b = activeBoard();
  if (!b) return;
  try {
    const st = api.getAppState();
    b.elements = deepClone(api.getSceneElements()) || [];
    b.appState = {
      theme: st.theme,
      gridSize: st.gridSize,
      // Vista por tablero: al volver, cada tablero abre donde lo dejaste
      scrollX: st.scrollX,
      scrollY: st.scrollY,
      zoom: st.zoom?.value ?? 1,
    };
    b.files = deepClone(api.getFiles()) || {};
    b.updatedAt = Date.now();
    await idbPut(deepClone(b));
    store.set('econhub:boardActive', b.id);
  } catch (e) { /* persistencia es mejor-esfuerzo */ }
}

function scheduleLayoutRefresh() {
  if (!api) return;
  try {
    requestAnimationFrame(() => { try { api.refresh(); } catch {} });
    setTimeout(() => { try { api.refresh(); } catch {} }, 80);
    setTimeout(() => { try { api.refresh(); } catch {} }, 220);
  } catch {}
}

function renderTabs() {
  const box = $('#boardTabs');
  if (!box) return;
  box.innerHTML = boards.map((b) => `
    <button class="board-tab ${b.id === activeId ? 'active' : ''}" data-board="${b.id}" title="Abrir ${b.name} (doble clic para renombrar)">
      <i class="ri-artboard-line"></i><span class="board-tab-name">${b.name}</span>
      <span class="board-tab-del" data-boarddel="${b.id}" title="Eliminar (clic 2 veces)"><i class="ri-close-line"></i></span>
    </button>`).join('') + `
    <button class="board-tab board-tab-add" id="boardAdd" title="Nuevo tablero"><i class="ri-add-line"></i></button>`;
  scheduleLayoutRefresh();
}

function viewportCenter() {  try {
    const st = api.getAppState();
    const zoom = st.zoom?.value || 1;
    return {
      x: (st.width / 2 / zoom) - st.scrollX,
      y: (st.height / 2 / zoom) - st.scrollY,
    };
  } catch { return { x: 0, y: 0 }; }
}

function applyScene(board) {
  if (!api || !board) return;
  applyingRemote = true;
  try {
    // Clon antes de restaurar: restoreElements no debe tocar los datos guardados
    const elements = Ex.restoreElements(deepClone(board.elements) || [], null);
    if (board.files && Object.keys(board.files).length) {
      try { api.addFiles(Object.values(deepClone(board.files))); } catch {}
    }
    const saved = board.appState || {};
    const hasView = Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY);
    api.updateScene({
      elements,
      appState: {
        theme: boardTheme(),
        // Transparente siempre: el fondo lo da .board-canvas-wrap (CSS por tema)
        viewBackgroundColor: 'transparent',
        ...(hasView ? { scrollX: saved.scrollX, scrollY: saved.scrollY, zoom: { value: Number.isFinite(saved.zoom) ? saved.zoom : 1 } } : {}),
      },
    });
    // Solo encuadrar si el tablero no tenía vista guardada (evita saltos de zoom
    // que hacían ver los elementos "distorsionados" al cambiar de tablero).
    if (!hasView) {
      try {
        const els = api.getSceneElements();
        if (els.length && api.scrollToContent) api.scrollToContent(els, { fitToContent: true, maxZoom: 1 });
      } catch {}
    }
  } finally {
    setTimeout(() => { applyingRemote = false; }, 120);
  }
}

// Restaura la vista (zoom/scroll) del tablero sin tocar los elementos.
// Se usa al volver a la página: la sección oculta deja el contenedor en 0x0
// y Excalidraw pierde el encuadre.
function restoreView(board) {
  if (!api || !board) return;
  const saved = board.appState || {};
  const apply = () => {
    try {
      if (Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY)) {
        api.updateScene({
          appState: {
            scrollX: saved.scrollX,
            scrollY: saved.scrollY,
            zoom: { value: Number.isFinite(saved.zoom) ? saved.zoom : 1 },
          },
        });
      }
    } catch {}
  };
  // El contenedor acaba de pasar de 0x0 a su tamaño real: hay que esperar
  // un frame (y un margen) para que Excalidraw recalcule antes de fijar la vista.
  try { window.dispatchEvent(new Event('resize')); } catch {}
  requestAnimationFrame(() => { apply(); try { window.dispatchEvent(new Event('resize')); } catch {} });
  setTimeout(apply, 200);
}

// Token: si el usuario cambia de tablero varias veces rápido, solo el último
// cambio debe aplicarse (persistActive es asíncrono y podían intercalarse).
let sceneToken = 0;

async function switchBoard(id) {
  if (id === activeId || !api) return;
  const token = ++sceneToken;
  cancelPendingSave();
  await persistActive();
  if (token !== sceneToken) return;
  if (boards.some((b) => b.id === id)) {
    activeId = id;
    store.set('econhub:boardActive', id);
    renderTabs();
    applyScene(activeBoard());
  }
}

async function createBoard(name) {
  const token = ++sceneToken;
  cancelPendingSave();
  await persistActive();
  if (token !== sceneToken) return;
  const b = {
    id: uid(),
    name: name || `Tablero ${boards.length + 1}`,
    elements: [], appState: null, files: {},
    updatedAt: Date.now(),
  };
  boards.push(b);
  activeId = b.id;
  store.set('econhub:boardActive', b.id);
  await idbPut(JSON.parse(JSON.stringify(b)));
  renderTabs();
  applyScene(b);
  toast(`Tablero "${b.name}" creado`, 'ok');
}

function mountEditor() {
  const host = $('#boardCanvas');
  if (!host) return;
  host.innerHTML = '';
  const rootEl = document.createElement('div');
  rootEl.className = 'excalidraw-host';
  host.appendChild(rootEl);
  reactRoot = ReactDOMClient.createRoot(rootEl);

  const onChange = () => {
    if (applyingRemote || !api) return;
    scheduleSave();
    // Refresca el panel de herramienta con la selección actual
    clearTimeout(onChange._t);
    onChange._t = setTimeout(() => {
      try {
        // Solo al CAMBIAR la selección o la herramienta activa (ej. cambiar a texto)
        const ids = Object.keys(api.getAppState().selectedElementIds || {});
        const key = ids.slice().sort().join(',');
        const toolType = api.getAppState().activeTool?.type;
        if (key !== lastSelKey || toolType !== lastToolType) {
          lastSelKey = key;
          lastToolType = toolType;
          if ((ids.length || toolType === 'text') && ((document.documentElement?.clientWidth || window.innerWidth || 1024) > 768)) {
            propsClosedByUser = false;
            if ($('#boardSideLeft')?.classList.contains('hidden') || $('#boardPropsSec')?.classList.contains('hidden')) openProps(true);
          }
        }
        syncProps();
      } catch {}
    }, 120);
  };

  const menu = React.createElement(Ex.MainMenu, null,
    React.createElement(Ex.MainMenu.DefaultItems.SaveAsImage, null),
    React.createElement(Ex.MainMenu.DefaultItems.Export, null),
    React.createElement(Ex.MainMenu.Separator, null),
    React.createElement(Ex.MainMenu.DefaultItems.ClearCanvas, null),
    React.createElement(Ex.MainMenu.Separator, null),
    React.createElement(Ex.MainMenu.DefaultItems.Help, null));

  const welcome = React.createElement(Ex.WelcomeScreen, null,
    React.createElement(Ex.WelcomeScreen.Center, {
      heading: 'Tablero econhub',
      menuHeading: 'Dibuja a mano alzada: diagramas, oferta y demanda, anotaciones',
    }));

  const footer = React.createElement(Ex.Footer, null);

  reactRoot.render(React.createElement(Ex.Excalidraw, {
    excalidrawAPI: (inst) => {
      api = inst;
      setTimeout(() => { setToolbarCollapsed(toolbarCollapsed); }, 50);
      scheduleLayoutRefresh();
    },
    theme: boardTheme(),
    initialData: {
      elements: [],
      appState: {
        // Transparente: el fondo lo pone el contenedor (CSS por tema).
        // El relleno propio de Excalidraw falla con tonos oscuros en esta versión.
        viewBackgroundColor: 'transparent',
        currentItemFontFamily: 1,
        currentItemStrokeColor: PALETTE.teal,
      },
      scrollToContent: false,
    },
    onChange,
    name: 'Tablero econhub',
  }, menu, welcome, footer));

  // Alineación automática: si el contenedor se desplaza (por envolver pestañas, scroll o redimensionamiento),
  // recalibra offsetTop/offsetLeft antes de procesar cualquier clic para evitar cualquier desfase de selección.
  const checkAlignment = () => {
    if (!api) return;
    try {
      const cv = host.querySelector('canvas.interactive') || host.querySelector('canvas');
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      const st = api.getAppState();
      if (Math.abs(r.top - st.offsetTop) > 1 || Math.abs(r.left - st.offsetLeft) > 1) {
        api.refresh();
      }
    } catch {}
  };
  host.addEventListener('pointerdown', checkAlignment, { capture: true, passive: true });

  try {
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        scheduleLayoutRefresh();
      });
      const tb = document.querySelector('.board-toolbar');
      const wrap = document.querySelector('#boardCanvasWrap');
      if (tb) ro.observe(tb);
      if (wrap) ro.observe(wrap);
    }
  } catch {}
}

// Bounds reales de un skeleton, considerando `points` (las flechas/líneas los usan).
function skeletonBounds(skeletons) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of skeletons) {
    const x = s.x || 0, y = s.y || 0;
    const pts = Array.isArray(s.points) && s.points.length ? s.points : [[0, 0], [s.width || 0, s.height || 0]];
    for (const p of pts) {
      minX = Math.min(minX, x + p[0]); maxX = Math.max(maxX, x + p[0]);
      minY = Math.min(minY, y + p[1]); maxY = Math.max(maxY, y + p[1]);
    }
    if (s.type === 'text') {
      maxX = Math.max(maxX, x + (s.text || '').length * 12);
      maxY = Math.max(maxY, y + (s.fontSize || 20));
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 200; maxY = 120; }
  return { minX, minY, maxX, maxY };
}

// Inserta elementos (skeletons). `at` = punto escena donde centrar (drop);
// sin `at` se centra en la vista actual.
function insertSkeletons(skeletons, at) {
  if (!api) { toast('Abre el tablero primero', 'err'); return false; }
  const c = at || viewportCenter();
  const b = skeletonBounds(skeletons);
  const dx = c.x - (b.minX + b.maxX) / 2;
  const dy = c.y - (b.minY + b.maxY) / 2;
  const els = Ex.restoreElements(Ex.convertToExcalidrawElements(skeletons), null);
  els.forEach((el) => { el.x += dx; el.y += dy; });
  api.updateScene({ elements: [...api.getSceneElements(), ...els], captureUpdate: 'IMMEDIATELY' });
  scheduleSave();
  return true;
}

// Inserta una imagen (dataURL) centrada en la vista
function insertImageFile({ id, dataURL, mimeType, width, height }) {
  if (!api) { toast('Abre el tablero primero', 'err'); return false; }
  const W = Math.min(850, width || 640);
  const H = height && width ? Math.round((height * W) / width) : Math.round(W * 0.6);
  const c = viewportCenter();
  try {
    api.addFiles([{ id, dataURL, mimeType, created: Date.now(), lastRetrieved: Date.now() }]);
  } catch (e) { toast('No se pudo adjuntar la imagen', 'err'); return false; }
  const els = Ex.convertToExcalidrawElements([
    { type: 'image', x: Math.round(c.x - W / 2), y: Math.round(c.y - H / 2), width: W, height: H, fileId: id },
  ]);
  api.updateScene({ elements: [...api.getSceneElements(), ...els], captureUpdate: 'IMMEDIATELY' });
  scheduleSave();
  return true;
}

export async function importPlotPNG() {
  const cv = document.querySelector('#plotCanvas');
  if (!cv || !cv.width) { toast('Abre la Graficadora primero para tener una gráfica que traer', 'err'); return; }
  try {
    const img = new Image();
    img.src = cv.toDataURL('image/png');
    await img.decode();
    const ok = insertImageFile({
      id: `plot-${Date.now().toString(36)}`,
      dataURL: img.src, mimeType: 'image/png',
      width: img.naturalWidth, height: img.naturalHeight,
    });
    if (ok) toast('Gráfica traída al tablero', 'ok');
  } catch { toast('No se pudo leer la gráfica', 'err'); }
}

// ---- LaTeX con KaTeX -> SVG autocontenido (CSS + fuentes incrustadas) -> PNG ----
// El SVG via <img> está aislado: sin el CSS de KaTeX dentro, los superíndices,
// fracciones y raíces se renderizan planos. Por eso se incrusta todo.
let fontCache = {};
let katexCssCache = null;
async function katexAssetB64(name) {
  if (fontCache[name]) return fontCache[name];
  const buf = await (await fetch(`${KATEX_FONT_BASE}${name}.woff2`)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  fontCache[name] = btoa(bin);
  return fontCache[name];
}
async function katexCssEmbedded() {
  if (katexCssCache) return katexCssCache;
  const txt = await (await fetch(KATEX_CSS)).text();
  // Sin @font-face propios (rutas relativas rotas en data-URL): van los incrustados
  katexCssCache = txt.replace(/@font-face\s*{[^}]*}/g, '');
  return katexCssCache;
}
async function katexFacesCss() {
  const need = [
    ['KaTeX_Main', 'normal', 'normal', 'KaTeX_Main-Regular'],
    ['KaTeX_Main', 'bold', 'normal', 'KaTeX_Main-Bold'],
    ['KaTeX_Main', 'normal', 'italic', 'KaTeX_Main-Italic'],
    ['KaTeX_Math', 'normal', 'italic', 'KaTeX_Math-Italic'],
    ['KaTeX_Size1', 'normal', 'normal', 'KaTeX_Size1-Regular'],
    ['KaTeX_Size2', 'normal', 'normal', 'KaTeX_Size2-Regular'],
    ['KaTeX_Size3', 'normal', 'normal', 'KaTeX_Size3-Regular'],
    ['KaTeX_Size4', 'normal', 'normal', 'KaTeX_Size4-Regular'],
    ['KaTeX_AMS', 'normal', 'normal', 'KaTeX_AMS-Regular'],
    ['KaTeX_Caligraphic', 'bold', 'normal', 'KaTeX_Caligraphic-Bold'],
  ];
  const parts = await Promise.all(need.map(async ([fam, w, s, file]) => {
    try {
      const b64 = await katexAssetB64(file);
      return `@font-face{font-family:'${fam}';font-weight:${w};font-style:${s};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    } catch { return ''; }
  }));
  return parts.join('');
}

async function loadKatex() {
  if (katexMod) return katexMod;
  // Esperar el CSS: sin él la fórmula se mide mal (tamaño colapsado) y se recorta
  await ensureCss(KATEX_CSS);
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }
  katexMod = await import(/* @vite-ignore */ KATEX_JS);
  return katexMod;
}

// Color de texto LaTeX: dinámico según el tema del sitio o elección explícita del usuario
export function resolveLatexColor(userChoice = 'auto') {
  if (userChoice && userChoice !== 'auto') {
    if (userChoice === 'white' || userChoice === '#ffffff') return '#ffffff';
    if (userChoice === 'black' || userChoice === '#141414') return '#141414';
    if (userChoice === 'chalk' || userChoice === '#fef08a') return '#fef08a';
    if (userChoice === 'accent') {
      try {
        const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
        if (acc) return acc;
      } catch {}
      return '#38bdf8';
    }
    return userChoice;
  }
  // 'auto': dinámico según el tema activo en la página
  const t = currentSiteTheme();
  const isLight = (t === 'claro' || t === 'cafe');
  try {
    const textVar = getComputedStyle(document.documentElement).getPropertyValue('--text').trim();
    if (textVar) return textVar;
  } catch {}
  return isLight ? '#1b241d' : '#ffffff';
}

// Interpreta el código LaTeX soportando fórmulas directas y textos largos con alineación (& y \\)
export function renderKatexHtml(k, tex) {
  const raw = (tex || '').trim();
  if (!raw) throw new Error('Escribe una fórmula primero');

  // 1. Si ya incluye un entorno explícito (\begin{aligned}, \begin{matrix}, etc.), interpretar directo
  if (/^\\begin\s*\{/i.test(raw)) {
    return k.renderToString(raw, { displayMode: true, throwOnError: true, output: 'html' });
  }

  // 2. Si incluye separadores de columna (&) o saltos de línea (\\), LaTeX requiere envoltorio aligned
  if (raw.includes('&') || raw.includes('\\\\')) {
    try {
      return k.renderToString(`\\begin{aligned}\n${raw}\n\\end{aligned}`, {
        displayMode: true,
        throwOnError: true,
        output: 'html',
      });
    } catch (errAligned) {
      // Si falla dentro de aligned, intentar directo como fallback
      try {
        return k.renderToString(raw, { displayMode: true, throwOnError: true, output: 'html' });
      } catch {
        throw errAligned;
      }
    }
  }

  // 3. Intento directo normal
  try {
    return k.renderToString(raw, { displayMode: true, throwOnError: true, output: 'html' });
  } catch (errDirect) {
    // Si falla directo, intentar envolver en aligned por si eran múltiples expresiones
    try {
      return k.renderToString(`\\begin{aligned}\n${raw}\n\\end{aligned}`, {
        displayMode: true,
        throwOnError: true,
        output: 'html',
      });
    } catch {
      throw errDirect;
    }
  }
}

// Mide el tamaño real de la fórmula. Se mide `.katex` (el bloque con las
// métricas reales) en un contenedor inline-block, y se añade aire para que
// exponentes, fracciones y radicales no queden recortados.
const TEX_PAD = 30;
const TEX_FONT = 30;
function measureKatex(html, fore) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-99999px;top:0;display:inline-block;';
  const inner = document.createElement('div');
  // Mismo tamaño de fuente que el render final: si no, la caja no coincide
  inner.style.cssText = `color:${fore};font-size:${TEX_FONT}px;line-height:1.25;`;
  inner.innerHTML = html;
  wrap.appendChild(inner);
  const host = document.fullscreenElement || document.querySelector('#boardCard') || document.body;
  host.appendChild(wrap);
  const kx = inner.querySelector('.katex') || inner;
  const r = kx.getBoundingClientRect();
  // scrollWidth/offsetWidth atrapan desbordes (exponentes, fracciones, radicales)
  const cw = Math.max(Math.ceil(r.width), kx.scrollWidth || 0, inner.scrollWidth || 0, wrap.offsetWidth || 0);
  const ch = Math.max(Math.ceil(r.height), kx.scrollHeight || 0, inner.scrollHeight || 0, wrap.offsetHeight || 0);
  wrap.remove();
  return { W: Math.max(1, cw) + TEX_PAD * 2, H: Math.max(1, ch) + TEX_PAD * 2 };
}

export async function insertLatex(tex, userColor = 'auto') {
  const formula = (tex || '').trim();
  if (!formula) { toast('Escribe una fórmula primero', 'err'); return false; }
  let katex;
  try { katex = await loadKatex(); }
  catch { toast('No se pudo cargar el motor LaTeX (revisa tu conexión)', 'err'); return false; }

  let html;
  try {
    html = renderKatexHtml(katex, formula);
  } catch (err) {
    console.warn('Error de interpretación KaTeX:', err);
    toast(`Error LaTeX: ${err.message?.replace(/^ParseError:\s*/i, '') || 'fórmula inválida'}`, 'err');
    return false;
  }

  try {
    const [css, faces] = await Promise.all([katexCssEmbedded(), katexFacesCss()]);
    const fore = resolveLatexColor(userColor);
    const m = measureKatex(html, fore);
    const MAXW = 750;
    const scale = Math.min(1, MAXW / m.W);
    const outW = Math.round(m.W * scale), outH = Math.round(m.H * scale);

    // El viewBox hace el escalado. Se fuerzan colores para todos los glifos,
    // líneas de fracciones, raíces y caracteres KaTeX.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${m.W} ${m.H}">`
      + `<style>${css}${faces}`
      + `.katex-display{margin:0 !important;text-align:left !important;}`
      + `.katex{font-size:1em !important;color:${fore} !important;}`
      + `.katex, .katex *{color:${fore} !important;border-color:${fore} !important;}`
      + `.katex svg{fill:currentColor !important;stroke:currentColor !important;}`
      + `.katex svg path{fill:currentColor !important;stroke:none !important;}`
      + `</style>`
      + `<foreignObject x="${TEX_PAD}" y="${TEX_PAD}" width="${m.W - TEX_PAD * 2}" height="${m.H - TEX_PAD * 2}">`
      + `<div xmlns="http://www.w3.org/1999/xhtml" style="color:${fore};font-size:${TEX_FONT}px;line-height:1.25;">${html}</div>`
      + `</foreignObject></svg>`;

    const svgUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    const img = new Image();
    img.src = svgUrl;
    await img.decode();

    // Supersampling: 2x para nitidez en fórmulas normales; 1x en textos muy largos (>3500px)
    // para optimizar memoria del lienzo en el navegador.
    const SS = (outH > 3500 || (outW * outH > 1800000)) ? 1 : 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, outW * SS);
    canvas.height = Math.max(1, outH * SS);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');

    // Usar mimeType 'image/svg+xml': Excalidraw tiene una regla interna en modo oscuro
    // que invierte (invert(100%)) cualquier imagen que NO sea SVG. Declararla como SVG
    // evita esa inversión automática y preserva fielmente el color dinámico elegido.
    const ok = insertImageFile({
      id: `tex-${Date.now().toString(36)}`,
      dataURL: png, mimeType: 'image/svg+xml', width: outW, height: outH,
    });
    if (ok) toast('Fórmula insertada', 'ok');
    return ok;
  } catch (err) {
    console.error('Error al rasterizar fórmula LaTeX:', err);
    toast('No se pudo rasterizar la fórmula', 'err');
    return false;
  }
}

export function insertTemplate(id, at) {
  const cst = customPresets.find((p) => p.id === id);
  if (cst) return insertElements(cst.elements, at);
  const m = libraryItemsMath.find((x) => x.id === id);
  if (m) {
    const ok = insertElements(m.elements, at);
    if (ok && !at) toast(`Símbolo "${m.name}" insertado`, 'ok');
    return ok;
  }
  const tc = libraryItemsTeacher.find((x) => x.id === id);
  if (tc) {
    const ok = insertElements(tc.elements, at);
    if (ok && !at) toast(`Figura "${tc.name}" insertada`, 'ok');
    return ok;
  }
  const imp = importedLibraries.flatMap((l) => l.items || []).find((x) => x.id === id);
  if (imp) {
    const ok = insertElements(imp.elements, at);
    if (ok && !at) toast(`Elemento "${imp.name}" insertado`, 'ok');
    return ok;
  }
  const t = BOARD_TEMPLATES.find((x) => x.id === id);
  if (!t) return false;
  const scene = t.build({ ...PALETTE, muted: '#868e96', primary: PALETTE.primary });
  const isDark = (currentTheme === 'oscuro') || (api?.getAppState()?.theme === 'dark');
  const activeStroke = api?.getAppState()?.currentItemStrokeColor || (isDark ? '#ffffff' : '#1e1e1e');
  const colored = adaptElementsColor(scene.elements, { strokeColor: activeStroke, isDark });
  const ok = insertSkeletons(colored, at);
  if (ok && !at) toast(`Preset "${t.name}" insertado`, 'ok');
  return ok;
}

export async function exportBoardPNG() {
  if (!api) return;
  try {
    const blob = await Ex.exportToBlob({
      elements: api.getSceneElements(),
      mimeType: 'image/png',
      // En el PNG se hornea el fondo del tema (en el lienzo es transparente)
      appState: { ...api.getAppState(), viewBackgroundColor: boardBackground() },
      files: api.getFiles(),
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeBoard()?.name || 'tablero'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('PNG exportado', 'ok');
  } catch { toast('No se pudo exportar', 'err'); }
}

export function exportBoardFile() {
  if (!api) return;
  try {
    const data = {
      type: 'excalidraw', version: 2, source: 'econhub',
      elements: api.getSceneElements(), appState: api.getAppState(), files: api.getFiles(),
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeBoard()?.name || 'tablero'}.excalidraw`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Archivo .excalidraw guardado', 'ok');
  } catch { toast('No se pudo exportar', 'err'); }
}

export async function importBoardFile(file) {
  if (!api || !file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.elements)) { toast('Archivo inválido', 'err'); return; }
    cancelPendingSave();
    await persistActive();
    const b = {
      id: uid(), name: (file.name || 'Importado').replace(/\.excalidraw$/i, ''),
      elements: [], appState: null, files: {},
      updatedAt: Date.now(),
    };
    boards.push(b);
    activeId = b.id;
    // 1. Renderizar pestañas primero para que el layout DOM se asiente
    renderTabs();
    store.set('econhub:boardActive', b.id);
    await idbPut(deepClone(b));

    // 2. Aplicar la escena y calibrar vista
    applyingRemote = true;
    try {
      const elements = Ex.restoreElements(deepClone(data.elements), null);
      if (data.files) { try { api.addFiles(Object.values(deepClone(data.files))); } catch {} }
      const saved = data.appState || {};
      const hasView = Number.isFinite(saved.scrollX) && Number.isFinite(saved.scrollY);
      api.updateScene({
        elements,
        appState: {
          theme: boardTheme(),
          viewBackgroundColor: 'transparent',
          ...(hasView ? { scrollX: saved.scrollX, scrollY: saved.scrollY, zoom: { value: Number.isFinite(saved.zoom) ? saved.zoom : 1 } } : {}),
        },
        captureUpdate: 'IMMEDIATELY',
      });
      const els = api.getSceneElements();
      if (!hasView && els.length && api.scrollToContent) {
        api.scrollToContent(els, { fitToContent: true, maxZoom: 1 });
      }
    } finally {
      setTimeout(() => { applyingRemote = false; }, 120);
    }
    scheduleLayoutRefresh();
    scheduleSave();
    toast(`Tablero "${b.name}" importado`, 'ok');
  } catch { toast('No se pudo leer el archivo', 'err'); }
}

// Modal de fórmula (DOM construido en JS, estilo .modal del sitio)
function openLatexModal() {
  if (!api) { toast('Abre el tablero primero', 'err'); return; }
  document.querySelector('#boardLatexModal')?.remove();
  const ov = document.createElement('div');
  ov.className = 'modal';
  ov.id = 'boardLatexModal';

  let selectedColor = 'auto';

  ov.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <h2><i class="ri-function-line"></i> Insertar fórmula o texto LaTeX</h2>
        <button class="icon-btn" data-close="boardLatexModal"><i class="ri-close-line"></i></button>
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <span style="font-size:0.82rem; font-weight:600; color:var(--text);">Color del texto:</span>
          <div id="boardLatexColorGroup" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
            <button type="button" class="board-latex-color-btn active" data-color="auto" title="Dinámico: se adapta automáticamente al tema actual del sitio">
              <i class="ri-sparkling-fill" style="color:var(--accent);"></i> Dinámico (Tema)
            </button>
            <button type="button" class="board-latex-color-btn" data-color="#ffffff" title="Blanco puro">
              <span class="board-latex-dot" style="background:#ffffff; border:1px solid rgba(0,0,0,0.35);"></span> Blanco
            </button>
            <button type="button" class="board-latex-color-btn" data-color="#141414" title="Negro">
              <span class="board-latex-dot" style="background:#141414; border:1px solid rgba(255,255,255,0.35);"></span> Negro
            </button>
            <button type="button" class="board-latex-color-btn" data-color="accent" title="Color de acento del tema activo">
              <span class="board-latex-dot" style="background:var(--accent);"></span> Acento
            </button>
            <button type="button" class="board-latex-color-btn" data-color="#fef08a" title="Tiza amarilla de pizarra">
              <span class="board-latex-dot" style="background:#fef08a;"></span> Tiza
            </button>
          </div>
        </div>
        <label style="display:flex; flex-direction:column; gap:6px; font-size:0.82rem; color:var(--muted);">
          Código LaTeX (fórmula simple o texto largo con alineaciones &amp; y \\):
          <textarea id="boardLatexInput" placeholder="Escribe o pega fórmulas o textos largos...&#10;&#10;Ejemplos admitidos:&#10;• E = mc^2&#10;• Líneas con &amp; y \\ (se envuelven automáticamente en aligned)&#10;• Entornos \begin{aligned} ... \end{aligned}"></textarea>
        </label>
        <div id="boardLatexPreviewWrap" style="display:none; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <span style="font-size:0.78rem; font-weight:600; color:var(--muted);">Vista previa en vivo:</span>
            <span id="boardLatexStatus" style="font-size:0.75rem; color:var(--muted);"></span>
          </div>
          <div id="boardLatexPreview" class="board-latex-preview"></div>
        </div>
      </div>
      <div class="modal-foot">
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" data-close="boardLatexModal">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="boardLatexGo"><i class="ri-check-line"></i> Insertar en Tablero</button>
      </div>
    </div>`;
  const host = document.fullscreenElement || document.querySelector('#boardCard') || document.body;
  host.appendChild(ov);
  ov.classList.remove('hidden');

  const input = ov.querySelector('#boardLatexInput');
  const previewWrap = ov.querySelector('#boardLatexPreviewWrap');
  const preview = ov.querySelector('#boardLatexPreview');
  const status = ov.querySelector('#boardLatexStatus');
  const colorBtns = ov.querySelectorAll('#boardLatexColorGroup .board-latex-color-btn');
  const goBtn = ov.querySelector('#boardLatexGo');

  input.focus();

  let previewTimer = null;
  const updatePreview = async () => {
    const val = (input.value || '').trim();
    if (!val) {
      previewWrap.style.display = 'none';
      preview.innerHTML = '';
      status.textContent = '';
      return;
    }
    previewWrap.style.display = 'flex';
    status.textContent = 'Interpretando...';
    try {
      const k = await loadKatex();
      const html = renderKatexHtml(k, val);
      const fore = resolveLatexColor(selectedColor);
      preview.innerHTML = `<div style="color:${fore};font-size:1.1em;width:100%;">${html}</div>`;
      status.textContent = 'Válido';
      status.style.color = 'var(--accent)';
    } catch (e) {
      const msg = e.message?.replace(/^ParseError:\s*/i, '') || 'fórmula incompleta';
      preview.innerHTML = `<span style="font-size:0.8rem;color:#ef5350;">Sintaxis incompleta: ${msg}</span>`;
      status.textContent = 'Revisar';
      status.style.color = '#ef5350';
    }
  };

  colorBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      colorBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = btn.dataset.color || 'auto';
      updatePreview();
    });
  });

  input.addEventListener('input', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(updatePreview, 160);
  });

  goBtn.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) { toast('Escribe o pega una fórmula primero', 'err'); return; }
    goBtn.disabled = true;
    goBtn.innerHTML = '<i class="ri-loader-4-line spin"></i> Procesando...';
    const ok = await insertLatex(val, selectedColor);
    if (ok) {
      ov.remove();
    } else {
      goBtn.disabled = false;
      goBtn.innerHTML = '<i class="ri-check-line"></i> Insertar en Tablero';
    }
  });

  ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
  ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ov.remove()));
  ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') ov.remove(); });
}

function updateLibColorHint() {
  const dot = $('#boardLibColorDot');
  const txt = $('#boardLibColorText');
  if (!dot || !txt || !api) return;
  const isDark = isBoardDark();
  const curColor = api.getAppState()?.currentItemStrokeColor || (isDark ? '#ffffff' : '#1e1e1e');
  dot.style.backgroundColor = curColor;
  txt.textContent = `Color de trazo activo: ${curColor}`;
}

const isMobileView = () => ((document.documentElement?.clientWidth || window.innerWidth || 1024) <= 768);

// Visibilidad de los paneles laterales: Izquierdo (Herramientas) y Derecho (Librería)
function syncSideVisibility() {
  const sideLeft = $('#boardSideLeft');
  const sideRight = $('#boardSideRight');
  const propsSec = $('#boardPropsSec');
  const presetsSec = $('#boardPresets');

  const propsOpen = !!(sideLeft && !sideLeft.classList.contains('hidden') && propsSec && !propsSec.classList.contains('hidden'));
  const presetsOpen = !!(sideRight && !sideRight.classList.contains('hidden') && presetsSec && !presetsSec.classList.contains('hidden'));

  sideLeft?.classList.toggle('hidden', !propsOpen);
  sideRight?.classList.toggle('hidden', !presetsOpen);

  const isMobile = isMobileView();
  const backdrop = $('#boardSideBackdrop');
  if (backdrop) {
    backdrop.classList.toggle('hidden', !(isMobile && (propsOpen || presetsOpen)));
  }

  $('#boardPropsBtn')?.classList.toggle('active', propsOpen);
  $('#boardPresetsBtn')?.classList.toggle('active', presetsOpen);
  updateLibColorHint();
  setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch {} }, 60);
}

function openProps(open) {
  const side = $('#boardSideLeft');
  const sec = $('#boardPropsSec');
  if (side) side.classList.toggle('hidden', !open);
  if (sec) sec.classList.toggle('hidden', !open);
  if (open) { try { renderProps(); } catch {} }
  syncSideVisibility();
}

function openPresets(open) {
  const side = $('#boardSideRight');
  const sec = $('#boardPresets');
  if (side) side.classList.toggle('hidden', !open);
  if (sec) sec.classList.toggle('hidden', !open);
  if (open) { try { renderPresets(); } catch {} }
  syncSideVisibility();
}

export function setToolbarCollapsed(collapsed) {
  toolbarCollapsed = !!collapsed;
  store.set('econhub:boardToolbarCollapsed', toolbarCollapsed);
  const canvas = $('#boardCanvas');
  const wrap = $('#boardCanvasWrap');
  const pill = $('#boardToolbarPill');
  const btn = $('#boardToggleToolbarBtn');
  if (canvas) canvas.classList.toggle('toolbar-collapsed', toolbarCollapsed);
  if (wrap) wrap.classList.toggle('toolbar-collapsed', toolbarCollapsed);
  if (pill) pill.classList.toggle('hidden', !toolbarCollapsed);
  if (btn) {
    btn.classList.toggle('active', toolbarCollapsed);
    btn.title = toolbarCollapsed ? 'Mostrar barra de dibujo' : 'Contraer barra de dibujo';
  }
}

export function toggleToolbar() {
  setToolbarCollapsed(!toolbarCollapsed);
  toast(toolbarCollapsed ? 'Barra de dibujo contraída' : 'Barra de dibujo visible', 'ok');
}

function bindUI() {
  const box = $('#boardTabs');
  if (box && !box.dataset.bound) {
    box.dataset.bound = '1';
    box.addEventListener('click', async (e) => {
      if (e.target.closest('#boardAdd')) { createBoard(); return; }
      if (e.target.closest('[data-boarddel]')) return;
      const tab = e.target.closest('[data-board]');
      if (tab) switchBoard(tab.dataset.board);
    });
    box.addEventListener('dblclick', async (e) => {
      const tab = e.target.closest('[data-board]');
      if (!tab) return;
      const b = boards.find((x) => x.id === tab.dataset.board);
      if (!b) return;
      const nameEl = tab.querySelector('.board-tab-name');
      const inp = document.createElement('input');
      inp.className = 'board-tab-edit';
      inp.value = b.name;
      nameEl.replaceWith(inp);
      inp.focus(); inp.select();
      const commit = async () => {
        const v = inp.value.trim();
        if (v) { b.name = v; b.updatedAt = Date.now(); await idbPut(JSON.parse(JSON.stringify(b))); }
        renderTabs();
      };
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') commit();
        if (ev.key === 'Escape') renderTabs();
      });
      inp.addEventListener('blur', commit);
    });
    box.addEventListener('click', async (e) => {
      const del = e.target.closest('[data-boarddel]');
      if (!del || boards.length < 2) {
        if (del) toast('Debe quedar al menos un tablero', 'err');
        return;
      }
      const id = del.dataset.boarddel;
      if (del.dataset.armed) {
        cancelPendingSave();
        await idbDel(id);
        boards = boards.filter((b) => b.id !== id);
        if (activeId === id) {
          activeId = boards[boards.length - 1].id;
          store.set('econhub:boardActive', activeId);
          applyScene(activeBoard());
        }
        renderTabs();
        toast('Tablero eliminado', 'ok');
      } else {
        del.dataset.armed = '1';
        del.innerHTML = '<i class="ri-check-line"></i>';
        setTimeout(() => {
          const cur = box.querySelector(`[data-boarddel="${id}"]`);
          if (cur) { delete cur.dataset.armed; cur.innerHTML = '<i class="ri-close-line"></i>'; }
        }, 2600);
      }
    });
  }
  $('#boardLatexBtn')?.addEventListener('click', openLatexModal);
  $('#boardPlotBtn')?.addEventListener('click', importPlotPNG);
  $('#boardToggleToolbarBtn')?.addEventListener('click', () => toggleToolbar());
  $('#boardToolbarPill')?.addEventListener('click', () => toggleToolbar());
  setToolbarCollapsed(toolbarCollapsed);
  $('#boardPngBtn')?.addEventListener('click', exportBoardPNG);
  $('#boardFileBtn')?.addEventListener('click', exportBoardFile);
  $('#boardFullBtn')?.addEventListener('click', () => {
    const card = $('#boardCard');
    if (!card) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (card.requestFullscreen) card.requestFullscreen().catch(() => toast('Pantalla completa no disponible'));
  });
  document.addEventListener('fullscreenchange', () => {
    // Excalidraw recalcula su tamaño con el evento resize
    setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 120);
  });
  $('#boardImportBtn')?.addEventListener('click', () => $('#boardImportInput')?.click());
  $('#boardImportInput')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) importBoardFile(f);
    e.target.value = '';
  });
  // Barra lateral: Herramienta (izq) y Librería (der)
  $('#boardPropsBtn')?.addEventListener('click', () => {
    const side = $('#boardSideLeft');
    const open = side ? side.classList.contains('hidden') : false;
    propsClosedByUser = !open;
    if (open && isMobileView()) openPresets(false);
    openProps(open);
  });
  $('#boardPropsClose')?.addEventListener('click', () => { propsClosedByUser = true; openProps(false); });
  // Telón de fondo móvil para cerrar cajones laterales
  $('#boardSideBackdrop')?.addEventListener('click', () => {
    propsClosedByUser = true;
    openProps(false);
    openPresets(false);
  });
  // Reabrir al interactuar con el lienzo si hay algo seleccionado
  // (cubre el caso de cerrar con un elemento ya seleccionado y volver a tocarlo).
  if (!$('#boardCanvas')?.dataset.propPick) {
    const canvasHost = $('#boardCanvas');
    if (canvasHost) {
      canvasHost.dataset.propPick = '1';
      const reopenIfSelected = () => {
        setTimeout(() => {
          try {
            if (isMobileView()) return; // En móvil no abrir el panel intrusivamente al tocar figuras
            const ids = Object.keys(api?.getAppState()?.selectedElementIds || {});
            if (!ids.length) return;
            propsClosedByUser = false;
            if ($('#boardSideLeft')?.classList.contains('hidden')) openProps(true);
          } catch {}
        }, 160);
      };
      canvasHost.addEventListener('click', reopenIfSelected);
      canvasHost.addEventListener('dblclick', reopenIfSelected);
    }
  }
  $('#boardPresetsBtn')?.addEventListener('click', () => {
    const side = $('#boardSideRight');
    const open = side ? side.classList.contains('hidden') : false;
    if (open && isMobileView()) openProps(false);
    openPresets(open);
  });
  $('#boardPresetsClose')?.addEventListener('click', () => { openPresets(false); });

  // Menú "Más" para celular (evita desbordamientos y agrupa acciones secundarias)
  const moreBtn = $('#boardMoreBtn');
  const moreMenu = $('#boardMoreMenu');
  const closeBoardMore = () => moreMenu?.classList.add('hidden');

  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    moreMenu?.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#boardMoreMenu') && !e.target.closest('#boardMoreBtn')) {
      closeBoardMore();
    }
  });

  $('#bmmLatex')?.addEventListener('click', () => { closeBoardMore(); $('#boardLatexBtn')?.click(); });
  $('#bmmPlot')?.addEventListener('click', () => { closeBoardMore(); $('#boardPlotBtn')?.click(); });
  $('#bmmToggleBar')?.addEventListener('click', () => { closeBoardMore(); $('#boardToggleToolbarBtn')?.click(); });
  $('#bmmPng')?.addEventListener('click', () => { closeBoardMore(); $('#boardPngBtn')?.click(); });
  $('#bmmFile')?.addEventListener('click', () => { closeBoardMore(); $('#boardFileBtn')?.click(); });
  $('#bmmImport')?.addEventListener('click', () => { closeBoardMore(); $('#boardImportBtn')?.click(); });
  $('#bmmFull')?.addEventListener('click', () => { closeBoardMore(); $('#boardFullBtn')?.click(); });

  // Guardar selección (o todo) como preset nuevo
  $('#boardPresetAdd')?.addEventListener('click', () => {
    const box = $('#boardPresetNew');
    if (!box) return;
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) $('#boardPresetName')?.focus();
  });
  $('#boardPresetSave')?.addEventListener('click', async () => {
    await addCustomPreset($('#boardPresetName')?.value);
    const n = $('#boardPresetName'); if (n) n.value = '';
    $('#boardPresetNew')?.classList.add('hidden');
  });
  $('#boardPresetCancel')?.addEventListener('click', () => {
    const n = $('#boardPresetName'); if (n) n.value = '';
    $('#boardPresetNew')?.classList.add('hidden');
  });
  $('#boardPresetName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#boardPresetSave')?.click(); }
    if (e.key === 'Escape') $('#boardPresetCancel')?.click();
  });
  document.querySelectorAll('[data-close]').forEach((b) => {
    if (!b.dataset.bound) {
      b.dataset.bound = '1';
      b.addEventListener('click', () => document.getElementById(b.dataset.close)?.remove());
    }
  });
}

export async function mountBoard() {
  if (mounted && api) {
    // Al volver a la página, la sección estuvo oculta (contenedor 0x0) y
    // Excalidraw pierde el encuadre. Se redimensiona y se restaura la vista.
    try { restoreView(activeBoard()); } catch {}
    return true;
  }
  if (mountPromise) return mountPromise;
  const loader = $('#boardLoader');
  if (loader) loader.classList.remove('hidden');
  mountPromise = (async () => {
    try {
      await loadVendor();
    } catch {
      if (loader) loader.innerHTML = '<p>Sin conexión: el tablero necesita internet la primera vez.</p><button class="btn btn-primary btn-sm" id="boardRetry">Reintentar</button>';
      document.querySelector('#boardRetry')?.addEventListener('click', () => { mountPromise = null; mountBoard(); });
      mountPromise = null;
      return false;
    }
    try {
      await loadBoards();
      renderTabs();
      mountEditor();
      bindUI();
      // espera a que el API esté listo y pinta el tablero activo
      for (let i = 0; i < 100 && !api; i++) await new Promise((r) => setTimeout(r, 50));
      if (!api) throw new Error('El editor no respondió');
      loadCustomPresets();
      loadHiddenTemplates();
      loadImportedLibraries();
      await loadDefaultLibraries();
      renderProps();
      renderPresets();
      if (!isMobileView()) {
        openProps(true); // en escritorio visible por defecto, fuera del lienzo
      } else {
        openProps(false); // en móvil cerrado por defecto para no tapar el lienzo
      }
      applyScene(activeBoard());
      mounted = true;
      if (loader) loader.classList.add('hidden');
      return true;
    } catch (e) {
      if (loader) loader.classList.add('hidden');
      toast('No se pudo iniciar el tablero: ' + (e.message || e), 'err');
      mountPromise = null;
      return false;
    }
  })();
  return mountPromise;
}

// ---- Herramienta: paleta y controles de estilo (viven fuera del lienzo) ----
export const BOARD_COLORS = [
  '#ffffff', '#f1f3f5', '#ced4da', '#868e96', '#343a40', '#1e1e1e',
  '#e03131', '#c92a2a', '#f76707', '#f59f00', '#fcc419', '#ffd43b',
  '#2f9e44', '#2b8a3e', '#069a7e', '#0ca678', '#1971c2', '#127599',
  '#5f4786', '#8e44ad', '#d6336c', '#6c9a06', '#fd7e14', '#e8590c',
];
const BP_WIDTHS = [{ v: 1, px: 2 }, { v: 2, px: 3 }, { v: 4, px: 5 }];
const BP_STYLES = [
  { v: 'solid', bg: 'currentColor' },
  { v: 'dashed', bg: 'repeating-linear-gradient(90deg, currentColor 0 5px, transparent 5px 9px)' },
  { v: 'dotted', bg: 'repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 6px)' },
];
const BP_FILLS = [
  { v: 'hachure', cls: 'hachure' },
  { v: 'cross-hatch', cls: 'cross' },
  { v: 'solid', cls: 'solid' },
];
let bpTarget = 'stroke';

function selectedIds() { return api ? (api.getAppState().selectedElementIds || {}) : {}; }
function firstSelected() { const sel = selectedIds(); return api ? api.getSceneElements().find((e) => sel[e.id]) : null; }
function propValue(elKey, appKey, fallback) {
  const el = firstSelected();
  if (el && el[elKey] !== undefined && el[elKey] !== null) return el[elKey];
  const v = api ? api.getAppState()[appKey] : undefined;
  return v === undefined ? fallback : v;
}
function applyToolProp(elPatch, appPatch) {
  if (!api) { toast('Abre el tablero primero', 'err'); return; }
  const sel = selectedIds();
  const painted = api.getSceneElements().map((e) => (sel[e.id] ? {
    ...e,
    ...elPatch,
    version: (e.version || 1) + 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    updated: Date.now(),
  } : e));
  api.updateScene({ elements: painted, appState: appPatch || {}, captureUpdate: 'IMMEDIATELY' });
  scheduleSave();
}
function roundnessFor(kind) { return kind === 'round' ? { type: 3 } : null; }

function isTextMode() {
  if (!api) return false;
  const sel = selectedIds();
  const selKeys = Object.keys(sel);
  if (selKeys.length > 0) {
    const all = api.getSceneElements();
    const chosen = all.filter((e) => sel[e.id]);
    if (chosen.length === 1) return chosen[0].type === 'text';
    return chosen.length > 0 && chosen.every((e) => e.type === 'text');
  }
  const tool = api.getAppState().activeTool;
  return tool?.type === 'text';
}

function moveSelectedLayers(action) {
  if (!api) return;
  const sel = selectedIds();
  const selKeys = Object.keys(sel);
  if (!selKeys.length) { toast('Selecciona un elemento primero', 'err'); return; }
  const elements = [...api.getSceneElements()];
  if (action === 'back') {
    const selected = elements.filter((e) => sel[e.id]);
    const rest = elements.filter((e) => !sel[e.id]);
    api.updateScene({ elements: [...selected, ...rest], captureUpdate: 'IMMEDIATELY' });
    scheduleSave();
    toast('Enviado al fondo', 'ok');
  } else if (action === 'front') {
    const selected = elements.filter((e) => sel[e.id]);
    const rest = elements.filter((e) => !sel[e.id]);
    api.updateScene({ elements: [...rest, ...selected], captureUpdate: 'IMMEDIATELY' });
    scheduleSave();
    toast('Traído al frente', 'ok');
  } else if (action === 'down') {
    for (let i = 1; i < elements.length; i++) {
      if (sel[elements[i].id] && !sel[elements[i - 1].id]) {
        const tmp = elements[i];
        elements[i] = elements[i - 1];
        elements[i - 1] = tmp;
      }
    }
    api.updateScene({ elements, captureUpdate: 'IMMEDIATELY' });
    scheduleSave();
  } else if (action === 'up') {
    for (let i = elements.length - 2; i >= 0; i--) {
      if (sel[elements[i].id] && !sel[elements[i + 1].id]) {
        const tmp = elements[i];
        elements[i] = elements[i + 1];
        elements[i + 1] = tmp;
      }
    }
    api.updateScene({ elements, captureUpdate: 'IMMEDIATELY' });
    scheduleSave();
  }
}

function renderProps() {
  const colors = $('#bpColors');
  if (!colors || colors.dataset.built) { syncProps(); return; }
  colors.dataset.built = '1';

  // Swatches para figuras
  colors.innerHTML = BOARD_COLORS.map((c) => `<button class="bp-swatch" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
  colors.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const hex = b.dataset.c;
    if (bpTarget === 'bg') applyToolProp({ backgroundColor: hex }, { currentItemBackgroundColor: hex });
    else applyToolProp({ strokeColor: hex }, { currentItemStrokeColor: hex });
    syncProps();
  });
  $('#bpTarget')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-target]');
    if (!b) return;
    bpTarget = b.dataset.target;
    $('#bpTarget')?.querySelectorAll('[data-target]').forEach((x) => x.classList.toggle('on', x === b));
    $('#bpColors')?.querySelectorAll('.none').forEach((x) => x.remove());
    if (bpTarget === 'bg') {
      const none = document.createElement('button');
      none.className = 'bp-swatch none';
      none.dataset.c = 'transparent';
      none.title = 'Sin relleno';
      colors.prepend(none);
    }
    syncProps();
  });

  const W = $('#bpWidth');
  W.innerHTML = BP_WIDTHS.map((w) => `<button data-w="${w.v}" title="Grosor ${w.v}"><span class="bp-line" style="height:${w.px}px"></span></button>`).join('');
  W.addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; applyToolProp({ strokeWidth: +b.dataset.w }, { currentItemStrokeWidth: +b.dataset.w }); syncProps(); });

  const S = $('#bpStyle');
  S.innerHTML = BP_STYLES.map((s) => `<button data-s="${s.v}" title="${s.v}"><span class="bp-line" style="height:2px;background:${s.bg}"></span></button>`).join('');
  S.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; applyToolProp({ strokeStyle: b.dataset.s }, { currentItemStrokeStyle: b.dataset.s }); syncProps(); });

  const F = $('#bpFill');
  F.innerHTML = BP_FILLS.map((f) => `<button data-f="${f.v}" title="Relleno ${f.v}"><span class="bp-fill ${f.cls}"></span></button>`).join('');
  F.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; applyToolProp({ fillStyle: b.dataset.f }, { currentItemFillStyle: b.dataset.f }); syncProps(); });

  const O = $('#bpOpacity');
  O.addEventListener('input', () => {
    const v = +O.value;
    $('#bpOpacityVal').textContent = v + '%';
    applyToolProp({ opacity: v }, { currentItemOpacity: v });
  });

  $('#bpEdges')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    applyToolProp({ roundness: roundnessFor(b.dataset.v) }, { currentItemRoundness: b.dataset.v });
    syncProps();
  });

  // Swatches para texto
  const tColors = $('#bpTextColors');
  if (tColors) {
    tColors.innerHTML = BOARD_COLORS.map((c) => `<button class="bp-swatch" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
    tColors.addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      const hex = b.dataset.c;
      applyToolProp({ strokeColor: hex }, { currentItemStrokeColor: hex });
      syncProps();
    });
  }

  // Fuentes para texto (1: Virgil, 2: Helvetica, 3: Cascadia, 4: Serif)
  $('#bpFontFamily')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ff]');
    if (!b) return;
    applyToolProp({ fontFamily: +b.dataset.ff }, { currentItemFontFamily: +b.dataset.ff });
    syncProps();
  });

  // Tamaños para texto (S: 16, M: 20, L: 28, XL: 36)
  $('#bpFontSize')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fs]');
    if (!b) return;
    applyToolProp({ fontSize: +b.dataset.fs }, { currentItemFontSize: +b.dataset.fs });
    syncProps();
  });

  // Alineación para texto (left, center, right)
  $('#bpTextAlign')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ta]');
    if (!b) return;
    applyToolProp({ textAlign: b.dataset.ta }, { currentItemTextAlign: b.dataset.ta });
    syncProps();
  });

  // Opacidad para texto
  const tO = $('#bpTextOpacity');
  tO?.addEventListener('input', () => {
    const v = +tO.value;
    $('#bpTextOpacityVal').textContent = v + '%';
    applyToolProp({ opacity: v }, { currentItemOpacity: v });
  });

  // Capas (para texto y figuras)
  $('#bpLayers')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-layer]');
    if (!b) return;
    moveSelectedLayers(b.dataset.layer);
  });

  syncProps();
}

function syncProps() {
  if (!api) return;
  const isText = isTextMode();
  const secTitle = $('#boardPropsTitle');
  const shapeSub = $('#bpShapeProps');
  const textSub = $('#bpTextProps');

  if (isText) {
    if (secTitle) secTitle.innerHTML = '<i class="ri-text"></i> Texto';
    shapeSub?.classList.add('hidden');
    textSub?.classList.remove('hidden');

    const curStroke = propValue('strokeColor', 'currentItemStrokeColor', '#1e1e1e');
    $('#bpTextColors')?.querySelectorAll('.bp-swatch').forEach((b) => b.classList.toggle('active', b.dataset.c === curStroke));

    const curFf = propValue('fontFamily', 'currentItemFontFamily', 1);
    $('#bpFontFamily')?.querySelectorAll('[data-ff]').forEach((b) => b.classList.toggle('on', +b.dataset.ff === curFf));

    const curFs = propValue('fontSize', 'currentItemFontSize', 20);
    $('#bpFontSize')?.querySelectorAll('[data-fs]').forEach((b) => b.classList.toggle('on', +b.dataset.fs === curFs));

    const curTa = propValue('textAlign', 'currentItemTextAlign', 'left');
    $('#bpTextAlign')?.querySelectorAll('[data-ta]').forEach((b) => b.classList.toggle('on', b.dataset.ta === curTa));

    const curOp = propValue('opacity', 'currentItemOpacity', 100);
    const opEl = $('#bpTextOpacity');
    if (opEl) { opEl.value = curOp; $('#bpTextOpacityVal').textContent = curOp + '%'; }
  } else {
    if (secTitle) secTitle.innerHTML = '<i class="ri-tools-line"></i> Herramienta';
    textSub?.classList.add('hidden');
    shapeSub?.classList.remove('hidden');

    const isBg = bpTarget === 'bg';
    const cur = isBg ? propValue('backgroundColor', 'currentItemBackgroundColor', '#ffffff') : propValue('strokeColor', 'currentItemStrokeColor', '#069a7e');
    $('#bpColors')?.querySelectorAll('.bp-swatch').forEach((b) => b.classList.toggle('active', b.dataset.c === cur));
    const w = propValue('strokeWidth', 'currentItemStrokeWidth', 2);
    $('#bpWidth')?.querySelectorAll('[data-w]').forEach((b) => b.classList.toggle('on', +b.dataset.w === w));
    const st = propValue('strokeStyle', 'currentItemStrokeStyle', 'solid');
    $('#bpStyle')?.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === st));
    const fl = propValue('fillStyle', 'currentItemFillStyle', 'hachure');
    $('#bpFill')?.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === fl));
    const op = propValue('opacity', 'currentItemOpacity', 100);
    const oEl = $('#bpOpacity');
    if (oEl) { oEl.value = op; $('#bpOpacityVal').textContent = op + '%'; }
    const rd = firstSelected() ? (firstSelected().roundness ? 'round' : 'sharp') : (api.getAppState().currentItemRoundness || 'round');
    $('#bpEdges')?.querySelectorAll('[data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === rd));
  }
  updateLibColorHint();
}

// ---- Presets y Librerías: miniaturas reales + arrastrar al lienzo ----
const thumbCache = {};
const PRESET_KEY = 'econhub:boardPresets';
const HIDDEN_TEMPLATES_KEY = 'econhub:boardHiddenTemplates';
const IMPORTED_LIBS_KEY = 'econhub:boardImportedLibs';
let customPresets = [];
let hiddenTemplates = [];

const MATH_NAMES_ES = {
  'Complex numbers': 'Números complejos (ℂ)',
  'Infinity': 'Infinito (∞)',
  'Implication': 'Implicación (⟹)',
  'Approaches': 'Aproximación / Límite (⟶)',
  'Universal quantification': 'Para todo (∀)',
  'Existential quantification': 'Existe (∃)',
  'Element': 'Pertenece a (∈)',
  'Natural numbers': 'Números naturales (ℕ)',
  'Integers': 'Números enteros (ℤ)',
  'Real numbers': 'Números reales (ℝ)',
  'Greater than or equal to': 'Mayor o igual (≥)',
  'Less than or equal to': 'Menor o igual (≤)',
  'Partial derivaive': 'Derivada parcial (∂)',
  'Integral': 'Integral (∫)',
  'Summation': 'Sumatoria (∑)',
};

const TEACHER_NAMES_ES = {
  'Dotted Coordinate Grid With Axes Labeled': 'Plano cartesiano (puntos)',
  'Basic Venn Diagram': 'Diagrama de Venn (2 conj.)',
  'Coordinate Grid With Axes Labeled': 'Plano cartesiano con ejes',
  'Number Line with Labels': 'Recta numérica rotulada',
  'Blank Number Line': 'Recta numérica vacía',
  'Sphere Diagram Colored': 'Esfera 3D con sombreado',
  'Sphere Diagram': 'Esfera 3D trazo',
  'Rectangular Prism Cube': 'Cubo 3D',
  'Rectangular Prism Cuboid': 'Prisma rectangular 3D',
  'Parallel Lines and Transversal With Symb': 'Rectas paralelas y transversal',
  'Parallel Lines and Transversal Without S': 'Rectas paralelas simples',
  'Blank Graph Paper Coordinate Grid': 'Papel milimetrado / Cuadrícula',
};

function loadCustomPresets() { try { customPresets = store.get(PRESET_KEY, []) || []; } catch { customPresets = []; } }
function saveCustomPresets() { try { store.set(PRESET_KEY, customPresets.slice(0, 40)); } catch {} }

function loadHiddenTemplates() { try { hiddenTemplates = store.get(HIDDEN_TEMPLATES_KEY, []) || []; } catch { hiddenTemplates = []; } }
function saveHiddenTemplates() { try { store.set(HIDDEN_TEMPLATES_KEY, hiddenTemplates); } catch {} }

function loadImportedLibraries() {
  try { importedLibraries = store.get(IMPORTED_LIBS_KEY, []) || []; } catch { importedLibraries = []; }
}
function saveImportedLibraries() {
  try { store.set(IMPORTED_LIBS_KEY, importedLibraries); } catch {}
}

async function loadDefaultLibraries() {
  if (libraryItemsMath.length && libraryItemsTeacher.length) return;
  try {
    const [resMath, resTeacher] = await Promise.all([
      fetch('./mathematical-symbols.excalidrawlib').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('./math-teacher-library.excalidrawlib').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (resMath?.libraryItems) {
      libraryItemsMath = resMath.libraryItems.map((item) => ({
        id: item.id || `math-${uid()}`,
        name: MATH_NAMES_ES[item.name] || item.name || 'Símbolo matemático',
        origName: item.name || '',
        category: 'math',
        elements: item.elements,
      }));
    }
    if (resTeacher?.libraryItems) {
      libraryItemsTeacher = resTeacher.libraryItems.map((item) => ({
        id: item.id || `geo-${uid()}`,
        name: TEACHER_NAMES_ES[item.name] || item.name || 'Figura geométrica',
        origName: item.name || '',
        category: 'teacher',
        elements: item.elements,
      }));
    }
  } catch (e) {
    console.warn('[whiteboard] Error cargando librerías por defecto:', e);
  }
}

async function importLibraryFile(file) {
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    if (!json.libraryItems || !Array.isArray(json.libraryItems)) {
      toast('El archivo no parece ser una librería válida de Excalidraw (.excalidrawlib)', 'err');
      return;
    }
    const libName = file.name.replace(/\.(excalidrawlib|json)$/i, '');
    const newItems = json.libraryItems.map((item, idx) => ({
      id: item.id || `imp-${uid()}-${idx}`,
      name: item.name || `${libName} #${idx + 1}`,
      category: 'custom',
      elements: item.elements || [],
    }));
    importedLibraries.push({ name: libName, items: newItems });
    saveImportedLibraries();
    activeLibFilter = 'custom';
    const chip = document.querySelector(`.board-lib-chip[data-lib="custom"]`);
    if (chip) {
      document.querySelectorAll('.board-lib-chip').forEach((c) => c.classList.toggle('on', c === chip));
    }
    await renderPresets();
    toast(`Librería "${libName}" importada (${newItems.length} elementos)`, 'ok');
  } catch (err) {
    toast('Error al leer la librería: ' + err.message, 'err');
  }
}

function presetScene(t) {
  return t.build({ ...PALETTE, muted: '#868e96', primary: PALETTE.primary });
}

function boundsOfElements(els) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of els) {
    const pts = Array.isArray(e.points) && e.points.length
      ? e.points.map((p) => [e.x + p[0], e.y + p[1]])
      : [[e.x, e.y], [e.x + (e.width || 0), e.y + (e.height || 0)]];
    for (const p of pts) {
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    }
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 120; maxY = 80; }
  return { minX, minY, maxX, maxY };
}

function blobToDataURL(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(blob); });
}

function isNeutralDark(hex) {
  if (!hex || typeof hex !== 'string') return false;
  const h = hex.trim().toLowerCase();
  return h === '#000' || h === '#000000' || h === '#1e1e1e' || h === '#121212' || h === '#181818' || h === '#212529' || h === 'black';
}

function adaptElementsColor(elements, options = {}) {
  if (!Array.isArray(elements)) return [];
  const isDark = options.isDark !== undefined ? options.isDark : isBoardDark();
  const targetStroke = options.strokeColor || api?.getAppState()?.currentItemStrokeColor || (isDark ? '#ffffff' : '#1e1e1e');

  return elements.map((el) => {
    const copy = { ...el };
    if (isNeutralDark(copy.strokeColor)) {
      copy.strokeColor = targetStroke;
    } else if (copy.type === 'text' && (!copy.strokeColor || isNeutralDark(copy.strokeColor))) {
      copy.strokeColor = targetStroke;
    }
    // En modo oscuro, evitar que un fondo negro sólido tape elementos
    if (isDark && isNeutralDark(copy.backgroundColor)) {
      copy.backgroundColor = 'transparent';
    }
    return copy;
  });
}

async function thumbFromElements(elements, maxW = 190, asDataURL = false) {
  const isDark = isBoardDark();
  const thumbStroke = isDark ? '#f1f3f5' : '#1e1e1e';
  const adapted = adaptElementsColor(elements, { strokeColor: thumbStroke, isDark });
  const els = Ex.restoreElements(JSON.parse(JSON.stringify(adapted)), null);
  const b = boundsOfElements(els);
  const w = Math.max(40, b.maxX - b.minX), h = Math.max(30, b.maxY - b.minY);
  const scale = Math.min(1, maxW / w, 70 / h);
  const blob = await Ex.exportToBlob({
    elements: els,
    appState: { exportBackground: false, viewBackgroundColor: 'transparent', exportWithDarkMode: false },
    files: null,
    getDimensions: (sw, sh) => ({ width: sw * scale, height: sh * scale, scale }),
  });
  return asDataURL ? await blobToDataURL(blob) : URL.createObjectURL(blob);
}

async function presetThumb(t) {
  if (thumbCache[t.id]) return thumbCache[t.id];
  try {
    const { elements } = presetScene(t);
    const url = await thumbFromElements(Ex.convertToExcalidrawElements(elements));
    thumbCache[t.id] = url;
    return url;
  } catch { return null; }
}

// Inserta elementos guardados (presets personalizados y librerías), remapeando ids y adaptando color dinámico
function insertElements(elements, at, dynamicColor = true) {
  if (!api) { toast('Abre el tablero primero', 'err'); return false; }
  const isDark = isBoardDark();
  const activeStroke = api.getAppState()?.currentItemStrokeColor || (isDark ? '#ffffff' : '#1e1e1e');
  const colored = dynamicColor ? adaptElementsColor(elements, { strokeColor: activeStroke, isDark }) : elements;
  const els = Ex.restoreElements(JSON.parse(JSON.stringify(colored)), null);
  const map = {};
  els.forEach((e) => { const nid = uid(); map[e.id] = nid; e.id = nid; });
  els.forEach((e) => {
    if (e.containerId && map[e.containerId]) e.containerId = map[e.containerId];
    if (Array.isArray(e.boundElements)) e.boundElements = e.boundElements.map((b) => ({ ...b, id: map[b.id] || b.id }));
    if (e.startBinding?.elementId && map[e.startBinding.elementId]) e.startBinding.elementId = map[e.startBinding.elementId];
    if (e.endBinding?.elementId && map[e.endBinding.elementId]) e.endBinding.elementId = map[e.endBinding.elementId];
  });
  const b = boundsOfElements(els);
  const c = at || viewportCenter();
  const dx = c.x - (b.minX + b.maxX) / 2, dy = c.y - (b.minY + b.maxY) / 2;
  els.forEach((e) => { e.x += dx; e.y += dy; });
  api.updateScene({ elements: [...api.getSceneElements(), ...els], captureUpdate: 'IMMEDIATELY' });
  scheduleSave();
  return true;
}

async function addCustomPreset(name) {
  if (!api) { toast('Abre el tablero primero', 'err'); return; }
  const sel = selectedIds();
  const all = api.getSceneElements();
  const chosen = all.filter((e) => sel[e.id]);
  const els = (chosen.length ? chosen : all).map((e) => JSON.parse(JSON.stringify(e)));
  if (!els.length) { toast('Dibuja algo (o selecciona) antes de guardar', 'err'); return; }
  const p = { id: 'cst-' + uid(), name: (name || '').trim() || `Preset ${customPresets.length + 1}`, elements: els };
  try { p.thumb = await thumbFromElements(els, 150, true); } catch { p.thumb = null; }
  customPresets.unshift(p);
  saveCustomPresets();
  await renderPresets();
  toast(`Preset "${p.name}" guardado`, 'ok');
}

function deletePreset(id) {
  if (id.startsWith('cst-') || customPresets.some((p) => p.id === id)) {
    customPresets = customPresets.filter((p) => p.id !== id);
    saveCustomPresets();
    toast('Preset personalizado eliminado', 'ok');
  } else if (importedLibraries.some((lib) => lib.items.some((it) => it.id === id))) {
    importedLibraries.forEach((lib) => {
      lib.items = lib.items.filter((it) => it.id !== id);
    });
    importedLibraries = importedLibraries.filter((lib) => lib.items.length > 0);
    saveImportedLibraries();
    toast('Elemento de librería eliminado', 'ok');
  } else {
    if (!hiddenTemplates.includes(id)) {
      hiddenTemplates.push(id);
      saveHiddenTemplates();
    }
    toast('Elemento ocultado (puedes restaurar los predeterminados abajo)', 'ok');
  }
  renderPresets();
}

function restoreDefaultPresets() {
  hiddenTemplates = [];
  saveHiddenTemplates();
  renderPresets();
  toast('Elementos predeterminados restaurados', 'ok');
}

async function renderPresets() {
  const grid = $('#boardPresetGrid');
  if (!grid) return;

  // Tabs de categorías
  const tabs = $('#boardLibTabs');
  if (tabs && !tabs.dataset.bound) {
    tabs.dataset.bound = '1';
    tabs.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-lib]');
      if (!chip) return;
      activeLibFilter = chip.dataset.lib;
      tabs.querySelectorAll('.board-lib-chip').forEach((c) => c.classList.toggle('on', c === chip));
      renderPresets();
    });
  }

  // Buscador en tiempo real
  const searchInput = $('#boardPresetSearch');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1';
    searchInput.addEventListener('input', (e) => {
      presetSearchQuery = (e.target.value || '').trim().toLowerCase();
      renderPresets();
    });
  }

  // Importador de librerías (.excalidrawlib)
  const importBtn = $('#boardLibImportBtn');
  const importInput = $('#boardLibImportInput');
  if (importBtn && !importBtn.dataset.bound) {
    importBtn.dataset.bound = '1';
    importBtn.addEventListener('click', () => importInput?.click());
  }
  if (importInput && !importInput.dataset.bound) {
    importInput.dataset.bound = '1';
    importInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (file) await importLibraryFile(file);
      e.target.value = '';
    });
  }

  // Asegurar que las librerías por defecto se carguen si aún no están
  if (!libraryItemsMath.length && !libraryItemsTeacher.length) {
    loadDefaultLibraries().then(() => renderPresets());
  }

  const allItems = [];
  // 1. Plantillas de Economía
  BOARD_TEMPLATES.forEach((t) => {
    if (!hiddenTemplates.includes(t.id)) {
      allItems.push({ id: t.id, name: t.name, desc: t.desc || 'Plantilla de economía', category: 'econ', elements: null });
    }
  });
  // 2. Símbolos matemáticos
  libraryItemsMath.forEach((m) => {
    if (!hiddenTemplates.includes(m.id)) {
      allItems.push({ id: m.id, name: m.name, desc: m.origName || 'Símbolo matemático', category: 'math', elements: m.elements });
    }
  });
  // 3. Geometría y diagramas
  libraryItemsTeacher.forEach((tc) => {
    if (!hiddenTemplates.includes(tc.id)) {
      allItems.push({ id: tc.id, name: tc.name, desc: tc.origName || 'Diagrama geométrico', category: 'teacher', elements: tc.elements });
    }
  });
  // 4. Presets guardados por el usuario
  customPresets.forEach((p) => {
    allItems.push({ id: p.id, name: p.name, desc: 'Preset guardado', category: 'custom', elements: p.elements, custom: true, thumb: p.thumb });
  });
  // 5. Librerías importadas
  importedLibraries.forEach((lib) => {
    (lib.items || []).forEach((it) => {
      allItems.push({ id: it.id, name: it.name, desc: lib.name, category: 'custom', elements: it.elements, custom: true });
    });
  });

  // Filtrado por categoría
  let filtered = allItems;
  if (activeLibFilter !== 'all') {
    filtered = filtered.filter((it) => it.category === activeLibFilter);
  }
  // Filtrado por buscador
  if (presetSearchQuery) {
    filtered = filtered.filter((it) =>
      it.name.toLowerCase().includes(presetSearchQuery) ||
      (it.desc && it.desc.toLowerCase().includes(presetSearchQuery))
    );
  }

  if (!filtered.length) {
    grid.innerHTML = `<p class="board-preset-hint" style="text-align:center;padding:18px 8px;">No se encontraron elementos.</p>`;
    return;
  }

  grid.innerHTML = filtered.map((t) => `
    <div class="board-preset" role="button" tabindex="0" data-preset="${t.id}" title="${t.name} · ${t.desc || ''}">
      <span class="board-preset-thumb"><i class="ri-loader-4-line spin"></i></span>
      <b>${t.name}</b>
      <button type="button" class="board-preset-del" data-presetdel="${t.id}" title="Eliminar / ocultar" aria-label="Eliminar preset">
        <i class="ri-close-line"></i>
      </button>
    </div>`).join('') + (hiddenTemplates.length ? `
    <button type="button" class="btn btn-ghost btn-sm" id="boardRestorePresets" style="width:100%;font-size:0.75rem;justify-content:center;gap:5px;padding:7px 10px;margin-top:4px;">
      <i class="ri-refresh-line"></i> Restaurar predeterminados (${hiddenTemplates.length})
    </button>` : '');

  if (!grid.dataset.bound) {
    grid.dataset.bound = '1';

    // Evitar que pointerdown sobre el botón de borrar o restaurar active el arrastre
    grid.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-presetdel]') || e.target.closest('#boardRestorePresets')) {
        e.stopPropagation();
      }
    }, true);

    grid.addEventListener('click', (e) => {
      const restoreBtn = e.target.closest('#boardRestorePresets');
      if (restoreBtn) {
        e.preventDefault();
        e.stopPropagation();
        restoreDefaultPresets();
        return;
      }
      const del = e.target.closest('[data-presetdel]');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        deletePreset(del.dataset.presetdel);
        return;
      }
      const card = e.target.closest('[data-preset]');
      if (card && !card.dataset.dragged) insertTemplate(card.dataset.preset);
    });

    grid.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const card = e.target.closest('[data-preset]');
        if (card && e.target === card) {
          e.preventDefault();
          insertTemplate(card.dataset.preset);
        }
      }
    });

    bindPresetDrag(grid);
  }

  for (const t of filtered) {
    const box = grid.querySelector(`[data-preset="${t.id}"] .board-preset-thumb`);
    if (!box) continue;
    if (thumbCache[t.id]) {
      box.innerHTML = `<img src="${thumbCache[t.id]}" alt="">`;
      continue;
    }
    try {
      let url = null;
      if (t.thumb) {
        url = t.thumb;
      } else if (t.elements) {
        url = await thumbFromElements(t.elements, 190, true);
      } else {
        const tmpl = BOARD_TEMPLATES.find((x) => x.id === t.id);
        if (tmpl) url = await presetThumb(tmpl);
      }
      if (url) {
        thumbCache[t.id] = url;
        box.innerHTML = `<img src="${url}" alt="">`;
      } else {
        box.innerHTML = '<i class="ri-shape-line"></i>';
      }
    } catch {
      box.innerHTML = '<i class="ri-shape-line"></i>';
    }
  }
}

// Arrastrar un preset desde la barra y soltarlo en el lienzo (posición real del drop)
function bindPresetDrag(grid) {
  let drag = null;
  grid.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-presetdel]') || e.target.closest('#boardRestorePresets')) return;
    const card = e.target.closest('[data-preset]');
    if (!card || !api) return;
    e.preventDefault();
    card.dataset.dragged = '1';
    card.setPointerCapture(e.pointerId);
    const thumb = card.querySelector('img')?.src || '';
    const ghost = document.createElement('div');
    ghost.className = 'board-ghost';
    if (thumb) ghost.innerHTML = `<img src="${thumb}" alt="">`;
    ghost.style.left = e.clientX - 75 + 'px';
    ghost.style.top = e.clientY - 40 + 'px';
    const host = document.fullscreenElement || document.querySelector('#boardCard') || document.body;
    host.appendChild(ghost);
    drag = { id: card.dataset.preset, ghost, moved: false };

    const move = (ev) => {
      drag.moved = true;
      ghost.style.left = ev.clientX - 75 + 'px';
      ghost.style.top = ev.clientY - 40 + 'px';
      const over = overCanvas(ev.clientX, ev.clientY);
      $('#boardCanvasWrap')?.classList.toggle('board-dropover', over);
    };
    const up = (ev) => {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      card.removeEventListener('pointercancel', up);
      ghost.remove();
      $('#boardCanvasWrap')?.classList.remove('board-dropover');
      const drop = overCanvas(ev.clientX, ev.clientY);
      if (drag.moved && drop) {
        const p = Ex.viewportCoordsToSceneCoords({ clientX: ev.clientX, clientY: ev.clientY }, api.getAppState());
        insertTemplate(drag.id, p);
        const cv = document.querySelector('#boardCanvas canvas.interactive') || document.querySelector('#boardCanvas canvas');
        if (cv) try { cv.focus(); } catch {}
      }
      drag = null;
      setTimeout(() => { delete card.dataset.dragged; }, 60);
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up, { once: true });
    card.addEventListener('pointercancel', up, { once: true });
  });
}

function overCanvas(clientX, clientY) {
  const cv = document.querySelector('#boardCanvas .excalidraw canvas') || $('#boardCanvas');
  if (!cv) return false;
  const r = cv.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

export function initWhiteboard() {
  let started = false;
  let onBoard = false;
  const maybe = () => {
    const h = location.hash || '';
    const isBoard = h === '#/tablero' || h.startsWith('#/tablero?');
    if (isBoard) {
      if (!started) { started = true; }
      onBoard = true;
      mountBoard();
      return;
    }
    // Al salir del tablero: guardar y cancelar guardados pendientes
    if (onBoard) {
      onBoard = false;
      try { cancelPendingSave(); persistActive().catch(() => {}); } catch {}
    }
  };
  maybe();
  bus.addEventListener('route:changed', maybe);
  // Salvaguarda: guardar también al cerrar/recargar la pestaña
  window.addEventListener('beforeunload', () => { try { cancelPendingSave(); persistActive().catch(() => {}); } catch {} });

  // Capturar atajos de deshacer/rehacer globalmente cuando estamos en el tablero
  window.addEventListener('keydown', (e) => {
    if (!onBoard || !api) return;
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;

    // Si el usuario está escribiendo en un input o textarea externo (ej. modal LaTeX o renombrado), respetar su edición
    const act = document.activeElement;
    if (act && (act.tagName === 'INPUT' || (act.tagName === 'TEXTAREA' && !act.classList.contains('excalidraw-wysiwyg')) || act.isContentEditable)) {
      return;
    }

    const canvas = document.querySelector('#boardCanvas canvas.interactive') || document.querySelector('#boardCanvas canvas');
    if (!canvas) return;

    if (act !== canvas) {
      e.preventDefault();
      const synthetic = new KeyboardEvent('keydown', {
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        bubbles: true,
        cancelable: true,
      });
      canvas.dispatchEvent(synthetic);
    }
  });

  bus.addEventListener('theme:changed', (e) => {
    currentTheme = e.detail || currentTheme;
    Object.keys(thumbCache).forEach((k) => delete thumbCache[k]);
    if (api && mounted) {
      try {
        api.updateScene({ appState: { theme: boardTheme(), viewBackgroundColor: 'transparent' } });
        renderPresets();
      } catch {}
    }
  });
  window.EconHub = {
    ...(window.EconHub || {}),
    board: {
      mount: mountBoard, create: createBoard, switch: switchBoard,
      insertPlotPNG: importPlotPNG, insertLatex, insertTemplate,
      exportPNG: exportBoardPNG, exportFile: exportBoardFile, importFile: importBoardFile,
      toggleToolbar, setToolbarCollapsed,
      get api() { return api; },
    },
  };
}
