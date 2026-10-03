// econhub · plotter.js — graficadora pro v4
// 4 modos (1 variable, paramétrico, polar, 2 variables), análisis completo,
// sampling adaptativo, derivada/tangente, integral/área, tabla, exportación,
// persistencia y calibración robusta.
import { $, store, toast, bus } from './app.js';
import { PALETTE, KEYS } from './data.js';

let math = null;
const FN_COLORS = [PALETTE.teal, PALETTE.violet, PALETTE.highlight, PALETTE.info, PALETTE.success, PALETTE.primary, '#e53935', '#fb8c00'];
const STORE_KEY = 'econhub:plot';
const MAX_FUNCS = 8;

// Rango de zoom: de 0.1 % (ver valores muy grandes) a 200 000 % (detalle fino).
// El slider es logarítmico, si no sería inusable con este rango.
const ZOOM_MIN = 0.001;
const ZOOM_MAX = 2000;
const zoomToSlider = (z) => Math.log10(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)));
const sliderToZoom = (v) => Math.pow(10, parseFloat(v));
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Presets categorizados
const PRESET_CATS = [
  { id: 'econ', name: 'Economía', items: [
    '20 - 2*x', '2 + 0.5*x', '100 - 2*x', '10*x - 0.5*x^2', '100*x - 5*x^2',
    '0.5*x^2 - 4*x + 20', '50/x', 'x^0.5', '4*x^0.25', '12 + 3*x - 0.2*x^2',
    'exp(-0.1*x)', 'log(x+1)',
  ] },
  { id: 'crecimiento', name: 'Crecimiento y modelos', items: [
    'exp(0.03*x)', '10*exp(0.02*x)', 'x^(1/3)', '5*x^0.33', '2.5*exp(-0.05*x)', '1/(1+exp(-x))',
  ] },
  { id: 'basicas', name: 'Básicas', items: ['x^2', 'x^3 - 4*x', '1/x', 'sqrt(x+4)', 'abs(x)', 'x^4 - 5*x^2 + 4'] },
  { id: 'trig', name: 'Trigonométricas', items: ['sin(x)', 'cos(x)', 'tan(x)', 'sin(x)*cos(x)', 'sin(2*x)', 'cos(x/2)'] },
  { id: 'exp', name: 'Exponencial / Log', items: ['exp(x)', 'exp(-0.1*x)', 'log(x+5)', 'x*log(x+1)', '2^x', 'exp(-x^2)'] },
  { id: 'param', name: 'Paramétricas', items: ['cos(t), sin(t)', '2*cos(t), sin(t)', 'cos(3*t), sin(2*t)', 't*cos(t), t*sin(t)'] },
  { id: 'polar', name: 'Polares', items: ['2 + sin(3*theta)', 'cos(4*theta)', '1 + cos(theta)', 'theta/2', '2*cos(2*theta)'] },
];
const PRESETS_2V = [
  { expr: 'sin(x)*cos(y)', label: 'sin(x)·cos(y)' },
  { expr: 'x^2 - y^2', label: 'x² − y²' },
  { expr: 'exp(-0.05*(x^2+y^2))', label: 'exp(−0.05·(x²+y²))' },
  { expr: 'sin(sqrt(x^2+y^2))', label: 'sin(√(x²+y²))' },
  { expr: 'x^2 + y^2', label: 'x² + y²' },
  { expr: 'x*y', label: 'x·y' },
];

let state = {
  mode: '1v',
  funcs: [{ id: uid(), expr: 'x^2', color: FN_COLORS[0], visible: true, bad: false }],
  funcsByMode: null,
  pan: { x: 0, y: 0, zoom: 1 },
  settings: { showGrid: true, showAxes: true, crosshair: true, snap: true, derivative: false, integral: false, integralA: -2, integralB: 2 },
  paramRange: { tMin: 0, tMax: 6.283, polarThetaMax: 6.283 },
  analysis: { roots: [], extrema: [], intersections: [] },
};

function uid() { return Math.random().toString(36).slice(2, 9); }

function prettyExpr(s) {
  if (!s) return '';
  return s.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/\*/g, '·').replace(/\//g, '÷')
    .replace(/sqrt\(/g, '√(').replace(/theta/g, 'θ').replace(/alpha/g, 'α');
}

function loadMath() {
  if (math) return Promise.resolve(math);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjs@12.4.1/lib/browser/math.js';
    s.onload = () => { math = window.math; res(math); };
    s.onerror = () => rej(new Error('No se pudo cargar mathjs'));
    document.head.appendChild(s);
  });
}

function loadState() {
  try {
    const saved = store.get(STORE_KEY, null);
    if (!saved) { state.funcs = sanitizeFuncsFor(state.mode, state.funcs); return; }
    if (saved.funcsByMode && typeof saved.funcsByMode === 'object') {
      state.funcsByMode = state.funcsByMode || {};
      for (const m of ['1v', 'param', 'polar', '2v']) {
        if (Array.isArray(saved.funcsByMode[m])) state.funcsByMode[m] = sanitizeFuncsFor(m, saved.funcsByMode[m]);
      }
    }
    if (typeof saved.mode === 'string' && ['1v', 'param', 'polar', '2v'].includes(saved.mode)) state.mode = saved.mode;
    if (state.funcsByMode && Array.isArray(state.funcsByMode[state.mode])) {
      state.funcs = sanitizeFuncsFor(state.mode, state.funcsByMode[state.mode]);
    } else if (Array.isArray(saved.funcs)) {
      // Migración de guardados antiguos (una sola lista): se asigna a su modo
      state.funcsByMode = state.funcsByMode || {};
      state.funcs = sanitizeFuncsFor(state.mode, saved.funcs);
      state.funcsByMode[state.mode] = state.funcs;
    } else {
      state.funcs = sanitizeFuncsFor(state.mode, state.funcs);
    }
    if (saved.pan) {
      state.pan = saved.pan;
      // Sanea el zoom guardado (por si viene de un rango antiguo o corrupto)
      state.pan.zoom = clampZoom(Number.isFinite(state.pan.zoom) ? state.pan.zoom : 1);
    }
    if (saved.settings) state.settings = { ...state.settings, ...saved.settings };
    if (saved.paramRange) state.paramRange = { ...state.paramRange, ...saved.paramRange };
  } catch {}
}

function saveState() {
  try {
    state.funcsByMode = state.funcsByMode || {};
    state.funcsByMode[state.mode] = state.funcs;
    store.set(STORE_KEY, { mode: state.mode, funcs: state.funcs, funcsByMode: state.funcsByMode, pan: state.pan, settings: state.settings, paramRange: state.paramRange });
  } catch {}
}

// Cada modo conserva sus propias funciones: cambiar de modo jamás borra nada.
function defaultFuncsFor(mode) {
  if (mode === 'param') return [{ id: uid(), xExpr: 'cos(t)', yExpr: 'sin(t)', color: FN_COLORS[0], visible: true, bad: false }];
  if (mode === 'polar') return [{ id: uid(), expr: '2 + sin(3*theta)', color: FN_COLORS[0], visible: true, bad: false }];
  if (mode === '2v') return [{ id: uid(), expr: 'sin(x)*cos(y)', color: FN_COLORS[0], visible: true, bad: false }];
  return [{ id: uid(), expr: 'x^2', color: FN_COLORS[0], visible: true, bad: false }];
}
// Descarta funciones incompatibles con el modo (p. ej. restos de otro modo) y garantiza al menos una válida.
function sanitizeFuncsFor(mode, funcs) {
  const list = Array.isArray(funcs) ? funcs.slice(0, MAX_FUNCS) : [];
  const ok = list.filter(f => f && (mode === 'param'
    ? (typeof f.xExpr === 'string' && f.xExpr && typeof f.yExpr === 'string' && f.yExpr)
    : (typeof f.expr === 'string' && f.expr)));
  return ok.length ? ok : defaultFuncsFor(mode);
}

function saveSliderStore(snap) {
  try { store.set(KEYS.plotSliders, snap); } catch {}
}
function loadSliderStore() {
  try {
    const s = store.get(KEYS.plotSliders, null);
    if (s && typeof s === 'object') return { params: s.params || {}, cfg: s.cfg || {}, pos: s.pos || null, hidden: !!s.hidden };
  } catch {}
  return { params: {}, cfg: {}, pos: null, hidden: false };
}

function niceStep(span) {
  const raw = span / 8;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  return (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
}
function fmtNum(v) {
  if (!isFinite(v)) return '—';
  if (v === 0 || Math.abs(v) < 1e-9) return '0';
  const a = Math.abs(v);
  // Solo notación científica en extremos; el resto se muestra legible
  if (a >= 1e6 || a < 1e-6) return v.toExponential(2).replace(/\.?0+e/, 'e');
  const dec = a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4;
  return String(parseFloat(v.toFixed(dec)));
}

// Normaliza lo que escribe el usuario: admite 10x, sen(), √(), ÷·×, θ/π, f(x)=…
function normalizeExpr(raw) {
  if (raw == null) return '';
  let s = String(raw).trim()
    .replace(/[÷]/g, '/').replace(/[·]/g, '*').replace(/[×]/g, '*')
    .replace(/[θ]/g, 'theta').replace(/[π]/g, 'pi')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/\b(sen|seno)\s*\(/gi, 'sin(')
    .replace(/\bln\s*\(/gi, 'log(')
    .replace(/^\s*(f\s*\(\s*x\s*\)|y)\s*=/i, '');
  // multiplicación implícita: 10x → 10*x · 2sin(x) → 2*sin(x) · )( → )*( · x( → x*(
  // (con guardas: no rompe sqrt(/cot(, ni notación 2e3)
  s = s.replace(/(\d)(?=[a-df-zA-DF-Z_θπ(])/g, '$1*')
    .replace(/(\d)(?=exp\()/g, '$1*')
    .replace(/(\))(?=[a-zA-Z0-9_(θπ])/g, '$1*')
    .replace(/(?<![a-zA-Z])([xyt])(?=\()/g, '$1*')
    .replace(/(?<![a-zA-Z])([xyt])(?=\d)/g, '$1*')
    .replace(/(?<![a-zA-Z])(pi|theta)(?=[a-zA-Z0-9_(])/g, '$1*')
    .replace(/\*\*(?=\*)/g, '*');
  return s;
}

// Compilación cacheada
const compileCache = new Map();
function compileExpr(expr, vars) {
  const key = expr + '|' + vars.join(',');
  if (compileCache.has(key)) return compileCache.get(key);
  try {
    const node = math.parse(expr);
    const code = node.compile();
    compileCache.set(key, code);
    return code;
  } catch (e) {
    return null;
  }
}
function safeEval(expr, scope) {
  try {
    const code = compileExpr(expr, Object.keys(scope));
    if (!code) return NaN;
    const v = code.evaluate(scope);
    return typeof v === 'object' && v !== null ? Number(v) : v;
  } catch { return NaN; }
}
function validateExpr(expr, vars = ['x']) {
  if (!expr || !expr.trim()) return { ok: false, msg: 'Expresión vacía' };
  try {
    const node = math.parse(expr);
    // probar evaluación rápida
    const scope = {};
    vars.forEach(v => scope[v] = 1);
    const code = node.compile();
    const r = code.evaluate(scope);
    if (typeof r === 'function') return { ok: false, msg: 'Expresión devuelve función' };
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: e.message || 'Sintaxis no válida' };
  }
}

// Sampling adaptativo — con soporte de parámetros a,b,c y rango visible
let _paramScope = {};
function sample1V(expr, rangeX, steps = 700, scope = null) {
  const code = compileExpr(expr, ['x']);
  if (!code) return [];
  const s = scope || _paramScope;
  const pts = [];
  const dx = (rangeX[1] - rangeX[0]) / steps;
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const x = rangeX[0] + i * dx;
    let y = NaN;
    try { y = code.evaluate({ x, ...s }); if (typeof y === 'object') y = Number(y); } catch { y = NaN; }
    // Tope alto: al alejar mucho el zoom aparecen valores enormes y no deben desaparecer
    const valid = isFinite(y) && Math.abs(y) < 1e12;
    if (prev && prev.valid && valid) {
      const dy = Math.abs(y - prev.y);
      if (dy > Math.abs(rangeX[1] - rangeX[0]) * 0.15 && dy < 1e4) {
        const midX = (prev.x + x) / 2;
        let midY = NaN;
        try { midY = code.evaluate({ x: midX, ...s }); if (typeof midY === 'object') midY = Number(midY); } catch { midY = NaN; }
        if (isFinite(midY) && Math.abs(midY - prev.y) < dy * 0.9 && Math.abs(y - midY) < dy * 0.9) {
          pts.push({ x: midX, y: midY, valid: true });
        }
      }
    }
    pts.push({ x, y, valid });
    prev = { x, y, valid };
  }
  return pts;
}

export function initPlotter() {
  let built = false;
  const maybe = () => {
    if (!built && (location.hash || '').includes('herramientas')) {
      built = true;
      loadState();
      buildPlot();
    }
  };
  maybe();
  bus.addEventListener('route:changed', maybe);
}

function buildPlot() {
  const box = $('#plotBody');
  box.innerHTML = `
  <div class="plot-geogebra">
    <!-- Navegación jerárquica amplia -->
    <div class="gg-nav glass">
      <div class="gg-nav-left">
        <span class="gg-nav-title"><i class="ri-compass-3-line"></i> Modos</span>
        <div class="gg-tabs" id="plotModeSeg">
          <button class="gg-tab active" data-mode="1v"><i class="ri-function-line"></i><span>Función</span><small>f(x)</small></button>
          <button class="gg-tab" data-mode="param"><i class="ri-route-line"></i><span>Paramétrica</span><small>x(t), y(t)</small></button>
          <button class="gg-tab" data-mode="polar"><i class="ri-compass-discover-line"></i><span>Polar</span><small>r(θ)</small></button>
          <button class="gg-tab" data-mode="2v"><i class="ri-landscape-line"></i><span>Superficie</span><small>f(x,y)</small></button>
        </div>
      </div>
      <div class="gg-nav-right">
        <span class="badge gg-badge" id="plotInfoBadge">1 variable · vista cartesiana</span>
        <button class="btn btn-ghost btn-sm" id="plotHelpBtn" title="Sintaxis y atajos"><i class="ri-question-line"></i> Ayuda</button>
      </div>
    </div>

    <div class="gg-body">
      <!-- Panel álgebra · espacioso y pedagógico -->
      <aside class="gg-algebra">
        <div class="gg-card">
          <div class="gg-card-head">
            <h4><i class="ri-stack-line"></i> Álgebra <span id="plotFuncCount" class="badge">1/${MAX_FUNCS}</span></h4>
            <button class="btn btn-ghost btn-sm" id="plotExportJson" title="Exportar JSON"><i class="ri-download-2-line"></i></button>
          </div>
          <div id="plotFnList" class="plot-fnlist gg-fnlist"></div>
        </div>

        <details class="gg-group" id="plotGroupAnalysis" open>
          <summary><i class="ri-compass-3-line"></i> Análisis <i class="ri-arrow-down-s-line gg-chevron"></i></summary>
          <div class="gg-group-body">
            <div class="gg-checks">
              <label class="gg-check"><input type="checkbox" id="plotShowDeriv"><span>Derivada</span></label>
              <label class="gg-check"><input type="checkbox" id="plotShowIntegral"><span>Área</span></label>
            </div>
            <div id="plotAnalysis" class="plot-analysis">Añade funciones para ver raíces, extremos e intersecciones.</div>
            <div id="plotIntegralCtrl" class="plot-integral-ctrl hidden">
              <div class="gg-range">
                <label><span>a</span> <input type="number" id="plotA" value="-2" step="0.5" class="gg-number"></label>
                <label><span>b</span> <input type="number" id="plotB" value="2" step="0.5" class="gg-number"></label>
              </div>
              <div id="plotAreaVal" class="gg-area">Área ≈ —</div>
            </div>
          </div>
        </details>

      </aside>

      <!-- Lienzo amplio y destacado · estilo GeoGebra -->
      <main class="gg-graphics">
        <div class="gg-canvas-card">
          <div class="gg-toolsbar" role="toolbar" aria-label="Herramientas de construcción">
            <div class="gg-tools-group" id="plotTools">
              <button class="gg-tool active" data-tool="pan" title="Mover vista (arrastrar)"><i class="ri-drag-move-line"></i></button>
              <button class="gg-tool" data-tool="inspect" title="Inspeccionar valores (clic)"><i class="ri-cursor-line"></i></button>
              <button class="gg-tool" data-tool="point" title="Punto (clic para fijar)"><i class="ri-map-pin-line"></i></button>
              <button class="gg-tool" data-tool="tangent" title="Tangente (clic sobre una curva)"><i class="ri-line-chart-line"></i></button>
              <button class="gg-tool" data-tool="intersect" title="Recalcular intersecciones"><i class="ri-close-circle-line"></i></button>
              <button class="gg-tool" data-tool="box" title="Zoom por recuadro (arrastrar)"><i class="ri-focus-2-line"></i></button>
            </div>
            <span class="gg-tools-sep"></span>
            <div class="gg-tools-group">
              <button class="gg-tool" id="plotUndo" title="Deshacer (Ctrl+Z)"><i class="ri-arrow-go-back-line"></i></button>
              <button class="gg-tool" id="plotRedo" title="Rehacer (Ctrl+Shift+Z)"><i class="ri-arrow-go-forward-line"></i></button>
            </div>
            <span class="gg-tools-sep"></span>
            <div class="gg-tools-group">
              <button class="gg-tool" id="plotGridTool" title="Cuadrícula (G)"><i class="ri-grid-line"></i></button>
              <button class="gg-tool" id="plotSnapTool" title="Imanes a puntos (S)"><i class="ri-anchor-line"></i></button>
              <button class="gg-tool" id="plotFitTool" title="Ajustar vista (F)"><i class="ri-focus-3-line"></i></button>
              <button class="gg-tool" id="plotHomeTool" title="Centrar en (0,0)"><i class="ri-home-4-line"></i></button>
              <button class="gg-tool" id="plotFullTool" title="Pantalla completa"><i class="ri-fullscreen-line"></i></button>
            </div>
            <span class="gg-tools-sep"></span>
            <div class="gg-tools-group">
              <button class="gg-tool" id="plotSlidersBtn" title="Deslizadores (a, b, c…) — clic para mostrar/ocultar"><i class="ri-equalizer-line"></i></button>
              <button class="gg-tool" id="plotLibBtn" title="Biblioteca de funciones"><i class="ri-sparkling-line"></i></button>
              <button class="gg-tool" id="plotTableTool" title="Tabla de valores"><i class="ri-table-line"></i></button>
              <button class="gg-tool" id="plotSettingsBtn" title="Vista y exportación"><i class="ri-settings-3-line"></i></button>
            </div>
            <span class="gg-tools-sep gg-tools-sep-flex"></span>
            <div class="gg-coords mono" id="plotCoords">x: — · y: —</div>
            <div class="gg-toolbar-right"><span class="gg-zoom-badge mono" id="plotZoomBadge">100%</span></div>
          </div>
          <div class="gg-inputbar">
            <span class="gg-inputbar-plus" title="Añadir">+</span>
            <input id="plotTopInput" class="gg-inputbar-field" placeholder="Entrada: escribe f(x), un comando o una fórmula y pulsa Enter — ej: 10x-0.5x^2" autocomplete="off" spellcheck="false">
            <button class="gg-tool" id="plotCopyLink" title="Copiar enlace de esta vista"><i class="ri-link-m"></i></button>
          </div>
          <div id="plotModeStrip" class="gg-modestrip hidden"></div>
          <div id="plotLibDrop" class="gg-drop hidden">
            <div class="gg-drop-head"><b><i class="ri-sparkling-line"></i> Biblioteca de funciones</b><button class="icon-btn tiny" data-closedrop title="Cerrar"><i class="ri-close-line"></i></button></div>
            <div id="plotPresetCats" class="gg-presets"></div>
            <div id="plotPresets2v" class="hidden gg-presets">
              ${PRESETS_2V.map(p => `<button class="gg-preset" data-preset2v="${p.expr}">${p.label}</button>`).join('')}
            </div>
          </div>
          <div id="plotSettingsDrop" class="gg-drop hidden">
            <div class="gg-drop-head"><b><i class="ri-settings-3-line"></i> Vista y exportación</b><button class="icon-btn tiny" data-closedrop title="Cerrar"><i class="ri-close-line"></i></button></div>
            <div class="gg-settings-grid">
              <label class="gg-check"><input type="checkbox" id="plotGridChk" checked> Cuadrícula</label>
              <label class="gg-check"><input type="checkbox" id="plotSnapChk" checked> Imanes</label>
              <label class="gg-range-label">Zoom <b id="plotZoomVal" class="mono">100%</b><input type="range" id="plotZoom" min="-3" max="3.301" step="0.01" value="0"></label>
              <label>Resolución <select id="plotRes" class="gg-select"><option value="low">Baja</option><option value="mid" selected>Media</option><option value="high">Alta</option></select></label>
            </div>
            <div class="gg-actions">
              <button class="btn btn-ghost btn-sm" id="plotFitBtn"><i class="ri-focus-3-line"></i> Ajustar</button>
              <button class="btn btn-ghost btn-sm" id="plotCenterBtn"><i class="ri-crosshair-line"></i> Centrar</button>
              <button class="btn btn-ghost btn-sm" id="plotSaveBtn"><i class="ri-save-3-line"></i> Guardar</button>
              <button class="btn btn-ghost btn-sm" id="plotClearBtn"><i class="ri-delete-bin-line"></i> Limpiar</button>
              <button class="btn btn-primary btn-sm" id="plotPngBtn"><i class="ri-image-line"></i> PNG</button>
            </div>
          </div>
          <div class="gg-canvas-wrap" id="plotCanvasWrap">
            <canvas id="plotCanvas"></canvas>
            <div id="plotReadout" class="plot-readout hidden"></div>
            <div id="plotCross" class="plot-cross hidden"></div>
            <div id="plotBoxSel" class="gg-boxsel hidden"></div>
            <div id="plotTablePanel" class="gg-tablepanel hidden">
              <div class="gg-drop-head"><b><i class="ri-table-line"></i> Tabla de valores</b><button class="icon-btn tiny" id="plotTableClose" title="Cerrar"><i class="ri-close-line"></i></button></div>
              <div id="plotTableWrap" class="plot-table-wrap"></div>
            </div>
            <div id="plotSlidersFloat" class="gg-slidersfloat hidden">
              <div class="gg-sf-head" id="plotSlidersHead" title="Arrastra para mover el panel">
                <b><i class="ri-equalizer-line"></i> Deslizadores</b>
                <span class="gg-sf-actions">
                  <button class="icon-btn tiny" id="plotSlidersPlayAll" title="Animar / pausar todos"><i class="ri-play-fill"></i></button>
                  <button class="icon-btn tiny" id="plotSlidersHide" title="Ocultar panel"><i class="ri-eye-off-line"></i></button>
                </span>
              </div>
              <div id="plotParamSliders" class="gg-sliders"></div>
            </div>
            <button id="plotSlidersShow" class="gg-slidersshow hidden" title="Mostrar deslizadores"><i class="ri-equalizer-line"></i> Deslizadores</button>
            <div class="gg-fabs" role="toolbar" aria-label="Controles de vista">
              <button class="gg-fab" id="plotZoomIn" title="Acercar (+)"><i class="ri-zoom-in-line"></i></button>
              <button class="gg-fab" id="plotZoomOut" title="Alejar (−)"><i class="ri-zoom-out-line"></i></button>
              <button class="gg-fab" id="plotReset" title="Restablecer vista (doble clic en el lienzo)"><i class="ri-restart-line"></i></button>
              <button class="gg-fab" id="plotFabFull" title="Pantalla completa"><i class="ri-fullscreen-line"></i></button>
            </div>
          </div>
          <div class="gg-canvas-foot">
            <div id="plotLegend" class="gg-legend"></div>
            <div id="plotStatus" class="gg-status muted mono">Arrastra para mover · rueda para zoom · doble clic para restablecer</div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <dialog id="plotHelpDlg" class="plot-help-dlg">
    <div class="modal-card">
      <div class="modal-head"><h2><i class="ri-question-line"></i> Sintaxis de la graficadora</h2><button class="icon-btn" data-close-help><i class="ri-close-line"></i></button></div>
      <div class="plot-help-body">
        <p>Usa <b>mathjs</b>. Variables: <code>x</code> (1v), <code>t</code> (param), <code>theta</code> (polar), <code>x,y</code> (2v). Parámetros libres <code>a,b,c</code> crean sliders.</p>
        <table class="plot-help-table">
          <tr><td><code>^</code></td><td>potencia (x^2)</td><td><code>sqrt(x)</code></td><td>raíz</td></tr>
          <tr><td><code>sin(x) cos(x) tan(x)</code></td><td>trig (rad)</td><td><code>asin(x)</code></td><td>arcsin</td></tr>
          <tr><td><code>exp(x) log(x)</code></td><td>exponencial / log natural</td><td><code>abs(x)</code></td><td>valor absoluto</td></tr>
          <tr><td><code>pi e</code></td><td>constantes</td><td><code>10*x - 0.5*x^2</code></td><td>económica</td></tr>
        </table>
        <p class="muted">Atajos: rueda = zoom · arrastra = mover · doble clic = reset · <b>D</b> derivada · <b>A</b> área · <b>G</b> cuadrícula · <b>F</b> ajustar vista.</p>
        <p><b>Entrada única:</b> todo se escribe en la barra superior — <code>10x - 0.5x^2</code>, <code>f(x)=…</code>, <code>deriv(x^2)</code>, <code>area(x^2, -2, 2)</code>, <code>raices</code>, <code>tabla</code>, <code>centrar</code>, <code>limpiar</code>. Sin <code>*</code> también vale: <code>10x</code> = <code>10·x</code>.</p>
        <p><b>Deslizadores:</b> usa letras como <code>a</code>, <code>b</code>, <code>c</code> o <code>d</code> en tus fórmulas (ej: <code>a·x²</code>, <code>20 - 2·x + a</code>) y aparece un panel flotante que puedes <b>arrastrar donde quieras</b>. Cada deslizador tiene valor exacto, ▶ para <b>animarlo</b> (oscilar, subir o bajar) y ajustes de <b>mín, máx, paso y velocidad</b>. Atajos: <code>a=5</code> crea el número, <code>a=-10..10</code> fija su rango.</p>
        <p><b>Tendencia:</b> marca puntos con la herramienta Punto y escribe <code>tendencia</code> para ajustar la recta de regresión con su R² — ideal para estimar una demanda.</p>
      </div>
    </div>
  </dialog>
  `;

  // Referencias
  const modeSeg = $('#plotModeSeg');
  const inputsWrap = $('#plotModeStrip');
  const fnListEl = $('#plotFnList');
  const analysisEl = $('#plotAnalysis');
  const legendEl = $('#plotLegend');
  const coordsEl = $('#plotCoords');
  const statusEl = $('#plotStatus');
  const readout = $('#plotReadout');
  const cross = $('#plotCross');
  const cv = $('#plotCanvas');

  // Estado UI
  let hoverX = null, hoverY = null;
  let paramSliders = {};
  let sliderCfg = {};        // p -> {min,max,step,speed,mode}
  let sliderAnim = {};       // p -> {playing,dir,last} (no se persiste)
  let slidersPos = null;     // {x,y} px del panel flotante dentro del lienzo
  let slidersHidden = false;
  let lastSliderParams = [];
  _paramScope = paramSliders;
  try {
    const ss = loadSliderStore();
    if (ss.params) { paramSliders = ss.params; _paramScope = paramSliders; }
    if (ss.cfg) sliderCfg = ss.cfg;
    slidersPos = ss.pos || null;
    slidersHidden = !!ss.hidden;
  } catch {}
  function persistSliders(){ saveSliderStore({ params: { ...paramSliders }, cfg: sliderCfg, pos: slidersPos, hidden: slidersHidden }); }
  function syncSlidersBtn(){ const b = $('#plotSlidersBtn'); if (b) b.classList.toggle('active', !!lastSliderParams.length && !$('#plotSlidersFloat')?.classList.contains('hidden')); }
  // Visibilidad central: panel abierto XOR píldora de reapertura (nunca nada huérfano)
  function updateSlidersVisibility(){
    const has = lastSliderParams.length > 0;
    const panel = $('#plotSlidersFloat'), show = $('#plotSlidersShow');
    if (panel) panel.classList.toggle('hidden', slidersHidden || !has);
    if (show) show.classList.toggle('hidden', !(slidersHidden && has));
    syncSlidersBtn();
  }
  function applySlidersPos(){
    const panel = $('#plotSlidersFloat');
    if (!panel) return;
    if (slidersPos && isFinite(slidersPos.x) && isFinite(slidersPos.y)) {
      panel.style.left = slidersPos.x + 'px'; panel.style.top = slidersPos.y + 'px';
      panel.style.bottom = 'auto'; panel.style.right = 'auto';
    } else {
      panel.style.left = '12px'; panel.style.top = 'auto'; panel.style.bottom = '12px'; panel.style.right = 'auto';
    }
  }

  // Entrada única (GeoGebra): la barra superior lo recibe todo.
  // Esta franja solo aparece en modos que piden más campos (param/polar/2v).
  function renderInputs() {
    const m = state.mode;
    if (m === '1v') {
      // Modo función: sin franja extra, todo va por la Entrada superior
      inputsWrap.innerHTML = '';
      inputsWrap.classList.add('hidden');
    } else if (m === 'param') {
      inputsWrap.classList.remove('hidden');
      inputsWrap.innerHTML = `
        <div class="gg-modegrid">
          <label class="gg-field"><span class="gg-fx">x(t) =</span><input id="plotXExpr" class="gg-input" value="${state.funcs[0]?.xExpr || 'cos(t)'}"></label>
          <label class="gg-field"><span class="gg-fx">y(t) =</span><input id="plotYExpr" class="gg-input" value="${state.funcs[0]?.yExpr || 'sin(t)'}"></label>
          <label class="gg-field small"><span>t min</span><input id="plotTMin" type="number" value="${state.paramRange.tMin}" step="0.5" class="gg-number"></label>
          <label class="gg-field small"><span>t max</span><input id="plotTMax" type="number" value="${state.paramRange.tMax}" step="0.5" class="gg-number"></label>
          <button class="btn btn-primary btn-sm" id="plotParamAdd">Añadir curva</button>
        </div>`;
      bindInputParam();
    } else if (m === 'polar') {
      inputsWrap.classList.remove('hidden');
      inputsWrap.innerHTML = `
        <div class="gg-modegrid gg-modegrid-polar">
          <label class="gg-field gg-span"><span class="gg-fx">r(θ) =</span><input id="plotRExpr" class="gg-input" value="${state.funcs[0]?.expr || '2 + sin(3*theta)'}"></label>
          <label class="gg-field small"><span>θ max</span><input id="plotThetaMax" type="number" value="${state.paramRange.polarThetaMax}" step="0.5" class="gg-number"></label>
          <button class="btn btn-primary btn-sm" id="plotPolarAdd">Añadir polar</button>
        </div>`;
      bindInputPolar();
    } else if (m === '2v') {
      inputsWrap.classList.remove('hidden');
      inputsWrap.innerHTML = `
        <div class="gg-modegrid gg-modegrid-2v">
          <label class="gg-field gg-span"><span class="gg-fx">f(x,y) =</span><input id="plot2vExpr" class="gg-input" value="${state.funcs[0]?.expr || 'sin(x)*cos(y)'}"></label>
          <button class="btn btn-primary btn-sm" id="plot2vSet">Aplicar</button>
        </div>`;
      bindInput2v();
    }
    refreshParamSliders();
  }

  function bindInputParam() {
    $('#plotParamAdd').addEventListener('click', () => {
      const xE = normalizeExpr($('#plotXExpr').value), yE = normalizeExpr($('#plotYExpr').value);
      if (!xE || !yE) return toast('Completa x(t) e y(t)', 'err');
      const c1 = validateExpr(xE, ['t', 'a', 'b', 'c', 'd']), c2 = validateExpr(yE, ['t', 'a', 'b', 'c', 'd']);
      if (!c1.ok) return toast('x(t): ' + c1.msg, 'err');
      if (!c2.ok) return toast('y(t): ' + c2.msg, 'err');
      state.funcs.push({ id: uid(), xExpr: xE, yExpr: yE, color: FN_COLORS[state.funcs.length % FN_COLORS.length], visible: true, bad: false });
      state.paramRange.tMin = parseFloat($('#plotTMin').value) || 0;
      state.paramRange.tMax = parseFloat($('#plotTMax').value) || 6.283;
      renderFnList(); draw(); saveState();
    });
  }
  function bindInputPolar() {
    $('#plotPolarAdd').addEventListener('click', () => {
      const rE = normalizeExpr($('#plotRExpr').value);
      if (!rE) return;
      const chk = validateExpr(rE, ['theta', 'a', 'b', 'c', 'd']);
      if (!chk.ok) return toast(chk.msg, 'err');
      state.funcs.push({ id: uid(), expr: rE, color: FN_COLORS[state.funcs.length % FN_COLORS.length], visible: true, bad: false });
      state.paramRange.polarThetaMax = parseFloat($('#plotThetaMax').value) || 6.283;
      renderFnList(); draw(); saveState();
    });
  }
  function bindInput2v() {
    $('#plot2vSet').addEventListener('click', () => {
      const v = normalizeExpr($('#plot2vExpr').value);
      const chk = validateExpr(v, ['x', 'y', 'a', 'b', 'c', 'd']);
      if (!chk.ok) return toast(chk.msg, 'err');
      state.funcs = [{ id: uid(), expr: v, color: FN_COLORS[0], visible: true, bad: false }];
      renderFnList(); draw(); saveState();
    });
  }

  // Deslizadores estilo GeoGebra: número libre + mín/máx/paso/velocidad/modo + animación.
  // Se crean solos al usar letras (a,b,c,d,m,k,n,p) o con a=5 / a=-10..10 en la Entrada.
  function paramDefault(p){ return p === 'a' ? 1 : p === 'b' ? 0 : 5; }
  function clampNum(v, lo, hi){ if (!isFinite(v)) return lo; return Math.min(hi, Math.max(lo, v)); }
  function sliderDef(p){ return sliderCfg[p] || (sliderCfg[p] = { min: -10, max: 10, step: 0.1, speed: 1, mode: 'oscilar' }); }
  function sliderParamsFrom(exprs){
    const seen = [];
    for (const s of exprs) {
      try {
        const node = math.parse(s);
        node.traverse(n => { if (n.isSymbolNode && /^[abcd,mknp]$/.test(n.name) && !seen.includes(n.name)) seen.push(n.name); });
      } catch {}
    }
    return seen;
  }
  function currentSliderExprs(){
    const parts = [normalizeExpr($('#plotTopInput')?.value || '')];
    for (const f of state.funcs) { if (f.expr) parts.push(f.expr); if (f.xExpr) parts.push(f.xExpr); if (f.yExpr) parts.push(f.yExpr); }
    return parts;
  }
  function refreshParamSliders(){
    const params = (typeof math !== 'undefined' && math) ? sliderParamsFrom(currentSliderExprs()) : [];
    for (const p of Object.keys(sliderAnim)) if (!params.includes(p)) sliderStop(p, true);
    const same = params.length === lastSliderParams.length && params.every(p => lastSliderParams.includes(p));
    const isNew = params.some(p => !lastSliderParams.includes(p));
    lastSliderParams = params;
    if (!params.length) { const w = $('#plotParamSliders'); if (w) w.innerHTML = ''; updateSlidersVisibility(); return; }
    if (!same) renderSliders(params);
    else syncSliderValues();
    if (isNew) slidersHidden = false;
    updateSlidersVisibility();
    persistSliders();
  }
  // Compat: antes los sliders vivían bajo la Entrada; ahora todo pasa por el panel flotante
  function refreshParamSlidersFromExpr(){ refreshParamSliders(); }
  function renderSliders(params){
    const wrap = $('#plotParamSliders');
    if (!wrap) return;
    for (const p of params) {
      sliderDef(p);
      if (!(p in paramSliders)) paramSliders[p] = paramDefault(p);
      paramSliders[p] = clampNum(paramSliders[p], sliderCfg[p].min, sliderCfg[p].max);
    }
    wrap.innerHTML = params.map(sliderRowHTML).join('');
    for (const p of params) {
      const sel = wrap.querySelector(`[data-amode="${p}"]`);
      if (sel) sel.value = sliderCfg[p].mode;
    }
    applySlidersPos();
    syncSliderValues();
    persistSliders();
  }
  function sliderRowHTML(p){
    const c = sliderCfg[p];
    return `<div class="gg-slider" data-slider="${p}">
      <div class="gg-slider-top">
        <button class="gg-splay" data-play="${p}" title="Animar / pausar ${p}"><i class="${sliderAnim[p]?.playing ? 'ri-pause-fill' : 'ri-play-fill'}"></i></button>
        <span class="gg-sname">${p} = <b id="pv-${p}"></b></span>
        <input class="gg-snum mono" data-num="${p}" type="number" step="${c.step}" value="" title="Valor exacto de ${p}">
        <button class="gg-sset" data-settings="${p}" title="Mín, máx, paso, velocidad y modo"><i class="ri-settings-3-line"></i></button>
      </div>
      <input class="gg-srange" type="range" data-param="${p}" min="${c.min}" max="${c.max}" step="${c.step}" value="">
      <div class="gg-ssettings hidden" data-sset="${p}">
        <label>mín<input type="number" data-smin="${p}" step="any" value="${c.min}"></label>
        <label>máx<input type="number" data-smax="${p}" step="any" value="${c.max}"></label>
        <label>paso<input type="number" data-sstep="${p}" step="any" min="0" value="${c.step}"></label>
        <label>vel<input type="number" data-sspeed="${p}" step="any" min="0.1" value="${c.speed}"></label>
        <label>modo<select data-amode="${p}"><option value="oscilar">Oscilar</option><option value="subir">Subir</option><option value="bajar">Bajar</option></select></label>
      </div>
    </div>`;
  }
  function setParamValue(p, v){
    const c = sliderDef(p);
    v = clampNum(v, c.min, c.max);
    if (c.step > 0) v = parseFloat((c.min + Math.round((v - c.min) / c.step) * c.step).toFixed(10));
    paramSliders[p] = v;
    syncSliderRow(p);
    scheduleDraw();
    persistSliders();
  }
  function syncSliderRow(p){
    const row = document.querySelector(`[data-slider="${p}"]`);
    if (!row) return;
    const c = sliderCfg[p], v = paramSliders[p];
    const lab = row.querySelector(`#pv-${p}`);
    if (lab) lab.textContent = fmtNum(v);
    const range = row.querySelector('[data-param]');
    if (range) { range.min = c.min; range.max = c.max; range.step = c.step; if (document.activeElement !== range) range.value = v; }
    const num = row.querySelector('[data-num]');
    if (num && document.activeElement !== num) num.value = v;
  }
  function syncSliderValues(){ for (const p of lastSliderParams) syncSliderRow(p); }
  function updatePlayBtn(p){
    const btn = document.querySelector(`[data-play="${p}"]`);
    if (btn) btn.innerHTML = `<i class="${sliderAnim[p]?.playing ? 'ri-pause-fill' : 'ri-play-fill'}"></i>`;
    const any = Object.values(sliderAnim).some(s => s.playing);
    const all = $('#plotSlidersPlayAll');
    if (all) all.innerHTML = `<i class="${any ? 'ri-pause-fill' : 'ri-play-fill'}"></i>`;
  }
  function sliderToggle(p){
    const st = sliderAnim[p];
    if (st && st.playing) sliderStop(p);
    else sliderStart(p);
  }
  function sliderStart(p){
    const c = sliderDef(p);
    const st = sliderAnim[p] || (sliderAnim[p] = { playing: false, dir: 1, last: 0 });
    if (!(p in paramSliders)) paramSliders[p] = paramDefault(p);
    st.playing = true;
    st.last = performance.now();
    if (c.mode === 'bajar') st.dir = paramSliders[p] <= c.min ? 1 : -1;
    else st.dir = paramSliders[p] >= c.max ? (c.mode === 'oscilar' ? -1 : 1) : 1;
    if (c.mode === 'subir' && paramSliders[p] >= c.max) paramSliders[p] = c.min;
    updatePlayBtn(p);
    const stepFn = (now) => {
      if (!st.playing) return;
      const dt = Math.min(0.06, (now - st.last) / 1000);
      st.last = now;
      const span = (c.max - c.min) || 1;
      let v = paramSliders[p] + st.dir * c.speed * span / 6 * dt;
      if (v >= c.max) {
        if (c.mode === 'oscilar') { v = c.max; st.dir = -1; }
        else if (c.mode === 'subir') { v = c.min; st.dir = 1; }
        else { v = c.max; st.dir = -1; }
      } else if (v <= c.min) {
        if (c.mode === 'oscilar') { v = c.min; st.dir = 1; }
        else if (c.mode === 'bajar') { v = c.max; st.dir = -1; }
        else { v = c.min; st.dir = 1; }
      }
      setParamValue(p, v);
      requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }
  function sliderStop(p, silent){
    const st = sliderAnim[p];
    if (st) st.playing = false;
    updatePlayBtn(p);
    if (!silent) persistSliders();
  }
  function sliderStopAll(){ for (const p of Object.keys(sliderAnim)) sliderStop(p, true); persistSliders(); }
  function defineSlider(p, val, range){
    const c = sliderDef(p);
    if (range) {
      if (isFinite(range.min) && isFinite(range.max)) { c.min = Math.min(range.min, range.max); c.max = Math.max(range.min, range.max); }
      if (isFinite(range.step) && range.step > 0) c.step = range.step;
    }
    if (!isFinite(val)) val = (c.min + c.max) / 2;
    paramSliders[p] = clampNum(val, c.min, c.max);
    slidersHidden = false;
    if (typeof ggPush === 'function') ggPush();
    refreshParamSliders(); draw(); saveState(); persistSliders();
    toast(`${p} = ${fmtNum(paramSliders[p])} · deslizador [${fmtNum(c.min)}, ${fmtNum(c.max)}]`, 'ok');
  }

  // Lista de funciones
  function renderFnList() {
    const c = state.funcs.length;
    const countEl = $('#plotFuncCount');
    if (countEl) countEl.textContent = c + '/' + MAX_FUNCS;
    fnListEl.innerHTML = state.funcs.map((f, i) => {
      const label = state.mode === 'param' ? `${prettyExpr(f.xExpr || '')} , ${prettyExpr(f.yExpr || '')}` : prettyExpr(f.expr || '');
      const bad = f.bad ? ' bad' : '';
      const vis = f.visible === false ? ' off' : '';
      return `<div class="plot-fnitem${bad}${vis}" data-fn="${f.id}">
        <span class="fn-dot" style="background:${f.color}"></span>
        <span class="fn-expr mono" title="${(f.expr || f.xExpr || '')}">${label}</span>
        <span class="fn-actions">
          <button class="icon-btn tiny" data-vis="${f.id}" title="${f.visible===false?'Mostrar':'Ocultar'}"><i class="${f.visible===false?'ri-eye-off-line':'ri-eye-line'}"></i></button>
          <button class="icon-btn tiny" data-dup="${f.id}" title="Duplicar"><i class="ri-file-copy-line"></i></button>
          <input type="color" value="${f.color}" data-col="${f.id}" title="Color" class="fn-col">
          ${c>1?`<button class="icon-btn tiny danger" data-del="${f.id}" title="Quitar"><i class="ri-close-line"></i></button>`:''}
        </span>
      </div>`;
    }).join('');
    // Objetos construidos dentro del Álgebra: puntos en todos los modos, tangentes solo en f(x)
    try {
      const pts = (typeof ggPoints !== 'undefined' && ggPoints) || [];
      const tgs = (state.mode === '1v' && typeof ggTangents !== 'undefined' && ggTangents) || [];
      if (pts.length || tgs.length) {
        fnListEl.innerHTML += `<div class="gg-objs-title">Objetos</div>` + pts.map((p, i) =>
          `<div class="plot-fnitem gg-obj"><span class="fn-dot" style="background:${p.color || '#ffc107'}"></span><span class="fn-expr mono">${p.label || ('P' + (i + 1))} = (${fmtNum(p.x)}, ${fmtNum(p.y)})</span><span class="fn-actions"><button class="icon-btn tiny danger" data-ptdel="${i}" title="Quitar punto"><i class="ri-close-line"></i></button></span></div>`
        ).join('') + tgs.map((t, i) =>
          `<div class="plot-fnitem gg-obj"><span class="fn-dot" style="background:var(--accent)"></span><span class="fn-expr mono">Tangente en x=${fmtNum(t.x)}</span><span class="fn-actions"><button class="icon-btn tiny danger" data-tgdel="${i}" title="Quitar tangente"><i class="ri-close-line"></i></button></span></div>`
        ).join('');
      }
    } catch {}
    if (state.mode === '1v' || state.mode === 'param' || state.mode === 'polar') {
      legendEl.innerHTML = state.funcs.filter(f=>f.visible!==false).map((f,i)=>`<span class="legend-item"><i style="background:${f.color}"></i> ${state.mode==='param'?`C${i+1}`:`f${i+1}(x)`}: ${prettyExpr(f.expr||f.xExpr||'')}</span>`).join('');
    } else {
      legendEl.innerHTML = `<span class="legend-item"><i style="background:${state.funcs[0]?.color}"></i> f(x,y)</span>`;
    }
    // tabla si el panel está abierto
    const _tp = $('#plotTablePanel');
    if (_tp && !_tp.classList.contains('hidden')) renderTable();
    // La lista manda: cualquier alta/baja/edición recalcula los deslizadores
    try { refreshParamSliders(); } catch {}
  }

  fnListEl.addEventListener('click', e => {
    const ptdel = e.target.closest('[data-ptdel]');
    if (ptdel) { if (typeof ggPush === 'function') ggPush(); ggPoints.splice(parseInt(ptdel.dataset.ptdel, 10), 1); renderFnList(); draw(); saveState(); return; }
    const tgdel = e.target.closest('[data-tgdel]');
    if (tgdel) { if (typeof ggPush === 'function') ggPush(); ggTangents.splice(parseInt(tgdel.dataset.tgdel, 10), 1); renderFnList(); draw(); saveState(); return; }
    const del = e.target.closest('[data-del]');
    if (del) { if (typeof ggPush === 'function') ggPush(); state.funcs = state.funcs.filter(f=>f.id!==del.dataset.del); renderFnList(); draw(); saveState(); return; }
    const dup = e.target.closest('[data-dup]');
    if (dup) { const f = state.funcs.find(x=>x.id===dup.dataset.dup); if (f && state.funcs.length < MAX_FUNCS) { state.funcs.push({...f, id: uid()}); renderFnList(); draw(); saveState(); } return; }
    const vis = e.target.closest('[data-vis]');
    if (vis) { const f = state.funcs.find(x=>x.id===vis.dataset.vis); if (f) { f.visible = !f.visible; renderFnList(); draw(); saveState(); } return; }
    const item = e.target.closest('[data-fn]');
    if (item && !e.target.closest('button') && !e.target.closest('input')) {
      // editar
      const f = state.funcs.find(x=>x.id===item.dataset.fn);
      if (!f) return;
      const exprEl = item.querySelector('.fn-expr');
      const isParam = state.mode==='param';
      if (item.querySelector('input.fn-edit')) return;
      const inp = document.createElement('input');
      inp.className = 'fn-edit mono';
      inp.value = isParam ? `${f.xExpr},${f.yExpr}` : f.expr;
      exprEl.replaceWith(inp);
      inp.focus(); inp.select();
      const commit = () => {
        const rawv = inp.value.trim();
        if (!rawv) { renderFnList(); return; }
        const v = normalizeExpr(rawv);
        if (!v) { renderFnList(); return; }
        if (isParam) {
          const parts = v.split(',');
          if (parts.length!==2) return toast('Formato: x(t), y(t)', 'err');
          const c1 = validateExpr(parts[0].trim(), ['t','a','b','c','d']), c2 = validateExpr(parts[1].trim(), ['t','a','b','c','d']);
          if (!c1.ok) return toast(c1.msg,'err'); if (!c2.ok) return toast(c2.msg,'err');
          f.xExpr = parts[0].trim(); f.yExpr = parts[1].trim(); f.bad=false;
        } else {
          const chk = validateExpr(v, state.mode==='polar'?['theta','a','b','c','d']: state.mode==='2v'?['x','y','a','b','c','d']: ['x','a','b','c','d']);
          if (!chk.ok) return toast(chk.msg,'err');
          f.expr = v; f.bad=false;
        }
        renderFnList(); draw(); saveState();
      };
      inp.addEventListener('keydown', ev=>{ if(ev.key==='Enter') commit(); if(ev.key==='Escape') renderFnList(); });
      inp.addEventListener('blur', commit);
    }
  });
  fnListEl.addEventListener('input', e=>{
    const col = e.target.closest('[data-col]');
    if(col){ const f=state.funcs.find(x=>x.id===col.dataset.col); if(f){ f.color=col.value; renderFnList(); draw(); saveState(); } }
  });

  // Presets
  const catWrap = $('#plotPresetCats');
  catWrap.innerHTML = PRESET_CATS.map((cat, i)=>`
    <details class="preset-cat" ${i===0?'open':''}>
      <summary>${cat.name}</summary>
      <div class="chip-row">${cat.items.map(p=>`<button class="chip" data-preset="${p}">${prettyExpr(p)}</button>`).join('')}</div>
    </details>
  `).join('');
  catWrap.addEventListener('click', e=>{
    const b = e.target.closest('[data-preset]');
    if(!b) return;
    // Una sola vía de entrada: todo preset pasa por la Entrada (normaliza + valida)
    addExprFromCommand(b.dataset.preset);
  });
  $('#plotPresets2v').addEventListener('click', e=>{
    const b=e.target.closest('[data-preset2v]'); if(!b) return;
    state.funcs=[{id:uid(), expr:b.dataset.preset2v, color: FN_COLORS[0], visible:true, bad:false}];
    const inp=$('#plot2vExpr'); if(inp) inp.value=b.dataset.preset2v;
    renderFnList(); draw(); saveState();
  });

  // Refleja el modo en pestañas + insignia (reutilizable en init y en deshacer)
  function syncModeUI(){
    modeSeg.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active', x.dataset.mode===state.mode));
    const badge = $('#plotInfoBadge');
    if (badge) badge.textContent = { '1v':'1 variable · vista cartesiana', 'param':'Paramétrico · x(t), y(t)', 'polar':'Polar · r(θ)', '2v':'2 variables · f(x,y)'}[state.mode] || state.mode;
    const is2v = state.mode==='2v';
    const cw = $('#plotPresetCats'); if (cw) cw.classList.toggle('hidden', is2v);
    const p2 = $('#plotPresets2v'); if (p2) p2.classList.toggle('hidden', !is2v);
  }

  // Modo — cada modo conserva sus funciones y objetos: cambiar jamás borra
  modeSeg.addEventListener('click', e=>{
    const b=e.target.closest('[data-mode]'); if(!b || b.dataset.mode===state.mode) return;
    state.funcsByMode = state.funcsByMode || {};
    state.funcsByMode[state.mode] = state.funcs;
    state.mode=b.dataset.mode;
    state.funcs = sanitizeFuncsFor(state.mode, state.funcsByMode[state.mode]);
    syncModeUI();
    if (typeof closeDrops === 'function') closeDrops();
    renderInputs();
    renderFnList();
    draw(); saveState();
  });

  // Controles análisis
  const derivChk = $('#plotShowDeriv'), integChk = $('#plotShowIntegral');
  derivChk.checked = !!state.settings.derivative;
  integChk.checked = !!state.settings.integral;
  $('#plotA').value = state.settings.integralA; $('#plotB').value = state.settings.integralB;
  derivChk.addEventListener('change', ()=>{ state.settings.derivative = derivChk.checked; draw(); saveState(); });
  integChk.addEventListener('change', ()=>{ state.settings.integral = integChk.checked; $('#plotIntegralCtrl').classList.toggle('hidden', !integChk.checked); draw(); saveState(); });
  $('#plotA').addEventListener('input', ()=>{ state.settings.integralA = parseFloat($('#plotA').value)||0; draw(); saveState(); });
  $('#plotB').addEventListener('input', ()=>{ state.settings.integralB = parseFloat($('#plotB').value)||1; draw(); saveState(); });
  if(state.settings.integral) $('#plotIntegralCtrl').classList.remove('hidden');

  // Settings
  $('#plotGridChk').checked = state.settings.showGrid;
  $('#plotSnapChk').checked = state.settings.snap;
  $('#plotGridChk').addEventListener('change', e=>{ state.settings.showGrid = e.target.checked; draw(); saveState(); });
  $('#plotSnapChk').addEventListener('change', e=>{ state.settings.snap = e.target.checked; draw(); saveState(); });
  const syncZoomUI=()=>{
    const pct = state.pan.zoom * 100;
    const txt = pct >= 100 ? Math.round(pct) + '%' : (Math.round(pct*10)/10) + '%';
    const a=$('#plotZoomVal'); if(a) a.textContent=txt;
    const b=$('#plotZoomBadge'); if(b) b.textContent=txt;
    const z=$('#plotZoom');
    if(z){ z.min=String(zoomToSlider(ZOOM_MIN)); z.max=String(zoomToSlider(ZOOM_MAX)); z.value=String(zoomToSlider(state.pan.zoom)); }
  };
  $('#plotZoom').addEventListener('input', e=>{ state.pan.zoom = sliderToZoom(e.target.value); syncZoomUI(); draw(); });
  $('#plotRes').addEventListener('change', draw);
  $('#plotFitBtn').addEventListener('click', ()=>{ fitView(); syncZoomUI(); });
  $('#plotCenterBtn').addEventListener('click', ()=>{ state.pan={x:0,y:0,zoom:1}; syncZoomUI(); draw(); saveState(); });

  // Acciones
  $('#plotClearBtn').addEventListener('click', ()=>{ if (typeof ggPush === 'function') ggPush(); ggPoints.length = 0; ggTangents.length = 0; sliderStopAll(); if(state.mode==='1v') state.funcs=[{id:uid(), expr:'x^2', color:FN_COLORS[0], visible:true, bad:false}]; else if(state.mode==='param') state.funcs=[{id:uid(), xExpr:'cos(t)', yExpr:'sin(t)', color:FN_COLORS[0], visible:true, bad:false}]; else if(state.mode==='polar') state.funcs=[{id:uid(), expr:'2 + sin(3*theta)', color:FN_COLORS[0], visible:true, bad:false}]; else state.funcs=[{id:uid(), expr:'sin(x)*cos(y)', color:FN_COLORS[0], visible:true, bad:false}]; renderFnList(); draw(); saveState(); toast('Gráfica limpia'); });
  $('#plotSaveBtn').addEventListener('click', ()=>{ saveState(); toast('Gráfica guardada', 'ok'); });
  $('#plotPngBtn').addEventListener('click', exportPNG);
  $('#plotExportJson').addEventListener('click', exportJSON);
  $('#plotCopyLink').addEventListener('click', copyLink);
  $('#plotTableTool')?.addEventListener('click', toggleTable);
  $('#plotTableClose')?.addEventListener('click', toggleTable);
  $('#plotHelpBtn').addEventListener('click', ()=> $('#plotHelpDlg').showModal());
  document.querySelector('[data-close-help]')?.addEventListener('click', ()=> $('#plotHelpDlg').close());
  $('#plotHelpDlg')?.addEventListener('click', e=>{ if(e.target.id==='plotHelpDlg') e.target.close(); });

  // Barra de comandos tipo GeoGebra
  function addExprFromCommand(rawExpr) {
    const expr = normalizeExpr(rawExpr);
    if (!expr) return;
    if (typeof ggPush === 'function') ggPush();
    const m = state.mode;
    if (m === '2v') {
      const chk = validateExpr(expr, ['x','y','a','b','c','d']);
      if (!chk.ok) { toast(chk.msg, 'err'); return; }
      state.funcs = [{ id: uid(), expr, color: FN_COLORS[0], visible: true, bad: false }];
      const inp = $('#plot2vExpr'); if (inp) inp.value = expr;
    } else if (m === 'param') {
      const parts = expr.split(',');
      if (parts.length !== 2) { toast('Formato paramétrico: x(t), y(t)', 'err'); return; }
      const c1 = validateExpr(normalizeExpr(parts[0]), ['t','a','b','c','d']), c2 = validateExpr(normalizeExpr(parts[1]), ['t','a','b','c','d']);
      if (!c1.ok) { toast('x(t): ' + c1.msg, 'err'); return; }
      if (!c2.ok) { toast('y(t): ' + c2.msg, 'err'); return; }
      state.funcs.push({ id: uid(), xExpr: normalizeExpr(parts[0]), yExpr: normalizeExpr(parts[1]), color: FN_COLORS[state.funcs.length%FN_COLORS.length], visible: true, bad: false });
    } else {
      if (m !== 'polar' && /theta/.test(expr)) { toast('Eso usa θ: cambia al modo Polar para graficarlo', 'err'); return; }
      const vars = m === 'polar' ? ['theta','a','b','c','d'] : ['x','a','b','c','d','m','k'];
      const chk = validateExpr(expr, vars);
      if (!chk.ok) { toast(chk.msg, 'err'); return; }
      if (state.funcs.length >= MAX_FUNCS) { toast('Máximo ' + MAX_FUNCS + ' funciones', 'err'); return; }
      state.funcs.push({ id: uid(), expr, color: FN_COLORS[state.funcs.length%FN_COLORS.length], visible: true, bad: false });
    }
    const main = $('#plotTopInput'); if (main) { main.value = ''; }
    refreshParamSliders();
    renderFnList(); draw(); saveState();
  }
  function runCommand(raw) {
    const cmd = (raw || '').trim();
    if (!cmd) return;
    const low = cmd.toLowerCase();
    const norm = low.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // sin acentos
    const openGroup = (id) => { const g = document.getElementById(id); if (g) g.open = true; };

    // Derivada: "deriv", "derivada" o "deriv(x^2)"
    const dv = cmd.match(/^deriv(?:ada|ative)?\s*\((.+)\)\s*$/i);
    if (dv) {
      addExprFromCommand(dv[1].trim());
      state.settings.derivative = true;
      const c = $('#plotShowDeriv'); if (c) c.checked = true;
      openGroup('plotGroupAnalysis');
      draw(); saveState();
      toast('Derivada activada');
      return;
    }
    if (norm === 'deriv' || norm === 'derivada' || norm === 'derivar') {
      state.settings.derivative = !state.settings.derivative;
      const c = $('#plotShowDeriv'); if (c) c.checked = state.settings.derivative;
      openGroup('plotGroupAnalysis');
      toast(state.settings.derivative ? 'Derivada activada' : 'Derivada desactivada');
      draw(); saveState(); return;
    }

    // Área: "area", "area(a,b)" o "area(expr, a, b)"
    if (norm.startsWith('area')) {
      const inner = cmd.replace(/^[aá]rea\s*/i, '').replace(/^\(/, '').replace(/\)$/, '');
      const parts = inner.split(',').map(s => s.trim()).filter(Boolean);
      let expr = null, a = null, b = null;
      if (parts.length >= 3) { expr = parts[0]; a = parseFloat(parts[1]); b = parseFloat(parts[2]); }
      else if (parts.length === 2) { a = parseFloat(parts[0]); b = parseFloat(parts[1]); }
      if (expr && !isNaN(a) && !isNaN(b)) addExprFromCommand(expr);
      if (!isNaN(a) && !isNaN(b)) { state.settings.integralA = a; state.settings.integralB = b; const ia = $('#plotA'); if (ia) ia.value = a; const ib = $('#plotB'); if (ib) ib.value = b; }
      state.settings.integral = true;
      const ic = $('#plotShowIntegral'); if (ic) ic.checked = true;
      const ctrl = $('#plotIntegralCtrl'); if (ctrl) ctrl.classList.remove('hidden');
      openGroup('plotGroupAnalysis');
      draw(); saveState();
      toast('Área activada');
      return;
    }

    // Raíces / extremos / intersecciones
    if (norm === 'raices' || norm === 'roots' || norm === 'raiz' || norm === 'extremos') {
      openGroup('plotGroupAnalysis');
      const nRoots = state.analysis?.roots?.length || 0;
      const nExt = state.analysis?.extrema?.length || 0;
      toast(`Análisis: ${nRoots} raíz(es) · ${nExt} extremo(s)`);
      return;
    }
    if (norm === 'interseccion' || norm === 'intersecciones' || norm === 'intersect') {
      openGroup('plotGroupAnalysis');
      toast(`Intersecciones: ${state.analysis?.intersections?.length || 0}`);
      return;
    }

    if (norm === 'tabla' || norm === 'table') { showTable(); return; }
    if (norm === 'ajustar' || norm === 'fit' || norm === 'zoom') { fitView(); syncZoomUI(); return; }
    if (norm === 'centrar' || norm === 'center') { state.pan = { x: 0, y: 0, zoom: 1 }; syncZoomUI(); draw(); saveState(); return; }
    if (norm === 'limpiar' || norm === 'clear' || norm === 'reset') { $('#plotClearBtn')?.click(); return; }
    if (norm === 'ayuda' || norm === 'help' || norm === '?') { $('#plotHelpDlg')?.showModal(); return; }
    if (norm === 'cuadricula' || norm === 'grid') { state.settings.showGrid = !state.settings.showGrid; const g = $('#plotGridChk'); if (g) g.checked = state.settings.showGrid; draw(); saveState(); return; }
    if (norm === 'imanes' || norm === 'snap') { state.settings.snap = !state.settings.snap; const s = $('#plotSnapChk'); if (s) s.checked = state.settings.snap; draw(); saveState(); return; }
    if (norm === 'tendencia' || norm === 'regresion' || norm === 'reg' || norm === 'ajuste') { addTrendLine(); return; }

    // Deslizadores por Entrada (como GeoGebra): a=5 crea el número, a=-10..10 fija su rango
    const rangeAssign = cmd.match(/^([a-dmknp])\s*=\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/i);
    if (rangeAssign) {
      const p = rangeAssign[1].toLowerCase();
      let r0 = parseFloat(rangeAssign[2]), r1 = parseFloat(rangeAssign[3]);
      if (r0 > r1) { const t = r0; r0 = r1; r1 = t; }
      defineSlider(p, paramSliders[p], { min: r0, max: r1 });
      return;
    }
    const assign = cmd.match(/^([a-dmknp])\s*=\s*(-?\d+(?:\.\d+)?)$/i);
    if (assign) { defineSlider(assign[1].toLowerCase(), parseFloat(assign[2])); return; }

    // Expresión: admite "f(x)=..." o "y=..."
    const expr = cmd.replace(/^\s*(f\s*\(\s*x\s*\)|y)\s*=/i, '').trim();
    addExprFromCommand(expr);
  }
  // Recta de tendencia (regresión lineal) sobre los puntos marcados — ideal para estimar demanda
  function addTrendLine(){
    if (state.mode !== '1v') { toast('Cambia al modo Función para trazar la tendencia', 'err'); return; }
    const pts = (typeof ggPoints !== 'undefined' ? ggPoints : []).filter(p => p && isFinite(p.x) && isFinite(p.y));
    if (pts.length < 2) { toast('Marca al menos 2 puntos con la herramienta Punto y escribe tendencia', 'err'); return; }
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
    const den = n * sxx - sx * sx;
    if (!isFinite(den) || Math.abs(den) < 1e-12) { toast('Los puntos comparten el mismo x: no hay recta de tendencia', 'err'); return; }
    const m = (n * sxy - sx * sy) / den, b = (sy - m * sx) / n;
    const my = sy / n;
    let ss = 0, sr = 0;
    for (const p of pts) { ss += (p.y - my) * (p.y - my); const r = p.y - (m * p.x + b); sr += r * r; }
    const r2 = ss > 0 ? Math.max(0, 1 - sr / ss) : 1;
    const mr = Math.round(m * 10000) / 10000, br = Math.round(b * 10000) / 10000;
    const expr = `${mr}*x${br < 0 ? '' : '+'}${br}`;
    if (state.funcs.length >= MAX_FUNCS) { toast('Máximo ' + MAX_FUNCS + ' funciones', 'err'); return; }
    if (typeof ggPush === 'function') ggPush();
    state.funcs.push({ id: uid(), expr, color: FN_COLORS[state.funcs.length % FN_COLORS.length], visible: true, bad: false });
    refreshParamSliders(); renderFnList(); draw(); saveState();
    toast(`Tendencia: y ≈ ${prettyExpr(expr)} · R² = ${Math.round(r2 * 1000) / 1000}`, 'ok');
  }
  // (La antigua barra inferior de comandos se eliminó: la Entrada superior es la única vía)

  // Navegación estilo GeoGebra + herramientas de construcción
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let rafPending = false;
  function scheduleDraw(){ if(rafPending) return; rafPending=true; requestAnimationFrame(()=>{ rafPending=false; draw(); }); }
  // Herramienta activa + objetos construidos + historial (deshacer/rehacer)
  let activeTool = 'pan';
  let ggPoints = [];
  let ggTangents = [];
  let ggHistory = [], ggFuture = [];
  const ggSnapshot = () => JSON.stringify({ mode: state.mode, funcs: state.funcs, pan: state.pan, points: ggPoints, tangents: ggTangents });
  function ggPush(){ ggHistory.push(ggSnapshot()); if (ggHistory.length > 60) ggHistory.shift(); ggFuture.length = 0; syncUndoUI(); }
  function ggRestore(snap){ try {
    const o = JSON.parse(snap);
    if (o.mode && o.mode !== state.mode && ['1v','param','polar','2v'].includes(o.mode)) {
      state.funcsByMode = state.funcsByMode || {};
      state.funcsByMode[state.mode] = state.funcs;
      state.mode = o.mode;
      syncModeUI();
      renderInputs();
    }
    state.funcs = sanitizeFuncsFor(state.mode, o.funcs);
    state.pan = o.pan || state.pan;
    ggPoints = Array.isArray(o.points) ? o.points : [];
    ggTangents = Array.isArray(o.tangents) ? o.tangents : [];
    renderFnList(); syncZoomUI(); draw(); saveState();
  } catch {} }
  function ggUndo(){ if (!ggHistory.length) { toast('Nada que deshacer'); return; } ggFuture.push(ggSnapshot()); ggRestore(ggHistory.pop()); syncUndoUI(); }
  function ggRedo(){ if (!ggFuture.length) { toast('Nada que rehacer'); return; } ggHistory.push(ggSnapshot()); ggRestore(ggFuture.pop()); syncUndoUI(); }
  function syncUndoUI(){ const u = $('#plotUndo'), r = $('#plotRedo'); if (u) u.classList.toggle('disabled', !ggHistory.length); if (r) r.classList.toggle('disabled', !ggFuture.length); const g = $('#plotGridTool'); if (g) g.classList.toggle('active', !!state.settings.showGrid); const s = $('#plotSnapTool'); if (s) s.classList.toggle('active', !!state.settings.snap); }
  // Zoom anclado al cursor: mantiene fijo el punto bajo el puntero (antes no anclaba nada)
  function zoomAt(mx, my, factor){
    const rect = cv.getBoundingClientRect();
    const before = screenToWorld(mx, my, rect);
    state.pan.zoom = clampZoom(state.pan.zoom * factor);
    const { rangeX, rangeY } = ranges();
    const W = rect.width, H = rect.height;
    const cx2 = mx - before.x * (W / 2) / rangeX;
    const cy2 = my + before.y * (H / 2) / rangeY;
    state.pan.x = (cx2 - W / 2) / 40;
    state.pan.y = (H / 2 - cy2) / 40;
    syncZoomUI(); scheduleDraw();
  }
  function canvasHint(){
    const hints = { pan: 'Arrastra para mover · rueda para zoom · doble clic para restablecer', inspect: 'Clic en una curva para inspeccionar su valor · Esc para volver a mover', point: 'Clic en el lienzo para fijar un punto · Esc para volver a mover', tangent: 'Clic sobre una curva para trazar su tangente · Esc para volver a mover', intersect: 'Pulsa de nuevo para recalcular intersecciones', box: 'Arrastra un recuadro para ampliar esa zona · Esc para volver a mover' };
    if (statusEl) statusEl.textContent = hints[activeTool] || hints.pan;
    cv.style.cursor = activeTool === 'pan' ? 'grab' : activeTool === 'box' ? 'zoom-in' : 'crosshair';
  }
  function setTool(t){
    activeTool = t;
    document.querySelectorAll('#plotTools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    canvasHint();
    if (t === 'intersect') { draw(); const n = (state.analysis.intersections || []).length; toast(n ? n + ' intersección(es) marcada(s) con A' : 'Sin intersecciones en la vista actual'); }
  }
  let drag = null;
  let boxStart = null;
  const boxSel = () => $('#plotBoxSel');
  const pinch = new Map();
  let pinchDist = 0;
  cv.addEventListener('pointerdown', e=>{
    cv.setPointerCapture(e.pointerId);
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) { const p = [...pinch.values()]; pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); drag = null; boxStart = null; return; }
    const rect = cv.getBoundingClientRect();
    if (activeTool === 'box') { boxStart = { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
    drag = { x: e.clientX, y: e.clientY, px: state.pan.x, py: state.pan.y, moved: false };
    if (activeTool === 'pan') cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', e=>{
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) {
      const p = [...pinch.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      const rect = cv.getBoundingClientRect();
      if (pinchDist > 0 && Math.abs(d - pinchDist) > 2) zoomAt(rect.width / 2, rect.height / 2, d > pinchDist ? 1.06 : 0.94);
      pinchDist = d;
      return;
    }
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (drag && activeTool === 'box' && boxStart) {
      const el = boxSel();
      if (el) { el.classList.remove('hidden'); el.style.left = Math.min(boxStart.x, mx) + 'px'; el.style.top = Math.min(boxStart.y, my) + 'px'; el.style.width = Math.abs(mx - boxStart.x) + 'px'; el.style.height = Math.abs(my - boxStart.y) + 'px'; }
      drag.moved = true;
      return;
    }
    if (drag && activeTool === 'pan') {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
      state.pan.x = drag.px + (e.clientX - drag.x) / 40;
      state.pan.y = drag.py - (e.clientY - drag.y) / 40;
      scheduleDraw();
    } else if (!drag) {
      hoverX = mx; hoverY = my;
      updateReadout(e);
      if (state.settings.crosshair) updateCrosshair(mx, my);
    }
    const { rangeX, rangeY } = ranges();
    const { cx, cy } = xform(rect.width, rect.height);
    const wx = ((mx - cx) / (rect.width / 2)) * rangeX;
    const wy = (cy - my) / (rect.height / 2) * rangeY;
    coordsEl.textContent = `x: ${fmtNum(wx)} · y: ${fmtNum(wy)}`;
  });
  function endPointer(e){
    pinch.delete(e.pointerId);
    const wasClick = drag && !drag.moved;
    const rect = cv.getBoundingClientRect();
    // Zoom por recuadro
    if (drag && activeTool === 'box' && boxStart) {
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const el = boxSel(); if (el) el.classList.add('hidden');
      const w = Math.abs(mx - boxStart.x), h = Math.abs(my - boxStart.y);
      if (w > 24 && h > 24) {
        ggPush();
        const c = { x: (boxStart.x + mx) / 2, y: (boxStart.y + my) / 2 };
        const world = screenToWorld(c.x, c.y, rect);
        const zoomF = Math.min((rect.width / w), (rect.height / h), 6);
        state.pan.zoom = clampZoom(state.pan.zoom * zoomF);
        const { rangeX, rangeY } = ranges();
        state.pan.x = ((c.x - world.x * (rect.width / 2) / rangeX) - rect.width / 2) / 40;
        state.pan.y = ((rect.height / 2) - (c.y + world.y * (rect.height / 2) / rangeY)) / 40;
        syncZoomUI(); draw(); saveState();
      }
      boxStart = null; drag = null; cv.style.cursor = 'zoom-in';
      return;
    }
    drag = null;
    if (activeTool === 'pan') cv.style.cursor = 'grab';
    if (wasClick && activeTool !== 'pan' && activeTool !== 'box') handleToolClick(e);
    else { draw(); saveState(); }
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', e=>{ pinch.clear(); drag = null; boxStart = null; const el = boxSel(); if (el) el.classList.add('hidden'); });
  function snapWorld(w){
    if (!state.settings.snap) return w;
    let best = null, bd = 0.35 * (10 / state.pan.zoom);
    for (const sp of [...(state.analysis.roots || []), ...(state.analysis.extrema || []), ...(state.analysis.intersections || [])]) {
      const d = Math.hypot(sp.x - w.x, (sp.y || 0) - w.y);
      if (d < bd) { bd = d; best = { x: sp.x, y: sp.y || 0 }; }
    }
    return best || w;
  }
  function handleToolClick(e){
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let w = snapWorld(screenToWorld(mx, my, rect));
    if (activeTool === 'point') {
      ggPush();
      ggPoints.push({ x: w.x, y: w.y, label: 'P' + (ggPoints.length + 1), color: '#ffc107' });
      renderFnList(); draw(); saveState();
      toast(`Punto P${ggPoints.length} en (${fmtNum(w.x)}, ${fmtNum(w.y)})`, 'ok');
    } else if (activeTool === 'inspect') {
      updateReadout(e);
      if (state.settings.crosshair) updateCrosshair(mx, my);
    } else if (activeTool === 'tangent' && state.mode === '1v' && state.funcs.length) {
      let bf = null, bd = Infinity;
      const { rangeX } = ranges();
      for (const f of state.funcs.filter(f => f.visible !== false && !f.bad)) {
        const y = safeEval(f.expr, { x: w.x, ...paramSliders });
        if (!isFinite(y)) continue;
        const d = Math.abs(y - w.y) / Math.max(1, rangeX / 10);
        if (d < bd) { bd = d; bf = f; }
      }
      if (bf && bd < 2.5) {
        ggPush();
        ggTangents.push({ x: w.x, fnId: bf.id });
        renderFnList(); draw(); saveState();
        toast(`Tangente a f en x=${fmtNum(w.x)}`, 'ok');
      } else toast('Acerca el clic a una curva para trazar su tangente', 'err');
    }
  }
  cv.addEventListener('pointerleave', ()=>{ readout.classList.add('hidden'); cross.classList.add('hidden'); coordsEl.textContent='x: — · y: —'; });
  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.88 : 1.14);
  }, { passive:false });
  cv.addEventListener('dblclick', ()=>{ ggPush(); state.pan={x:0,y:0,zoom:1}; syncZoomUI(); draw(); saveState(); });
  // teclado
  window.addEventListener('keydown', e=>{
    if(document.activeElement && ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    if(e.key==='+'||e.key==='='){ zoomAt(cv.clientWidth/2, cv.clientHeight/2, 1.2); }
    if(e.key==='-'){ zoomAt(cv.clientWidth/2, cv.clientHeight/2, 1/1.2); }
    if(e.key.toLowerCase()==='g'){ state.settings.showGrid=!state.settings.showGrid; $('#plotGridChk').checked=state.settings.showGrid; syncUndoUI(); draw(); }
    if(e.key.toLowerCase()==='d'){ state.settings.derivative=!state.settings.derivative; $('#plotShowDeriv').checked=state.settings.derivative; draw(); }
    if(e.key.toLowerCase()==='a'){ state.settings.integral=!state.settings.integral; $('#plotShowIntegral').checked=state.settings.integral; $('#plotIntegralCtrl').classList.toggle('hidden', !state.settings.integral); draw(); }
    if(e.key.toLowerCase()==='f'){ fitView(); syncZoomUI(); }
  });
  // Atajos propios: S imanes · V mover · Esc soltar herramienta · Ctrl+Z / Ctrl+Shift+Z
  window.addEventListener('keydown', e=>{
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag && ['INPUT','TEXTAREA','SELECT'].includes(tag)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && (location.hash || '').includes('graficadora')) { e.preventDefault(); e.shiftKey ? ggRedo() : ggUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); ggRedo(); }
    else if (e.key.toLowerCase() === 's' && (location.hash || '').includes('graficadora')) { state.settings.snap = !state.settings.snap; const c = $('#plotSnapChk'); if (c) c.checked = state.settings.snap; syncUndoUI(); draw(); saveState(); }
    else if (e.key.toLowerCase() === 'v') setTool('pan');
    else if (e.key === 'Escape') setTool('pan');
  });
  $('#plotZoomIn').addEventListener('click', ()=>{ zoomAt(cv.clientWidth/2, cv.clientHeight/2, 1.3); saveState(); });
  $('#plotZoomOut').addEventListener('click', ()=>{ zoomAt(cv.clientWidth/2, cv.clientHeight/2, 1/1.3); saveState(); });
  $('#plotReset').addEventListener('click', ()=>{ ggPush(); state.pan={x:0,y:0,zoom:1}; syncZoomUI(); draw(); saveState(); });
  // Barra de herramientas: selección, historial y vista
  document.querySelector('#plotTools')?.addEventListener('click', e=>{
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  $('#plotUndo')?.addEventListener('click', ggUndo);
  $('#plotRedo')?.addEventListener('click', ggRedo);
  const syncGridBtn = ()=>{ state.settings.showGrid = !state.settings.showGrid; const c = $('#plotGridChk'); if (c) c.checked = state.settings.showGrid; syncUndoUI(); draw(); saveState(); };
  const syncSnapBtn = ()=>{ state.settings.snap = !state.settings.snap; const c = $('#plotSnapChk'); if (c) c.checked = state.settings.snap; syncUndoUI(); draw(); saveState(); };
  $('#plotGridTool')?.addEventListener('click', syncGridBtn);
  $('#plotSnapTool')?.addEventListener('click', syncSnapBtn);
  $('#plotFitTool')?.addEventListener('click', ()=>{ fitView(); syncZoomUI(); });
  $('#plotHomeTool')?.addEventListener('click', ()=>{ ggPush(); state.pan = { x: 0, y: 0, zoom: 1 }; syncZoomUI(); draw(); saveState(); });
  const goFull = ()=>{
    const card = document.querySelector('.gg-canvas-card');
    if (!card) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
    else if (card.requestFullscreen) card.requestFullscreen().catch(()=>toast('Pantalla completa no disponible'));
    setTimeout(draw, 350);
  };
  $('#plotFullTool')?.addEventListener('click', goFull);
  $('#plotFabFull')?.addEventListener('click', goFull);
  document.addEventListener('fullscreenchange', ()=>setTimeout(draw, 120));
  // Barra de Entrada superior (como GeoGebra): acepta fórmulas y comandos
  $('#plotTopInput')?.addEventListener('keydown', e=>{
    if (e.key === 'Enter') { runCommand(e.target.value); e.target.value = ''; }
  });
  document.querySelector('.gg-inputbar-plus')?.addEventListener('click', ()=>{
    const inp = $('#plotTopInput');
    if (inp && inp.value.trim()) { runCommand(inp.value); inp.value = ''; inp.focus(); }
    else inp?.focus();
  });
  // Desplegables del lienzo: biblioteca y ajustes (cero paneles redundantes)
  function closeDrops(except){
    for (const id of ['#plotLibDrop', '#plotSettingsDrop']) {
      if (id !== except) $(id)?.classList.add('hidden');
    }
    $('#plotLibBtn')?.classList.toggle('active', !$('#plotLibDrop')?.classList.contains('hidden'));
    $('#plotSettingsBtn')?.classList.toggle('active', !$('#plotSettingsDrop')?.classList.contains('hidden'));
  }
  $('#plotLibBtn')?.addEventListener('click', e=>{ e.stopPropagation(); const d = $('#plotLibDrop'); const willOpen = !!d?.classList.contains('hidden'); closeDrops('#plotLibDrop'); d?.classList.toggle('hidden'); $('#plotLibBtn')?.classList.toggle('active', willOpen); });
  $('#plotSettingsBtn')?.addEventListener('click', e=>{ e.stopPropagation(); const d = $('#plotSettingsDrop'); const willOpen = !!d?.classList.contains('hidden'); closeDrops('#plotSettingsDrop'); d?.classList.toggle('hidden'); $('#plotSettingsBtn')?.classList.toggle('active', willOpen); });
  document.querySelectorAll('[data-closedrop]').forEach(b=>b.addEventListener('click', ()=>closeDrops()));
  document.addEventListener('click', e=>{ if (!e.target.closest('.gg-drop') && !e.target.closest('#plotLibBtn') && !e.target.closest('#plotSettingsBtn')) closeDrops(); });
  // Sliders en vivo desde la Entrada única
  $('#plotTopInput')?.addEventListener('input', ()=>{ refreshParamSliders(); });
  bindSliders();
  canvasHint(); syncUndoUI();
  // Eventos del panel de deslizadores (delegados: sobreviven a cada redibujado)
  function bindSliders(){
    const wrap = $('#plotParamSliders');
    if (wrap && !wrap.dataset.bound) {
      wrap.dataset.bound = '1';
      wrap.addEventListener('input', e => {
        const r = e.target.closest('[data-param]');
        if (r) { const p = r.dataset.param; sliderStop(p, true); setParamValue(p, parseFloat(r.value)); return; }
        const n = e.target.closest('[data-num]');
        if (n) { const v = parseFloat(n.value); if (isFinite(v)) { sliderStop(n.dataset.num, true); setParamValue(n.dataset.num, v); } return; }
      });
      wrap.addEventListener('change', e => {
        const t = e.target;
        const cfgFor = (attr) => Object.keys(sliderCfg).find(p => t.matches(`[${attr}="${p}"]`));
        const p = t.matches('[data-num]') ? t.dataset.num : cfgFor('data-smin') || cfgFor('data-smax') || cfgFor('data-sstep') || cfgFor('data-sspeed') || cfgFor('data-amode');
        if (!p) return;
        const c = sliderDef(p);
        if (t.matches('[data-num]')) {
          const v = parseFloat(t.value);
          if (isFinite(v)) { sliderStop(p, true); setParamValue(p, v); }
          else syncSliderRow(p);
          return;
        }
        if (t.matches('[data-smin]')) { const v = parseFloat(t.value); if (isFinite(v)) c.min = v; }
        if (t.matches('[data-smax]')) { const v = parseFloat(t.value); if (isFinite(v)) c.max = v; }
        if (c.max < c.min) { const tmp = c.min; c.min = c.max; c.max = tmp; }
        if (t.matches('[data-sstep]')) { const v = parseFloat(t.value); c.step = (isFinite(v) && v > 0) ? v : 0.1; }
        if (t.matches('[data-sspeed]')) { const v = parseFloat(t.value); c.speed = (isFinite(v) && v > 0) ? v : 1; }
        if (t.matches('[data-amode]')) c.mode = t.value;
        paramSliders[p] = clampNum(paramSliders[p] ?? paramDefault(p), c.min, c.max);
        renderSliders(lastSliderParams);
        draw(); saveState(); persistSliders();
      });
      wrap.addEventListener('click', e => {
        const pl = e.target.closest('[data-play]');
        if (pl) { sliderToggle(pl.dataset.play); return; }
        const st = e.target.closest('[data-settings]');
        if (st) { document.querySelector(`[data-sset="${st.dataset.settings}"]`)?.classList.toggle('hidden'); return; }
      });
    }
    $('#plotSlidersBtn')?.addEventListener('click', () => {
      if (!lastSliderParams.length) { toast('Usa a, b, c, d… en una función — o escribe a=5 en la Entrada', 'err'); return; }
      slidersHidden = !slidersHidden;
      updateSlidersVisibility(); persistSliders();
    });
    $('#plotSlidersHide')?.addEventListener('click', () => {
      slidersHidden = true;
      updateSlidersVisibility(); persistSliders();
    });
    $('#plotSlidersShow')?.addEventListener('click', () => {
      slidersHidden = false;
      updateSlidersVisibility(); persistSliders();
    });
    $('#plotSlidersPlayAll')?.addEventListener('click', () => {
      const any = Object.values(sliderAnim).some(s => s.playing);
      if (any) sliderStopAll();
      else for (const p of lastSliderParams) sliderStart(p);
      updatePlayBtn(lastSliderParams[0]);
    });
    // Arrastrar el panel por el lienzo (posición absoluta como en GeoGebra)
    const head = $('#plotSlidersHead'), panel = $('#plotSlidersFloat'), stage = $('#plotCanvasWrap');
    if (head && panel && stage && !head.dataset.bound) {
      head.dataset.bound = '1';
      head.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        e.preventDefault();
        const sr = stage.getBoundingClientRect(), pr = panel.getBoundingClientRect();
        const dx = e.clientX - pr.left, dy = e.clientY - pr.top;
        head.setPointerCapture(e.pointerId);
        const move = ev => {
          const nx = Math.min(Math.max(0, ev.clientX - sr.left - dx), Math.max(0, sr.width - pr.width));
          const ny = Math.min(Math.max(0, ev.clientY - sr.top - dy), Math.max(0, sr.height - pr.height));
          panel.style.left = nx + 'px'; panel.style.top = ny + 'px';
          panel.style.bottom = 'auto'; panel.style.right = 'auto';
        };
        const up = ev => {
          head.removeEventListener('pointermove', move);
          head.removeEventListener('pointercancel', up);
          const r2 = panel.getBoundingClientRect();
          slidersPos = { x: Math.round(r2.left - sr.left), y: Math.round(r2.top - sr.top) };
          persistSliders();
        };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', up, { once: true });
        head.addEventListener('pointercancel', up, { once: true });
      });
    }
  }

  function ranges(){
    const H = cv.clientHeight||330, W=cv.clientWidth||560;
    const rangeX = 10/state.pan.zoom;
    return {rangeX, rangeY: rangeX * H / (W||1)};
  }
  function xform(W,H){
    const {rangeX, rangeY}=ranges();
    const cx=W/2 + state.pan.x*40, cy=H/2 - state.pan.y*40;
    return {rangeX, rangeY, cx, cy, sx:x=>cx+(x/rangeX)*(W/2), sy:y=>cy-(y/rangeY)*(H/2)};
  }
  function screenToWorld(sx,sy,rect){
    const {rangeX, rangeY, cx, cy}=xform(rect.width, rect.height);
    return {x: ((sx-cx)/(rect.width/2))*rangeX, y: (cy-sy)/(rect.height/2)*rangeY};
  }
  function updateCrosshair(mx,my){
    cross.classList.remove('hidden');
    cross.style.left=mx+'px'; cross.style.top=my+'px';
  }

  // Análisis helpers
  // ¿La expresión es (casi) constante en el rango visible? Devuelve su valor o null.
  function constVal(expr, range){
    try {
      if (typeof expr !== 'string' || !expr) return null;
      const xs = [range[0], (range[0] + range[1]) / 2, range[1]];
      const ys = xs.map(x => safeEval(expr, { x, ...paramSliders }));
      if (!ys.every(isFinite)) return null;
      const mn = Math.min(...ys), mx = Math.max(...ys);
      if (mx - mn <= 1e-9 * Math.max(1, Math.abs(mx))) return (mn + mx) / 2;
    } catch {}
    return null;
  }
  function findRoots(expr, range, rangeY){
    // Función (casi) constante: sin barrido ruidoso — una raíz si es ~0, ninguna si no
    const cc = constVal(expr, range);
    if (cc !== null) return Math.abs(cc) < 1e-9 ? [(range[0] + range[1]) / 2] : [];
    const roots=[];
    const steps=600;
    const dx=(range[1]-range[0])/steps;
    let prevX=range[0], prevY=safeEval(expr,{x:prevX, ...paramSliders});
    for(let i=1;i<=steps;i++){
      const x=range[0]+i*dx;
      const y=safeEval(expr,{x, ...paramSliders});
      if(!isFinite(prevY)||!isFinite(y)){ prevX=x; prevY=y; continue; }
      if(prevY===0){ roots.push(prevX); }
      else if(y===0){ roots.push(x); }
      else if(prevY*y<0){
        // bisección
        let lo=prevX, hi=x, flo=prevY;
        for(let k=0;k<22;k++){
          const mid=(lo+hi)/2;
          const fm=safeEval(expr,{x:mid, ...paramSliders});
          if(!isFinite(fm)) break;
          if(flo*fm<=0){ hi=mid; } else { lo=mid; flo=fm; }
        }
        const rx=(lo+hi)/2;
        if(roots.every(r=>Math.abs(r-rx)>1e-4)) roots.push(rx);
      }
      prevX=x; prevY=y;
    }
    const clean = roots.filter(r=>isFinite(r)).sort((a,b)=>a-b).filter((r,i,arr)=>i===0||Math.abs(r-arr[i-1])>1e-3);
    return clean.slice(0,12);
  }
  function findExtrema(expr, range){
    // Constante: no hay extremos (evita la lluvia de falsos positivos)
    if (constVal(expr, range) !== null) return [];
    // usar derivada numérica o simbólica
    let derivExpr=null;
    try{ derivExpr=math.derivative(expr,'x').toString(); }catch{}
    if(derivExpr){
      return findRoots(derivExpr, range).map(x=>({x, y:safeEval(expr,{x, ...paramSliders}), type:'extrema'}));
    }
    // numérico: buscar cambios de pendiente
    const pts=sample1V(expr, range, 600, _paramScope).filter(p=>p.valid);
    const ext=[];
    for(let i=1;i<pts.length-1;i++){
      const a=pts[i-1].y, b=pts[i].y, c=pts[i+1].y;
      if((b>a && b>c) || (b<a && b<c)){
        ext.push({x:pts[i].x, y:b, type: b>a?'max':'min'});
      }
    }
    return ext.slice(0,10);
  }

  function updateReadout(e){
    const rect=cv.getBoundingClientRect();
    const {rangeX, rangeY, sx, sy, cx, cy}=xform(rect.width, rect.height);
    const wx = ((e.clientX-rect.left - cx)/(rect.width/2))*rangeX;
    const wy = (cy - (e.clientY-rect.top))/(rect.height/2)*rangeY;
    readout.classList.remove('hidden');
    if(state.mode==='1v'){
      let snap=null;
      if(state.settings.snap){
        for(const sp of state.analysis.roots){
          const dx=sx(sp.x)-(e.clientX-rect.left), dy=sy(0)-(e.clientY-rect.top);
          if(Math.hypot(dx,dy)<18) { snap={x:sp.x, y:0, label:`Raíz`}; break; }
        }
        if(!snap) for(const sp of state.analysis.extrema){
          const dx=sx(sp.x)-(e.clientX-rect.left), dy=sy(sp.y)-(e.clientY-rect.top);
          if(Math.hypot(dx,dy)<18) { snap={x:sp.x, y:sp.y, label: sp.type==='max'?'Máx':'Mín'}; break; }
        }
        if(!snap) for(const sp of state.analysis.intersections){
          const dx=sx(sp.x)-(e.clientX-rect.left), dy=sy(sp.y)-(e.clientY-rect.top);
          if(Math.hypot(dx,dy)<18) snap=sp;
        }
      }
      if(snap){
        readout.classList.add('snap');
        readout.innerHTML=`<b>${snap.label}</b> (${fmtNum(snap.x)}, ${fmtNum(snap.y)})`;
      } else {
        readout.classList.remove('snap');
        const vals=state.funcs.filter(f=>f.visible!==false).map((f,i)=>{
          const v=safeEval(f.expr,{x:wx, ...paramSliders});
          return isFinite(v)?`<b style="color:${f.color}">f${i+1}=${fmtNum(v)}</b>`:null;
        }).filter(Boolean);
        readout.innerHTML=`x=${fmtNum(wx)} ${vals.length?'· '+vals.join(' · '):''}`;
        // tangente preview
        if(state.settings.derivative && state.funcs[0]){
          const d = numericDerivative(state.funcs[0].expr, wx);
          readout.innerHTML += `<br><span class="muted">f'(x)≈${fmtNum(d)}</span>`;
        }
      }
    } else if(state.mode==='param' || state.mode==='polar'){
      readout.textContent=`x=${fmtNum(wx)} · y=${fmtNum(wy)}`;
    } else {
      // 2v: evaluar f(x,y)
      const v=safeEval(state.funcs[0]?.expr||'sin(x)*cos(y)',{x:wx,y:wy, ...paramSliders});
      readout.textContent = `x=${fmtNum(wx)} · y=${fmtNum(wy)} · f=${fmtNum(v)}`;
    }
    const rx = Math.min(rect.width-200, Math.max(8, e.clientX-rect.left+14));
    const ry = e.clientY-rect.top - 38;
    readout.style.left=rx+'px'; readout.style.top=ry+'px';
  }

  function numericDerivative(expr, x){
    const h=1e-5;
    const y1=safeEval(expr,{x:x-h, ...paramSliders}), y2=safeEval(expr,{x:x+h, ...paramSliders});
    if(!isFinite(y1)||!isFinite(y2)) return NaN;
    return (y2-y1)/(2*h);
  }
  function numericIntegral(expr, a,b, n=800){
    if(a===b) return 0;
    if(a>b) [a,b]=[b,a];
    const h=(b-a)/n;
    let sum = safeEval(expr,{x:a, ...paramSliders}) + safeEval(expr,{x:b, ...paramSliders});
    for(let i=1;i<n;i++){
      const x=a+i*h;
      const y=safeEval(expr,{x, ...paramSliders});
      if(!isFinite(y)) return NaN;
      sum += (i%2===0?2:4)*y;
    }
    return sum*h/3;
  }

  function fitView(){
    if(state.mode==='1v' && state.funcs.length){
      // calcular bounding box de funciones visibles — rango visible
      const W=cv.clientWidth||560, H=cv.clientHeight||330;
      const {rangeX, cx}=xform(W,H);
      const xLeft=((0 - cx)/(W/2))*rangeX;
      const xRight=((W - cx)/(W/2))*rangeX;
      const xs = [xLeft, xRight];
      let minY=Infinity, maxY=-Infinity;
      for(const f of state.funcs.filter(f=>f.visible!==false)){
        const pts=sample1V(f.expr, xs, 400, _paramScope);
        for(const p of pts) if(p.valid){ minY=Math.min(minY,p.y); maxY=Math.max(maxY,p.y); }
      }
      if(isFinite(minY) && isFinite(maxY)){
        const midY=(minY+maxY)/2;
        const spanY = Math.max(4, (maxY-minY)*1.4);
        // ajustar zoom para que spanY quepa
        const curRangeY = ranges().rangeY;
        const targetZoom = (10/state.pan.zoom) * (curRangeY/spanY) * 0.9;
        state.pan.zoom = clampZoom(state.pan.zoom * (curRangeY/spanY));
        state.pan.y = midY / (10/state.pan.zoom) * 2;
        syncZoomUI(); draw(); saveState();
      }
    } else {
      state.pan={x:0,y:0,zoom:1}; syncZoomUI(); draw(); saveState();
    }
  }

  function exportPNG(){
    const a=document.createElement('a');
    a.href=cv.toDataURL('image/png');
    a.download=`graficadora-${Date.now()}.png`;
    a.click();
    toast('PNG exportado','ok');
  }
  function exportJSON(){
    const data={mode:state.mode, funcs:state.funcs, pan:state.pan, settings:state.settings, paramRange:state.paramRange};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='graficadora.json'; a.click();
    toast('JSON exportado','ok');
  }
  function copyLink(){
    const data=btoa(encodeURIComponent(JSON.stringify({m:state.mode, f:state.funcs, p:state.pan})));
    const url=location.origin+location.pathname+'#/herramientas/graficadora?plot='+data;
    navigator.clipboard.writeText(url).then(()=>toast('Enlace copiado','ok')).catch(()=>toast(url));
  }
  function toggleTable(){
    const panel = $('#plotTablePanel'), wrap = $('#plotTableWrap');
    if (!panel || !wrap) return;
    const isHidden = panel.classList.contains('hidden');
    if (isHidden) { renderTable(); panel.classList.remove('hidden'); }
    else panel.classList.add('hidden');
    $('#plotTableTool')?.classList.toggle('active', isHidden);
  }
  function showTable(){
    const panel = $('#plotTablePanel'), wrap = $('#plotTableWrap');
    if (!panel || !wrap) return;
    renderTable();
    panel.classList.remove('hidden');
    $('#plotTableTool')?.classList.add('active');
  }
  function renderTable(){
    const wrap=$('#plotTableWrap');
    if(state.mode!=='1v'){ wrap.innerHTML='<span class="muted">Tabla solo para f(x)</span>'; return; }
    const {rangeX}=ranges();
    const xMin=-rangeX, xMax=rangeX, n=12;
    const step=(xMax-xMin)/n;
    let html=`<table class="plot-table"><thead><tr><th>x</th>${state.funcs.filter(f=>f.visible!==false).map((f,i)=>`<th style="color:${f.color}">f${i+1}</th>`).join('')}</tr></thead><tbody>`;
    for(let i=0;i<=n;i++){
      const x=xMin+i*step;
      html+=`<tr><td class="mono">${fmtNum(x)}</td>`;
      for(const f of state.funcs.filter(f=>f.visible!==false)){
        const y=safeEval(f.expr,{x, ...paramSliders});
        html+=`<td class="mono">${isFinite(y)?fmtNum(y):'—'}</td>`;
      }
      html+='</tr>';
    }
    html+='</tbody></table>';
    html+=`<div class="row" style="gap:8px; margin-top:8px"><button class="btn btn-ghost btn-sm" id="plotCsvBtn"><i class="ri-download-2-line"></i> CSV</button><button class="btn btn-ghost btn-sm" id="plotCopyTable"><i class="ri-file-copy-line"></i> Copiar</button></div>`;
    wrap.innerHTML=html;
    $('#plotCsvBtn')?.addEventListener('click', ()=>{
      let csv='x,'+state.funcs.filter(f=>f.visible!==false).map((_,i)=>'f'+(i+1)).join(',')+'\n';
      for(let i=0;i<=n;i++){ const x=xMin+i*step; const row=[fmtNum(x)]; for(const f of state.funcs.filter(f=>f.visible!==false)) row.push(fmtNum(safeEval(f.expr,{x, ...paramSliders}))); csv+=row.join(',')+'\n'; }
      const blob=new Blob([csv],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='tabla.csv'; a.click();
    });
    $('#plotCopyTable')?.addEventListener('click', ()=>{ navigator.clipboard.writeText(wrap.innerText).then(()=>toast('Tabla copiada','ok')); });
  }

  let mathSlidersDone = false;
  async function draw(){
    try{ await loadMath(); } catch(e){ return toast('mathjs no disponible: '+e.message,'err'); }
    // mathjs carga asíncrono: al estar listo se detectan los parámetros una vez
    if (!mathSlidersDone) { mathSlidersDone = true; try { refreshParamSliders(); } catch {} }
    const W=cv.clientWidth||560, H=cv.clientHeight||330;
    cv.width=W*dpr; cv.height=H*dpr;
    const ctx=cv.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    const mode=state.mode;
    // fondo
    const css=getComputedStyle(document.documentElement);
    const bgSoft=css.getPropertyValue('--bg-soft').trim();
    // grid/fondo sutil
    if(mode==='1v' || mode==='param' || mode==='polar') drawCartesian(ctx,W,H);
    else draw2v(ctx,W,H);
    // actualizar análisis
    updateAnalysis();
    statusEl.textContent = `Zoom ${Math.round(state.pan.zoom*100)}% · ${state.funcs.filter(f=>f.visible!==false).length} curva(s) · ${state.mode}`;
  }

  function drawCartesian(ctx,W,H){
    const css=getComputedStyle(document.documentElement);
    const muted=css.getPropertyValue('--muted').trim()||'#888';
    const gridC=css.getPropertyValue('--panel-2').trim()||'rgba(128,128,128,0.18)';
    const borderC=css.getPropertyValue('--border').trim()||'rgba(128,128,128,0.1)';
    const {sx,sy,rangeX,rangeY,cx,cy}=xform(W,H);
    const resSel=$('#plotRes')?.value||'mid';
    const steps = resSel==='low'?400: resSel==='high'?1200:700;

    // grid — rango visible (corrige desplazamiento)
    const xLeft = ((0 - cx)/(W/2))*rangeX;
    const xRight = ((W - cx)/(W/2))*rangeX;
    const yBottom = ((cy - H)/(H/2))*rangeY;
    const yTop = ((cy - 0)/(H/2))*rangeY;
    if(state.settings.showGrid){
      const step=niceStep(rangeX);
      const minor=step/5;
      ctx.lineWidth=1;
      for(let k=Math.ceil(xLeft/minor)-1; k<=Math.floor(xRight/minor)+1; k++){
        const px=sx(k*minor); ctx.strokeStyle=borderC; ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke();
      }
      for(let k=Math.ceil(yBottom/minor)-1; k<=Math.floor(yTop/minor)+1; k++){
        const py=sy(k*minor); ctx.strokeStyle=borderC; ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W,py); ctx.stroke();
      }
      ctx.font='11px JetBrains Mono'; ctx.textAlign='center';
      for(let k=Math.ceil(xLeft/step)-1; k<=Math.floor(xRight/step)+1; k++){
        const x=k*step, px=sx(x);
        if(px<-20||px>W+20) continue;
        ctx.strokeStyle=gridC; ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke();
        if(Math.abs(x)>1e-9){ ctx.fillStyle=muted; ctx.fillText(fmtNum(x), px, Math.min(H-4, Math.max(12, sy(0)+14))); }
      }
      for(let k=Math.ceil(yBottom/step)-1; k<=Math.floor(yTop/step)+1; k++){
        const y=k*step, py=sy(y);
        if(py<-20||py>H+20) continue;
        ctx.strokeStyle=gridC; ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(W,py); ctx.stroke();
        if(Math.abs(y)>1e-9){ ctx.fillStyle=muted; ctx.fillText(fmtNum(y), Math.min(W-8, Math.max(8, sx(0)+8)), py+3); }
      }
    }
    if(state.settings.showAxes!==false){
      ctx.strokeStyle=muted; ctx.lineWidth=1.6; ctx.fillStyle=muted;
      const axisY=sy(0), axisX=sx(0);
      if(axisY>=0 && axisY<=H){ ctx.beginPath(); ctx.moveTo(0,axisY); ctx.lineTo(W-14,axisY); ctx.stroke(); arrow(ctx,W-14,axisY,W,axisY); ctx.fillText('x', W-10, axisY-8); }
      if(axisX>=0 && axisX<=W){ ctx.beginPath(); ctx.moveTo(axisX,H); ctx.lineTo(axisX,14); ctx.stroke(); arrow(ctx,axisX,14,axisX,0); ctx.fillText('y', axisX+8,12); }
    }

    const mode=state.mode;
    if(mode==='1v'){
      // área integral sombreada
      if(state.settings.integral){
        const af = state.funcs.find(f=>f && f.visible!==false && !f.bad && typeof f.expr==='string' && f.expr);
        if (af) {
        const a=state.settings.integralA, b=state.settings.integralB;
        const pts=sample1V(af.expr, [Math.min(a,b), Math.max(a,b)], 400, _paramScope);
        ctx.fillStyle='rgba(6,154,126,0.18)';
        ctx.beginPath();
        let first=true;
        for(const p of pts){ if(!p.valid) { first=true; continue; } const px=sx(p.x), py=sy(p.y); const base=sy(0); if(first){ ctx.moveTo(px, base); ctx.lineTo(px, py); first=false; } else ctx.lineTo(px, py); }
        // cerrar
        if(pts.length){ const last=pts[pts.length-1]; if(last.valid) ctx.lineTo(sx(last.x), sy(0)); }
        ctx.closePath(); ctx.fill();
        const area=numericIntegral(af.expr, a,b);
        const _av=$('#plotAreaVal'); if(_av) _av.textContent = isFinite(area) ? `Área ≈ ${fmtNum(area)}` : 'Área ≈ —';
        } else { const _av2=$('#plotAreaVal'); if(_av2) _av2.textContent='Área ≈ —'; }
      }
      // funciones — rango visible y trazo nítido (sin blur excesivo)
      const vx = [xLeft - Math.abs(xRight-xLeft)*0.08, xRight + Math.abs(xRight-xLeft)*0.08];
      for(const f of state.funcs.filter(f=>f.visible!==false)){
        if(f.bad) continue;
        const pts=sample1V(f.expr, vx, steps, _paramScope);
        ctx.strokeStyle=f.color; ctx.lineWidth=2.4; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        ctx.beginPath(); let pen=false;
        for(const p of pts){
          if(!p.valid){ pen=false; continue; }
          const px=sx(p.x), py=sy(p.y);
          if(px<-80||px>W+80||py<-80||py>H+80){ pen=false; continue; }
          if(!pen){ ctx.moveTo(px,py); pen=true; } else ctx.lineTo(px,py);
        }
        ctx.stroke();
        // brillo sutil opcional — segundo trazo muy fino
        ctx.globalAlpha=0.18; ctx.lineWidth=5; ctx.stroke(); ctx.globalAlpha=1;
        // derivada
        if(state.settings.derivative){
          ctx.strokeStyle=f.color; ctx.globalAlpha=0.55; ctx.setLineDash([6,6]); ctx.lineWidth=1.8;
          ctx.beginPath(); let pen2=false;
          for(let i=0;i<=steps;i++){
            const x=vx[0] + (i/steps)*(vx[1]-vx[0]);
            const d=numericDerivative(f.expr, x);
            if(!isFinite(d)){ pen2=false; continue; }
            const px=sx(x), py=sy(d);
            if(!pen2){ ctx.moveTo(px,py); pen2=true; } else ctx.lineTo(px,py);
          }
          ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
        }
        // tangente en hover
        if(hoverX!=null && state.settings.derivative){
          const rect=cv.getBoundingClientRect();
          const wx = ((hoverX - (W/2 + state.pan.x*40))/(W/2))*rangeX;
          const wy=safeEval(f.expr,{x:wx, ...paramSliders});
          const m=numericDerivative(f.expr, wx);
          if(isFinite(wy) && isFinite(m)){
            const x1=wx- rangeX*0.5, x2=wx+ rangeX*0.5;
            const y1=wy + m*(x1-wx), y2=wy + m*(x2-wx);
            ctx.strokeStyle=f.color; ctx.globalAlpha=0.35; ctx.setLineDash([4,6]); ctx.lineWidth=1.6;
            ctx.beginPath(); ctx.moveTo(sx(x1), sy(y1)); ctx.lineTo(sx(x2), sy(y2)); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha=1;
            ctx.fillStyle=f.color; ctx.beginPath(); ctx.arc(sx(wx), sy(wy),4,0,Math.PI*2); ctx.fill();
          }
        }
      }
      // puntos especiales + objetos construidos (puntos y tangentes)
      drawSpecials(ctx,W,H,sx,sy);
      ggDrawObjects(ctx,sx,sy);
    } else if(mode==='param'){
      for(const f of state.funcs.filter(f=>f.visible!==false)){
        const tMin=state.paramRange.tMin, tMax=state.paramRange.tMax;
        const n=800;
        ctx.strokeStyle=f.color; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        ctx.beginPath(); let pen=false;
        for(let i=0;i<=n;i++){
          const t=tMin + (i/n)*(tMax-tMin);
          const x=safeEval(f.xExpr,{t, ...paramSliders}), y=safeEval(f.yExpr,{t, ...paramSliders});
          if(!isFinite(x)||!isFinite(y)){ pen=false; continue; }
          const px=sx(x), py=sy(y);
          if(!pen){ ctx.moveTo(px,py); pen=true; } else ctx.lineTo(px,py);
        }
        ctx.stroke(); ctx.shadowBlur=0;
        // puntos de inicio/fin
        const sx0=safeEval(f.xExpr,{t:tMin, ...paramSliders}), sy0=safeEval(f.yExpr,{t:tMin, ...paramSliders});
        if(isFinite(sx0)&&isFinite(sy0)){ ctx.fillStyle=f.color; ctx.beginPath(); ctx.arc(sx(sx0), sy(sy0),5,0,Math.PI*2); ctx.fill(); }
      }
      ggDrawObjects(ctx,sx,sy);
    } else if(mode==='polar'){
      for(const f of state.funcs.filter(f=>f.visible!==false)){
        const tMax=state.paramRange.polarThetaMax;
        const n=1000;
        ctx.strokeStyle=f.color; ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.shadowColor='transparent'; ctx.shadowBlur=0;
        ctx.beginPath(); let pen=false;
        for(let i=0;i<=n;i++){
          const th=(i/n)*tMax;
          const r=safeEval(f.expr,{theta:th, ...paramSliders});
          if(!isFinite(r)){ pen=false; continue; }
          const x=r*Math.cos(th), y=r*Math.sin(th);
          const px=sx(x), py=sy(y);
          if(!pen){ ctx.moveTo(px,py); pen=true; } else ctx.lineTo(px,py);
        }
        ctx.stroke(); ctx.shadowBlur=0;
      }
      // círculos polares de referencia
      ctx.strokeStyle='rgba(128,128,128,0.12)'; ctx.lineWidth=1;
      for(let r=1; r<=5; r++){
        const rad = (r / rangeX)*(W/2);
        if(rad>10 && rad<W){
          ctx.beginPath(); ctx.arc(W/2+state.pan.x*40, H/2-state.pan.y*40, rad,0,Math.PI*2); ctx.stroke();
        }
      }
      ggDrawObjects(ctx,sx,sy);
    }
  }

  function arrow(ctx,x1,y1,x2,y2,size=8){
    const ang=Math.atan2(y2-y1,x2-x1);
    ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-size*Math.cos(ang-0.42), y2-size*Math.sin(ang-0.42)); ctx.lineTo(x2-size*Math.cos(ang+0.42), y2-size*Math.sin(ang+0.42)); ctx.closePath(); ctx.fill();
  }

  // Dibuja puntos fijados y tangentes del usuario sobre el lienzo cartesiano
  function ggDrawObjects(ctx,sx,sy){
    try {
      for (const p of (ggPoints || [])) {
        const px = sx(p.x), py = sy(p.y);
        ctx.fillStyle = p.color || '#ffc107';
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = p.color || '#ffc107'; ctx.font = 'bold 10px JetBrains Mono'; ctx.textAlign = 'left';
        ctx.fillText((p.label || 'P') + `(${fmtNum(p.x)},${fmtNum(p.y)})`, px + 8, py - 8);
      }
      if (state.mode === '1v') {
        const { rangeX } = ranges();
        for (const t of (ggTangents || [])) {
          const f = state.funcs.find(f => f.id === t.fnId) || state.funcs.filter(f => f.visible !== false && !f.bad)[0];
          if (!f || !f.expr) continue;
          const wy = safeEval(f.expr, { x: t.x, ...paramSliders });
          const m = numericDerivative(f.expr, t.x);
          if (!isFinite(wy) || !isFinite(m)) continue;
          const x1 = t.x - rangeX * 0.6, x2 = t.x + rangeX * 0.6;
          ctx.strokeStyle = f.color; ctx.globalAlpha = 0.75; ctx.setLineDash([7, 5]); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(sx(x1), sy(wy + m * (x1 - t.x))); ctx.lineTo(sx(x2), sy(wy + m * (x2 - t.x))); ctx.stroke();
          ctx.setLineDash([]); ctx.globalAlpha = 1;
          ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(sx(t.x), sy(wy), 4.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    } catch {}
  }

  function drawSpecials(ctx,W,H,sx,sy){
    const css=getComputedStyle(document.documentElement);
    const bg=css.getPropertyValue('--bg').trim()||'#fff';
    const {rangeX}=xform(W,H);
    const cx=W/2 + state.pan.x*40;
    const xLeft=((0 - cx)/(W/2))*rangeX;
    const xRight=((W - cx)/(W/2))*rangeX;
    const visRange=[xLeft, xRight];
    // raíces — rango visible ordenado
    for(const f of state.funcs.filter(f=>!f.bad && f.visible!==false)){
      const roots=findRoots(f.expr, visRange);
      for(const rx of roots){
        const px=sx(rx);
        if(px<-20||px>W+20) continue;
        ctx.fillStyle=f.color; ctx.beginPath(); ctx.arc(px, sy(0),4,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=bg; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(px, sy(0),4,0,Math.PI*2); ctx.stroke();
      }
    }
    // intersecciones — ordenadas por x para etiquetado consistente
    if(state.funcs.length>1){
      const allInter=[];
      for(let a=0;a<state.funcs.length;a++){
        for(let b=a+1;b<state.funcs.length;b++){
          const fa=state.funcs[a], fb=state.funcs[b];
          if(fa.bad||fb.bad||fa.visible===false||fb.visible===false) continue;
          const diff = `( ${fa.expr} ) - ( ${fb.expr} )`;
          const xs=findRoots(diff, visRange);
          for(const rx of xs){
            const ry=safeEval(fa.expr,{x:rx, ...paramSliders});
            if(!isFinite(ry)) continue;
            const px=sx(rx), py=sy(ry);
            if(px<-20||px>W+20||py<-20||py>H+20) continue;
            allInter.push({rx, ry, fa, fb});
          }
        }
      }
      allInter.sort((p,q)=>p.rx-q.rx);
      let lbl=0;
      for(const it of allInter){
        if(lbl>=8) break;
        const rx=it.rx, ry=it.ry;
        const px=sx(rx), py=sy(ry);
        lbl++;
        ctx.fillStyle=PALETTE.highlight; ctx.beginPath(); ctx.arc(px,py,4.5,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle=bg; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(px,py,4.5,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle=PALETTE.highlight; ctx.font='10px JetBrains Mono'; ctx.textAlign='left';
        ctx.fillText(`A${lbl}(${fmtNum(rx)},${fmtNum(ry)})`, px+8, py-8);
      }
    }
  }

  function updateAnalysis(){
    if(state.mode!=='1v'){ analysisEl.innerHTML='<span class="muted">Análisis solo en modo f(x). Cambia a f(x) para raíces y extremos.</span>'; return; }
    const W=cv.clientWidth||560, H=cv.clientHeight||330;
    const rangeX=10/state.pan.zoom;
    const cx=W/2 + state.pan.x*40;
    const xLeft=((0 - cx)/(W/2))*rangeX;
    const xRight=((W - cx)/(W/2))*rangeX;
    const range=[xLeft, xRight];
    const allRoots=[], allExt=[];
    let html='';
    for(let i=0;i<state.funcs.length;i++){
      const f=state.funcs[i];
      if(!f || f.bad || f.visible===false || typeof f.expr!=='string' || !f.expr) continue;
      const roots=findRoots(f.expr, range);
      const ext=findExtrema(f.expr, range);
      allRoots.push(...roots.map(x=>({x,y:0,label:`f${i+1} raíz`})) );
      allExt.push(...ext);
      if(roots.length||ext.length){
        html+=`<div class="analysis-fn"><b style="color:${f.color}">f${i+1}: ${prettyExpr(f.expr)}</b>`;
        if(roots.length) html+=`<div class="analysis-row"><span>Raíces:</span> ${roots.map(r=>`<code>${fmtNum(r)}</code>`).join(', ')}</div>`;
        if(ext.length) html+=`<div class="analysis-row"><span>Extremos:</span> ${ext.map(e=>`<code>${e.type}(${fmtNum(e.x)},${fmtNum(e.y)})</code>`).join(', ')}</div>`;
        html+='</div>';
      }
    }
    // intersecciones globales
    const inters=[];
    for(let a=0;a<state.funcs.length;a++){
      for(let b=a+1;b<state.funcs.length;b++){
        const fa=state.funcs[a], fb=state.funcs[b];
        if(!fa || !fb || fa.bad||fb.bad||fa.visible===false||fb.visible===false) continue;
        if(typeof fa.expr!=='string' || !fa.expr || typeof fb.expr!=='string' || !fb.expr) continue;
        const diff=`(${fa.expr})-(${fb.expr})`;
        const xs=findRoots(diff, range);
        for(const x of xs){ const y=safeEval(fa.expr,{x, ...paramSliders}); if(isFinite(y)) inters.push({x,y,label:`f${a+1}=f${b+1}`}); }
      }
    }
    inters.sort((a,b)=>a.x-b.x);
    if(inters.length){
      html+=`<div class="analysis-fn"><b>Intersecciones</b><div class="analysis-row">${inters.slice(0,6).map(p=>`<code>A(${fmtNum(p.x)},${fmtNum(p.y)})</code>`).join(', ')}</div></div>`;
    }
    state.analysis.roots=allRoots;
    state.analysis.extrema=allExt;
    state.analysis.intersections=inters;
    analysisEl.innerHTML = html || '<span class="muted">Sin raíces/extremos en el rango visible. Aleja el zoom.</span>';
  }

  function draw2v(ctx,W,H){
    const {rangeX, rangeY}=ranges();
    const expr=$('#plot2vExpr')?.value.trim() || state.funcs[0]?.expr || 'sin(x)*cos(y)';
    const n=90;
    const range=Math.max(rangeX, rangeY);
    let min=Infinity, max=-Infinity;
    const grid=[];
    for(let i=0;i<=n;i++){
      grid[i]=[];
      for(let j=0;j<=n;j++){
        const x=(i/n-0.5)*range*2, y=(j/n-0.5)*range*2;
        const v=safeEval(expr,{x,y, ...paramSliders});
        grid[i][j]=isFinite(v)?v:NaN;
        if(isFinite(v)){ min=Math.min(min,v); max=Math.max(max,v); }
      }
    }
    const span=max-min||1;
    const ramp=v=>{
      const t=(v-min)/span;
      const stops=[[0,PALETTE.violet],[0.33,PALETTE.info],[0.66,PALETTE.teal],[0.9,PALETTE.success],[1,PALETTE.highlight]];
      let a=stops[0], b=stops[stops.length-1];
      for(let i=0;i+1<stops.length;i++){ if(t>=stops[i][0]&&t<=stops[i+1][0]){ a=stops[i]; b=stops[i+1]; break; } }
      const k=(t-a[0])/(b[0]-a[0]||1);
      const hex=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
      const ca=hex(a[1]), cb=hex(b[1]);
      return `rgb(${Math.round(ca[0]+(cb[0]-ca[0])*k)},${Math.round(ca[1]+(cb[1]-ca[1])*k)},${Math.round(ca[2]+(cb[2]-ca[2])*k)})`;
    };
    const cw=W/n, ch=H/n;
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){
      const v=grid[i][j]; if(!isFinite(v)) continue;
      ctx.fillStyle=ramp(v); ctx.fillRect(i*cw, j*ch, cw+1, ch+1);
    }
    // contornos
    const levels=6;
    ctx.lineWidth=1;
    for(let L=1;L<levels;L++){
      const lvl=min+(span*L)/levels;
      ctx.strokeStyle='rgba(255,255,255,0.55)';
      ctx.beginPath();
      for(let i=0;i<n;i++) for(let j=0;j<n;j++){
        const v=grid[i][j];
        const pts=[];
        const vR=grid[i+1]?.[j];
        if(isFinite(v)&&isFinite(vR)&&(v-lvl)*(vR-lvl)<=0){ const t=(lvl-v)/(vR-v); pts.push([(i+t)*cw, j*ch]); }
        const vD=grid[i]?.[j+1];
        if(isFinite(v)&&isFinite(vD)&&(v-lvl)*(vD-lvl)<=0){ const t=(lvl-v)/(vD-v); pts.push([i*cw, (j+t)*ch]); }
        if(pts.length===2){ ctx.moveTo(pts[0][0],pts[0][1]); ctx.lineTo(pts[1][0],pts[1][1]); }
      }
      ctx.stroke();
    }
    const css=getComputedStyle(document.documentElement);
    ctx.strokeStyle=css.getPropertyValue('--muted').trim()||'#888'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(W/2,0); ctx.lineTo(W/2,H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='11px JetBrains Mono'; ctx.textAlign='left';
    ctx.fillText(`f(x,y)=${prettyExpr(expr)}`,10,20);
    ctx.fillText(`min ${fmtNum(min)} · max ${fmtNum(max)}`,10,36);
    // colorbar
    const barW=14, barH=120, bx=W-28, by=20;
    for(let i=0;i<barH;i++){
      const t=1-i/barH;
      const v=min+ t*span;
      ctx.fillStyle=ramp(v); ctx.fillRect(bx, by+i, barW,1);
    }
    ctx.strokeStyle='rgba(255,255,255,0.6)'; ctx.strokeRect(bx,by,barW,barH);
    ctx.fillStyle='#fff'; ctx.font='9px JetBrains Mono';
    ctx.fillText(fmtNum(max), bx-2, by-4);
    ctx.fillText(fmtNum(min), bx-2, by+barH+10);
  }

  // inicialización
  syncModeUI();
  renderInputs();
  renderFnList();
  syncZoomUI();
  draw();
  // carga desde URL
  try{
    const params=new URLSearchParams(location.search);
    const p=params.get('plot');
    if(p){
      const obj=JSON.parse(decodeURIComponent(atob(p)));
      if(obj.f) state.funcs=sanitizeFuncsFor(state.mode, obj.f);
      if(obj.m && ['1v','param','polar','2v'].includes(obj.m)) state.mode=obj.m;
      if(obj.p) state.pan=obj.p;
      syncModeUI();
      renderInputs(); renderFnList(); draw();
    }
  }catch{}
  window.EconHub={...(window.EconHub||{}), plot:{redraw:draw}};
  window.addEventListener('resize', ()=>{ clearTimeout(window.__plotRz); window.__plotRz=setTimeout(draw,120); });
  // Redibuja si el lienzo cambia de tamaño (fullscreen, paneles, zoom de página)
  if ('ResizeObserver' in window) {
    let __roT = null;
    try {
      const __ro = new ResizeObserver(()=>{ clearTimeout(__roT); __roT = setTimeout(()=>{ try { draw(); } catch {} }, 120); });
      __ro.observe(cv);
    } catch {}
  }
  bus.addEventListener('theme:changed', draw);
}
