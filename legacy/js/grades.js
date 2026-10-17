// econhub · grades.js — calculadora de promedios ponderados y "cuánto te falta"
// Materias con créditos, evaluaciones con porcentaje y nota. Calcula el promedio
// (por créditos y por %), el máximo alcanzable y la nota necesaria en lo pendiente
// para aprobar o llegar a tu meta.
import { $, $$, store, toast, bus } from './app.js';
import { PALETTE, KEYS, uid } from './data.js';

const COLORS = [PALETTE.teal, PALETTE.info, PALETTE.violet, PALETTE.success, PALETTE.highlight, '#e53935', '#fb8c00'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

const defaultItems = () => ([
  { id: uid(), name: 'Parcial 1', weight: 30, grade: null },
  { id: uid(), name: 'Parcial 2', weight: 30, grade: null },
  { id: uid(), name: 'Examen final', weight: 40, grade: null },
]);

let data = { max: 5, pass: 3, target: 4, materias: [] };
let mounted = false;
let saveTimer = null;

function freshMateria(n) {
  return { id: uid(), name: `Materia ${n}`, credits: 3, color: COLORS[(n - 1) % COLORS.length], items: defaultItems() };
}

function normalize(raw) {
  const out = { max: clamp(+raw.max || 5, 1, 10), pass: 0, target: 0, materias: [] };
  out.pass = clamp(raw.pass != null ? +raw.pass : 3, 0, out.max);
  out.target = clamp(raw.target != null ? +raw.target : 4, 0, out.max);
  out.materias = (raw.materias || []).map((m, i) => ({
    id: m.id || uid(),
    name: m.name || `Materia ${i + 1}`,
    credits: clamp(+m.credits || 0, 0, 60),
    color: m.color || COLORS[i % COLORS.length],
    items: (m.items || []).map((it) => ({
      id: it.id || uid(),
      name: it.name || 'Evaluación',
      weight: clamp(+it.weight || 0, 0, 100),
      grade: (it.grade == null || it.grade === '' || isNaN(+it.grade)) ? null : clamp(+it.grade, 0, out.max),
    })),
  }));
  if (!out.materias.length) out.materias = [freshMateria(1)];
  return out;
}

function load() {
  const saved = store.get(KEYS.grades, null);
  if (saved && Array.isArray(saved.materias)) return normalize(saved);
  return { max: 5, pass: 3, target: 4, materias: [freshMateria(1)] };
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set(KEYS.grades, data), 350);
}

/* ---------- cálculo ---------- */
function statsOf(m) {
  const max = data.max;
  let gradedW = 0, pendingW = 0, pts = 0;
  for (const it of m.items) {
    const w = clamp(+it.weight || 0, 0, 100);
    if (it.grade == null || it.grade === '' || isNaN(+it.grade)) pendingW += w;
    else { gradedW += w; pts += clamp(+it.grade, 0, max) * w; }
  }
  const sumW = gradedW + pendingW;
  const current = gradedW > 0 ? pts / gradedW : null;
  const final = sumW > 0 ? pts / sumW : null;
  const maxFinal = sumW > 0 ? (pts + max * pendingW) / sumW : null;
  const need = (goal) => (pendingW > 0 && sumW > 0) ? (goal * sumW - pts) / pendingW : null;
  return {
    gradedW, pendingW, sumW, pts, current, final, maxFinal,
    neededTarget: need(data.target), neededPass: need(data.pass),
    value: pendingW > 0 ? current : final,
  };
}

function computeGlobal() {
  let cw = 0, acc = 0, maxAcc = 0, credits = 0, gradedW = 0, totalW = 0;
  for (const m of data.materias) {
    const cr = Math.max(0, +m.credits || 0);
    const s = statsOf(m);
    credits += cr;
    gradedW += s.gradedW;
    totalW += s.sumW;
    if (s.value != null && cr > 0) { acc += s.value * cr; cw += cr; }
    if (s.maxFinal != null && cr > 0) maxAcc += s.maxFinal * cr;
  }
  return {
    avg: cw > 0 ? acc / cw : null,
    maxAvg: cw > 0 ? maxAcc / cw : null,
    credits,
    count: data.materias.length,
    progress: totalW > 0 ? gradedW / totalW : 0,
  };
}

/* ---------- animaciones ---------- */
function animateNum(el, to, decimals = 2, suffix = '') {
  if (!el) return;
  if (el._tw) { try { el._tw.kill(); } catch { /* noop */ } }
  const from = parseFloat(el.dataset.v || '0') || 0;
  if (reduced() || !window.gsap || to == null || !isFinite(to)) {
    el.textContent = (to == null || !isFinite(to)) ? '—' : fmt(to, decimals) + suffix;
    el.dataset.v = isFinite(to) ? to : 0;
    return;
  }
  const obj = { v: from };
  el._tw = gsap.to(obj, {
    v: to, duration: 0.6, ease: 'power2.out',
    onUpdate: () => { el.textContent = fmt(obj.v, decimals) + suffix; el.dataset.v = obj.v; },
  });
}

function pop(el) {
  if (!el || reduced() || !window.gsap) return;
  gsap.fromTo(el, { scale: 1.25 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' });
}

function animateOut(el, cb) {
  if (!el || reduced() || !window.gsap) { cb(); return; }
  gsap.to(el, {
    opacity: 0, x: 36, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0,
    duration: 0.3, ease: 'power2.in', onComplete: cb,
  });
}

/* ---------- HTML ---------- */
function itemHTML(it) {
  return `<div class="grade-item" data-iid="${it.id}">
    <input class="gi-name" type="text" data-field="name" value="${esc(it.name)}" placeholder="Evaluación (ej: Parcial 1)">
    <label class="gi-w" title="Porcentaje de la nota"><input type="number" data-field="weight" min="0" max="100" step="1" value="${it.weight}"><span>%</span></label>
    <label class="gi-g" title="Nota obtenida (vacío = pendiente)"><input type="number" data-field="grade" min="0" max="${data.max}" step="0.1" value="${it.grade != null ? it.grade : ''}" placeholder="—"></label>
    <button class="icon-btn tiny danger" data-act="del-item" title="Quitar evaluación"><i class="ri-close-line"></i></button>
  </div>`;
}

function subjectHTML(m) {
  return `<article class="subject-card" data-mid="${m.id}">
    <div class="subj-head">
      <span class="subj-ico" style="background:${m.color}"><i class="ri-book-2-line"></i></span>
      <input class="subj-name" type="text" data-field="name" value="${esc(m.name)}" placeholder="Nombre de la materia">
      <label class="subj-credits" title="Créditos de la materia"><i class="ri-award-line"></i><input type="number" data-field="credits" min="0" max="60" step="1" value="${m.credits}"></label>
      <span class="subj-avg" data-avg>—</span>
      <button class="icon-btn tiny" data-act="add-item" title="Agregar evaluación"><i class="ri-add-line"></i></button>
      <button class="icon-btn tiny danger" data-act="del-subject" title="Eliminar materia"><i class="ri-delete-bin-line"></i></button>
    </div>
    <div class="subj-progress"><i data-bar style="background:${m.color}"></i></div>
    <div class="subj-items" data-items">${m.items.map(itemHTML).join('') || '<div class="gi-empty">Sin evaluaciones. Agrega una con su porcentaje.</div>'}</div>
    <div class="subj-needs" data-needs></div>
  </article>`;
}

function needPill(needed, label) {
  if (needed == null) return '';
  const max = data.max, pass = data.pass;
  if (needed <= 0.0001) return `<span class="need-pill need-ok">Ya cumples ${label}</span>`;
  if (needed > max + 0.0001) return `<span class="need-pill need-bad">Imposible · necesitarías ${fmt(needed)} para ${label}</span>`;
  const cls = needed <= pass ? 'need-ok' : 'need-warn';
  return `<span class="need-pill ${cls}">Necesitas ${fmt(needed)} para ${label}</span>`;
}

function needsHTML(m, s) {
  if (!m.items.length) return '<span class="needs-hint">Añade evaluaciones con su % para calcular el promedio.</span>';
  if (s.sumW <= 0) return '<span class="needs-hint">Asigna porcentajes a tus evaluaciones.</span>';
  if (s.pendingW <= 0.0001) {
    const ok = (s.final ?? 0) >= data.pass;
    return `<span class="needs-hint">Nota final:</span> <b>${fmt(s.final)}</b> <span class="need-pill ${ok ? 'need-ok' : 'need-bad'}">${ok ? 'Aprobada ✓' : 'Reprobada'}</span>`;
  }
  const lead = s.gradedW > 0
    ? `Llevas <b>${fmt(s.gradedW, 0)}%</b> con <b>${fmt(s.current)}</b>.`
    : 'Aún no has calificado nada.';
  const prefix = s.gradedW > 0 ? 'Te falta' : 'Tienes';
  return `${lead} ${prefix} <b>${fmt(s.pendingW, 0)}%</b> → ${needPill(s.neededTarget, `la meta (${fmt(data.target, 1)})`)} ${needPill(s.neededPass, `aprobar (${fmt(data.pass, 1)})`)}
    <span class="needs-hint">máx posible ${fmt(s.maxFinal)} · mín ${fmt(s.final)}</span>`;
}

/* ---------- render ---------- */
function renderList(animateId, focusSel) {
  const list = $('#gradesList');
  if (!list) return;
  list.innerHTML = data.materias.length
    ? data.materias.map(subjectHTML).join('')
    : `<div class="grades-empty"><i class="ri-medal-line"></i><p>Sin materias todavía. Agrega la primera con el botón de arriba.</p></div>`;
  if (animateId && !reduced() && window.gsap) {
    const card = list.querySelector(`.subject-card[data-mid="${animateId}"]`);
    if (card) gsap.fromTo(card, { opacity: 0, y: 22, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)' });
  }
  if (focusSel) {
    const el = list.querySelector(focusSel);
    if (el) { el.focus(); if (el.select) el.select(); }
  }
}

function refreshComputed() {
  const g = computeGlobal();
  animateNum($('#gAvg'), g.avg, 2);
  animateNum($('#gCred'), g.credits, 0);
  animateNum($('#gProg'), g.progress * 100, 0, '%');
  const meta = $('#gTarget');
  if (meta) meta.textContent = fmt(data.target, 1);
  const bar = $('#gGoal');
  if (bar) bar.style.width = clamp(((g.avg || 0) / (data.target || 1)) * 100, 0, 100) + '%';
  const hint = $('#gTargetHint');
  if (hint) {
    if (g.avg == null) hint.textContent = 'agrega materias con créditos';
    else if (g.avg >= data.target) hint.textContent = `meta alcanzada ✓ · máx ${fmt(g.maxAvg)}`;
    else hint.textContent = `faltan ${fmt(data.target - g.avg)} · máx ${fmt(g.maxAvg)}`;
  }

  for (const m of data.materias) {
    const card = document.querySelector(`.subject-card[data-mid="${m.id}"]`);
    if (!card) continue;
    const s = statsOf(m);
    const avgEl = card.querySelector('[data-avg]');
    if (avgEl) {
      avgEl.textContent = fmt(s.value);
      avgEl.style.color = s.value == null ? 'var(--muted)' : (s.value >= data.pass ? 'var(--pal-teal)' : '#ef5350');
    }
    const barEl = card.querySelector('[data-bar]');
    if (barEl) barEl.style.width = clamp(((s.value || 0) / data.max) * 100, 0, 100) + '%';
    const needs = card.querySelector('[data-needs]');
    if (needs) needs.innerHTML = needsHTML(m, s);
  }
}

/* ---------- montaje ---------- */
function syncSettings() {
  const t = $('#gradeTarget'), p = $('#gradePass'), mx = $('#gradeMax');
  if (t) t.value = data.target;
  if (p) p.value = data.pass;
  if (mx) mx.value = data.max;
}

function bindToolbar() {
  const on = (sel, key) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener('input', () => {
      let v = parseFloat(el.value);
      if (isNaN(v)) return;
      if (key === 'max') {
        data.max = clamp(v, 1, 10);
        data.pass = clamp(data.pass, 0, data.max);
        data.target = clamp(data.target, 0, data.max);
        $$('#gradesList input[data-field="grade"]').forEach((i) => { i.max = data.max; });
        syncSettings();
      } else if (key === 'pass') {
        data.pass = clamp(v, 0, data.max);
      } else {
        data.target = clamp(v, 0, data.max);
      }
      saveSoon();
      refreshComputed();
    });
    el.addEventListener('change', syncSettings);
  };
  on('#gradeTarget', 'target');
  on('#gradePass', 'pass');
  on('#gradeMax', 'max');

  $('#gradeAddSubject')?.addEventListener('click', (e) => {
    const m = freshMateria(data.materias.length + 1);
    data.materias.push(m);
    saveSoon();
    renderList(m.id, `.subject-card[data-mid="${m.id}"] .subj-name`);
    refreshComputed();
    pop(e.currentTarget);
    toast('Materia agregada');
  });

  $('#gradeReset')?.addEventListener('click', () => {
    if (!confirm('¿Borrar todas las materias y empezar de cero?')) return;
    data.materias = [freshMateria(1)];
    saveSoon();
    renderList(data.materias[0].id);
    refreshComputed();
    toast('Calculadora reiniciada');
  });
}

function bindList() {
  const list = $('#gradesList');
  if (!list) return;

  list.addEventListener('input', (e) => {
    const card = e.target.closest('.subject-card');
    if (!card) return;
    const m = data.materias.find((x) => x.id === card.dataset.mid);
    if (!m) return;
    const field = e.target.dataset.field;
    if (!field) return;
    const row = e.target.closest('.grade-item');
    if (row) {
      const it = m.items.find((x) => x.id === row.dataset.iid);
      if (!it) return;
      if (field === 'name') it.name = e.target.value;
      else if (field === 'weight') it.weight = clamp(parseFloat(e.target.value) || 0, 0, 100);
      else if (field === 'grade') {
        const v = e.target.value.trim();
        it.grade = v === '' ? null : (isNaN(+v) ? null : +v);
      }
    } else if (field === 'name') {
      m.name = e.target.value;
    } else if (field === 'credits') {
      m.credits = clamp(parseFloat(e.target.value) || 0, 0, 60);
    }
    saveSoon();
    refreshComputed();
  });

  list.addEventListener('change', (e) => {
    const f = e.target.dataset.field;
    if (f === 'weight') e.target.value = clamp(parseFloat(e.target.value) || 0, 0, 100);
    else if (f === 'grade') {
      const v = e.target.value.trim();
      if (v !== '') e.target.value = clamp(parseFloat(v) || 0, 0, data.max);
    } else if (f === 'credits') e.target.value = clamp(parseFloat(e.target.value) || 0, 0, 60);
  });

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const card = e.target.closest('.subject-card');
    if (!card) return;
    const m = data.materias.find((x) => x.id === card.dataset.mid);
    if (!m) return;
    const act = btn.dataset.act;

    if (act === 'add-item') {
      const used = m.items.reduce((s, it) => s + (+it.weight || 0), 0);
      const w = clamp(100 - used, 0, 100) || 10;
      const it = { id: uid(), name: `Evaluación ${m.items.length + 1}`, weight: Math.round(w), grade: null };
      m.items.push(it);
      saveSoon();
      renderList(null, `.subject-card[data-mid="${m.id}"] .grade-item[data-iid="${it.id}"] .gi-name`);
      refreshComputed();
      pop(btn);
    } else if (act === 'del-item') {
      const row = e.target.closest('.grade-item');
      const i = m.items.findIndex((x) => x.id === row.dataset.iid);
      if (i < 0) return;
      animateOut(row, () => {
        m.items.splice(i, 1);
        saveSoon();
        renderList(null, `.subject-card[data-mid="${m.id}"] .subj-name`);
        refreshComputed();
      });
    } else if (act === 'del-subject') {
      if (!confirm(`¿Eliminar "${m.name}"?`)) return;
      const i = data.materias.findIndex((x) => x.id === m.id);
      animateOut(card, () => {
        data.materias.splice(i, 1);
        saveSoon();
        renderList();
        refreshComputed();
        toast('Materia eliminada');
      });
    }
  });
}

function mount() {
  const box = $('#gradesBody');
  if (!box) return;
  box.innerHTML = `
    <div class="grades-app">
      <div class="grades-summary">
        <div class="stat-card" style="--sc:${PALETTE.teal}">
          <span>Promedio general</span><b id="gAvg">—</b><small>ponderado por créditos</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.info}">
          <span>Créditos</span><b id="gCred">0</b><small>inscritos en total</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.violet}">
          <span>Avance</span><b id="gProg">0%</b><small>del semestre calificado</small>
        </div>
        <div class="stat-card" style="--sc:${PALETTE.highlight}">
          <span>Meta de promedio</span><b id="gTarget">4,0</b>
          <div class="grades-goal-bar"><i id="gGoal"></i></div>
          <small id="gTargetHint">—</small>
        </div>
      </div>

      <div class="grades-toolbar glass">
        <button class="btn btn-primary btn-sm" id="gradeAddSubject"><i class="ri-add-line"></i> Agregar materia</button>
        <div class="grades-settings">
          <label>Meta <input type="number" id="gradeTarget" min="0" step="0.1"></label>
          <label>Aprobación <input type="number" id="gradePass" min="0" step="0.1"></label>
          <label>Nota máx <input type="number" id="gradeMax" min="1" max="10" step="0.5"></label>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-ghost btn-sm" id="gradeReset" title="Borrar todo"><i class="ri-delete-bin-2-line"></i> Reiniciar</button>
      </div>

      <div class="grades-list" id="gradesList"></div>
      <p class="grades-note"><i class="ri-information-line"></i> Escribe la nota de cada evaluación; deja el campo vacío si aún no la tienes. Los porcentajes son el peso sobre la materia y los créditos ponderan el promedio general.</p>
    </div>`;
  syncSettings();
  bindToolbar();
  bindList();
  renderList();
  refreshComputed();
}

function ensure() {
  if (mounted) return;
  mounted = true;
  mount();
}

export function initGrades() {
  data = load();
  window.EconHub = { ...(window.EconHub || {}), grades: { redraw: () => { if (mounted) { syncSettings(); refreshComputed(); } } } };
  const maybe = () => {
    if ((location.hash || '').includes('promedios')) {
      ensure();
      setTimeout(refreshComputed, 80);
    }
  };
  maybe();
  bus.addEventListener('route:changed', (e) => {
    if ((e.detail || '').includes('promedios')) {
      ensure();
      setTimeout(refreshComputed, 80);
    }
  });
}
