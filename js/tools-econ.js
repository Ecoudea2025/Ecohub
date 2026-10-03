// econhub · tools-econ.js — conceptos económicos interactivos + modelo de Solow
// Datos organizados: tarjetas de resultados con count-up, sliders con badges
// animados y leyenda de la gráfica.
import { $, bus } from './app.js';
import { PALETTE } from './data.js';

const CONCEPTS = [
  { title: 'Inflación', icon: 'ri-price-tag-3-line', color: '#ffc107',
    desc: 'Aumento generalizado y sostenido del nivel de precios: tu dinero pierde poder de compra.',
    extra: 'El IPC mide una canasta de bienes. Si la inflación anual es del 10%, lo que hoy cuesta $100.000 costará $110.000 en un año. Tasa de inflación: \\( \\pi = \\frac{IPC_t - IPC_{t-1}}{IPC_{t-1}} \\times 100\\)' },
  { title: 'Elasticidad', icon: 'ri-focus-3-line', color: '#069a7e',
    desc: 'Qué tan sensible es la cantidad demandada u ofrecida ante cambios en el precio.',
    extra: '\\[ \\varepsilon = \\frac{\\%\\Delta Q}{\\%\\Delta P} \\] |ε|>1 → elástica (responde fuerte); |ε|<1 → inelástica (insensible). La insulina es inelástica; los viajes en avión, elásticos.' },
  { title: 'Costo de oportunidad', icon: 'ri-git-branch-line', color: '#5f4786',
    desc: 'El valor de la mejor alternativa a la que renuncias al tomar una decisión.',
    extra: 'Estudiar 2 horas hoy cuesta lo que habrías ganado o aprendido en esas 2 horas. Todo tiene costo de oportunidad.' },
  { title: 'Oferta y demanda', icon: 'ri-scales-3-line', color: '#127599',
    desc: 'El precio de equilibrio se forma donde la cantidad ofrecida iguala a la demandada.',
    extra: 'Exceso de demanda → sube el precio; exceso de oferta → baja. El equilibrio es estable: el mercado tiende a él. \\( Q_d(p^*) = Q_o(p^*) \\)' },
  { title: 'PIB', icon: 'ri-global-line', color: '#33691e',
    desc: 'Valor de mercado de todos los bienes y servicios finales producidos en un país en un período.',
    extra: '\\[ PIB = C + I + G + (X - M) \\] Es flujo, no stock: mide producción anual, no riqueza acumulada.' },
];

/* ---------- KaTeX (lazy) ---------- */
let katexReady = null;
function loadKatex() {
  if (katexReady) return katexReady;
  katexReady = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
    s.onload = () => {
      const ar = document.createElement('script');
      ar.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js';
      ar.onload = () => { renderAllMath(); res(); };
      ar.onerror = rej;
      document.head.appendChild(ar);
    };
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return katexReady;
}
function renderAllMath() {
  if (!window.renderMathInElement) return;
  try {
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  } catch { /* noop */ }
}

/* ---------- helpers ---------- */
function countUp(el, val, digits = 2) {
  if (!el || !window.gsap) { if (el) el.textContent = Number(val).toFixed(digits); return; }
  const obj = { v: 0 };
  gsap.to(obj, {
    v: val, duration: 0.6, ease: 'power2.out',
    onUpdate: () => { el.textContent = obj.v.toFixed(digits); },
  });
}

function paintRange(el, color) {
  const v = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.background = `linear-gradient(90deg, ${color} ${v}%, var(--panel-2) ${v}%)`;
}

function popEl(el) {
  if (!el || !window.gsap) return;
  gsap.fromTo(el, { scale: 1.28 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' });
}

/* ================= INTERÉS COMPUESTO ================= */
function buildSimulator() {
  const box = $('#conceptsBody');
  box.innerHTML = `
    <div class="concept-card open sim-card" data-reveal>
      <div class="cc-head">
        <span class="cc-ico" style="background:linear-gradient(135deg,${PALETTE.teal},${PALETTE.info})"><i class="ri-percent-line"></i></span>
        <h4>Interés compuesto</h4>
        <span class="badge">simulador</span>
      </div>
      <p>El interés se calcula sobre el capital inicial más los intereses acumulados: crece exponencialmente. A = P·(1 + r)^t</p>
      <div class="sim-result">
        <span>Capital final ≈</span>
        <b id="icOut">0</b>
      </div>
      <div class="math-line">\\( A = P \\cdot (1 + r)^t \\)</div>
      <div class="sim-sliders">
        <div class="slider-block">
          <div class="slider-head"><span>Capital inicial</span><b class="sval" id="icPv">1.000.000</b></div>
          <input type="range" id="icP" min="100000" max="20000000" step="100000" value="1000000">
        </div>
        <div class="slider-block">
          <div class="slider-head"><span>Tasa anual</span><b class="sval" id="icRv">6%</b></div>
          <input type="range" id="icR" min="0" max="20" step="0.5" value="6">
        </div>
        <div class="slider-block">
          <div class="slider-head"><span>Años</span><b class="sval" id="icTv">10</b></div>
          <input type="range" id="icT" min="1" max="30" step="1" value="10">
        </div>
      </div>
      <canvas class="ichart" id="ichart"></canvas>
    </div>
    ${CONCEPTS.map((c) => `
    <div class="concept-card" data-concept data-reveal>
      <div class="cc-head">
        <span class="cc-ico" style="background:${c.color}"><i class="${c.icon}"></i></span>
        <h4>${c.title}</h4>
        <i class="ri-arrow-down-s-line cc-arrow"></i>
      </div>
      <p>${c.desc}</p>
      <div class="cc-extra"><div>${c.extra}</div></div>
    </div>`).join('')}`;

  const sync = () => {
    const P = +$('#icP').value, r = +$('#icR').value / 100, t = +$('#icT').value;
    $('#icPv').textContent = P.toLocaleString('es-CO', { maximumFractionDigits: 0 });
    $('#icRv').textContent = $('#icR').value + '%';
    $('#icTv').textContent = $('#icT').value + ' años';
    popEl($('#icTv'));
    countUp($('#icOut'), P * Math.pow(1 + r, t), 0);
    drawInterestChart();
  };
  [['#icP', PALETTE.teal], ['#icR', PALETTE.info], ['#icT', PALETTE.violet]].forEach(([sel, color]) => {
    const el = $(sel);
    el.addEventListener('input', () => { paintRange(el, color); sync(); });
    paintRange(el, color);
  });
  box.addEventListener('click', (e) => {
    const card = e.target.closest('[data-concept]');
    if (card) card.classList.toggle('open');
  });
  sync();
  loadKatex();
}

function drawInterestChart() {
  const cv = $('#ichart');
  if (!cv) return;
  const P = +$('#icP').value, r = +$('#icR').value / 100, t = +$('#icT').value;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const grid = css.getPropertyValue('--panel-2').trim() || 'rgba(128,128,128,0.15)';
  const text = css.getPropertyValue('--muted').trim() || '#888';
  ctx.clearRect(0, 0, W, H);
  const maxV = Math.max(P * Math.pow(1 + r, t), P * (1 + r * t)) * 1.08;
  const pad = 30;
  const step = Math.max(1, Math.round(t / 12));
  for (let i = 0; i <= t; i += step) {
    const x = pad + (i / t) * (W - pad * 2);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, H - pad); ctx.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    const y = pad + (i / 4) * (H - pad * 2);
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    ctx.fillStyle = text; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxV * (1 - i / 4) / 1000) + 'k', pad - 6, y + 3);
  }
  const line = (fn, color, w = 2.4) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const year = (i / 200) * t;
      const x = pad + (i / 200) * (W - pad * 2);
      const v = fn(year);
      const y = H - pad - (v / maxV) * (H - pad * 2);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  line((yr) => P * Math.pow(1 + r, yr), PALETTE.teal);
  line((yr) => P * (1 + r * yr), css.getPropertyValue('--muted').trim() || '#888', 1.6);
  ctx.fillStyle = PALETTE.teal; ctx.font = '11px Inter'; ctx.textAlign = 'left';
  ctx.fillText('Compuesto', W - pad - 86, pad + 12);
  ctx.fillStyle = css.getPropertyValue('--muted').trim() || '#888';
  ctx.fillText('Simple', W - pad - 40, pad + 26);
}

/* ================= SOLOW ================= */
let solow = { s: 0.25, delta: 0.08, n: 0.02, alpha: 0.33 };
function solowValues() {
  const { s, delta, n, alpha } = solow;
  const kStar = Math.pow(s / (n + delta), 1 / (1 - alpha));
  const yStar = Math.pow(kStar, alpha);
  return { kStar, yStar, inv: s * yStar, cons: (1 - s) * yStar };
}

function buildSolow() {
  const box = $('#solowBody');
  box.innerHTML = `
    <div class="solow-layout">
      <div class="solow-controls glass">
        <h4 class="mini-title"><i class="ri-settings-3-line"></i> Parámetros del modelo</h4>
        <div class="slider-block">
          <div class="slider-head"><span>Tasa de ahorro <code>s</code></span><b class="sval" id="slSv">0.25</b></div>
          <input type="range" id="slS" min="0.05" max="0.5" step="0.01" value="0.25">
        </div>
        <div class="slider-block">
          <div class="slider-head"><span>Depreciación <code>δ</code></span><b class="sval" id="slDv">0.08</b></div>
          <input type="range" id="slD" min="0.02" max="0.2" step="0.01" value="0.08">
        </div>
        <div class="slider-block">
          <div class="slider-head"><span>Crecimiento poblacional <code>n</code></span><b class="sval" id="slNv">0.02</b></div>
          <input type="range" id="slN" min="0" max="0.1" step="0.005" value="0.02">
        </div>
        <div class="slider-block">
          <div class="slider-head"><span>Elasticidad del capital <code>α</code></span><b class="sval" id="slAv">0.33</b></div>
          <input type="range" id="slA" min="0.2" max="0.8" step="0.01" value="0.33">
        </div>
      </div>
      <div class="solow-stats">
        <div class="stat-card" style="--sc:${PALETTE.teal}">
          <span>Capital por trabajador</span>
          <b id="stK">0</b>
          <small>\\( k^* = \\left(\\frac{s}{n+\\delta}\\right)^{\\frac{1}{1-\\alpha}} \\)</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.highlight}">
          <span>Producción per cápita</span>
          <b id="stY">0</b>
          <small>\\( y^* = (k^*)^{\\alpha} \\)</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.info}">
          <span>Inversión de equilibrio</span>
          <b id="stI">0</b>
          <small>\\( s \\cdot y^* = (n+\\delta) \\cdot k^* \\)</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.success}">
          <span>Consumo per cápita</span>
          <b id="stC">0</b>
          <small>\\( c^* = (1-s) \\cdot y^* \\)</small>
        </div>
      </div>
    </div>
    <div class="solow-chart glass">
      <canvas class="ichart" id="solowchart"></canvas>
      <div class="solow-legend">
        <span><i style="background:${PALETTE.highlight}"></i> \\( y = k^{\\alpha} \\)</span>
        <span><i style="background:${PALETTE.teal}"></i> \\( s \\cdot k^{\\alpha} \\) (inversión)</span>
        <span><i style="background:var(--accent)"></i> \\( (n+\\delta) \\cdot k \\) (break-even)</span>
        <span><i style="background:${PALETTE.violet}"></i> \\( k^* \\) · estado estacionario</span>
      </div>
    </div>
    <p class="solow-note">Sube <b>s</b> → k* crece (más capital por trabajador). Sube <b>n</b> o <b>δ</b> → k* cae. Sin progreso tecnológico, el crecimiento per cápita se detiene en el estado estacionario.</p>`;

  const sync = () => {
    solow.s = +$('#slS').value; solow.delta = +$('#slD').value;
    solow.n = +$('#slN').value; solow.alpha = +$('#slA').value;
    $('#slSv').textContent = solow.s.toFixed(2); $('#slDv').textContent = solow.delta.toFixed(2);
    $('#slNv').textContent = solow.n.toFixed(3); $('#slAv').textContent = solow.alpha.toFixed(2);
    popEl($('#slSv'));
    const { kStar, yStar, inv, cons } = solowValues();
    countUp($('#stK'), kStar);
    countUp($('#stY'), yStar);
    countUp($('#stI'), inv);
    countUp($('#stC'), cons);
    drawSolow();
  };
  [['#slS', PALETTE.teal], ['#slD', '#ef5350'], ['#slN', PALETTE.info], ['#slA', PALETTE.violet]].forEach(([sel, color]) => {
    const el = $(sel);
    el.addEventListener('input', () => { paintRange(el, color); sync(); });
    paintRange(el, color);
  });
  sync();
  loadKatex();
}

function drawSolow() {
  const cv = $('#solowchart');
  if (!cv) return;
  const { s, delta, n, alpha } = solow;
  const { kStar, yStar } = solowValues();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue('--muted').trim() || '#888';
  const grid = css.getPropertyValue('--panel-2').trim() || 'rgba(128,128,128,0.15)';
  ctx.clearRect(0, 0, W, H);
  const kmax = 2.2, ymax = 2.0, pad = 34;
  const X = (k) => pad + (k / kmax) * (W - pad * 2);
  const Y = (v) => H - pad - (v / ymax) * (H - pad * 2);
  for (let i = 0; i <= 10; i++) {
    const k = (i / 10) * kmax;
    ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(X(k), pad); ctx.lineTo(X(k), H - pad); ctx.stroke();
    if (i % 2 === 0) { ctx.fillStyle = text; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center'; ctx.fillText(k.toFixed(1), X(k), H - pad + 14); }
  }
  ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
  const f = (fn, color, w = 2.6, dash = []) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const k = (i / 160) * kmax;
      const v = Math.max(0, fn(k));
      i ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v));
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  f((k) => Math.pow(k, alpha), PALETTE.highlight, 2.6);
  f((k) => s * Math.pow(k, alpha), PALETTE.teal, 2.4);
  f((k) => (n + delta) * k, css.getPropertyValue('--accent').trim() || '#888', 2.2, [7, 5]);
  ctx.strokeStyle = PALETTE.violet; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(kStar), pad); ctx.lineTo(X(kStar), H - pad); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.violet;
  ctx.beginPath(); ctx.arc(X(kStar), Y(yStar), 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = text; ctx.font = '11px Inter'; ctx.textAlign = 'left';
  ctx.fillText('y = k^α', X(1.35), Y(Math.pow(1.3, alpha)) - 8);
  ctx.fillStyle = PALETTE.teal; ctx.fillText('s·k^α', X(0.75), Y(0.62) - 6);
  ctx.fillStyle = css.getPropertyValue('--accent').trim() || '#888'; ctx.fillText('(n+δ)·k', X(1.5), Y(0.42) - 6);
  ctx.fillStyle = PALETTE.violet; ctx.fillText('k*', X(kStar) + 8, Y(yStar) + 18);
}

let drawn = false;
function ensureDrawn() {
  if (drawn) return;
  drawn = true;
  buildSimulator();
  buildSolow();
  loadKatex();
  bus.addEventListener('theme:changed', () => { drawInterestChart(); drawSolow(); });
}

export function initToolsEcon() {
  window.EconHub = { ...(window.EconHub || {}), econ: { redraw: () => { drawInterestChart(); drawSolow(); } } };
  const maybe = () => {
    if ((location.hash || '').includes('herramientas')) {
      ensureDrawn();
      setTimeout(() => { drawInterestChart(); drawSolow(); }, 60);
    }
  };
  maybe();
  bus.addEventListener('route:changed', (e) => {
    if ((e.detail || '').includes('herramientas')) {
      ensureDrawn();
      setTimeout(() => { drawInterestChart(); drawSolow(); }, 60);
    }
  });
}
