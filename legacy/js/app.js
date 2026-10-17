// Ecohub · app.js — shell: router, temas, toasts, storage, animaciones hero/reveal/morph
import { PALETTE, THEMES, HOME_CARDS, LAB_CARDS, KEYS, todayISO } from './data.js';
import { initBrandAnimation } from './brand-anim.js';
import { initHeroGraphAnimation } from './hero-graph-anim.js';

let _animeMod = null;
const anime = () => (_animeMod ||= import('animejs'));

export const bus = new EventTarget();
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Memoria local en caché + cola de sincronización con la base de datos SQLite (api/storage.php)
const _cache = new Map();
const _pendingBatch = new Map();
let _syncTimer = null;
let _hasServerHydrated = false;

function _flushBatch() {
  if (!_pendingBatch.size) return;
  const items = [];
  _pendingBatch.forEach((value, key) => {
    items.push({ key, value, updated_at: Date.now() });
  });
  _pendingBatch.clear();

  fetch('api/storage.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batch: items })
  }).catch((err) => {
    console.warn('[store] Error al sincronizar con SQLite:', err);
  });
}

function _scheduleBatchSave(key, value) {
  _pendingBatch.set(key, value);
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(_flushBatch, 250);
}

export const store = {
  // Inicialización y recuperación desde la base de datos SQLite del servidor
  async init() {
    if (_hasServerHydrated) return;
    try {
      const res = await fetch('api/storage.php');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        // 1. Cargar datos del servidor en caché y localStorage
        Object.entries(json.data).forEach(([k, v]) => {
          _cache.set(k, v);
          try {
            localStorage.setItem(k, JSON.stringify(v));
          } catch { /* cuota */ }
        });

        // 2. Si había datos en localStorage no existentes en SQLite, preservarlos en el servidor
        const missingOnServer = [];
        for (let i = 0; i < localStorage.length; i++) {
          const lk = localStorage.key(i);
          if (lk && !Object.prototype.hasOwnProperty.call(json.data, lk)) {
            try {
              const parsed = JSON.parse(localStorage.getItem(lk));
              _cache.set(lk, parsed);
              missingOnServer.push({ key: lk, value: parsed, updated_at: Date.now() });
            } catch { /* noop */ }
          }
        }
        if (missingOnServer.length) {
          fetch('api/storage.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch: missingOnServer })
          }).catch(() => {});
        }
      }
      _hasServerHydrated = true;
    } catch (e) {
      console.warn('[store] Servidor offline o SQLite no disponible; usando almacenamiento local:', e);
    }
  },

  get(key, def = null) {
    if (_cache.has(key)) return _cache.get(key);
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        _cache.set(key, parsed);
        return parsed;
      }
      return def;
    } catch {
      return def;
    }
  },

  set(key, val) {
    _cache.set(key, val);
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch { /* cuota */ }
    _scheduleBatchSave(key, val);
  },

  del(key) {
    _cache.delete(key);
    _pendingBatch.delete(key);
    try {
      localStorage.removeItem(key);
    } catch { /* noop */ }
    fetch(`api/storage.php?key=${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => {});
  },

  async exportBackup() {
    window.open('api/storage.php?action=export&download=1', '_blank');
  },

  async importBackup(file) {
    const text = await file.text();
    const data = JSON.parse(text);
    const res = await fetch('api/storage.php?action=import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (res.ok) {
      localStorage.clear();
      _cache.clear();
      await this.init();
      location.reload();
    }
  }
};
window.store = store;

window.addEventListener('beforeunload', () => {
  _flushBatch();
});

export function toast(msg, type = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 320);
  }, 3400);
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  store.set(KEYS.theme, theme);
  bus.dispatchEvent(new CustomEvent('theme:changed', { detail: theme }));
}

export function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'oscuro';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  applyTheme(next);
  toast(`Tema: ${next}`);
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function renderHomeCards() {
  const grid = $('#homeCards');
  grid.innerHTML = HOME_CARDS.map((c) => `
    <a class="home-card" href="#/${c.sec}" style="--card-c:${c.color}" data-reveal>
      <div class="hc-icon"><i class="${c.icon}"></i></div>
      <h3>${c.title}</h3>
      <p>${c.desc}</p>
      <span class="hc-go">Abrir <i class="ri-arrow-right-line"></i></span>
    </a>`).join('') + `
    <a class="home-card" href="#/laboratorios" style="--card-c:${PALETTE.violet}" data-reveal>
      <div class="hc-icon"><i class="ri-flask-line"></i></div>
      <h3>Laboratorios</h3>
      <p>Simuladores avanzados, repaso espaciado (SM-2) y experimentos económicos.</p>
      <span class="hc-go">Abrir <i class="ri-arrow-right-line"></i></span>
    </a>`;
}

function renderLabs() {
  const grid = $('#labsGrid');
  grid.innerHTML = LAB_CARDS.map((c) => {
    if (c.route) {
      return `
      <a class="home-card" href="#/laboratorios/${c.route}" style="--card-c:${c.color}" data-reveal>
        <div class="hc-icon"><i class="${c.icon}"></i></div>
        <h3>${c.title}</h3>
        <p>${c.desc}</p>
        <span class="hc-go">Abrir <i class="ri-arrow-right-line"></i></span>
      </a>`;
    }
    return `
    <div class="home-card disabled" style="--card-c:${c.color}" data-reveal>
      <div class="hc-icon"><i class="${c.icon}"></i></div>
      <h3>${c.title}</h3>
      <p>${c.desc}</p>
      <span class="hc-go">Próximamente <i class="ri-time-line"></i></span>
    </div>`;
  }).join('');
}

function renderTodayPanel(agenda) {
  const panel = $('#todayContent');
  const today = todayISO();
  const events = (agenda?.events || []).filter((e) => e.date === today || (e.recurring === 'daily'));
  const tasks = (agenda?.tasks || []).filter((t) => t.date === today);
  const byTime = [...events.map((e) => ({ ...e, kind: 'event' })), ...tasks.map((t) => ({ ...t, kind: 'task' }))]
    .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));

  if (!byTime.length) {
    panel.innerHTML = `<p class="today-empty">Nada agendado hoy. ¿Le cuentas a tu agente qué tienes que hacer? <a href="#/agenda">Vamos →</a></p>`;
    return;
  }
  panel.innerHTML = byTime.map((it) => {
    const done = !!it.done;
    const time = it.kind === 'event' && !it.allDay ? (it.start || '') : it.estMin ? `~${it.estMin}m` : 'todo el día';
    const color = it.category ? (window.EconHub?.catColor ? EconHub.catColor(it.category) : '#6c9a06') : '#6c9a06';
    return `<div class="today-item ${done ? 'done' : ''}">
      <span class="ti-time">${time}</span>
      <span class="dot" style="background:${color}"></span>
      <span class="t-title">${it.title || it.kind === 'task' ? it.title : ''}</span>
    </div>`;
  }).join('');
}

/* ---------- Stats con count-up (089) ---------- */
const counts = {};
function countUp(sel, val) {
  const el = document.querySelector(sel);
  if (!el || counts[sel] === val) return;
  counts[sel] = val;
  if (reduced()) { el.textContent = val; return; }
  const obj = { v: +el.textContent || 0 };
  gsap.to(obj, {
    v: val, duration: 0.85, ease: 'power2.out',
    onUpdate: () => { el.textContent = Math.round(obj.v); },
  });
}
async function renderStats(agenda) {
  const tasks = agenda?.tasks || [];
  countUp('#stDays', new Set(tasks.map((t) => t.date)).size);
  countUp('#stTasks', tasks.length);
  countUp('#stDone', tasks.filter((t) => t.done).length);
  try {
    const { pdfStorage } = await import('./pdf-storage.js');
    const list = await pdfStorage.list();
    countUp('#stPdf', list.length);
  } catch {
    countUp('#stPdf', store.get(KEYS.docs, []).length);
  }
}

/* ---------- Ripple click (041) ---------- */
function initRipple() {
  if (reduced()) return;
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.btn, .ckey, .seg-btn, .sub-nav .chip');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 0.95;
    const ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = ink.style.height = d + 'px';
    ink.style.left = (e.clientX - r.left - d / 2) + 'px';
    ink.style.top = (e.clientY - r.top - d / 2) + 'px';
    el.appendChild(ink);
    setTimeout(() => ink.remove(), 680);
  });
}

const TOOL_PAGES = { calc: 'calc', calculadora: 'calc', graficadora: 'plot', conceptos: 'concepts', modelos: 'solow', juegos: 'gametree', promedios: 'grades' };
const LAB_PAGES = { repaso: 'repaso' };

function router() {
  const hash = location.hash.replace(/^#\//, '') || 'inicio';
  const raw = hash.split('?')[0];
  const [sec, sub] = raw.split('/');
  $$('.page').forEach((p) => p.classList.remove('active'));
  const target = $('#sec-' + sec);
  if (target) target.classList.add('active');
  else $('#sec-inicio').classList.add('active');
  $$('.nav-links a').forEach((a) => a.classList.toggle('active', a.dataset.sec === sec));
  if (sec === 'herramientas') {
    const pageId = TOOL_PAGES[sub] || null;
    const landing = $('#toolsLanding');
    if (landing) landing.classList.toggle('hidden', !!pageId);
    $$('.tool-page').forEach((p) => p.classList.toggle('hidden', p.id !== 'toolPage-' + pageId));
    if (pageId) {
      animateToolPage(pageId);
      if (pageId === 'plot') setTimeout(() => window.EconHub.plot?.redraw?.(), 90);
      if (pageId === 'concepts' || pageId === 'solow') setTimeout(() => window.EconHub.econ?.redraw?.(), 90);
    }
  }
  if (sec === 'laboratorios') {
    const pageId = LAB_PAGES[sub] || null;
    const landing = $('#labsLanding');
    if (landing) landing.classList.toggle('hidden', !!pageId);
    $$('.lab-page').forEach((p) => p.classList.toggle('hidden', p.id !== 'labPage-' + pageId));
    if (pageId && !reduced()) {
      const el = $('#labPage-' + pageId);
      if (el) gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out', clearProps: 'opacity,transform' });
    }
  }
  window.scrollTo({ top: 0 });
  if (window.ScrollTrigger) ScrollTrigger.refresh();
  const secName = sec[0].toUpperCase() + sec.slice(1);
  const title = sub ? `${sub[0].toUpperCase() + sub.slice(1)} · ${secName}` : secName;
  document.title = `Ecohub — ${title}`;
  if (!reduced()) revealSection(target);
  bus.dispatchEvent(new CustomEvent('route:changed', { detail: raw }));
}

let revealDone = new WeakSet();
function revealSection(secEl) {
  if (!secEl || revealDone.has(secEl)) return;
  revealDone.add(secEl);
  const items = $$('[data-reveal]', secEl);
  if (!items.length) return;
  if (reduced()) return;
  gsap.fromTo(items,
    { opacity: 0, y: 26, scale: 0.985 },
    { opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' });
}

/* ---------- Preloader (085 counter) ---------- */
function initPreloader() {
  const pl = $('#preloader');
  if (!pl) return Promise.resolve();
  if (reduced() || sessionStorage.getItem('econhub:pl')) {
    pl.remove();
    return Promise.resolve();
  }
  sessionStorage.setItem('econhub:pl', '1');
  return new Promise((res) => {
    const counter = { val: 0 };
    const disp = $('#plCount');
    const bar = $('#plBar');
    gsap.to(counter, {
      val: 100, duration: 0.8, ease: 'power2.inOut',
      onUpdate: () => {
        disp.textContent = Math.round(counter.val) + '%';
        bar.style.width = counter.val + '%';
      },
      onComplete: () => {
        pl.classList.add('gone');
        setTimeout(() => { pl.remove(); res(); }, 380);
      },
    });
  });
}

/* ---------- Magnetic buttons (038) ---------- */
function initMagnetic() {
  if (reduced() || !window.matchMedia('(pointer:fine)').matches) return;
  $$('.hero-cta .btn').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist < 110) {
        const pull = (110 - dist) / 110;
        gsap.to(btn, { x: dx * pull * 0.35, y: dy * pull * 0.35, duration: 0.4, ease: 'power2.out' });
      }
    });
    btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.55, ease: 'elastic.out(1, 0.4)' }));
  });
}

/* ---------- Tilt cards (021) ---------- */
function initTilt() {
  if (reduced() || !window.matchMedia('(pointer:fine)').matches) return;
  const cards = $$('.home-card:not(.disabled)');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--mx', (x * 100 + 50) + '%');
      card.style.setProperty('--my', (y * 100 + 50) + '%');
      gsap.to(card, { rotateY: x * 6, rotateX: -y * 6, duration: 0.4, transformPerspective: 700, ease: 'power2.out' });
    });
    card.addEventListener('mouseleave', () => gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.7, ease: 'elastic.out(1, 0.5)' }));
  });
}

/* ---------- 095 Cursor spotlight ---------- */
function initSpotlight() {
  const spot = $('#spotlight');
  if (!spot || reduced() || !window.matchMedia('(pointer:fine)').matches) {
    spot?.remove();
    return;
  }
  const qx = gsap.quickTo(spot, 'left', { duration: 0.4, ease: 'power3' });
  const qy = gsap.quickTo(spot, 'top', { duration: 0.4, ease: 'power3' });
  let shown = false;
  document.addEventListener('mousemove', (e) => {
    if (!shown) { spot.style.opacity = '1'; shown = true; }
    qx(e.clientX);
    qy(e.clientY);
  }, { passive: true });
  document.addEventListener('mouseleave', () => { spot.style.opacity = '0'; shown = false; });
}

/* ---------- 094 Particle float field ---------- */
const PARTICLE_COLORS = ['#6c9a06', '#069a7e', '#ffc107', '#127599', '#5f4786'];
function initParticles() {
  const wrap = $('#particles');
  if (!wrap || reduced()) { wrap?.remove(); return; }
  const N = window.innerWidth < 768 ? 8 : 14;
  const tweens = [];
  for (let i = 0; i < N; i++) {
    const p = document.createElement('span');
    p.className = 'pfx';
    const size = gsap.utils.random(4, 9);
    p.style.width = p.style.height = size + 'px';
    p.style.background = gsap.utils.random(PARTICLE_COLORS);
    p.style.left = gsap.utils.random(0, 100) + '%';
    p.style.top = gsap.utils.random(0, 100) + '%';
    const o = gsap.utils.random(0.12, 0.4);
    p.style.opacity = o;
    wrap.appendChild(p);
    tweens.push(gsap.fromTo(p,
      { y: 0, opacity: o },
      {
        y: gsap.utils.random(-160, -70),
        x: gsap.utils.random(-36, 36),
        opacity: 0,
        duration: gsap.utils.random(4.5, 9),
        delay: gsap.utils.random(0, 6),
        repeat: -1,
        ease: 'sine.inOut',
      }));
  }
  // Pausar SOLO las partículas (nunca la timeline global: congelaría el hero)
  document.addEventListener('visibilitychange', () => {
    tweens.forEach((t) => (document.hidden ? t.pause() : t.resume()));
  });
}

/* ---------- 018 scroll velocity skew + parallax en capas (014/019) ---------- */
function initScrollFx() {
  if (reduced() || !window.ScrollTrigger) return;
  ScrollTrigger.create({
    onUpdate: (self) => {
      const v = gsap.utils.clamp(-4, 4, self.getVelocity() / 260);
      gsap.to('#heroTitle, #heroSub', {
        skewX: v, duration: 0.45, ease: 'power2.out', overwrite: 'auto',
      });
    },
  });
  const cfg = (y, scrub = 0.7) => ({
    y, ease: 'none',
    scrollTrigger: { trigger: '#sec-inicio', start: 'top top', end: 'bottom top', scrub },
  });
  gsap.to('#heroChart', cfg(-70));
  gsap.to('.hero-cta', cfg(-38, 0.6));
  gsap.to('#heroEyebrow', cfg(-26, 0.5));
}

/* ---------- 044 Elastic stretch en botones primarios ---------- */
function initElastic() {
  if (reduced()) return;
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.btn-primary');
    if (b) gsap.to(b, { scaleX: 1.05, scaleY: 0.93, duration: 0.28, ease: 'power2.out', overwrite: 'auto' });
  });
  document.addEventListener('mouseout', (e) => {
    const b = e.target.closest('.btn-primary');
    if (b) gsap.to(b, { scaleX: 1, scaleY: 1, duration: 0.7, ease: 'elastic.out(1, 0.4)', overwrite: 'auto' });
  });
}

/* ---------- 087 content-in: entrada de páginas de herramientas ---------- */
const toolAnimated = new WeakSet();
function animateToolPage(pageId) {
  const body = $('#toolPage-' + pageId);
  if (!body || toolAnimated.has(body) || reduced()) return;
  toolAnimated.add(body);
  gsap.fromTo(body.children,
    { opacity: 0, y: 24 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', delay: 0.05, clearProps: 'opacity,transform' });
}
/* ---------- Títulos en cascada al navegar (splitText chars + stagger) ---------- */
const scrambleDone = new WeakSet();
function initScramble() {
  bus.addEventListener('route:changed', () => {
    setTimeout(() => {
      if (reduced()) return;
      $$('.page.active [data-scramble]').forEach((el) => {
        if (scrambleDone.has(el)) return;
        scrambleDone.add(el);
        anime().then(({ splitText, animate, stagger }) => {
          try {
            const finalText = el.textContent.trim();
            el.textContent = finalText;
            const { chars } = splitText(el, { chars: true, words: false });
            animate(chars, {
              opacity: [0.1, 1],
              y: [14, 0],
              skewX: [8, 0],
              duration: 420,
              delay: stagger(26),
              ease: 'outExpo',
            });
          } catch { /* el texto queda visible */ }
        });
      });
    }, 160);
  });
}

/* ---------- Gráfica hero viva: cálculo, derivadas, integrales y equilibrio ---------- */
function initHeroDot() {
  initHeroGraphAnimation();
}

/* ---------- spring: modales entran con física ---------- */
function initModalSpring() {
  if (reduced()) return;
  const obs = new MutationObserver((muts) => {
    muts.forEach((m) => {
      if (m.type !== 'attributes' || m.attributeName !== 'class') return;
      const modal = m.target;
      if (modal.classList.contains('hidden')) return;
      const card = modal.querySelector('.modal-card');
      if (card) {
        anime().then(({ animate }) => {
          animate(card, {
            scale: [0.92, 1], y: [18, 0], opacity: [0, 1],
            duration: 520, delay: 40, ease: 'spring({ stiffness: 180, damping: 16 })',
          });
        });
      }
    });
  });
  $$('.modal').forEach((m) => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
}

/* ---------- Logo del editor PDF (stroke reveal) ---------- */
function initPdfLogo() {
  const path = document.querySelector('.pdf-brand path:not([id])');
  if (!path || reduced()) return;
  const len = path.getTotalLength();
  gsap.fromTo(path,
    { strokeDasharray: len, strokeDashoffset: len, opacity: 0 },
    { strokeDashoffset: 0, opacity: 1, duration: 1.1, delay: 0.25, ease: 'power2.inOut' });
}

/* ---------- Hero: título con clase real (hw/hw-inner) + reveal GSAP + draw animejs ---------- */
function wrapHeroWords(title) {
  const wrapText = (node) => {
    const words = node.textContent.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    words.forEach((w) => {
      if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
      const hw = document.createElement('span');
      hw.className = 'hw';
      const inner = document.createElement('span');
      inner.className = 'hw-inner';
      inner.textContent = w;
      hw.appendChild(inner);
      frag.appendChild(hw);
    });
    node.replaceWith(frag);
  };
  const walk = (el) => {
    [...el.childNodes].forEach((node) => {
      if (node.nodeType === 3 && node.textContent.trim()) wrapText(node);
      else if (node.nodeType === 1) {
        if (node.classList.contains('accent')) {
          [...node.childNodes].forEach((n) => {
            if (n.nodeType === 3 && n.textContent.trim()) wrapText(n);
          });
        } else walk(node);
      }
    });
  };
  walk(title);
  const accent = title.querySelector('.accent');
  if (accent) {
    accent.querySelectorAll('.hw-inner').forEach((s) => {
      s.style.background = 'linear-gradient(90deg, var(--pal-success), var(--pal-teal))';
      s.style.webkitBackgroundClip = 'text';
      s.style.backgroundClip = 'text';
      s.style.color = 'transparent';
    });
  }
}

let heroPlayed = false;
function initHero() {
  if (heroPlayed) return;
  heroPlayed = true;
  const title = $('#heroTitle');
  if (!title) return;
  // Estructura con clase SIEMPRE (visible sin animación, con estilo aplicado)
  wrapHeroWords(title);

  // animejs: la gráfica se dibuja + el punto viajero (ya existe)
  anime().then(({ svg, animate }) => {
    try {
      const line = $('#heroLine');
      const draw = svg.createDrawable(line);
      animate(draw, { draw: '0% 100%', duration: 1300, delay: 850, ease: 'out(3)' });
    } catch { /* noop */ }
  });

  if (reduced()) return;
  // GSAP (gsapify): reveal 3D por palabra con stagger
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.fromTo('#heroEyebrow',
    { opacity: 0, y: 14, letterSpacing: '0.45em' },
    { opacity: 1, y: 0, letterSpacing: '0.14em', duration: 0.7 }, 0)
    .fromTo('.hero-title .hw-inner',
      { yPercent: 118, opacity: 0, rotateX: -35, transformPerspective: 600 },
      { yPercent: 0, opacity: 1, rotateX: 0, duration: 0.8, stagger: 0.06, ease: 'power4.out', clearProps: 'transform' }, 0.05)
    .fromTo('#heroSub', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.45')
    .fromTo('.hero-cta a', { opacity: 0, y: 12, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.08, ease: 'back.out(1.6)' }, '-=0.3')
    .fromTo('#heroChart', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, '-=0.4');
  // Red de seguridad: nunca oculto
  setTimeout(() => {
    title.querySelectorAll('.hw-inner').forEach((s) => {
      s.style.transform = '';
      s.style.opacity = '';
    });
  }, 1500);
}

function initBlobs() {
  if (reduced()) return;
  anime().then(({ animate }) => {
    const defs = [
      { el: '.blob-a', r: ['38% 62% 55% 45% / 55% 40% 60% 45%', '55% 45% 40% 60% / 42% 60% 40% 58%'], x: [0, 34], y: [0, -26], d: 9200 },
      { el: '.blob-b', r: ['50% 50% 45% 55% / 60% 45% 55% 40%', '42% 58% 55% 45% / 45% 58% 42% 55%'], x: [0, -30], y: [0, 22], d: 8400 },
      { el: '.blob-c', r: ['60% 40% 48% 52% / 48% 60% 40% 52%', '45% 55% 60% 40% / 55% 42% 58% 45%'], x: [0, 26], y: [0, 30], d: 9800 },
      { el: '.blob-d', r: ['50% 50% 58% 42% / 45% 55% 45% 55%', '58% 42% 50% 50% / 55% 45% 55% 45%'], x: [0, -24], y: [0, -18], d: 7600 },
    ];
    defs.forEach(({ el, r, x, y, d }) => {
      animate(el, { borderRadius: r, translateX: x, translateY: y, duration: d, direction: 'alternate', loop: true, ease: 'inOut(2)' });
    });
  });
}

function initInteractions() {
  gsap.registerPlugin(ScrollTrigger, Flip);
  // micro-interacciones GSAP (gsapify 005 hover, click rebound)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .icon-btn, .chip, .tab, .seg-btn');
    if (!btn || btn.disabled) return;
    if (reduced()) return;
    gsap.fromTo(btn, { scale: 0.95 }, { scale: 1, duration: 0.35, ease: 'elastic.out(1, 0.45)' });
  }, true);

  // navbar scrolled
  const nav = $('#navbar');
  const onScrollNav = () => nav.classList.toggle('scrolled', window.scrollY > 48);
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  // tema
  $('#themeBtn').addEventListener('click', cycleTheme);

  // menú móvil con backdrop y autocierre en cambio de ruta
  const menuBtn = $('#menuBtn');
  const navLinks = $('#navLinks');
  const navBackdrop = $('#navBackdrop');

  const closeMobileNav = () => {
    navLinks?.classList.remove('open');
    navBackdrop?.classList.add('hidden');
    menuBtn?.setAttribute('aria-expanded', 'false');
  };

  const toggleMobileNav = () => {
    const willOpen = !navLinks?.classList.contains('open');
    navLinks?.classList.toggle('open', willOpen);
    navBackdrop?.classList.toggle('hidden', !willOpen);
    menuBtn?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  };

  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMobileNav();
  });
  navBackdrop?.addEventListener('click', closeMobileNav);
  navLinks?.addEventListener('click', (e) => {
    if (e.target.closest('a')) closeMobileNav();
  });
  window.addEventListener('hashchange', closeMobileNav);
  window.addEventListener('route:changed', closeMobileNav);
}

export async function initApp() {
  window.__navLog = [];
  window.addEventListener('hashchange', () => window.__navLog.push({ t: Date.now(), hash: location.hash }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) window.__navLog.push({ t: Date.now(), click: a.getAttribute('href') });
  }, true);

  // Hidratar datos desde la base de datos persistente SQLite (anti-borrado de cookies)
  await store.init();

  const saved = store.get(KEYS.theme, 'oscuro');
  applyTheme(saved);
  document.documentElement.setAttribute('data-theme', saved);
  $('#todayDate').textContent = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  renderHomeCards();
  renderLabs();
  initInteractions();
  initBrandAnimation();
  initBlobs();
  initMagnetic();
  initTilt();
  initRipple();
  initSpotlight();
  initParticles();
  initElastic();
  initScramble();
  initHeroDot();
  initModalSpring();

  window.addEventListener('hashchange', router);
  router();
  initScrollFx();

  // El panel "Hoy" escucha desde ya: initAgenda emite 'agenda:changed'
  // (al cargar del servidor) mientras el preloader sigue en curso, y antes
  // ese evento se perdía dejando el panel con los skeletons.
  bus.addEventListener('agenda:changed', (e) => { renderTodayPanel(e.detail); renderStats(e.detail); });
  renderTodayPanel(store.get(KEYS.agenda));
  renderStats(store.get(KEYS.agenda));

  // El hero se anima en paralelo con el preloader: al levantarse la cortina,
  // las palabras ya están entrando (menos espera percibida).
  const plP = initPreloader();
  initHero();
  await plP;
  bus.addEventListener('route:changed', (e) => {
    if (e.detail === 'pdf') initPdfLogo();
  });
}
