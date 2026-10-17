// econhub · tools.js — motor de anotaciones sobre el PDF:
// 10 herramientas + 5 de geometría CAD (línea con medida/ángulo, triángulos con
// ángulos, arco de 3 puntos), selección múltiple con marquee, borrador continuo
// con radio ajustable, ghost preview, snap a grid 8px, undo/redo (50 pasos).
import { $, $$, store, toast } from './app.js';
import { TOOL_MODES, GEO_MODES, PALETTE, EXTRA_SWATCHES, KEYS } from './data.js';
import { getPdfState, annotsFor } from './pdf-editor.js';

let _animeMod = null;
const anime = () => (_animeMod ||= import('animejs'));

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function getOverlayHost() {
  return document.fullscreenElement || document.querySelector('.pdf-app') || document.body;
}

export const FONT_FAMILIES = [
  { id: 'sans', name: 'Sans', font: 'Inter, system-ui, -apple-system, sans-serif' },
  { id: 'serif', name: 'Serif', font: 'Merriweather, Georgia, serif' },
  { id: 'mono', name: 'Mono', font: 'JetBrains Mono, monospace' },
  { id: 'hand', name: 'Script', font: 'Caveat, Comic Sans MS, cursive' },
];

export function fontFor(familyId, size) {
  const f = FONT_FAMILIES.find((x) => x.id === familyId) || FONT_FAMILIES[0];
  return `${size}px ${f.font}`;
}

const state = {
  tool: 'select',
  color: PALETTE.info,
  width: 3,
  textSize: 16,
  fontFamily: 'sans',
  opacity: 1,
  dashed: false,
  eraserRadius: 18,
  drawing: null,          // shape clásica en progreso (base units)
  selected: null,         // { pageNum, indexes: Set }
  dragAnn: null,          // { mode:'move', indexes, start } | { mode:'marquee', pageNum, x0,y0,x1,y1 }
  geo: null,              // gesto geométrico en progreso { type, pts, cur }
  measurePending: null,   // datos para el panel de medidas
  measurePop: null,
  undoStack: [],
  redoStack: [],
  textArea: null,
  eraseCount: 0,
};

const ALL_COLORS = () => [...Object.values(PALETTE), ...EXTRA_SWATCHES];

function loadPrefs() {
  const p = store.get('econhub:toolprefs', {});
  if (p.color) state.color = p.color;
  if (p.width) state.width = p.width;
  if (p.textSize) state.textSize = p.textSize;
  if (p.fontFamily) state.fontFamily = p.fontFamily;
  if (p.opacity != null) state.opacity = p.opacity;
  if (p.dashed != null) state.dashed = p.dashed;
  if (p.eraserRadius) state.eraserRadius = p.eraserRadius;
}
function savePrefs() {
  store.set('econhub:toolprefs', {
    color: state.color, width: state.width, textSize: state.textSize,
    fontFamily: state.fontFamily, opacity: state.opacity, dashed: state.dashed,
    eraserRadius: state.eraserRadius,
  });
}

function activeDoc() { return getPdfState().docs[getPdfState().active]; }
function isGeo(t) { return GEO_MODES.some((g) => g.id === t); }
function isClassicDraw(t) { return ['pencil', 'rect', 'ellipse', 'tri', 'line', 'highlighter'].includes(t); }

/* ---------- historia ---------- */
function snapshot() {
  const doc = activeDoc();
  return doc ? structuredClone(doc.annots) : null;
}
function commit() {
  const pre = state.pre;
  state.pre = null;
  if (!pre) return;
  state.undoStack.push(pre);
  if (state.undoStack.length > 50) state.undoStack.shift();
  state.redoStack = [];
  updateHistBtns();
}
function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshot());
  const prev = state.undoStack.pop();
  const doc = activeDoc();
  doc.annots = prev;
  persistAnnots();
  redrawAll();
  updateHistBtns();
}
function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshot());
  const next = state.redoStack.pop();
  const doc = activeDoc();
  doc.annots = next;
  persistAnnots();
  redrawAll();
  updateHistBtns();
}
function persistAnnots() {
  const doc = activeDoc();
  if (!doc) return;
  const saved = store.get('econhub:annots', {});
  saved[doc.key] = doc.annots;
  store.set('econhub:annots', saved);
}
function updateHistBtns() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (u) u.disabled = !state.undoStack.length;
  if (r) r.disabled = !state.redoStack.length;
}

/* ---------- render ---------- */
export function redrawPage(docKey, w) {
  const ctx = w.drawCanvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.setTransform(dpr * w.scale, 0, 0, dpr * w.scale, 0, 0);
  ctx.clearRect(0, 0, w.drawCanvas.width / (dpr * w.scale), w.drawCanvas.height / (dpr * w.scale));
  const annots = annotsFor(docKey, w.pageNum);
  annots.forEach((a, i) => drawAnnot(ctx, a, isSelected(w.pageNum, i)));
  if (state.drawing && state.drawing.pageNum === w.pageNum) drawGhost(ctx, state.drawing);
  if (state.geo && state.geo.pageNum === w.pageNum) drawGeoPreview(ctx, state.geo);
  if (state.dragAnn && state.dragAnn.mode === 'marquee' && state.dragAnn.pageNum === w.pageNum) drawMarquee(ctx, state.dragAnn);
}

function isSelected(pageNum, index) {
  return !!state.selected && state.selected.pageNum === pageNum && state.selected.indexes.has(index);
}

function redrawAll() {
  const doc = activeDoc();
  if (!doc) return;
  doc.wrappers.forEach((w) => { if (w.rendered) redrawPage(doc.key, w); });
}

function rgba(hex, a) {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

/* ---------- geometría: helpers ---------- */
function angleDeg(dx, dy) {
  return (Math.atan2(-dy, dx) * 180) / Math.PI; // 0° derecha, 90° arriba
}
function snapAngle(a) {
  const snaps = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  for (const s of snaps) {
    if (Math.abs(((a - s + 540) % 360) - 180) < 3) return s;
  }
  return null;
}
function lineInter(a, da, b, db) {
  // intersección de dos rayos: a=(x,y), da ángulo, b, db ángulo
  const radA = (da * Math.PI) / 180, radB = (db * Math.PI) / 180;
  const dax = Math.cos(radA), day = -Math.sin(radA);
  const dbx = Math.cos(radB), dby = -Math.sin(radB);
  const den = dax * dby - day * dbx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.x - a.x) * dby - (b.y - a.y) * dbx) / den;
  return { x: a.x + t * dax, y: a.y + t * day };
}
function arcFromCenterAndLimits(center, pStart, pEnd) {
  const radius = Math.hypot(pStart.x - center.x, pStart.y - center.y);
  if (radius < 1e-4) return null;
  const start = Math.atan2(pStart.y - center.y, pStart.x - center.x);
  const end = Math.atan2(pEnd.y - center.y, pEnd.x - center.x);
  return { center, radius, start, end };
}

/* ---------- drawAnnot (incluye geometría) ---------- */
function drawAnnot(ctx, a, selected) {
  ctx.save();
  ctx.strokeStyle = a.color;
  ctx.fillStyle = a.color;
  ctx.lineWidth = a.width || 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = a.opacity ?? 1;
  if (a.dashed && a.type !== 'pencil' && a.type !== 'highlighter') ctx.setLineDash([8, 6]);

  if (a.type === 'gline') {
    ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(a.x1, a.y1, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x2, a.y2, 2.6, 0, Math.PI * 2); ctx.fill();
  } else if (a.type === 'gtri') {
    ctx.beginPath();
    ctx.moveTo(a.pts[0].x, a.pts[0].y);
    ctx.lineTo(a.pts[1].x, a.pts[1].y);
    ctx.lineTo(a.pts[2].x, a.pts[2].y);
    ctx.closePath(); ctx.stroke();
    if (a.angles) {
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      a.angles.forEach((ang, i) => {
        const p = a.pts[i];
        ctx.fillText(Math.round(ang) + '°', p.x + 12, p.y - 6);
      });
    }
  } else if (a.type === 'garc') {
    ctx.beginPath();
    ctx.arc(a.center.x, a.center.y, a.radius, a.start, a.end, false);
    ctx.stroke();
    // Centro
    ctx.beginPath(); ctx.arc(a.center.x, a.center.y, 3, 0, Math.PI * 2); ctx.fill();
    // Delimitadores inicio y fin
    const ax = a.center.x + Math.cos(a.start) * a.radius;
    const ay = a.center.y + Math.sin(a.start) * a.radius;
    const bx = a.center.x + Math.cos(a.end) * a.radius;
    const by = a.center.y + Math.sin(a.end) * a.radius;
    ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, 2.5, 0, Math.PI * 2); ctx.fill();
    if (selected) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(a.center.x, a.center.y); ctx.lineTo(ax, ay);
      ctx.moveTo(a.center.x, a.center.y); ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    }
  } else if (a.type === 'highlight') {
    ctx.save();
    ctx.fillStyle = a.color || '#ffc107';
    ctx.globalAlpha = Math.min(a.opacity ?? 0.35, 0.40);
    ctx.globalCompositeOperation = 'multiply';
    const rects = a.rects || (a.w && a.h ? [{ x: a.x, y: a.y, w: a.w, h: a.h }] : []);
    rects.forEach((r) => {
      ctx.fillRect(r.x, r.y, r.w, r.h);
    });
    ctx.restore();
  } else if (a.type === 'pencil' || a.type === 'highlighter') {
    const pts = a.points || [];
    if (!pts.length) { ctx.restore(); return; }
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, (a.width || 3) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(
        pts[pts.length - 1].x, pts[pts.length - 1].y,
        pts[pts.length - 1].x, pts[pts.length - 1].y
      );
    }
    if (a.type === 'highlighter') { ctx.globalAlpha = 0.35; ctx.lineWidth = (a.width || 3) * 3.4; ctx.globalCompositeOperation = 'multiply'; }
    ctx.stroke();
  } else if (a.type === 'rect') {
    ctx.strokeRect(a.x, a.y, a.w, a.h);
  } else if (a.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, Math.abs(a.w / 2), Math.abs(a.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.type === 'tri') {
    ctx.beginPath();
    ctx.moveTo(a.x + a.w / 2, a.y);
    ctx.lineTo(a.x, a.y + a.h);
    ctx.lineTo(a.x + a.w, a.y + a.h);
    ctx.closePath(); ctx.stroke();
  } else if (a.type === 'line') {
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + a.w, a.y + a.h); ctx.stroke();
  } else if (a.type === 'text') {
    ctx.font = fontFor(a.fontFamily, a.size || 16);
    ctx.textBaseline = 'alphabetic';
    const lines = String(a.value || '').split('\n');
    const lineH = (a.size || 16) * 1.25;
    lines.forEach((ln, idx) => {
      ctx.fillText(ln, a.x, a.y + idx * lineH);
    });
  }
  if (selected) {
    ctx.globalAlpha = 0.9;
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = PALETTE.highlight;
    ctx.lineWidth = 1.6;
    const b = boundsOf(a);
    ctx.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawMarquee(ctx, d) {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = PALETTE.highlight;
  ctx.lineWidth = 1.4;
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
  ctx.fillStyle = rgba(PALETTE.highlight, 0.1);
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawGeoPreview(ctx, g) {
  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.width;
  ctx.globalAlpha = state.opacity;
  if (g.type === 'gline') {
    if (g.pts.length >= 1 && g.cur) {
      ctx.beginPath(); ctx.moveTo(g.pts[0].x, g.pts[0].y); ctx.lineTo(g.cur.x, g.cur.y); ctx.stroke();
    }
  } else if (g.type === 'gtri-eq' || g.type === 'gtri-r' || g.type === 'gtri-ang') {
    if (g.pts.length >= 1 && g.cur) {
      const P1 = g.pts[0], P2 = g.cur;
      const P3 = triThird(P1, P2, g.type);
      if (P3) {
        ctx.beginPath();
        ctx.moveTo(P1.x, P1.y); ctx.lineTo(P2.x, P2.y); ctx.lineTo(P3.x, P3.y);
        ctx.closePath(); ctx.stroke();
      }
    }
  } else if (g.type === 'garc') {
    const C = g.pts[0];
    if (C) {
      ctx.beginPath(); ctx.arc(C.x, C.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (g.pts.length === 1 && g.cur) {
      const curR = Math.hypot(g.cur.x - C.x, g.cur.y - C.y);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.arc(C.x, C.y, curR, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(g.cur.x, g.cur.y); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(g.cur.x, g.cur.y, 2.8, 0, Math.PI * 2); ctx.fill();
    } else if (g.pts.length === 2 && g.cur) {
      const A = g.pts[1];
      const R = Math.hypot(A.x - C.x, A.y - C.y);
      const startAngle = Math.atan2(A.y - C.y, A.x - C.x);
      const curAngle = Math.atan2(g.cur.y - C.y, g.cur.x - C.x);
      ctx.beginPath();
      ctx.arc(C.x, C.y, R, startAngle, curAngle, false);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(A.x, A.y, 2.8, 0, Math.PI * 2); ctx.fill();
      const endPt = { x: C.x + Math.cos(curAngle) * R, y: C.y + Math.sin(curAngle) * R };
      ctx.beginPath(); ctx.arc(endPt.x, endPt.y, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(C.x, C.y); ctx.lineTo(A.x, A.y);
      ctx.moveTo(C.x, C.y); ctx.lineTo(endPt.x, endPt.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}

function triThird(P1, P2, type) {
  if (type === 'gtri-eq') {
    const dx = P2.x - P1.x, dy = P2.y - P1.y;
    const mx = (P1.x + P2.x) / 2, my = (P1.y + P2.y) / 2;
    const h = (Math.hypot(dx, dy) * Math.sqrt(3)) / 2;
    return { x: mx - (dy / (Math.hypot(dx, dy) || 1)) * h, y: my + (dx / (Math.hypot(dx, dy) || 1)) * h };
  }
  if (type === 'gtri-r') {
    return { x: P1.x, y: P2.y }; // ángulo recto en P1
  }
  return null;
}

function drawGhost(ctx, d) {
  ctx.save();
  ctx.strokeStyle = state.color;
  ctx.lineWidth = state.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = state.opacity;
  if (d.dashed && d.type !== 'pencil' && d.type !== 'highlighter') {
    ctx.setLineDash([8, 6]);
  } else {
    ctx.setLineDash([]);
  }

  if (d.type === 'rect') {
    ctx.strokeRect(d.x, d.y, d.w, d.h);
  } else if (d.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(d.x + d.w / 2, d.y + d.h / 2, Math.abs(d.w / 2), Math.abs(d.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (d.type === 'tri') {
    ctx.beginPath();
    ctx.moveTo(d.x + d.w / 2, d.y);
    ctx.lineTo(d.x, d.y + d.h);
    ctx.lineTo(d.x + d.w, d.y + d.h);
    ctx.closePath();
    ctx.stroke();
  } else if (d.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.w, d.y + d.h);
    ctx.stroke();
  } else if (d.type === 'pencil' || d.type === 'highlighter') {
    const pts = d.points || [];
    if (!pts.length) { ctx.restore(); return; }
    ctx.setLineDash([]);
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, state.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(
        pts[pts.length - 1].x, pts[pts.length - 1].y,
        pts[pts.length - 1].x, pts[pts.length - 1].y
      );
    }
    if (d.type === 'highlighter') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = state.width * 3.4;
      ctx.globalCompositeOperation = 'multiply';
    } else {
      ctx.lineWidth = state.width;
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------- bounds / hit test ---------- */
function boundsOf(a) {
  if (a.type === 'highlight') {
    const rects = a.rects || (a.w && a.h ? [{ x: a.x, y: a.y, w: a.w, h: a.h }] : []);
    if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = rects.flatMap((r) => [r.x, r.x + r.w]);
    const ys = rects.flatMap((r) => [r.y, r.y + r.h]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (a.type === 'pencil' || a.type === 'highlighter') {
    const pts = a.points || [];
    if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (a.type === 'text') {
    const lines = String(a.value || '').split('\n');
    const maxLineLen = Math.max(...lines.map((l) => l.length), 1);
    const size = a.size || 16;
    const h = Math.max(size * 1.2, lines.length * (size * 1.25));
    return { x: a.x, y: a.y - size, w: Math.max(20, maxLineLen * size * 0.58), h };
  }
  if (a.type === 'gline') {
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2);
    return { x, y, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  }
  if (a.type === 'gtri') {
    const xs = a.pts.map((p) => p.x), ys = a.pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (a.type === 'garc') {
    return { x: a.center.x - a.radius, y: a.center.y - a.radius, w: a.radius * 2, h: a.radius * 2 };
  }
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}

function hitTest(annotList, px, py) {
  for (let i = annotList.length - 1; i >= 0; i--) {
    const a = annotList[i];
    const b = boundsOf(a);
    const tol = 6;
    if (px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol) return i;
  }
  return -1;
}

function hitTestRadius(annotList, px, py, r) {
  const hits = [];
  for (let i = 0; i < annotList.length; i++) {
    const a = annotList[i];
    const b = boundsOf(a);
    const cx = Math.max(b.x, Math.min(px, b.x + b.w));
    const cy = Math.max(b.y, Math.min(py, b.y + b.h));
    if (Math.hypot(px - cx, py - cy) <= r) hits.push(i);
  }
  return hits;
}

function rectIntersects(annotList, rect) {
  const out = [];
  for (let i = 0; i < annotList.length; i++) {
    const b = boundsOf(annotList[i]);
    if (b.x < rect.x + rect.w && b.x + b.w > rect.x && b.y < rect.y + rect.h && b.y + b.h > rect.y) out.push(i);
  }
  return out;
}

/* ---------- puntero ---------- */
function toBase(e, w) {
  const rect = w.inter.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / w.scale, y: (e.clientY - rect.top) / w.scale };
}
const snap = (v) => Math.round(v / 8) * 8;

/* ---------- resaltado por palabra (matching sobre el trazo real) ---------- */
// Cajas de palabra en coordenadas base de la página. Fuente de verdad:
// words del OCR; si no hay OCR, se subdividen los spans nativos por palabra.
function wordBoxesFor(doc, w) {
  const boxes = [];
  const ocrWords = doc?.ocrCache?.[w.pageNum]?.words;
  if (Array.isArray(ocrWords) && ocrWords.length) {
    for (const wd of ocrWords) {
      if (!wd) continue;
      const text = (wd.text || '').trim();
      if (!text || !(wd.baseW > 0) || !(wd.baseH > 0)) continue;
      boxes.push({ text, x: wd.baseX, y: wd.baseY, w: wd.baseW, h: wd.baseH });
    }
    return boxes;
  }

  if (!w.textDiv) return boxes;
  const wrapRect = w.wrap.getBoundingClientRect();
  const scale = w.scale || 1;
  const toBase = (r) => ({
    x: (r.left - wrapRect.left) / scale,
    y: (r.top - wrapRect.top) / scale,
    w: r.width / scale,
    h: r.height / scale,
  });

  for (const sp of w.textDiv.querySelectorAll('span')) {
    const text = (sp.textContent || '').trim();
    if (sp.dataset.baseX != null && sp.dataset.baseW != null) {
      const x = parseFloat(sp.dataset.baseX);
      const y = parseFloat(sp.dataset.baseY);
      const bw = parseFloat(sp.dataset.baseW);
      const bh = parseFloat(sp.dataset.baseH);
      if (!text || !(bw > 0) || !(bh > 0)) continue;
      const parts = text.split(/\s+/).filter(Boolean);
      if (parts.length <= 1) { boxes.push({ text, x, y, w: bw, h: bh }); continue; }
      const total = parts.reduce((s, p) => s + p.length, 0) || 1;
      let cx = x;
      for (const p of parts) {
        const ww = bw * (p.length / total);
        boxes.push({ text: p, x: cx, y, w: ww, h: bh });
        cx += ww;
      }
      continue;
    }

    // Span nativo pdf.js: medir cada palabra con Range para máxima precisión
    const node = sp.firstChild;
    if (!node || node.nodeType !== 3) {
      const r = sp.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) boxes.push({ text, ...toBase(r) });
      continue;
    }
    const raw = node.nodeValue || '';
    const re = /\S+/g;
    let m;
    const range = document.createRange();
    while ((m = re.exec(raw))) {
      let r;
      try {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        r = range.getBoundingClientRect();
      } catch { r = sp.getBoundingClientRect(); }
      if (r && r.width > 0 && r.height > 0) boxes.push({ text: m[0], ...toBase(r) });
    }
  }
  return boxes;
}

// ¿El trazo (polilínea) pasa sobre esta palabra? Muestrea el segmento para no
// perder palabras en trazos rápidos. Devuelve true si toca la banda de la palabra.
function strokeHitsWord(points, box) {
  const strokeW = (state.width || 3) * 3.4;
  const padY = Math.max(8, box.h * 0.6, strokeW * 0.6);
  const padX = Math.max(2, box.h * 0.2);
  const x0 = box.x - padX;
  const x1 = box.x + box.w + padX;
  const bandTop = box.y - padY;
  const bandBot = box.y + box.h + padY;
  const inside = (x, y) => x >= x0 && x <= x1 && y >= bandTop && y <= bandBot;
  const step = Math.max(2, strokeW * 0.4);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (inside(p.x, p.y)) return true;
    const q = points[i + 1];
    if (!q) continue;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const n = Math.min(40, Math.max(1, Math.ceil(len / step)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      if (inside(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)) return true;
    }
  }
  return false;
}

// Agrupa por línea y fusiona SOLO palabras contiguas marcadas; una palabra no
// marcada corta el rectángulo (así una palabra suelta queda suelta y la línea
// completa queda una barra continua).
function mergeWordRects(matched) {
  const lines = [];
  [...matched].sort((a, b) => a.y - b.y || a.x - b.x).forEach((bx) => {
    let line = lines.find((l) => Math.abs(l.y - bx.y) < Math.max(bx.h, l.h) * 0.6);
    if (!line) { line = { y: bx.y, h: bx.h, boxes: [] }; lines.push(line); }
    line.boxes.push(bx);
    line.y = Math.min(line.y, bx.y);
    line.h = Math.max(line.h, bx.h);
  });
  const rects = [];
  for (const l of lines) {
    l.boxes.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const bx of l.boxes) {
      if (!cur) { cur = { x: bx.x, y: bx.y, w: bx.w, h: bx.h }; continue; }
      const gap = bx.x - (cur.x + cur.w);
      const maxGap = Math.max(3, Math.min(cur.h, bx.h) * 0.9);
      if (gap <= maxGap) {
        cur.w = Math.max(cur.x + cur.w, bx.x + bx.w) - cur.x;
        cur.y = Math.min(cur.y, bx.y);
        cur.h = Math.max(cur.h, bx.h);
      } else {
        rects.push(cur);
        cur = { x: bx.x, y: bx.y, w: bx.w, h: bx.h };
      }
    }
    if (cur) rects.push(cur);
  }
  return rects;
}

function collectHighlightRects(doc, w, d) {
  const points = d.points || [];
  if (points.length < 2) return null;
  const boxes = wordBoxesFor(doc, w);
  if (!boxes.length) return null;
  const matched = boxes.filter((bx) => strokeHitsWord(points, bx));
  if (!matched.length) return null;
  const rects = mergeWordRects(matched);
  return rects.length ? rects : null;
}

function onPointerDown(e, layer) {
  if (e.button !== 0) return; // solo botón izquierdo; el central es paneo
  if (window.EconHub.pdf?.isPanning?.()) return; // paneo activo (Espacio)
  const doc = activeDoc();
  if (!doc) return;
  const w = doc.wrappers.find((x) => x.inter === layer);
  if (!w) return;
  const p = toBase(e, w);
  const annots = annotsFor(doc.key, w.pageNum);
  const snapOn = !e.shiftKey;

  // ----- geometría: gestos de 1-3 clics -----
  if (isGeo(state.tool)) {
    if (state.measurePop) return; // el panel de medidas está abierto
    if (state.tool === 'garc') {
      if (!state.geo || state.geo.pageNum !== w.pageNum) {
        state.geo = { type: 'garc', pageNum: w.pageNum, pts: [p], cur: p };
        state.pre = snapshot();
        toast('Centro fijado. Clic para inicio del arco', 'ok');
      } else if (state.geo.pts.length === 1) {
        state.geo.pts.push(p);
        state.geo.cur = p;
        toast('Inicio fijado. Clic para delimitar el fin', 'ok');
      } else if (state.geo.pts.length === 2) {
        const C = state.geo.pts[0];
        const A = state.geo.pts[1];
        const B = p;
        const R = Math.hypot(A.x - C.x, A.y - C.y);
        if (R > 1e-3) {
          const start = Math.atan2(A.y - C.y, A.x - C.x);
          const end = Math.atan2(B.y - C.y, B.x - C.x);
          annots.push({
            type: 'garc',
            pts: [C, A, B],
            center: C,
            radius: R,
            start,
            end,
            color: state.color,
            width: state.width,
            opacity: state.opacity,
          });
          commit();
          persistAnnots();
          toast('Arco creado con éxito', 'ok');
        } else {
          toast('El radio debe ser mayor a cero', 'err');
        }
        state.geo = null;
        redrawAll();
      }
      redrawPage(doc.key, w);
      return;
    }
    // gline / gtri-*: primer clic con arrastre
    state.geo = { type: state.tool, pageNum: w.pageNum, pts: [p], cur: null };
    state.pre = snapshot();
    try { layer.setPointerCapture(e.pointerId); } catch { /* noop */ }
    return;
  }

  if (state.tool === 'select-text') return;

  // ----- borrador continuo -----
  if (state.tool === 'eraser') {
    state.pre = snapshot();
    state.eraseCount = 0;
    const hits = hitTestRadius(annots, p.x, p.y, state.eraserRadius);
    if (hits.length) {
      hits.sort((a, b) => b - a);
      hits.forEach((i) => annots.splice(i, 1));
      state.eraseCount += hits.length;
      redrawPage(doc.key, w);
    }
    return;
  }

  // ----- mover con selección múltiple -----
  if (state.tool === 'select') {
    const i = hitTest(annots, p.x, p.y);
    if (i >= 0) {
      if (!isSelected(w.pageNum, i)) {
        state.selected = e.shiftKey && state.selected && state.selected.pageNum === w.pageNum
          ? { pageNum: w.pageNum, indexes: new Set([...state.selected.indexes, i]) }
          : { pageNum: w.pageNum, indexes: new Set([i]) };
      }
      state.dragAnn = { mode: 'move', pageNum: w.pageNum, indexes: [...state.selected.indexes], start: p };
      state.pre = snapshot();
      redrawAll();
      try { layer.setPointerCapture(e.pointerId); } catch { /* noop */ }
    } else {
      state.selected = { pageNum: w.pageNum, indexes: new Set() };
      state.dragAnn = { mode: 'marquee', pageNum: w.pageNum, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      state.pre = snapshot();
      redrawPage(doc.key, w);
      try { layer.setPointerCapture(e.pointerId); } catch { /* noop */ }
    }
    renderSelBar();
    return;
  }
  if (state.tool === 'text') {
    openTextInput(w, p);
    return;
  }
  if (state.tool === 'hand') return;

  // ----- formas clásicas -----
  state.drawing = {
    type: state.tool, pageNum: w.pageNum,
    x: snapOn ? snap(p.x) : p.x, y: snapOn ? snap(p.y) : p.y,
    w: 0, h: 0, points: state.tool === 'pencil' || state.tool === 'highlighter' ? [{ x: p.x, y: p.y }] : [],
    color: state.color, width: state.width,
    opacity: state.opacity, dashed: state.dashed,
  };
  state.pre = snapshot();
  try { layer.setPointerCapture(e.pointerId); } catch { /* noop */ }
}

function onPointerMove(e, layer) {
  if (window.EconHub.pdf?.isPanning?.()) return; // paneo activo (Espacio)
  const doc = activeDoc();
  if (!doc) return;
  const w = doc.wrappers.find((x) => x.inter === layer);
  if (!w) return;
  const p = toBase(e, w);
  const snapOn = !e.shiftKey;

  // geometría: preview
  if (isGeo(state.tool) && state.geo && state.geo.pageNum === w.pageNum && state.geo.cur !== undefined) {
    if (state.tool === 'gline') {
      let nx = p.x, ny = p.y;
      const a = angleDeg(p.x - state.geo.pts[0].x, p.y - state.geo.pts[0].y);
      const snapped = snapOn ? snapAngle(a) : null;
      if (snapped !== null) {
        const L = Math.hypot(p.x - state.geo.pts[0].x, p.y - state.geo.pts[0].y);
        nx = state.geo.pts[0].x + Math.cos((snapped * Math.PI) / 180) * L;
        ny = state.geo.pts[0].y - Math.sin((snapped * Math.PI) / 180) * L;
      }
      state.geo.cur = { x: nx, y: ny };
    } else {
      state.geo.cur = { x: p.x, y: p.y };
    }
    redrawPage(doc.key, w);
    return;
  }

  // borrador continuo
  if (state.tool === 'eraser' && state.pre) {
    const annots = annotsFor(doc.key, w.pageNum);
    const hits = hitTestRadius(annots, p.x, p.y, state.eraserRadius);
    if (hits.length) {
      hits.sort((a, b) => b - a);
      hits.forEach((i) => annots.splice(i, 1));
      state.eraseCount += hits.length;
      redrawPage(doc.key, w);
    }
    return;
  }

  // mover grupo / marquee
  if (state.dragAnn) {
    const annots = annotsFor(doc.key, w.pageNum);
    if (state.dragAnn.mode === 'move') {
      const dx = p.x - state.dragAnn.start.x, dy = p.y - state.dragAnn.start.y;
      state.dragAnn.indexes.forEach((idx) => {
        const a = annots[idx];
        if (!a) return;
        if (a.type === 'highlight') {
          if (a.rects) a.rects.forEach((r) => { r.x += dx; r.y += dy; });
          if (a.x != null) { a.x += dx; a.y += dy; }
        } else if (a.type === 'pencil' || a.type === 'highlighter' || a.type === 'text') {
          a.points?.forEach((pt) => { pt.x += dx; pt.y += dy; });
          if (a.type === 'text') { a.x += dx; a.y += dy; }
        } else if (a.type === 'gline') {
          a.x1 += dx; a.y1 += dy; a.x2 += dx; a.y2 += dy;
        } else if (a.type === 'gtri') {
          a.pts.forEach((pt) => { pt.x += dx; pt.y += dy; });
        } else if (a.type === 'garc') {
          a.pts.forEach((pt) => { pt.x += dx; pt.y += dy; });
          a.center.x += dx; a.center.y += dy;
        } else {
          a.x += dx; a.y += dy;
        }
      });
      state.dragAnn.start = p;
    } else {
      state.dragAnn.x1 = p.x;
      state.dragAnn.y1 = p.y;
    }
    redrawPage(doc.key, w);
    return;
  }

  if (!state.drawing || state.drawing.pageNum !== w.pageNum) return;
  if (state.drawing.type === 'pencil' || state.drawing.type === 'highlighter') {
    const pts = state.drawing.points;
    const last = pts[pts.length - 1];
    if (!last) {
      pts.push({ x: p.x, y: p.y });
    } else {
      const dist = Math.hypot(p.x - last.x, p.y - last.y);
      // Filtro anti-temblor: ignora micro-ruido (<1.2px) y estabiliza el movimiento con lerp
      if (dist >= 1.2) {
        const smoothPt = {
          x: Math.round((last.x + (p.x - last.x) * 0.78) * 10) / 10,
          y: Math.round((last.y + (p.y - last.y) * 0.78) * 10) / 10,
        };
        pts.push(smoothPt);
      }
    }
  } else {
    let nx = snapOn ? snap(p.x) : p.x, ny = snapOn ? snap(p.y) : p.y;
    const x0 = state.drawing.x, y0 = state.drawing.y;
    if (e.shiftKey) {
      const w2 = Math.abs(nx - x0), h2 = Math.abs(ny - y0);
      const s2 = Math.max(w2, h2);
      nx = x0 + Math.sign(nx - x0) * s2;
      ny = y0 + Math.sign(ny - y0) * s2;
    }
    state.drawing.w = nx - x0; state.drawing.h = ny - y0;
  }
  redrawPage(doc.key, w);
}

function onPointerUp(e, layer) {
  if (window.EconHub.pdf?.isPanning?.()) return; // paneo activo (Espacio)
  const doc = activeDoc();
  if (!doc) return;
  const w = doc.wrappers.find((x) => x.inter === layer);
  if (!w) return;
  const p = toBase(e, w);
  const annots = annotsFor(doc.key, w.pageNum);

  // geometría: fin del gesto
  if (isGeo(state.tool) && state.geo && state.geo.pageNum === w.pageNum) {
    if (state.tool === 'garc') return; // garc termina en el 3er clic
    const P1 = state.geo.pts[0];
    const P2 = state.geo.cur || p;
    state.geo = null;
    if (state.tool === 'gline') {
      if (Math.hypot(P2.x - P1.x, P2.y - P1.y) < 3) return;
      openMeasurePanel({ type: 'gline', P1, P2, pageNum: w.pageNum });
    } else if (state.tool === 'gtri-ang') {
      if (Math.hypot(P2.x - P1.x, P2.y - P1.y) < 3) return;
      openMeasurePanel({ type: 'gtri-ang', P1, P2, pageNum: w.pageNum });
    } else {
      // gtri-eq / gtri-r: completar directo
      if (Math.hypot(P2.x - P1.x, P2.y - P1.y) < 3) return;
      const P3 = triThird(P1, P2, state.tool);
      if (P3) {
        annots.push({ type: 'gtri', pts: [P1, P2, P3], angles: state.tool === 'gtri-r' ? [90, 0, 0] : null, color: state.color, width: state.width, opacity: state.opacity });
        commit();
        persistAnnots();
        toast(state.tool === 'gtri-eq' ? 'Triángulo equilátero' : 'Triángulo recto');
      }
      redrawAll();
    }
    return;
  }

  // borrador: commit del gesto
  if (state.tool === 'eraser' && state.pre) {
    if (state.eraseCount > 0) {
      commit();
      persistAnnots();
      toast(`Borradas ${state.eraseCount} anotación(es)`);
    }
    state.eraseCount = 0;
    return;
  }

  // mover grupo / marquee
  if (state.dragAnn) {
    if (state.dragAnn.mode === 'marquee') {
      const rect = {
        x: Math.min(state.dragAnn.x0, state.dragAnn.x1),
        y: Math.min(state.dragAnn.y0, state.dragAnn.y1),
        w: Math.abs(state.dragAnn.x1 - state.dragAnn.x0),
        h: Math.abs(state.dragAnn.y1 - state.dragAnn.y0),
      };
      if (rect.w < 3 && rect.h < 3) {
        state.selected = { pageNum: w.pageNum, indexes: new Set() };
      } else {
        state.selected = { pageNum: w.pageNum, indexes: new Set(rectIntersects(annots, rect)) };
      }
      commit();
      state.dragAnn = null;
      renderSelBar();
      redrawPage(doc.key, w);
      return;
    }
    const moved = annots[state.dragAnn.indexes[0]];
    if (moved) { commit(); persistAnnots(); }
    state.dragAnn = null;
    redrawAll();
    return;
  }

  if (state.dragAnn) { state.dragAnn = null; return; }
  if (!state.drawing || state.drawing.pageNum !== w.pageNum) return;
  const d = state.drawing;
  state.drawing = null;

  if (d.type === 'pencil' || d.type === 'highlighter') {
    if (d.points.length < 2) return;

    // Resaltador por palabra: se ciñe al trazo real (una palabra, varias o la línea completa)
    if (d.type === 'highlighter') {
      const matchedRects = collectHighlightRects(doc, w, d);
      if (matchedRects) {
        const paddedRects = matchedRects.map((r) => ({
          x: Math.round((r.x - 1) * 10) / 10,
          y: Math.round((r.y - 1) * 10) / 10,
          w: Math.round((r.w + 2) * 10) / 10,
          h: Math.round((r.h + 2) * 10) / 10,
        }));
        const annot = {
          type: 'highlight',
          rects: paddedRects,
          color: state.color || '#ffc107',
          opacity: 0.35,
        };
        annotsFor(doc.key, w.pageNum).push(annot);
        commit();
        persistAnnots();
        redrawAll();
        toast(`Texto resaltado (${paddedRects.length} bloque${paddedRects.length > 1 ? 's' : ''})`, 'ok');
        return;
      }
    }

    // Fallback: si no hay texto en el área trazada, guardar como trazo libre
    annotsFor(doc.key, w.pageNum).push(d);
  } else {
    if (Math.abs(d.w) < 2 && Math.abs(d.h) < 2) return;
    annotsFor(doc.key, w.pageNum).push(d);
  }
  commit();
  persistAnnots();
  redrawAll();
}

/* ---------- panel de medidas (línea CAD / triángulo por ángulos) ---------- */
function openMeasurePanel(data) {
  closeMeasurePanel();
  const el = document.createElement('div');
  el.className = 'measure-popover';
  state.measurePending = data;
  state.measurePop = el;
  if (data.type === 'gline') {
    const L = Math.hypot(data.P2.x - data.P1.x, data.P2.y - data.P1.y);
    const A = angleDeg(data.P2.x - data.P1.x, data.P2.y - data.P1.y);
    el.innerHTML = `
      <div class="mp-title"><i class="ri-draft-line"></i> Línea CAD</div>
      <div class="mp-row"><span>Longitud</span><input type="number" id="mpLen" step="0.1" min="1" value="${Math.round(L * 10) / 10}"> <b>pt</b></div>
      <div class="mp-row"><span>ángulo</span><input type="number" id="mpAng" step="1" value="${Math.round(A * 10) / 10}"> <b>°</b></div>
      <div class="mp-cm" id="mpCm"></div>
      <div class="mp-quick">${[0, 45, 90, 135, 180, 270].map((a) => `<button class="chip mp-q" data-a="${a}">${a}°</button>`).join('')}</div>
      <div class="mp-foot">
        <button class="btn btn-ghost btn-sm" id="mpCancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="mpApply"><i class="ri-check-line"></i> Aplicar</button>
      </div>`;
    const upd = () => {
      const cm = (+el.querySelector('#mpLen').value * 0.3528).toFixed(2).replace('.', ',');
      el.querySelector('#mpCm').textContent = `≈ ${cm} cm a escala del PDF`;
    };
    el.querySelector('#mpLen').addEventListener('input', upd);
    upd();
    el.querySelectorAll('.mp-q').forEach((b) => b.addEventListener('click', () => { el.querySelector('#mpAng').value = b.dataset.a; }));
    el.querySelector('#mpApply').addEventListener('click', () => {
      const L = +el.querySelector('#mpLen').value || 1;
      const A = +el.querySelector('#mpAng').value || 0;
      const P1 = data.P1;
      const P2 = { x: P1.x + Math.cos((A * Math.PI) / 180) * L, y: P1.y - Math.sin((A * Math.PI) / 180) * L };
      const annots = annotsFor(activeDoc().key, state.measurePending.pageNum);
      annots.push({ type: 'gline', x1: P1.x, y1: P1.y, x2: P2.x, y2: P2.y, length: L, angle: A, color: state.color, width: state.width, opacity: state.opacity });
      commit();
      persistAnnots();
      closeMeasurePanel();
      redrawAll();
      toast(`Línea: ${L} pt (${(L * 0.3528).toFixed(2)} cm) a ${A}°`);
    });
    el.querySelector('#mpCancel').addEventListener('click', closeMeasurePanel);
  } else if (data.type === 'gtri-ang') {
    const P1 = data.P1, P2 = data.P2;
    el.innerHTML = `
      <div class="mp-title"><i class="ri-settings-3-line"></i> Triángulo por ángulos</div>
      <div class="mp-row"><span>ángulo A (en P1)</span><input type="number" id="mpA" step="1" min="1" max="179" value="60"></div>
      <div class="mp-row"><span>ángulo B (en P2)</span><input type="number" id="mpB" step="1" min="1" max="179" value="60"></div>
      <div class="mp-cm" id="mpC">C = 60°</div>
      <div class="mp-foot">
        <button class="btn btn-ghost btn-sm" id="mpCancel">Cancelar</button>
        <button class="btn btn-primary btn-sm" id="mpApply"><i class="ri-check-line"></i> Crear</button>
      </div>`;
    const upd = () => {
      const A = +el.querySelector('#mpA').value || 1, B = +el.querySelector('#mpB').value || 1;
      el.querySelector('#mpC').textContent = `C = ${180 - A - B}·`;
      el.querySelector('#mpC').style.color = A + B >= 180 ? '#ef5350' : '';
    };
    el.querySelector('#mpA').addEventListener('input', upd);
    el.querySelector('#mpB').addEventListener('input', upd);
    upd();
    el.querySelector('#mpApply').addEventListener('click', () => {
      const A = +el.querySelector('#mpA').value || 1, B = +el.querySelector('#mpB').value || 1;
      if (A + B >= 180) return toast('A + B debe ser menor a 180°', 'err');
      const baseAng = angleDeg(P2.x - P1.x, P2.y - P1.y);
      const P3 = lineInter(P1, baseAng - A, P2, baseAng + 180 + B);
      if (!P3) return toast('No se pudo construir el triángulo', 'err');
      const annots = annotsFor(activeDoc().key, state.measurePending.pageNum);
      annots.push({ type: 'gtri', pts: [P1, P2, P3], angles: [A, B, 180 - A - B], color: state.color, width: state.width, opacity: state.opacity });
      commit();
      persistAnnots();
      closeMeasurePanel();
      redrawAll();
      toast('Triángulo creado con sus ángulos');
    });
    el.querySelector('#mpCancel').addEventListener('click', closeMeasurePanel);
  }
  // posición: anclado al final del gesto (dentro del row? mejor fixed centrado cerca del punto)
  const ws = $('#pdfWorkspace');
  const wsRect = ws.getBoundingClientRect();
  el.style.position = 'fixed';
  const anchor = data.P2 || data.P1;
  const wrap = docWrapperFor(data.pageNum);
  const scale = wrap?.scale || 1;
  const wrapRect = wrap?.wrap.getBoundingClientRect();
  const x = wrapRect ? wrapRect.left + anchor.x * scale : wsRect.left + 200;
  const y = wrapRect ? wrapRect.top + anchor.y * scale : wsRect.top + 200;
  el.style.left = `${Math.max(8, Math.min(x + 12, window.innerWidth - 280))}px`;
  el.style.top = `${Math.max(8, y - 40)}px`;
  getOverlayHost().appendChild(el);
  state.measurePop = el;
  el.querySelector('#mpLen')?.focus();
  el.querySelector('#mpLen')?.select();
}
function docWrapperFor(pageNum) {
  const doc = activeDoc();
  return doc ? doc.wrappers.find((w) => w.pageNum === pageNum) : null;
}
function closeMeasurePanel() {
  if (state.measurePop) { state.measurePop.remove(); state.measurePop = null; }
  state.measurePending = null;
}

/* ---------- texto ---------- */
function commitTextInput() {
  if (!state.textArea) return;
  const { ta, wrapEl, w, p, docKey } = state.textArea;
  const value = ta ? ta.value.trim() : '';
  if (value) {
    const doc = activeDoc();
    if (doc) {
      state.pre = snapshot();
      const annot = {
        type: 'text',
        x: Math.round(p.x * 10) / 10,
        y: Math.round((p.y + state.textSize) * 10) / 10,
        size: state.textSize || 16,
        fontFamily: state.fontFamily || 'sans',
        color: state.color || '#5f4786',
        width: 2,
        value,
      };
      annotsFor(docKey, w.pageNum).push(annot);
      commit();
      persistAnnots();
      redrawAll();
      toast('Texto añadido', 'ok');
    }
  }
  state.textArea = null;
  if (wrapEl && wrapEl.isConnected) wrapEl.remove();
}

function closeTextInput() {
  if (state.textArea) {
    const { wrapEl } = state.textArea;
    state.textArea = null;
    if (wrapEl && wrapEl.isConnected) wrapEl.remove();
  }
}

function openTextInput(w, p) {
  if (state.textArea) {
    commitTextInput();
  }
  const doc = activeDoc();
  if (!doc) return;

  const wrapEl = document.createElement('div');
  wrapEl.className = 'pdf-text-editor-wrap';
  const cssX = p.x * w.scale;
  const cssY = p.y * w.scale;

  Object.assign(wrapEl.style, {
    position: 'absolute',
    left: `${cssX}px`,
    top: `${cssY}px`,
    zIndex: '45',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    pointerEvents: 'auto',
  });

  const curFont = FONT_FAMILIES.find((f) => f.id === state.fontFamily) || FONT_FAMILIES[0];
  const quickColors = ['#ffffff', '#1e1e1e', '#e53935', '#ffc107', '#66bb6a', '#069a7e', '#127599', '#5f4786'];

  const toolbar = document.createElement('div');
  toolbar.className = 'pdf-text-toolbar';
  toolbar.innerHTML = `
    <div class="ptt-group ptt-size-group">
      <button type="button" class="ptt-btn" id="pttSizeDown" title="Disminuir tamaño (Ctrl+[)"><i class="ri-subtract-line"></i></button>
      <span class="ptt-size-val" id="pttSizeVal">${state.textSize}px</span>
      <button type="button" class="ptt-btn" id="pttSizeUp" title="Aumentar tamaño (Ctrl+])"><i class="ri-add-line"></i></button>
    </div>
    <div class="ptt-group ptt-fonts">
      ${FONT_FAMILIES.map((f) => `<button type="button" class="ptt-font-btn ${f.id === (state.fontFamily || 'sans') ? 'active' : ''}" data-font="${f.id}" title="${f.name}" style="font-family:${f.font}">${f.name}</button>`).join('')}
    </div>
    <div class="ptt-group ptt-colors">
      ${quickColors.map((c) => `<button type="button" class="ptt-color-dot ${c === state.color ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
      <label class="ptt-color-custom" title="Color personalizado">
        <input type="color" id="pttCustomColor" value="${state.color}">
        <span class="ptt-custom-pip" id="pttCustomPip" style="background:${state.color}"></span>
      </label>
    </div>
    <div class="ptt-group ptt-actions">
      <button type="button" class="ptt-btn ptt-commit" id="pttCommit" title="Insertar texto (Enter)"><i class="ri-check-line"></i></button>
      <button type="button" class="ptt-btn ptt-close" id="pttClose" title="Cancelar (Esc)"><i class="ri-close-line"></i></button>
    </div>
  `;

  const ta = document.createElement('textarea');
  ta.className = 'pdf-text-input';
  ta.placeholder = 'Escribe aquí… (Shift+Enter para salto)';
  const fontSize = Math.max(12, state.textSize * w.scale);

  Object.assign(ta.style, {
    fontSize: `${fontSize}px`,
    fontFamily: curFont.font,
    color: state.color || 'var(--text)',
    borderColor: state.color || 'var(--accent)',
  });

  const stopEv = (e) => e.stopPropagation();
  wrapEl.addEventListener('pointerdown', stopEv);
  wrapEl.addEventListener('mousedown', stopEv);
  wrapEl.addEventListener('click', stopEv);

  // Evitar que hacer clic en los botones de la barra des-enfoque y cierre el texto
  toolbar.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  wrapEl.appendChild(toolbar);
  wrapEl.appendChild(ta);
  w.wrap.appendChild(wrapEl);

  state.textArea = { wrapEl, ta, w, p, docKey: doc.key };

  const applyTextStyles = () => {
    const fs = Math.max(12, state.textSize * w.scale);
    ta.style.fontSize = `${fs}px`;
    const f = FONT_FAMILIES.find((x) => x.id === state.fontFamily) || FONT_FAMILIES[0];
    ta.style.fontFamily = f.font;
    ta.style.color = state.color;
    ta.style.borderColor = state.color;
    toolbar.querySelector('#pttSizeVal').textContent = `${state.textSize}px`;
    const pip = toolbar.querySelector('#pttCustomPip');
    if (pip) pip.style.background = state.color;
    toolbar.querySelectorAll('.ptt-color-dot').forEach((d) => d.classList.toggle('active', d.dataset.color === state.color));
    toolbar.querySelectorAll('.ptt-font-btn').forEach((b) => b.classList.toggle('active', b.dataset.font === state.fontFamily));
  };

  // Eventos de la barra contextual
  toolbar.querySelector('#pttSizeDown')?.addEventListener('click', () => {
    state.textSize = Math.max(10, state.textSize - 2);
    savePrefs();
    applyTextStyles();
    ta.focus();
  });
  toolbar.querySelector('#pttSizeUp')?.addEventListener('click', () => {
    state.textSize = Math.min(64, state.textSize + 2);
    savePrefs();
    applyTextStyles();
    ta.focus();
  });

  toolbar.querySelectorAll('.ptt-font-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.fontFamily = btn.dataset.font;
      savePrefs();
      applyTextStyles();
      ta.focus();
    });
  });

  toolbar.querySelectorAll('.ptt-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      state.color = dot.dataset.color;
      savePrefs();
      applyTextStyles();
      ta.focus();
    });
  });

  toolbar.querySelector('#pttCustomColor')?.addEventListener('input', (e) => {
    state.color = e.target.value;
    savePrefs();
    applyTextStyles();
  });

  toolbar.querySelector('#pttCommit')?.addEventListener('click', () => {
    commitTextInput();
  });
  toolbar.querySelector('#pttClose')?.addEventListener('click', () => {
    closeTextInput();
  });

  // Auto-ajuste de altura según el contenido escrito
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(38, ta.scrollHeight)}px`;
  });

  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commitTextInput();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeTextInput();
    }
  });

  // Blur diferido para permitir clics dentro del toolbar
  let blurTimer = null;
  ta.addEventListener('blur', () => {
    blurTimer = setTimeout(() => {
      if (state.textArea && state.textArea.ta === ta) {
        commitTextInput();
      }
    }, 220);
  });
  wrapEl.addEventListener('focusin', () => {
    clearTimeout(blurTimer);
  });

  setTimeout(() => {
    ta.focus();
  }, 30);
}

/* ---------- barra de selección ---------- */
function renderSelBar() {
  let bar = $('#selBar');
  const count = state.selected ? state.selected.indexes.size : 0;
  if (!count) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'selBar';
    bar.className = 'sel-bar';
    document.querySelector('.pdf-workspace').appendChild(bar);
    bar.addEventListener('click', (e) => {
      if (e.target.closest('#selDel')) {
        const doc = activeDoc();
        if (doc && state.selected) {
          const annots = annotsFor(doc.key, state.selected.pageNum);
          const idxs = [...state.selected.indexes].sort((a, b) => b - a);
          state.pre = snapshot();
          idxs.forEach((i) => annots.splice(i, 1));
          commit();
          persistAnnots();
          const n = idxs.length;
          state.selected = null;
          renderSelBar();
          redrawAll();
          toast(`Borradas ${n} anotaciones`);
        }
      }
      if (e.target.closest('#selClear')) {
        state.selected = null;
        renderSelBar();
        redrawAll();
      }
    });
  }
  bar.innerHTML = `<span><b>${count}</b> seleccionada${count > 1 ? 's' : ''}</span>
    <button class="btn btn-danger-ghost btn-sm" id="selDel"><i class="ri-delete-bin-line"></i> Borrar</button>
    <button class="btn btn-ghost btn-sm" id="selClear"><i class="ri-close-line"></i></button>`;
}

/* ---------- cursor del borrador ---------- */
function updateEraserCursor(e) {
  let cur = $('#eraserCursor');
  const doc = activeDoc();
  if (state.tool !== 'eraser' || !doc) { if (cur) cur.remove(); return; }
  const w = doc.wrappers[0];
  const radiusPx = state.eraserRadius * (w?.scale || 1);
  if (!cur) {
    cur = document.createElement('div');
    cur.id = 'eraserCursor';
    getOverlayHost().appendChild(cur);
  }
  cur.style.width = cur.style.height = radiusPx * 2 + 'px';
  cur.style.left = e.clientX + 'px';
  cur.style.top = e.clientY + 'px';
}

/* ---------- UI: tiles ---------- */
function renderToolbar() {
  const grid = $('#toolGrid');
  const geo = GEO_MODES.find((g) => g.id === state.tool);
  grid.innerHTML = TOOL_MODES.map((t) => `
    <button class="tool-btn ${t.id === state.tool ? 'active' : ''}" data-tool="${t.id}"
      title="${t.name} (${t.shortcut}) · doble clic para ajustar" style="--tc:${t.color}">
      <i data-lucide="${t.icon}"></i><span>${t.name}</span>
      <span class="tk-key">${t.shortcut}</span>
    </button>`).join('') + `
    <button class="tool-btn geo-tile ${geo ? 'active' : ''}" data-geo-menu
      title="Geometría CAD: línea con medida, triángulos, arcos" style="--tc:#5f4786">
      <i data-lucide="${geo ? geo.icon : 'shapes'}"></i><span>${geo ? geo.name.split(' ')[0] : 'Geometría'}</span>
      <span class="tk-key">J</span>
    </button>`;
  grid.querySelector('[data-geo-menu]').addEventListener('click', (e) => {
    e.stopPropagation();
    openGeoMenu(e.currentTarget);
  });
  if (window.lucide) lucide.createIcons();
}

let geoMenuEl = null;

function openGeoMenu(btn) {
  closeGeoMenu();
  const el = document.createElement('div');
  el.className = 'geo-menu';
  el.innerHTML = GEO_MODES.map((g) => `<button class="geo-item" data-geo="${g.id}"><i data-lucide="${g.icon}"></i><span>${g.name}</span></button>`).join('');
  getOverlayHost().appendChild(el);
  const btnRect = btn.getBoundingClientRect();
  el.style.position = 'fixed';
  el.style.left = Math.min(Math.max(8, btnRect.left), window.innerWidth - 240) + 'px';
  el.style.top = (btnRect.bottom + 8) + 'px';
  el.style.zIndex = '9999';
  el.querySelectorAll('.geo-item').forEach((it) => it.addEventListener('click', (e) => {
    e.stopPropagation();
    closeGeoMenu();
    setTool(it.dataset.geo);
  }));
  if (window.lucide) lucide.createIcons();
  geoMenuEl = el;
}

function closeGeoMenu() {
  if (geoMenuEl) { geoMenuEl.remove(); geoMenuEl = null; }
}

/* ---------- popover de ajustes (doble clic) ---------- */
let popoverEl = null;

function openPopover(btn, toolId) {
  closePopover();
  closeMeasurePanel();
  const isDraw = isClassicDraw(toolId);
  const isText = toolId === 'text';
  const isErase = toolId === 'eraser';
  if (!isDraw && !isText && !isErase) { console.log('[popover] no config for', toolId); return; }
  const tool = TOOL_MODES.find((t) => t.id === toolId);
  // Backdrop sutil para sensación flotante moderna
  const backdrop = document.createElement('div');
  backdrop.className = 'tool-popover-backdrop';
  backdrop.addEventListener('click', closePopover);
  getOverlayHost().appendChild(backdrop);
  const el = document.createElement('div');
  el.className = 'tool-popover';
  el.dataset.popover = toolId;
  const eraseRow = isErase
    ? `<div class="tp-row"><span>Radio de borrado</span><b id="tpErase">${state.eraserRadius}px</b></div>
       <input type="range" class="tp-range" id="tpEraseRange" min="10" max="60" value="${state.eraserRadius}">`
    : '';
  el.innerHTML = `
    <div class="tp-head">
      <span><i class="ri-equalizer-line"></i> ${tool.name}</span>
      <small>ajustes</small>
      <button class="icon-btn tiny" id="tpClose" title="Cerrar" style="margin-left:auto"><i class="ri-close-line"></i></button>
    </div>
    <div class="tp-row"><span>Color</span><b class="tp-now" id="tpColorNow" style="color:${state.color}">${state.color}</b></div>
    <div class="tp-swatches" id="tpSwatches">
      ${ALL_COLORS().map((c) => `<span class="swatch ${c === state.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
      <button class="color-custom-btn" title="Color personalizado"><input type="color" id="tpCustom" value="${state.color}"></button>
    </div>
    ${isDraw ? `
    <div class="tp-row"><span>Grosor</span><b id="tpWidth">${state.width}px</b></div>
    <input type="range" class="tp-range" id="tpWidthRange" min="1" max="12" value="${state.width}">
    <div class="tp-row"><span>Opacidad</span><b id="tpOpacity">${Math.round(state.opacity * 100)}%</b></div>
    <input type="range" class="tp-range" id="tpOpacityRange" min="15" max="100" value="${Math.round(state.opacity * 100)}">
    ${toolId !== 'pencil' && toolId !== 'highlighter' ? `<label class="prop-dash"><input type="checkbox" id="tpDash" ${state.dashed ? 'checked' : ''}> punteado</label>` : ''}` : ''}
    ${isText ? `
    <div class="tp-row"><span>Tamaño de texto</span><b id="tpSize">${state.textSize}px</b></div>
    <input type="range" class="tp-range" id="tpSizeRange" min="10" max="48" value="${state.textSize}">
    <div class="tp-row"><span>Tipografía</span><b id="tpFontNow">${FONT_FAMILIES.find(f => f.id === state.fontFamily)?.name || 'Sans'}</b></div>
    <div class="tp-fonts" id="tpFonts">
      ${FONT_FAMILIES.map(f => `<button type="button" class="tp-font-btn ${f.id === (state.fontFamily || 'sans') ? 'active' : ''}" data-font="${f.id}" style="font-family:${f.font}">${f.name}</button>`).join('')}
    </div>` : ''}
    ${eraseRow}
    <div class="tp-hint"><i class="ri-mouse-line"></i> Rueda: color sobre los círculos · grosor en el resto</div>`;
  // Posicionamiento flotante moderno — fixed para no ser recortado por overflow
  getOverlayHost().appendChild(el);
  const btnRect = btn.getBoundingClientRect();
  const idealLeft = btnRect.left + btnRect.width / 2 - 160;
  el.style.position = 'fixed';
  el.style.left = Math.min(Math.max(8, idealLeft), window.innerWidth - 336) + 'px';
  el.style.top = (btnRect.bottom + 12) + 'px';
  el._backdrop = backdrop;
  if (!reduced()) {
    anime().then(({ animate }) => {
      animate(el, { scale: [0.92, 1], y: [-6, 0], opacity: [0, 1], duration: 300, ease: 'spring({ stiffness: 240, damping: 18 })' });
    });
  }
  popoverEl = el;
  el.querySelector('#tpClose')?.addEventListener('click', (e)=>{ e.stopPropagation(); closePopover(); });

  el.querySelector('#tpSwatches').addEventListener('click', (e) => {
    const s = e.target.closest('.swatch[data-color]');
    if (s) { state.color = s.dataset.color; savePrefs(); refreshPopover(); }
  });
  el.querySelector('#tpCustom')?.addEventListener('input', (e) => { state.color = e.target.value; savePrefs(); refreshPopover(); });
  el.querySelector('#tpFonts')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tp-font-btn[data-font]');
    if (btn) {
      state.fontFamily = btn.dataset.font;
      savePrefs();
      refreshPopover();
    }
  });
  const bindRange = (id, cb) => {
    const r = el.querySelector('#' + id);
    if (r) r.addEventListener('input', (e) => { cb(+e.target.value); savePrefs(); refreshPopover(true); });
  };
  bindRange('tpWidthRange', (v) => { state.width = v; });
  bindRange('tpOpacityRange', (v) => { state.opacity = v / 100; });
  bindRange('tpSizeRange', (v) => { state.textSize = v; });
  bindRange('tpEraseRange', (v) => { state.eraserRadius = v; });
  el.querySelector('#tpDash')?.addEventListener('change', (e) => { state.dashed = e.target.checked; savePrefs(); });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.target.closest('#tpSwatches')) {
      const colors = ALL_COLORS();
      const idx = colors.indexOf(state.color);
      const next = (idx + (e.deltaY > 0 ? 1 : -1) + colors.length) % colors.length;
      state.color = colors[next];
      savePrefs();
      refreshPopover();
    } else if (isErase) {
      state.eraserRadius = Math.min(60, Math.max(10, state.eraserRadius + (e.deltaY > 0 ? -2 : 2)));
      savePrefs();
      refreshPopover(true);
    } else {
      state.width = Math.min(12, Math.max(1, state.width + (e.deltaY > 0 ? -1 : 1)));
      savePrefs();
      refreshPopover(true);
    }
  }, { passive: false });
}

function refreshPopover(keepRanges = false) {
  if (!popoverEl) return;
  popoverEl.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s.dataset.color === state.color));
  const now = popoverEl.querySelector('#tpColorNow');
  if (now) { now.textContent = state.color; now.style.color = state.color; }
  popoverEl.querySelectorAll('.tp-font-btn').forEach((b) => b.classList.toggle('active', b.dataset.font === (state.fontFamily || 'sans')));
  const fNow = popoverEl.querySelector('#tpFontNow');
  if (fNow) {
    const fam = FONT_FAMILIES.find((f) => f.id === (state.fontFamily || 'sans'));
    fNow.textContent = fam ? fam.name : 'Sans';
  }
  const set = (id, txt) => { const b = popoverEl.querySelector('#' + id); if (b) b.textContent = txt; };
  set('tpWidth', state.width + 'px');
  set('tpOpacity', Math.round(state.opacity * 100) + '%');
  set('tpSize', state.textSize + 'px');
  set('tpErase', state.eraserRadius + 'px');
  if (!keepRanges) {
    const wr = popoverEl.querySelector('#tpWidthRange');
    if (wr) wr.value = state.width;
    const c = popoverEl.querySelector('#tpCustom');
    if (c) c.value = state.color;
    const er = popoverEl.querySelector('#tpEraseRange');
    if (er) er.value = state.eraserRadius;
  }
  redrawAll();
}

function closePopover() {
  if (popoverEl) {
    if (popoverEl._backdrop) popoverEl._backdrop.remove();
    popoverEl.remove(); popoverEl = null;
  } else {
    document.querySelectorAll('.tool-popover-backdrop').forEach(b=>b.remove());
  }
}

/* ---------- herramienta activa ---------- */
let selectionPopupEl = null;

function removeSelectionPopup() {
  if (selectionPopupEl) {
    selectionPopupEl.remove();
    selectionPopupEl = null;
  }
}

function handleTextSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    removeSelectionPopup();
    return;
  }
  const text = sel.toString().trim();
  if (!text || text.length === 0) {
    removeSelectionPopup();
    return;
  }

  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const wrap = container.nodeType === 1 ? container.closest('.pdf-page-wrap') : container.parentElement?.closest('.pdf-page-wrap');
  if (!wrap) {
    removeSelectionPopup();
    return;
  }

  const s = getPdfState();
  const doc = s.docs[s.active];
  if (!doc) return;
  const pageNum = parseInt(wrap.dataset.pageNum, 10) || s.page;
  const w = doc.wrappers.find((x) => x.pageNum === pageNum);
  if (!w) return;

  const rect = range.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) {
    removeSelectionPopup();
    return;
  }

  removeSelectionPopup();

  const pop = document.createElement('div');
  pop.className = 'text-selection-popup';
  pop.innerHTML = `
    <button class="ts-btn" id="tsCopy" title="Copiar texto"><i class="ri-file-copy-line"></i> Copiar</button>
    <button class="ts-btn highlight-btn" id="tsHighlight" title="Resaltar este texto"><i class="ri-mark-pen-line"></i> Resaltar</button>
    <button class="ts-btn" id="tsAsk" title="Consultar al agente"><i class="ri-chat-smile-3-line"></i> Agente</button>
  `;

  getOverlayHost().appendChild(pop);
  selectionPopupEl = pop;

  const left = Math.max(10, Math.min(rect.left + rect.width / 2 - 110, window.innerWidth - 250));
  const top = Math.max(10, rect.top - 44);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  pop.querySelector('#tsCopy')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      toast('Texto copiado al portapapeles', 'ok');
    } catch {
      toast('Texto: ' + text.slice(0, 35), 'ok');
    }
    removeSelectionPopup();
  });

  pop.querySelector('#tsHighlight')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const clientRects = [...range.getClientRects()];
    const wrapRect = w.wrap.getBoundingClientRect();
    const rawRects = clientRects.map((cr) => ({
      x: Math.round(((cr.left - wrapRect.left) / w.scale) * 10) / 10,
      y: Math.round(((cr.top - wrapRect.top) / w.scale) * 10) / 10,
      w: Math.round((cr.width / w.scale) * 10) / 10,
      h: Math.round((cr.height / w.scale) * 10) / 10,
    })).filter((r) => r.w > 1 && r.h > 1);

    const rects = mergeWordRects(rawRects);
    if (rects.length) {
      state.pre = snapshot();
      annotsFor(doc.key, w.pageNum).push({
        type: 'highlight',
        rects,
        color: state.color || '#ffc107',
        opacity: 0.35,
        text,
      });
      commit();
      persistAnnots();
      redrawAll();
      toast('Texto resaltado con OTP', 'ok');
    }
    sel.removeAllRanges();
    removeSelectionPopup();
  });

  pop.querySelector('#tsAsk')?.addEventListener('click', (e) => {
    e.stopPropagation();
    location.hash = '#/agenda';
    const chatInput = document.querySelector('#chatInput');
    if (chatInput) {
      chatInput.value = `Sobre el documento "${doc.name}" (pág. ${w.pageNum}):\n"${text}"\n`;
      chatInput.focus();
    }
    removeSelectionPopup();
  });
}

function setTool(id) {
  const changed = state.tool !== id;
  closePopover();
  closeMeasurePanel();
  removeSelectionPopup();
  state.tool = id;
  state.drawing = null;
  state.selected = null;
  renderSelBar();
  closeTextInput();
  if (changed) {
    renderToolbar();
    if (!reduced() && !isGeo(id)) {
      anime().then(({ animate }) => {
        const btn = document.querySelector(`.tool-btn[data-tool="${id}"]`);
        if (btn) animate(btn, { scale: [0.88, 1], duration: 480, ease: 'spring({ stiffness: 240, damping: 14 })' });
      });
    }
  }
  const doc = activeDoc();
  if (doc) {
    const ws = $('#pdfWorkspace');
    ws.style.cursor = id === 'hand' ? 'grab' : id === 'select-text' ? 'text' : id === 'select' ? 'default' : 'crosshair';
    const isTextSelect = id === 'select-text';
    const textSelectable = isTextSelect || (id === 'hand' && window.EconHub.pdf?.textLayerOn?.());
    doc.wrappers.forEach((w) => {
      w.inter.style.cursor = id === 'hand' ? 'grab' : isTextSelect ? 'text' : id === 'select' ? 'default' : 'crosshair';
      w.inter.style.pointerEvents = isTextSelect || id === 'hand' ? 'none' : 'auto';
      if (w.drawCanvas) w.drawCanvas.style.pointerEvents = 'none';
      if (w.textDiv) {
        if (isTextSelect) w.textDiv.style.display = '';
        w.textDiv.style.pointerEvents = textSelectable ? 'auto' : 'none';
        w.textDiv.style.userSelect = textSelectable ? 'text' : 'none';
        if (textSelectable) {
          w.wrap.classList.add('text-select-active');
          w.textDiv.classList.add('text-select-active');
        } else {
          w.wrap.classList.remove('text-select-active');
          w.textDiv.classList.remove('text-select-active');
        }
      }
    });

    // Si es seleccionar texto o resaltar y no hay capa, lanzar OCR en la página visible
    const cur = doc.wrappers.find((w) => w.pageNum === getPdfState().page) || doc.wrappers[0];
    if (cur && (isTextSelect || state.tool === 'highlighter')) {
      const hasSpans = cur.textDiv && cur.textDiv.querySelectorAll('span').length >= 3;
      if (!hasSpans && !cur.ocrPending && !cur.ocrRunning) {
        import('./ocr.js').then((m) => m.ocrPage && m.ocrPage(cur, doc).catch(() => {}));
      }
    }
  }
  if (id !== 'eraser') { const c = $('#eraserCursor'); if (c) c.remove(); }
  redrawAll();
}

export function initTools() {
  loadPrefs();
  renderToolbar();
  $('#toolGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    const wasSame = b.dataset.tool === state.tool;
    setTool(b.dataset.tool);
    if (wasSame) {
      setTimeout(() => openPopover(b, b.dataset.tool), 80);
    }
  });
  document.addEventListener('click', (e) => {
    if (popoverEl && !e.target.closest('.tool-popover') && !e.target.closest('[data-tool]')) closePopover();
    if (state.measurePop && !e.target.closest('.measure-popover') && !e.target.closest('.pdf-interact')) closeMeasurePanel();
    if (!e.target.closest('.geo-menu') && !e.target.closest('[data-geo-menu]')) closeGeoMenu();
    if (!e.target.closest('.text-selection-popup')) {
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) removeSelectionPopup();
      }, 100);
    }
  });

  // Listener para selección de texto interactiva
  document.addEventListener('selectionchange', () => {
    clearTimeout(window._selTimeout);
    window._selTimeout = setTimeout(handleTextSelection, 120);
  });

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);
  window.EconHub.tools = { redrawPage, setTool, getState: () => state, handleTextSelection };

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'v') setTool('select');
    else if (k === 'h') setTool('hand');
    else if (k === 'p') setTool('pencil');
    else if (k === 'r') setTool('rect');
    else if (k === 'o') setTool('ellipse');
    else if (k === 'y') setTool('tri');
    else if (k === 'l') setTool('line');
    else if (k === 'q') setTool('select-text');
    else if (k === 's') setTool('text');
    else if (k === 'g') setTool('highlighter');
    else if (k === 'e') setTool('eraser');
    else if (k === 'f') { e.preventDefault(); window.EconHub.pdf?.toggleFullscreen?.(); }
    else if (k === 'arrowleft') { e.preventDefault(); window.EconHub.pdf?.nav?.(-1); }
    else if (k === 'arrowright') { e.preventDefault(); window.EconHub.pdf?.nav?.(1); }
    else if (k === '+' || k === '=') { e.preventDefault(); window.EconHub.pdf?.zoom?.(1.25); }
    else if (k === '-') { e.preventDefault(); window.EconHub.pdf?.zoom?.(0.8); }
    else if (k === 'escape') {
      state.drawing = null;
      state.geo = null;
      closeTextInput();
      closePopover();
      closeMeasurePanel();
      removeSelectionPopup();
      redrawAll();
    }
    else if ((e.ctrlKey || e.metaKey) && k === 'a') {
      const doc = activeDoc();
      if (doc && window.EconHub.tools && (location.hash || '').includes('pdf')) {
        e.preventDefault();
        const cur = getPdfState().page;
        state.selected = { pageNum: cur, indexes: new Set(annotsFor(doc.key, cur).map((_, i) => i)) };
        renderSelBar();
        redrawAll();
      }
    }
    else if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 's') { e.preventDefault(); window.EconHub.pdf?.save?.(); }
    else if (k === 'delete' || k === 'backspace') {
      const doc = activeDoc();
      if (state.selected && doc) {
        const annots = annotsFor(doc.key, state.selected.pageNum);
        const idxs = [...state.selected.indexes].sort((a, b) => b - a);
        if (idxs.length) {
          state.pre = snapshot();
          idxs.forEach((i) => annots.splice(i, 1));
          commit();
          persistAnnots();
          const n = idxs.length;
          state.selected = null;
          renderSelBar();
          redrawAll();
          if (n > 1) toast(`Borradas ${n} anotaciones`);
        }
      }
    }
  });

  document.addEventListener('pointerdown', (e) => {
    const layer = e.target.closest('.pdf-interact');
    if (!layer) return;
    if (state.tool === 'hand' || state.tool === 'select-text') return;
    onPointerDown(e, layer);
  }, true);
  document.addEventListener('pointermove', (e) => {
    const layer = e.target.closest('.pdf-interact');
    if (!layer) return;
    onPointerMove(e, layer);
  }, true);
  document.addEventListener('pointerup', (e) => {
    const layer = e.target.closest('.pdf-interact');
    if (!layer) return;
    onPointerUp(e, layer);
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (state.tool === 'eraser') updateEraserCursor(e);
  }, true);

  window.EconHub.pdf = {
    ...(window.EconHub.pdf || {}),
    nav: (d) => { const s = getPdfState(); const doc = s.docs[s.active]; if (doc) goToPageLocal(s.page + d); },
    save: () => { const ev = new CustomEvent('econhub:save'); document.dispatchEvent(ev); },
    onPagesBuilt: () => redrawAll(),
  };
}

function goToPageLocal(n) {
  window.EconHub.pdf?.nav?.(n - (getPdfState().page || 1));
}

document.addEventListener('econhub:save', () => {
  const btn = $('#saveBtn');
  if (btn) btn.click();
});
