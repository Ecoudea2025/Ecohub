// econhub · repaso.js — laboratorio de repaso espaciado (SM-2)
// Tarjetas de conceptos, sesión de estudio diaria, programación por intervalos
// crecientes y gestión de tarjetas. Persistencia en localStorage.
import { $, $$, store, toast, bus } from './app.js';
import { PALETTE, KEYS, uid, todayISO, addDaysISO } from './data.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;

const STARTER = [
  { front: '¿Qué mide la elasticidad-precio de la demanda?', back: 'La sensibilidad de la cantidad demandada ante un cambio en el precio:\n$$\\varepsilon = \\frac{\\%\\Delta Q}{\\%\\Delta P}$$', deck: 'Micro' },
  { front: 'Ley de rendimientos marginales decrecientes', back: 'Al añadir más unidades de un factor variable manteniendo los demás fijos, el producto marginal eventualmente cae:\n$$\\frac{\\partial^2 Q}{\\partial L^2} < 0$$', deck: 'Micro' },
  { front: 'PIB por el método del gasto', back: 'Identidad macroeconómica fundamental del producto interno bruto:\n$$Y = C + I + G + (X - M)$$\nDonde $C$ es consumo, $I$ inversión, $G$ gasto y $(X - M)$ exportaciones netas.', deck: 'Macro' },
  { front: 'Estado estacionario en el modelo de Solow', back: 'Punto donde la inversión iguala a la depreciación efectiva:\n$$s \\cdot y^* = (n + \\delta + g) \\cdot k^*$$\nSin progreso técnico el stock de capital por trabajador se estabiliza.', deck: 'Macro' },
];

let katexInst = null;
let katexLoading = false;
async function loadKatex() {
  if (katexInst) return katexInst;
  if (window.katex) { katexInst = window.katex; return katexInst; }
  if (katexLoading) {
    while (katexLoading && !katexInst) await new Promise((r) => setTimeout(r, 40));
    return katexInst;
  }
  katexLoading = true;
  try {
    if (!document.querySelector('link[href*="katex"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css';
      document.head.appendChild(link);
    }
    const mod = await import(/* @vite-ignore */ 'https://esm.sh/katex@0.16.21');
    katexInst = mod.default || mod;
    return katexInst;
  } catch (err) {
    console.warn('Error cargando KaTeX en repaso:', err);
    return null;
  } finally {
    katexLoading = false;
  }
}

function renderMathHtml(raw) {
  if (!raw) return '';
  if (katexInst) {
    let s = raw;
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      try { return katexInst.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
      catch { return esc(_); }
    });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => {
      try { return katexInst.renderToString(tex.trim(), { displayMode: true, throwOnError: false }); }
      catch { return esc(_); }
    });
    s = s.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
      try { return katexInst.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
      catch { return esc(_); }
    });
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => {
      try { return katexInst.renderToString(tex.trim(), { displayMode: false, throwOnError: false }); }
      catch { return esc(_); }
    });

    const parts = s.split(/(<[^>]+>)/g);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = esc(parts[i]).replace(/\n/g, '<br>');
    }
    return parts.join('');
  }

  loadKatex().then((k) => {
    if (k && mounted) {
      if (view === 'estudiar' && session.current) {
        const card = $('#fcCard');
        if (card) {
          const pPrompt = card.querySelector('.fc-prompt p');
          const pAnswer = card.querySelector('.fc-answer p');
          if (pPrompt) pPrompt.innerHTML = renderMathHtml(session.current.front);
          if (pAnswer) pAnswer.innerHTML = renderMathHtml(session.current.back);
        }
      } else if (view === 'tarjetas') {
        renderManager();
      }
    }
  });
  return esc(raw).replace(/\n/g, '<br>');
}

let data = { cards: [] };
let mounted = false;
let saveTimer = null;
let view = 'estudiar';
let deckFilter = 'all';
let session = { queue: [], done: 0, total: 0, current: null, revealed: false };
let editingId = null;

/* ---------- datos ---------- */
function load() {
  const saved = store.get(KEYS.repaso, null);
  if (saved && Array.isArray(saved.cards)) {
    saved.cards.forEach((c) => {
      if (c.front.includes('¿Qué mide la elasticidad-precio') && !c.back.includes('varepsilon')) {
        c.back = 'La sensibilidad de la cantidad demandada ante un cambio en el precio:\n$$\\varepsilon = \\frac{\\%\\Delta Q}{\\%\\Delta P}$$';
      } else if (c.front.includes('Ley de rendimientos marginales') && !c.back.includes('\\partial')) {
        c.back = 'Al añadir más unidades de un factor variable manteniendo los demás fijos, el producto marginal eventualmente cae:\n$$\\frac{\\partial^2 Q}{\\partial L^2} < 0$$';
      } else if (c.front.includes('PIB por el método del gasto') && !c.back.includes('Y = C')) {
        c.back = 'Identidad macroeconómica fundamental del producto interno bruto:\n$$Y = C + I + G + (X - M)$$\nDonde $C$ es consumo, $I$ inversión, $G$ gasto y $(X - M)$ exportaciones netas.';
      } else if (c.front.includes('Estado estacionario') && !c.back.includes('s \\cdot y^*')) {
        c.back = 'Punto donde la inversión iguala a la depreciación efectiva:\n$$s \\cdot y^* = (n + \\delta + g) \\cdot k^*$$\nSin progreso técnico el stock de capital por trabajador se estabiliza.';
      }
    });
    return { cards: saved.cards };
  }
  const cards = STARTER.map((c, i) => ({
    id: uid(), front: c.front, back: c.back, deck: c.deck,
    ease: 2.5, interval: 0, reps: 0, lapses: 0, due: todayISO(), created: todayISO(),
  }));
  return { cards };
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEYS.repaso, data), 300);
}
function decks() { return [...new Set(data.cards.map((c) => (c.deck || 'General').trim() || 'General'))].sort(); }
function isDue(c) { return (c.due || todayISO()) <= todayISO(); }
function intervalDays(c) {
  if (c.reps === 0) return 0;
  if (c.reps === 1) return 1;
  if (c.reps === 2) return 6;
  return Math.round((c.interval || 1) * c.ease);
}
// Devuelve una copia programada con calidad q (0..5) — no muta
function project(c, q) {
  const n = { ...c };
  if (q < 3) {
    n.reps = 0; n.interval = 0; n.lapses = (n.lapses || 0) + 1;
    n.ease = Math.max(1.3, (n.ease || 2.5) - 0.2);
    n.due = todayISO();
  } else {
    n.ease = Math.max(1.3, (n.ease || 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
    n.reps = (n.reps || 0) + 1;
    if (n.reps === 1) n.interval = 1;
    else if (n.reps === 2) n.interval = 6;
    else n.interval = Math.round((n.interval || 1) * n.ease);
    n.due = addDaysISO(todayISO(), n.interval);
  }
  n.last = todayISO();
  return n;
}
function apply(c, q) {
  const n = project(c, q);
  Object.assign(c, n);
  saveSoon();
}
function dueLabel(iso) {
  if (!iso) return 'hoy';
  const diff = Math.round((new Date(iso + 'T12:00:00') - new Date(todayISO() + 'T12:00:00')) / DAY);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff < 30) return `${diff} días`;
  return `${Math.round(diff / 30)} mes(es)`;
}
function intervalLabel(q) {
  const c = session.current;
  if (!c) return '';
  const n = project(c, q);
  if (q < 3) return '< 10 min';
  return n.interval === 1 ? '1 día' : `${n.interval} días`;
}

/* ---------- stats ---------- */
function stats() {
  const total = data.cards.length;
  const pool = deckFilter === 'all' ? data.cards : data.cards.filter((c) => (c.deck || 'General') === deckFilter);
  const due = pool.filter(isDue).length;
  const learned = pool.filter((c) => (c.interval || 0) >= 21).length;
  const learning = pool.filter((c) => (c.reps || 0) > 0 && (c.interval || 0) < 21).length;
  return { total, due, learned, learning };
}

/* ---------- animaciones ---------- */
function pop(el) { if (el && !reduced() && window.gsap) gsap.fromTo(el, { scale: 1.2 }, { scale: 1, duration: 0.45, ease: 'elastic.out(1,0.5)' }); }
function animateNum(el, to) {
  if (!el) return;
  if (reduced() || !window.gsap) { el.textContent = to; return; }
  const from = parseInt(el.dataset.v || '0', 10) || 0;
  if (from === to) { el.textContent = to; return; }
  const o = { v: from };
  gsap.to(o, { v: to, duration: 0.5, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); el.dataset.v = Math.round(o.v); } });
}

/* ---------- montaje ---------- */
function mount() {
  const box = $('#repasoBody');
  if (!box) return;
  box.innerHTML = `
    <div class="repaso-app">
      <div class="repaso-summary">
        <div class="stat-card" style="--sc:${PALETTE.highlight}"><span>Pendientes hoy</span><b id="rpDue">0</b><small>para repasar ahora</small></div>
        <div class="stat-card" style="--sc:${PALETTE.info}"><span>Total tarjetas</span><b id="rpTotal">0</b><small>en tu mazo</small></div>
        <div class="stat-card" style="--sc:${PALETTE.teal}"><span>Aprendiendo</span><b id="rpLearning">0</b><small>en intervalos cortos</small></div>
        <div class="stat-card" style="--sc:${PALETTE.success}"><span>Dominadas</span><b id="rpLearned">0</b><small>intervalo ≥ 21 días</small></div>
      </div>

      <div class="repaso-toolbar glass">
        <div class="seg" id="repasoViewSeg">
          <button class="seg-btn active" data-rv="estudiar"><i class="ri-play-circle-line"></i> Estudiar</button>
          <button class="seg-btn" data-rv="tarjetas"><i class="ri-stack-line"></i> Tarjetas</button>
        </div>
        <div class="repaso-deck" id="repasoDeck">
          <span class="rd-label">Mazo</span>
          <button class="rd-btn" id="repasoDeckBtn" aria-haspopup="listbox" aria-expanded="false">
            <span id="repasoDeckLabel">Todos los mazos</span>
            <i class="ri-arrow-down-s-line"></i>
          </button>
          <div class="rd-menu hidden" id="repasoDeckMenu" role="listbox"></div>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-secondary btn-sm" id="repasoAiBtn" title="Generar e importar tarjetas con IA"><i class="ri-sparkling-fill" style="color:var(--pal-highlight)"></i> Generar con IA</button>
        <button class="btn btn-primary btn-sm" id="repasoAddBtn"><i class="ri-add-line"></i> Nueva tarjeta</button>
        <button class="btn btn-ghost btn-sm" id="repasoResetBtn" title="Reiniciar el progreso de todas las tarjetas"><i class="ri-refresh-line"></i> Reiniciar progreso</button>
      </div>

      <section class="repaso-view" id="repasoEstudiar">
        <div class="repaso-study glass" id="repasoStudy"></div>
      </section>

      <section class="repaso-view hidden" id="repasoGestion">
        <div class="repaso-editor glass" id="repasoEditor"></div>
        <div class="repaso-cards" id="repasoCards"></div>
      </section>

      <div class="modal hidden" id="repasoAiModal">
        <div class="modal-card" style="max-width:640px;width:95%">
          <header class="modal-head">
            <h3><i class="ri-sparkling-fill" style="color:var(--pal-highlight)"></i> Generar Tarjetas con IA</h3>
            <button class="icon-btn" id="aiCloseBtn" title="Cerrar"><i class="ri-close-line"></i></button>
          </header>
          <div class="modal-body rp-ai-grid">
            <div class="rp-ai-step">
              <h4><i class="ri-file-copy-line accent"></i> 1. Copia el Prompt para tu IA (ChatGPT / Claude / DeepSeek)</h4>
              <p>Configura el tema y copia el prompt optimizado para que la IA responda en formato compatible con LaTeX:</p>
              <div class="rp-ai-inputs">
                <label>Tema o materia
                  <input type="text" id="aiTopic" placeholder="Ej: Microeconomía: Monopolio" value="Microeconomía: Monopolio y fijación de precios">
                </label>
                <label>Cantidad
                  <input type="number" id="aiCount" min="1" max="25" value="5">
                </label>
                <label>Mazo destino
                  <input type="text" id="aiDeck" list="rpDeckList" placeholder="Micro" value="Micro">
                </label>
              </div>
              <button class="btn btn-secondary btn-sm" id="aiCopyPromptBtn" style="width:100%"><i class="ri-clipboard-line"></i> Copiar Prompt al Portapapeles</button>
            </div>

            <div class="rp-ai-step">
              <h4><i class="ri-download-cloud-line accent"></i> 2. Pega la respuesta de la IA</h4>
              <p>Pega el texto generado (soporta <code>Pregunta | Respuesta | Mazo</code>, tablas o JSON):</p>
              <textarea id="aiPaste" rows="5" placeholder="¿Qué es el ingreso marginal en monopolio? | Es el cambio en el ingreso total al vender una unidad más: $IMg = P(Q) + Q \cdot P'(Q) < P$. | Micro"></textarea>
              <div class="rp-ai-preview-box">
                <span id="aiCountBadge" class="badge">0 tarjetas válidas detectadas</span>
                <button type="button" class="rp-ai-sample-btn" id="aiSampleBtn">Cargar ejemplo con LaTeX</button>
              </div>
            </div>
          </div>
          <footer class="modal-foot" style="display:flex;justify-content:flex-end;gap:10px">
            <button class="btn btn-ghost btn-sm" id="aiCancelBtn">Cancelar</button>
            <button class="btn btn-primary btn-sm" id="aiImportBtn" disabled><i class="ri-check-line"></i> Importar al mazo</button>
          </footer>
        </div>
      </div>
    </div>`;
  bindToolbar();
  bindAiModal();
  refreshStats();
  buildSession();
  renderEditor();
  renderManager();
}

function buildAiPrompt(topic, count, deck) {
  return `Actúa como un profesor universitario experto en Economía.
Genera exactamente ${count} flashcards de estudio de alta calidad sobre: "${topic}".

REGLAS ESTRICTAS:
1. Formato de salida: exactamente UNA línea por tarjeta, usando plecas (|) como separadores:
Pregunta | Respuesta | Mazo

2. El mazo debe ser: ${deck || 'General'}
3. Preguntas desafiantes, conceptuales o cuantitativas.
4. Respuestas claras, precisas y rigurosas.
5. Si incluye fórmulas matemáticas o estadísticas, escríbelas en notación LaTeX estándar entre signos de dólar ($...$ o $$...$$).
6. NO agregues introducciones, conclusiones ni texto adicional fuera de las tarjetas.

EJEMPLO:
¿Qué es la Regla de la Elasticidad Inversa en Monopolio? | Establece que el margen de beneficio sobre el costo marginal es inversamente proporcional a la elasticidad de la demanda: $\\frac{P - CMg}{P} = -\\frac{1}{\\varepsilon_d}$. | ${deck || 'General'}`;
}

function parseAiCards(text, defaultDeck = 'General') {
  if (!text || !text.trim()) return [];
  const trimmed = text.trim();
  const results = [];

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const front = item.front || item.pregunta || item.question || item.q || '';
          const back = item.back || item.respuesta || item.answer || item.a || '';
          const deck = item.deck || item.mazo || defaultDeck;
          if (front && back) results.push({ front: String(front).trim(), back: String(back).trim(), deck: String(deck || defaultDeck).trim() });
        }
        if (results.length) return results;
      }
    } catch { /* noop */ }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    if (/^(pregunta|front|tarjeta|cuestión|n[°o]|item)\s*(\||;|\t)/i.test(line)) continue;
    if (line.startsWith('---') || line.startsWith('===') || line.startsWith('```')) continue;

    let sep = null;
    if (line.includes('|')) sep = '|';
    else if (line.includes('\t')) sep = '\t';
    else if (line.includes(';') && (line.match(/;/g) || []).length <= 3) sep = ';';
    if (!sep) continue;

    const parts = line.split(sep).map((p) => p.trim());
    if (parts.length >= 2) {
      const front = parts[0].replace(/^(\d+[\.\)]\s*|[-*•]\s*)/, '').trim();
      const back = parts[1].trim();
      const deck = (parts[2] || defaultDeck).trim();
      if (front && back) {
        results.push({ front, back, deck: deck || defaultDeck });
      }
    }
  }

  return results;
}

function bindAiModal() {
  const modal = $('#repasoAiModal');
  const openBtn = $('#repasoAiBtn');
  const closeBtn = $('#aiCloseBtn');
  const cancelBtn = $('#aiCancelBtn');
  const copyBtn = $('#aiCopyPromptBtn');
  const pasteArea = $('#aiPaste');
  const badge = $('#aiCountBadge');
  const importBtn = $('#aiImportBtn');
  const sampleBtn = $('#aiSampleBtn');

  const close = () => modal?.classList.add('hidden');
  openBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    const curDeck = deckFilter !== 'all' ? deckFilter : 'Micro';
    const dInput = $('#aiDeck');
    if (dInput) dInput.value = curDeck;
  });
  closeBtn?.addEventListener('click', close);
  cancelBtn?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

  copyBtn?.addEventListener('click', async () => {
    const topic = $('#aiTopic')?.value.trim() || 'Conceptos clave de Economía';
    const count = parseInt($('#aiCount')?.value, 10) || 5;
    const deck = $('#aiDeck')?.value.trim() || 'General';
    const prompt = buildAiPrompt(topic, count, deck);
    try {
      await navigator.clipboard.writeText(prompt);
      toast('Prompt copiado al portapapeles. Pégalo en tu IA', 'ok');
    } catch {
      toast('No se pudo copiar automáticamente', 'err');
    }
  });

  const updateParsed = () => {
    const txt = pasteArea?.value || '';
    const defDeck = $('#aiDeck')?.value.trim() || 'General';
    const parsed = parseAiCards(txt, defDeck);
    if (badge) badge.textContent = `${parsed.length} tarjeta(s) válida(s) detectada(s)`;
    if (importBtn) importBtn.disabled = parsed.length === 0;
    return parsed;
  };
  pasteArea?.addEventListener('input', updateParsed);

  sampleBtn?.addEventListener('click', () => {
    if (pasteArea) {
      pasteArea.value = `¿Qué representa el multiplicador keynesiano? | Es el factor de amplificación del gasto autónomo sobre el PIB de equilibrio: $$k = \\frac{1}{1 - c(1 - t) + m}$$ donde $c$ es la propensión marginal a consumir. | Macro
¿Cómo se calcula el estimador MCO en notación matricial? | Minimiza la suma de residuos cuadráticos: $$\\hat{\\beta} = (X^T X)^{-1} X^T Y$$ bajo los supuestos clásicos de Gauss-Markov. | Econometría
¿Qué es el excedente del consumidor? | Es la diferencia entre la disposición a pagar y el precio de mercado: $$EC = \\int_0^{Q^*} [P(q) - P^*] \\, dq$$ | Micro`;
      updateParsed();
      toast('Ejemplo cargado con fórmulas LaTeX', 'ok');
    }
  });

  importBtn?.addEventListener('click', () => {
    const defDeck = $('#aiDeck')?.value.trim() || 'General';
    const parsed = updateParsed();
    if (!parsed.length) return toast('No hay tarjetas válidas para importar', 'err');
    parsed.forEach((c) => {
      data.cards.push({
        id: uid(),
        front: c.front,
        back: c.back,
        deck: c.deck || defDeck,
        ease: 2.5,
        interval: 0,
        reps: 0,
        lapses: 0,
        due: todayISO(),
        created: todayISO(),
      });
    });
    saveSoon();
    refreshStats();
    buildSession();
    renderManager();
    close();
    if (pasteArea) pasteArea.value = '';
    updateParsed();
    toast(`¡${parsed.length} tarjeta(s) importada(s) con éxito!`, 'ok');
  });
}

function bindToolbar() {
  $('#repasoViewSeg')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rv]');
    if (!b) return;
    view = b.dataset.rv;
    $$('#repasoViewSeg .seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.rv === view));
    $('#repasoEstudiar')?.classList.toggle('hidden', view !== 'estudiar');
    $('#repasoGestion')?.classList.toggle('hidden', view !== 'tarjetas');
    if (view === 'estudiar') buildSession(); else renderManager();
  });
  $('#repasoDeckBtn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleDeckMenu(); });
  $('#repasoDeckMenu')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-deck]');
    if (!b) return;
    deckFilter = b.dataset.deck;
    toggleDeckMenu(false);
    renderManager(); buildSession(); refreshStats();
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#repasoDeck')) toggleDeckMenu(false); });
  $('#repasoAddBtn')?.addEventListener('click', () => {
    view = 'tarjetas';
    $$('#repasoViewSeg .seg-btn').forEach((x) => x.classList.toggle('active', x.dataset.rv === view));
    $('#repasoEstudiar')?.classList.add('hidden');
    $('#repasoGestion')?.classList.remove('hidden');
    editingId = null;
    renderEditor();
    setTimeout(() => $('#rpFront')?.focus(), 80);
  });
  $('#repasoResetBtn')?.addEventListener('click', () => {
    if (!confirm('¿Reiniciar el progreso de todas las tarjetas? Volverán a estar pendientes hoy.')) return;
    data.cards.forEach((c) => { c.ease = 2.5; c.interval = 0; c.reps = 0; c.lapses = 0; c.due = todayISO(); });
    saveSoon(); refreshStats(); buildSession(); renderManager();
    toast('Progreso reiniciado');
  });
}

/* ---------- sesión de estudio ---------- */
function buildSession() {
  const pool = (deckFilter === 'all' ? data.cards : data.cards.filter((c) => (c.deck || 'General') === deckFilter));
  session.queue = pool.filter(isDue);
  session.done = 0;
  session.total = session.queue.length;
  session.current = null;
  session.revealed = false;
  nextCard(false);
}

function nextCard(animate = true) {
  session.current = session.queue.shift() || null;
  session.revealed = false;
  renderStudy(animate);
}

function renderStudy(animate = true) {
  const el = $('#repasoStudy');
  if (!el) return;
  if (!session.current) {
    const s = stats();
    el.innerHTML = `
      <div class="repaso-done">
        <i class="ri-checkbox-circle-line"></i>
        <h3>${session.total === 0 ? 'Nada pendiente por hoy' : '¡Sesión completada!'}</h3>
        <p>${session.total === 0 ? 'No tienes tarjetas para repasar con este filtro. Crea nuevas o vuelve mañana.' : `Repasaste ${session.done} tarjeta(s). Vuelve mañana para mantener la memoria.`}</p>
        <div class="repaso-done-actions">
          ${session.total === 0 ? '<button class="btn btn-primary btn-sm" id="rpHintAdd"><i class="ri-add-line"></i> Crear una tarjeta</button>' : ''}
          <span class="badge">Pendientes hoy: ${s.due}</span>
        </div>
      </div>`;
    $('#rpHintAdd')?.addEventListener('click', () => $('#repasoAddBtn')?.click());
    return;
  }
  const c = session.current;
  const pct = session.total ? Math.round((session.done / session.total) * 100) : 0;
  el.innerHTML = `
    <div class="fc-wrap">
      <div class="fc-progress"><i style="width:${pct}%"></i></div>
      <div class="fc-card ${session.revealed ? 'flipped' : ''}" id="fcCard">
        <div class="fc-meta">
          <span class="fc-chip"><i class="ri-stack-line"></i> ${esc(c.deck || 'General')}</span>
          <span class="fc-counter mono">${session.done}/${session.total}</span>
        </div>
        <div class="fc-prompt"><span class="fc-label">Pregunta</span><p>${renderMathHtml(c.front)}</p></div>
        <div class="fc-answer">
          <span class="fc-label">Respuesta</span>
          <p>${renderMathHtml(c.back)}</p>
        </div>
        <button class="fc-reveal" id="fcReveal" title="Mostrar respuesta (Espacio)"><i class="ri-eye-line"></i> Mostrar respuesta <kbd>Espacio</kbd></button>
      </div>
      <div class="fc-actions ${session.revealed ? 'ready' : ''}" id="fcActions">
        <button class="fc-grade g-again" data-q="0"><span>Otra vez</span><small id="iv0">&lt; 10 min</small></button>
        <button class="fc-grade g-hard" data-q="3"><span>Difícil</span><small id="iv3">${intervalLabel(3) || '1 día'}</small></button>
        <button class="fc-grade g-good" data-q="4"><span>Bien</span><small id="iv4">${intervalLabel(4) || '1 día'}</small></button>
        <button class="fc-grade g-easy" data-q="5"><span>Fácil</span><small id="iv5">${intervalLabel(5) || '4 días'}</small></button>
      </div>
      <p class="fc-hint muted">
        <span>Teclas rápidas:</span>
        <span><kbd>Espacio</kbd> mostrar</span>
        <span><kbd>1</kbd> otra vez</span>
        <span><kbd>2</kbd> difícil</span>
        <span><kbd>3</kbd> bien</span>
        <span><kbd>4</kbd> fácil</span>
      </p>
    </div>`;
  if (animate && !reduced() && window.gsap) {
    gsap.fromTo(el.querySelector('.fc-card'), { opacity: 0, y: 18, rotateX: -8 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.4, ease: 'power3.out' });
  }
  updateIntervalLabels();
  $('#fcReveal')?.addEventListener('click', reveal);
  $('#fcCard')?.addEventListener('click', (e) => { if (e.target.closest('#fcReveal')) return; if (!session.revealed) reveal(); });
  el.querySelectorAll('.fc-grade').forEach((b) => b.addEventListener('click', () => grade(+b.dataset.q)));
}

function reveal() {
  if (!session.current || session.revealed) return;
  session.revealed = true;
  const card = $('#fcCard');
  card?.classList.add('flipped');
  $('#fcActions')?.classList.add('ready');
  updateIntervalLabels();
  if (!reduced() && window.gsap) {
    gsap.fromTo('#fcActions', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }
}
function updateIntervalLabels() {
  [0, 3, 4, 5].forEach((q) => { const el = document.getElementById('iv' + q); if (el) el.textContent = intervalLabel(q); });
}
function grade(q) {
  if (!session.current || !session.revealed) { reveal(); return; }
  const c = session.current;
  apply(c, q);
  session.done++;
  if (!reduced() && window.gsap && $('#fcCard')) {
    gsap.to($('#fcCard'), { opacity: 0, x: q < 3 ? -30 : 30, duration: 0.22, ease: 'power2.in', onComplete: () => {
      if (q < 3 && isDue(c)) session.queue.push(c);
      nextCard();
    } });
  } else {
    if (q < 3 && isDue(c)) session.queue.push(c);
    nextCard();
  }
  refreshStats();
}

/* ---------- editor ---------- */
function renderEditor() {
  const el = $('#repasoEditor');
  if (!el) return;
  const editing = editingId ? data.cards.find((c) => c.id === editingId) : null;
  el.innerHTML = `
    <h4 class="mini-title"><i class="ri-add-circle-line"></i> ${editing ? 'Editar tarjeta' : 'Nueva tarjeta'}</h4>
    <div class="rp-editor-grid">
      <label>Pregunta<textarea id="rpFront" rows="2" placeholder="¿Qué es...?">${editing ? esc(editing.front) : ''}</textarea></label>
      <label>Respuesta<textarea id="rpBack" rows="3" placeholder="La definición o idea clave...">${editing ? esc(editing.back) : ''}</textarea></label>
      <label class="rp-editor-deck">Mazo<input id="rpDeck" type="text" list="rpDeckList" placeholder="Micro, Macro..." value="${editing ? esc(editing.deck || '') : ''}">
        <datalist id="rpDeckList">${decks().map((d) => `<option value="${esc(d)}"></option>`).join('')}</datalist>
      </label>
    </div>
    <div class="rp-editor-actions">
      <button class="btn btn-primary btn-sm" id="rpSave"><i class="ri-save-3-line"></i> ${editing ? 'Guardar' : 'Agregar tarjeta'}</button>
      ${editing ? '<button class="btn btn-ghost btn-sm" id="rpCancel">Cancelar</button>' : ''}
    </div>`;
  $('#rpSave')?.addEventListener('click', saveCard);
  $('#rpCancel')?.addEventListener('click', () => { editingId = null; renderEditor(); });
}

function saveCard() {
  const front = $('#rpFront')?.value.trim();
  const back = $('#rpBack')?.value.trim();
  const deck = ($('#rpDeck')?.value || 'General').trim() || 'General';
  if (!front || !back) return toast('Completa pregunta y respuesta', 'err');
  if (editingId) {
    const c = data.cards.find((x) => x.id === editingId);
    if (c) { c.front = front; c.back = back; c.deck = deck; }
    toast('Tarjeta actualizada');
  } else {
    data.cards.push({ id: uid(), front, back, deck, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: todayISO(), created: todayISO() });
    toast('Tarjeta agregada');
  }
  editingId = null;
  saveSoon(); renderEditor(); renderManager(); refreshStats();
}

/* ---------- gestor ---------- */
function renderManager() {
  const el = $('#repasoCards');
  if (!el) return;
  const pool = (deckFilter === 'all' ? data.cards : data.cards.filter((c) => (c.deck || 'General') === deckFilter));
  if (!pool.length) {
    el.innerHTML = '<div class="grades-empty"><i class="ri-stack-line"></i><p>No hay tarjetas en este mazo.</p></div>';
    return;
  }
  el.innerHTML = pool.map((c) => `
    <article class="rp-card ${isDue(c) ? 'due' : ''}" data-cid="${c.id}">
      <div class="rp-card-main">
        <div class="rp-card-front">${renderMathHtml(c.front)}</div>
        <div class="rp-card-back">${renderMathHtml(c.back)}</div>
      </div>
      <div class="rp-card-side">
        <span class="rp-card-deck">${esc(c.deck || 'General')}</span>
        <span class="rp-card-due" title="Próximo repaso"><i class="ri-calendar-line"></i> ${dueLabel(c.due)}</span>
      </div>
      <div class="rp-card-actions">
        <button class="icon-btn tiny" data-act="edit" title="Editar"><i class="ri-edit-line"></i></button>
        <button class="icon-btn tiny" data-act="reset" title="Marcar para hoy"><i class="ri-refresh-line"></i></button>
        <button class="icon-btn tiny danger" data-act="del" title="Eliminar"><i class="ri-delete-bin-line"></i></button>
      </div>
    </article>`).join('');
}

function bindManager() {
  const el = $('#repasoCards');
  if (!el) return;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const art = e.target.closest('[data-cid]');
    const c = data.cards.find((x) => x.id === art.dataset.cid);
    if (!c) return;
    const act = btn.dataset.act;
    if (act === 'edit') { editingId = c.id; renderEditor(); $('#rpFront')?.focus(); }
    else if (act === 'reset') { c.due = todayISO(); c.reps = 0; c.interval = 0; saveSoon(); renderManager(); refreshStats(); toast('Marcada para hoy'); }
    else if (act === 'del') {
      if (!confirm('¿Eliminar esta tarjeta?')) return;
      data.cards = data.cards.filter((x) => x.id !== c.id);
      saveSoon(); renderManager(); refreshStats(); buildSession(); toast('Tarjeta eliminada');
    }
  });
}

/* ---------- stats UI ---------- */
function refreshStats() {
  const s = stats();
  animateNum($('#rpDue'), s.due);
  animateNum($('#rpTotal'), s.total);
  animateNum($('#rpLearning'), s.learning);
  animateNum($('#rpLearned'), s.learned);
  if (deckFilter !== 'all' && !decks().includes(deckFilter)) deckFilter = 'all';
  renderDeckMenu();
}

function renderDeckMenu() {
  const menu = $('#repasoDeckMenu');
  const label = $('#repasoDeckLabel');
  if (label) label.textContent = deckFilter === 'all' ? 'Todos los mazos' : deckFilter;
  if (!menu) return;
  const list = ['all', ...decks()];
  menu.innerHTML = list.map((d) => `
    <button class="rd-opt ${d === deckFilter ? 'on' : ''}" data-deck="${esc(d)}" role="option" aria-selected="${d === deckFilter}">
      <span>${d === 'all' ? 'Todos los mazos' : esc(d)}</span>${d === deckFilter ? '<i class="ri-check-line"></i>' : ''}
    </button>`).join('');
}

function toggleDeckMenu(force) {
  const menu = $('#repasoDeckMenu');
  const btn = $('#repasoDeckBtn');
  if (!menu) return;
  const show = force != null ? force : menu.classList.contains('hidden');
  menu.classList.toggle('hidden', !show);
  btn?.setAttribute('aria-expanded', String(show));
}

function onKey(e) {
  if (!mounted || view !== 'estudiar' || !session.current) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(); return; }
  if (!session.revealed) return;
  const map = { '1': 0, '2': 3, '3': 4, '4': 5 };
  if (map[e.key] !== undefined) { e.preventDefault(); grade(map[e.key]); }
}

function ensure() {
  if (mounted) return;
  mounted = true;
  data = load();
  saveSoon();
  mount();
  bindManager();
  document.addEventListener('keydown', onKey);
  window.EconHub = { ...(window.EconHub || {}), repaso: { refresh: () => { if (mounted) { refreshStats(); buildSession(); renderManager(); } } } };
}

export function initRepaso() {
  data = load();
  const maybe = () => {
    if ((location.hash || '').includes('laboratorios/repaso')) {
      ensure();
      setTimeout(() => { refreshStats(); }, 60);
    }
  };
  maybe();
  bus.addEventListener('route:changed', (e) => {
    if ((e.detail || '').includes('laboratorios/repaso')) {
      ensure();
      setTimeout(() => { refreshStats(); }, 60);
    }
  });
}
