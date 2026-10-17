// econhub · pdf-editor.js — carga, renderizado por vistas, zoom, modos de lectura,
// navegación, recientes y exportación (pdf-lib lazy) con almacenamiento IndexedDB
import { $, $$, store, toast } from './app.js';
import { READ_MODES, KEYS, uid } from './data.js';
import { pdfStorage } from './pdf-storage.js';

const DPR_CAP = 2;

let state = {
  docs: [],            // {key, name, size, pdfDoc, url, wrappers: [{pageNum, wrap, canvas, drawCanvas, inter, textDiv}], annots: {}}
  active: -1,
  scale: 1,
  readMode: 'normal',
  page: 1,
  paginated: false,
  renderTasks: {},
  textLayer: true,
};

export function getPdfState() { return state; }
export function annotsFor(docKey, pageNum) {
  const doc = state.docs.find((d) => d.key === docKey);
  if (!doc) return [];
  if (!doc.annots[pageNum]) doc.annots[pageNum] = [];
  return doc.annots[pageNum];
}

function activeDoc() { return state.docs[state.active]; }

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function renderRecents() {
  const box = $('#pdfRecents');
  if (!box) return;
  const recents = await pdfStorage.list();
  if (!recents.length) {
    box.innerHTML = '<div style="font-size:0.75rem; color:var(--muted); padding:6px 4px;">No hay documentos recientes</div>';
    return;
  }
  box.innerHTML = recents.slice(0, 8).map((r) => `
    <div class="recent-item-wrap">
      <button class="recent-btn" data-recent="${r.key}" title="Abrir ${r.name}">
        <i class="ri-file-pdf-2-line" style="color:var(--pal-info)"></i>
        <span class="recent-name">${r.name}</span>
        <span class="recent-size badge">${formatBytes(r.size)}${r.numPages ? ' · ' + r.numPages + 'p' : ''}</span>
      </button>
      <button class="recent-del-btn" data-del-recent="${r.key}" title="Eliminar de recientes">
        <i class="ri-close-line"></i>
      </button>
    </div>`).join('');
}

function renderDocList() {
  const box = $('#pdfDocList');
  box.innerHTML = state.docs.map((d, i) => `
    <div class="doc-item ${i === state.active ? 'active' : ''}" data-doci="${i}" title="${d.name}">
      <i class="ri-file-pdf-2-line" style="color:var(--pal-info)"></i>
      <span class="doc-name">${d.name}</span>
      <span class="badge">${d.pdfDoc.numPages}p</span>
    </div>`).join('');
}

function renderHist() {
  const box = $('#pdfHistList');
  const hist = store.get(KEYS.pdfHist, []);
  box.innerHTML = hist.slice(0, 30).map((h) => `<div class="hist-item">${h}</div>`).join('') || '';
}
function addHist(text) {
  const hist = store.get(KEYS.pdfHist, []);
  hist.unshift(new Date().toLocaleTimeString('es-CO') + ' · ' + text);
  store.set(KEYS.pdfHist, hist.slice(0, 100));
  renderHist();
}

async function loadPdf(file, recent = null) {
  let uint8 = null;
  let name = '';
  let key = '';
  let size = 0;

  if (recent) {
    key = recent.key;
    name = recent.name || 'Documento';
    const record = await pdfStorage.load(recent.key);
    if (record && record.uint8 && record.uint8.length > 0) {
      uint8 = record.uint8;
      name = record.name || name;
      size = record.size || uint8.length;
    } else {
      toast('No se encontró copia local de ' + name, 'err');
      return null;
    }
  } else if (file) {
    name = file.name;
    size = file.size || 0;
    key = file.name + '-' + (file.size || Date.now()) + '-' + Math.random().toString(36).slice(2, 6);
    uint8 = new Uint8Array(await file.arrayBuffer());
  }

  if (!uint8 || uint8.length < 10) {
    toast('Archivo PDF vacío o inválido', 'err');
    return null;
  }

  // Verificar cabecera básica %PDF- y ajustar offset si tiene bytes basura al inicio
  if (uint8[0] !== 0x25 || uint8[1] !== 0x50 || uint8[2] !== 0x44 || uint8[3] !== 0x46) {
    let offset = -1;
    for (let i = 0; i < Math.min(1024, uint8.length - 4); i++) {
      if (uint8[i] === 0x25 && uint8[i + 1] === 0x50 && uint8[i + 2] === 0x44 && uint8[i + 3] === 0x46) {
        offset = i;
        break;
      }
    }
    if (offset > 0) {
      uint8 = uint8.subarray(offset);
    }
  }

  // Crear copia independiente de los bytes para IndexedDB antes de que pdfjs transfiera el buffer al worker
  const storageBytes = new Uint8Array(uint8.length);
  storageBytes.set(uint8);

  try {
    const loadingTask = pdfjsLib.getDocument({ data: uint8 });
    const pdfDoc = await loadingTask.promise;
    const doc = { key, name, size, pdfDoc, url: null, wrappers: [], annots: {} };
    const saved = store.get('econhub:annots', {});
    if (saved[key]) doc.annots = saved[key];
    state.docs.push(doc);
    state.active = state.docs.length - 1;
    state.page = 1;
    state.paginated = pdfDoc.numPages > 100;
    renderDocList();
    await buildWrappers(doc);
    $('#pdfFileName').textContent = doc.name;
    $('#pageCount').textContent = pdfDoc.numPages;
    $('#pdfEmpty').classList.add('hidden');
    addHist(`Abierto ${doc.name}`);

    // Guardar copia local binaria en IndexedDB con la copia independiente no transferida
    await pdfStorage.save(key, doc.name, storageBytes, pdfDoc.numPages);
    renderRecents();

    // Fit al ancho por defecto para vista amplia
    setTimeout(fitWidth, 80);

    // Intentar recuperar anotaciones embebidas si existen (sidecar en PDF)
    try {
      const bytes = await doc.pdfDoc.getData();
      const { PDFDocument: PDFLib } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
      const tmp = await PDFLib.load(bytes, { ignoreEncryption: true });
      const subj = tmp.getSubject() || '';
      if (subj.startsWith('econhub-annotations:')) {
        const json = decodeURIComponent(escape(atob(subj.slice(20))));
        const recovered = JSON.parse(json);
        if (recovered && typeof recovered === 'object') { doc.annots = recovered; persistAnnotsForDoc(doc); }
      }
    } catch {}
    return doc;
  } catch (err) {
    const msg = String((err && err.message) || err || '');
    if (/password|encrypt/i.test(msg)) toast('PDF protegido con contraseña: no se pudo abrir', 'err');
    else if (/corrupt|invalid|format|header/i.test(msg)) toast('PDF corrupto o con formato no soportado', 'err');
    else toast('No se pudo leer el PDF: ' + msg.slice(0, 90), 'err');
  }
}

async function buildWrappers(doc) {
  const container = $('#pdfPages');
  container.innerHTML = '';
  doc.wrappers = [];
  const n = doc.pdfDoc.numPages;
  doc.baseWidth = 595; doc.baseHeight = 842;
  try {
    const p1 = await doc.pdfDoc.getPage(1);
    const bvp = p1.getViewport({ scale: 1 });
    doc.baseWidth = bvp.width; doc.baseHeight = bvp.height;
  } catch { /* placeholder A4 */ }
  const phW = doc.baseWidth * state.scale;
  const phH = doc.baseHeight * state.scale;
  for (let p = 1; p <= n; p++) {
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page-wrap';
    wrap.dataset.pageNum = p;
    wrap.dataset.rmode = state.readMode;
    wrap.style.width = phW + 'px';
    wrap.style.height = phH + 'px';
    const label = document.createElement('span');
    label.className = 'pg-label';
    label.textContent = p;
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    const drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'pdf-layer pdf-draw';
    const inter = document.createElement('canvas');
    inter.className = 'pdf-layer pdf-interact';
    const textDiv = document.createElement('div');
    textDiv.className = 'textLayer';
    wrap.append(label, textDiv, canvas, drawCanvas, inter);
    container.appendChild(wrap);
    doc.wrappers.push({
      pageNum: p, wrap, canvas, drawCanvas, inter, textDiv,
      scale: state.scale, rendered: false, scheduled: false,
      baseWidth: doc.baseWidth, baseHeight: doc.baseHeight,
    });
    if (state.paginated && p !== 1) wrap.style.display = 'none';
  }
  scheduleRenderVisible();
  window.EconHub.pdf?.onPagesBuilt?.();
}

let renderScheduled = false;
function scheduleRenderVisible() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    const doc = activeDoc();
    if (!doc) return;
    const ws = $('#pdfWorkspace');
    const top = ws.scrollTop - 700;
    const bottom = ws.scrollTop + ws.clientHeight + 700;
    let acc = 0;
    for (const w of doc.wrappers) {
      if (state.paginated && !w.rendered) continue;
      const h = w.wrap.offsetHeight || 842;
      const y = acc;
      acc = y + h + 18;
      const visible = y + h >= top && y <= bottom;
      if (visible && !w.rendered && !w.scheduled) {
        w.scheduled = true;
        renderPage(doc, w).finally(() => { w.scheduled = false; });
      } else if (!visible && !w.rendered) {
        cancelRender(doc, w);
      }
    }
  });
}

function cancelRender(doc, w) {
  const task = state.renderTasks[w.pageNum];
  if (task) { try { task.cancel(); } catch { /* noop */ } delete state.renderTasks[w.pageNum]; }
}

async function renderPage(doc, w) {
  cancelRender(doc, w);
  const pageNum = w.pageNum;
  const myScale = state.scale;
  try {
    const page = await doc.pdfDoc.getPage(pageNum);
    if (myScale !== state.scale) return;
    const baseViewport = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    const vp = page.getViewport({ scale: myScale });
    const cw = Math.floor(vp.width * dpr);
    const ch = Math.floor(vp.height * dpr);
    if (cw < 1 || ch < 1) return;

    // Render en canvas fuera de pantalla: la página visible mantiene su imagen
    // anterior hasta que el nuevo ráster está listo (sin parpadeo ni estirado).
    const buffer = w._buffer || (w._buffer = document.createElement('canvas'));
    buffer.width = cw;
    buffer.height = ch;
    const bctx = buffer.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.renderTasks[pageNum] = page.render({ canvasContext: bctx, viewport: vp, transform: undefined, enableXfa: false });
    await state.renderTasks[pageNum].promise;
    delete state.renderTasks[pageNum];
    if (myScale !== state.scale) return; // la escala cambió durante el render

    // Swap atómico hacia el canvas visible
    w.canvas.width = cw;
    w.canvas.height = ch;
    const ctx = w.canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(buffer, 0, 0);
    w.canvas.style.width = vp.width + 'px';
    w.canvas.style.height = vp.height + 'px';
    w.wrap.style.width = vp.width + 'px';
    w.wrap.style.height = vp.height + 'px';
    w.drawCanvas.width = cw;
    w.drawCanvas.height = ch;
    w.drawCanvas.style.width = vp.width + 'px';
    w.drawCanvas.style.height = vp.height + 'px';
    w.inter.width = cw;
    w.inter.height = ch;
    w.inter.style.width = vp.width + 'px';
    w.inter.style.height = vp.height + 'px';
    w.scale = myScale;
    w.baseWidth = baseViewport.width;
    w.baseHeight = baseViewport.height;
    w.rendered = true;
    w.canvas.dataset.rendered = '1';
    // Filtro de lectura inline (fuente única: data.js)
    const rm = READ_MODES.find((m) => m.id === state.readMode);
    w.canvas.style.filter = (rm && rm.filter) ? rm.filter : 'none';
    // Capa de texto seleccionable + detección OTP automática en segundo plano
    if (state.textLayer) {
      try {
        const textContent = await page.getTextContent();
        if (myScale !== state.scale) return;
        const hasText = textContent.items && textContent.items.some((it) => (it.str || '').trim().length > 3);
        if (w.textDiv) {
          w.textDiv.innerHTML = '';
          w.textDiv.style.setProperty('--scale-factor', String(myScale));
        }

        if (hasText) {
          pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: w.textDiv,
            viewport: vp,
            textDivs: [],
          });
          w.textDiv.style.display = '';
        } else if (doc.ocrCache && doc.ocrCache[pageNum]) {
          // Re-aplicar capa OCR cacheada para la nueva escala instantáneamente
          import('./ocr.js').then((m) => m.applyOcrLayer && m.applyOcrLayer(w, doc.ocrCache[pageNum]));
        } else if (!w.ocrPending && !w.ocrRunning) {
          // Si no hay texto nativo, lanzar OCR automático en segundo plano
          w.ocrPending = true;
          import('./ocr.js').then((m) => m.ocrPage && m.ocrPage(w, doc).catch(() => {}));
        }
      } catch { /* texto opcional */ }
    } else if (w.textDiv) {
      w.textDiv.style.display = 'none';
    }
    window.EconHub.tools?.redrawPage(doc.key, w);
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') w.rendered = true;
  }
}

function updateZoomLabel() {
  const z = $('#zoomVal');
  if (!z) return;
  z.textContent = Math.round(state.scale * 100) + '%';
  z.classList.remove('pop');
  void z.offsetWidth;
  z.classList.add('pop');
  setTimeout(() => z.classList.remove('pop'), 240);
}

// Redimensiona sincrónicamente el layout de todas las páginas al nuevo zoom.
// Mantiene el bitmap previo (el CSS lo escala) hasta que renderPage haga el swap,
// así no hay huecos blancos ni saltos de altura al hacer zoom.
function applyScaleToLayout(doc, scale) {
  for (const w of doc.wrappers) {
    const bw = w.baseWidth || doc.baseWidth || 595;
    const bh = w.baseHeight || doc.baseHeight || 842;
    const wd = bw * scale;
    const ht = bh * scale;
    w.wrap.style.width = wd + 'px';
    w.wrap.style.height = ht + 'px';
    w.canvas.style.width = wd + 'px';
    w.canvas.style.height = ht + 'px';
    w.drawCanvas.style.width = wd + 'px';
    w.drawCanvas.style.height = ht + 'px';
    w.inter.style.width = wd + 'px';
    w.inter.style.height = ht + 'px';
    w.scale = scale;
  }
}

// Guarda el punto (ax, ay) de la ventana como fracción dentro de la página
// que lo contiene, para poder reanclarlo tras cambiar la escala.
function captureScrollAnchor(ws, ax, ay) {
  const doc = activeDoc();
  if (!doc) return null;
  for (const w of doc.wrappers) {
    if (state.paginated && w.wrap.style.display === 'none') continue;
    const r = w.wrap.getBoundingClientRect();
    if (ax >= r.left && ax <= r.right && ay >= r.top && ay <= r.bottom) {
      return {
        wrap: w.wrap,
        fx: r.width ? (ax - r.left) / r.width : 0.5,
        fy: r.height ? (ay - r.top) / r.height : 0.5,
        ax, ay,
      };
    }
  }
  return null;
}

function restoreScrollAnchor(ws, anchor) {
  if (!anchor) return;
  const r = anchor.wrap.getBoundingClientRect();
  const px = r.left + r.width * anchor.fx;
  const py = r.top + r.height * anchor.fy;
  ws.scrollLeft += px - anchor.ax;
  ws.scrollTop += py - anchor.ay;
}

let scaleRenderTimer = null;
function setScale(scale, opts = {}) {
  const next = Math.min(4, Math.max(0.25, scale));
  if (Math.abs(next - state.scale) < 0.0005) return;
  const ws = $('#pdfWorkspace');
  const rect = ws.getBoundingClientRect();
  const ax = (opts && opts.anchorX != null) ? opts.anchorX : rect.left + ws.clientWidth / 2;
  const ay = (opts && opts.anchorY != null) ? opts.anchorY : rect.top + ws.clientHeight / 2;
  const anchor = captureScrollAnchor(ws, ax, ay);

  state.scale = next;
  updateZoomLabel();
  const doc = activeDoc();
  if (!doc) return;

  // Invalida los bitmaps visibles y ajusta el layout de inmediato (sin overlay).
  doc.wrappers.forEach((w) => { w.rendered = false; w.scheduled = false; });
  applyScaleToLayout(doc, next);

  // Reancla el punto bajo el cursor/centro para que el zoom no "salte".
  const prevBehavior = ws.style.scrollBehavior;
  ws.style.scrollBehavior = 'auto';
  restoreScrollAnchor(ws, anchor);
  ws.style.scrollBehavior = prevBehavior;

  // Re-render diferido: agrupa ráfagas de Ctrl+rueda en un solo trabajo.
  clearTimeout(scaleRenderTimer);
  scaleRenderTimer = setTimeout(() => {
    if (state.paginated) {
      const w = doc.wrappers.find((x) => x.pageNum === state.page);
      if (w) renderPage(doc, w);
    }
    scheduleRenderVisible();
  }, 110);
}

function setReadMode(id) {
  state.readMode = id;
  store.set(KEYS.readMode, id);
  const doc = activeDoc();
  if (doc) {
    doc.wrappers.forEach((w) => {
      w.wrap.dataset.rmode = id;
      const rm = READ_MODES.find((m) => m.id === id);
      if (w.canvas.style) w.canvas.style.filter = (rm && rm.filter) ? rm.filter : 'none';
      if (w.textDiv) w.textDiv.style.display = (state.textLayer && id === 'normal') ? '' : 'none';
    });
  }
  renderChips();
}

function renderChips() {
  const box = $('#readModeChips');
  box.innerHTML = READ_MODES.map((m) => `
    <button class="chip ${m.id === state.readMode ? 'on' : ''}" data-rmode="${m.id}" style="--chip-c:${m.color}" title="Modo de lectura: ${m.name}">
      <i class="${m.icon}"></i>${m.name}
    </button>`).join('');
}

function goToPage(n) {
  const doc = activeDoc();
  if (!doc) return;
  const nn = Math.min(Math.max(1, n), doc.pdfDoc.numPages);
  state.page = nn;
  $('#pageNum').value = nn;
  if (state.paginated) {
    doc.wrappers.forEach((w) => w.wrap.style.display = w.pageNum === nn ? '' : 'none');
    const w = doc.wrappers.find((x) => x.pageNum === nn);
    if (w) {
      w.wrap.setAttribute('data-page-flip', '');
      setTimeout(() => w.wrap.removeAttribute('data-page-flip'), 480);
      w.rendered = false;
      renderPage(doc, w);
    }
    // No forzar scrollTop=0, mantener posición superior con offset pequeño
    $('#pdfWorkspace').scrollTo({ top: 0, behavior: 'auto' });
  } else {
    const w = doc.wrappers.find((x) => x.pageNum === nn);
    if (w) w.wrap.scrollIntoView({ behavior: 'auto', block: 'nearest' });
  }
}

function trackPage() {
  const doc = activeDoc();
  if (!doc || state.paginated) return;
  const ws = $('#pdfWorkspace');
  const center = ws.scrollTop + ws.clientHeight / 2;
  let best = state.page;
  for (const w of doc.wrappers) {
    const off = w.wrap.offsetTop - ws.offsetTop;
    if (off <= center) best = w.pageNum;
  }
  if (best !== state.page) {
    state.page = best;
    $('#pageNum').value = best;
  }
}

function persistAnnotsForDoc(doc) {
  const saved = store.get('econhub:annots', {});
  saved[doc.key] = doc.annots;
  store.set('econhub:annots', saved);
}
async function saveAnnotations() {
  const doc = activeDoc();
  if (!doc) return;
  persistAnnotsForDoc(doc);
  // Intento File System Access (reemplazo editable)
  if (await saveWithFileSystem(doc)) return;
  addHist('Anotaciones guardadas');
  toast('Anotaciones guardadas en este navegador (usa Descargar para archivo local)', 'ok');
}

async function downloadPDF() {
  const doc = activeDoc();
  if (!doc) return toast('Abre un PDF primero', 'err');
  toast('Preparando PDF anotado…');
  try {
    const { PDFDocument, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
    const out = await PDFDocument.create();
    const src = await PDFDocument.load(await doc.pdfDoc.getData(), { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPages().map((_, i) => i));
    const font = await out.embedFont('Helvetica');
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      out.addPage(p);
      const { width, height } = p.getSize();
      const annots = doc.annots[i + 1] || [];
      for (const a of annots) {
        const col = rgb(...hexToRgb(a.color || '#127599'));
        const scaleX = width / (doc.wrappers[i]?.baseWidth || width);
        const sc = (v) => v * scaleX;
        const opacity = a.opacity ?? 1;
        const dash = a.dashed && a.type !== 'pencil' && a.type !== 'highlighter' ? [6, 5] : undefined;
        if (a.type === 'highlight') {
          const rects = a.rects || (a.w && a.h ? [{ x: a.x, y: a.y, w: a.w, h: a.h }] : []);
          for (const r of rects) {
            p.drawRectangle({
              x: sc(r.x),
              y: height - sc(r.y + r.h),
              width: sc(r.w),
              height: sc(r.h),
              color: col,
              opacity: a.opacity ?? 0.35,
            });
          }
        } else if (a.type === 'pencil' || a.type === 'highlighter') {
          const pts = a.points || [];
          if (a.type === 'highlighter') {
            for (let j = 0; j + 1 < pts.length; j++) {
              p.drawLine({ start: { x: sc(pts[j].x), y: height - sc(pts[j].y) }, end: { x: sc(pts[j + 1].x), y: height - sc(pts[j + 1].y) }, thickness: sc((a.width || 3) * 3.4), color: col, opacity: 0.35 });
            }
          } else {
            for (let j = 0; j + 1 < pts.length; j++) {
              p.drawLine({ start: { x: sc(pts[j].x), y: height - sc(pts[j].y) }, end: { x: sc(pts[j + 1].x), y: height - sc(pts[j + 1].y) }, thickness: sc(a.width || 3), color: col, opacity });
            }
          }
        } else if (a.type === 'rect') {
          p.drawRectangle({ x: sc(a.x), y: height - sc(a.y + a.h), width: sc(a.w), height: sc(a.h), borderColor: col, borderWidth: sc(a.width || 3), opacity, dashArray: dash });
        } else if (a.type === 'ellipse') {
          p.drawEllipse({ x: sc(a.x + a.w / 2), y: height - sc(a.y + a.h / 2), xScale: sc(a.w / 2), yScale: sc(a.h / 2), borderColor: col, borderWidth: sc(a.width || 3), opacity, dashArray: dash });
        } else if (a.type === 'tri') {
          p.drawPolygon({ points: [{ x: sc(a.x + a.w / 2), y: height - sc(a.y) }, { x: sc(a.x), y: height - sc(a.y + a.h) }, { x: sc(a.x + a.w), y: height - sc(a.y + a.h) }], borderColor: col, borderWidth: sc(a.width || 3), opacity });
        } else if (a.type === 'line') {
          p.drawLine({ start: { x: sc(a.x), y: height - sc(a.y) }, end: { x: sc(a.x + a.w), y: height - sc(a.y + a.h) }, thickness: sc(a.width || 3), color: col, opacity, dashArray: dash });
        } else if (a.type === 'gline') {
          p.drawLine({ start: { x: sc(a.x1), y: height - sc(a.y1) }, end: { x: sc(a.x2), y: height - sc(a.y2) }, thickness: sc(a.width || 3), color: col, opacity, dashArray: dash });
        } else if (a.type === 'gtri') {
          p.drawPolygon({ points: a.pts.map((pt) => ({ x: sc(pt.x), y: height - sc(pt.y) })), borderColor: col, borderWidth: sc(a.width || 3), opacity });
        } else if (a.type === 'garc') {
          const segs = 36;
          let sweep = a.end - a.start;
          while (sweep < 0) sweep += 2 * Math.PI;
          let d = '';
          for (let i = 0; i <= segs; i++) {
            const t = a.start + sweep * (i / segs);
            const x = a.center.x + Math.cos(t) * a.radius;
            const y = a.center.y + Math.sin(t) * a.radius;
            d += `${i === 0 ? 'M' : 'L'} ${sc(x)} ${height - sc(y)} `;
          }
          p.drawSvgPath(d, { borderColor: col, borderWidth: sc(a.width || 3), opacity });
        } else if (a.type === 'text') {
          const lines = String(a.value || '').split('\n');
          const size = a.size || 16;
          const lineH = size * 1.25;
          lines.forEach((ln, idx) => {
            p.drawText(ln, { x: sc(a.x), y: height - sc(a.y + idx * lineH), size: sc(size), font, color: col, opacity });
          });
        }
      }
    }
    const bytes = await out.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = doc.name.replace(/\.pdf$/i, '') + '-anotado.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
    addHist('Exportado PDF anotado');
    toast('PDF anotado descargado', 'ok');
  } catch (err) {
    toast('Falló la exportación: ' + err.message, 'err');
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function fitWidth() {
  const doc = activeDoc();
  if (!doc) return;
  const ws = $('#pdfWorkspace');
  const base = doc.baseWidth || doc.wrappers[0]?.baseWidth || 595;
  // Ajustar al ancho disponible para ver la página completa con un margen
  const avail = Math.max(160, ws.clientWidth - 44);
  setScale(avail / base, { anchorY: ws.getBoundingClientRect().top + 40 });
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

function toggleFullscreen() {
  const app = document.querySelector('.pdf-app') || document.querySelector('#sec-pdf');
  if (!isFullscreen()) {
    const req = app.requestFullscreen || app.webkitRequestFullscreen || app.mozRequestFullScreen || app.msRequestFullscreen;
    if (req) {
      req.call(app).catch(() => {
        const docReq = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        docReq?.call(document.documentElement).catch(() => toast('No se pudo entrar a pantalla completa', 'err'));
      });
    } else {
      const docReq = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      docReq?.call(document.documentElement).catch(() => toast('No se pudo entrar a pantalla completa', 'err'));
    }
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) exit.call(document).catch(() => {});
  }
}

async function buildAnnotatedPdfBytes(doc) {
  const { PDFDocument, rgb } = await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');
  const out = await PDFDocument.create();
  const src = await PDFDocument.load(await doc.pdfDoc.getData(), { ignoreEncryption: true });
  // Embed annots JSON as sidecar for edición futura
  try {
    const annotJson = JSON.stringify(doc.annots);
    out.setSubject('econhub-annotations:' + btoa(unescape(encodeURIComponent(annotJson))).slice(0, 2000));
    // also attach as file
    if (out.attach) {
      out.attach(new TextEncoder().encode(annotJson), 'econhub-annots.json', { mimeType: 'application/json', description: 'econhub annotations' });
    }
  } catch {}
  const pages = await out.copyPages(src, src.getPages().map((_, i) => i));
  const font = await out.embedFont('Helvetica');
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    out.addPage(p);
    const { width, height } = p.getSize();
    const annots = doc.annots[i + 1] || [];
    for (const a of annots) {
      const col = rgb(...hexToRgb(a.color || '#127599'));
      const scaleX = width / (doc.wrappers[i]?.baseWidth || width);
      const sc = (v) => v * scaleX;
      const opacity = a.opacity ?? 1;
      const dash = a.dashed && a.type !== 'pencil' && a.type !== 'highlighter' ? [6, 5] : undefined;
      if (a.type === 'highlight') {
        const rects = a.rects || (a.w && a.h ? [{ x: a.x, y: a.y, w: a.w, h: a.h }] : []);
        for (const r of rects) {
          p.drawRectangle({
            x: sc(r.x),
            y: height - sc(r.y + r.h),
            width: sc(r.w),
            height: sc(r.h),
            color: col,
            opacity: a.opacity ?? 0.35,
          });
        }
      } else if (a.type === 'pencil' || a.type === 'highlighter') {
        const pts = a.points || [];
        if (a.type === 'highlighter') {
          for (let j = 0; j + 1 < pts.length; j++) p.drawLine({ start: { x: sc(pts[j].x), y: height - sc(pts[j].y) }, end: { x: sc(pts[j + 1].x), y: height - sc(pts[j + 1].y) }, thickness: sc((a.width || 3) * 3.4), color: col, opacity: 0.35 });
        } else { for (let j = 0; j + 1 < pts.length; j++) p.drawLine({ start: { x: sc(pts[j].x), y: height - sc(pts[j].y) }, end: { x: sc(pts[j + 1].x), y: height - sc(pts[j + 1].y) }, thickness: sc(a.width || 3), color: col, opacity }); }
      } else if (a.type === 'rect') p.drawRectangle({ x: sc(a.x), y: height - sc(a.y + a.h), width: sc(a.w), height: sc(a.h), borderColor: col, borderWidth: sc(a.width || 3), opacity, dashArray: dash });
      else if (a.type === 'ellipse') p.drawEllipse({ x: sc(a.x + a.w / 2), y: height - sc(a.y + a.h / 2), xScale: sc(a.w / 2), yScale: sc(a.h / 2), borderColor: col, borderWidth: sc(a.width || 3), opacity, dashArray: dash });
      else if (a.type === 'tri') p.drawPolygon({ points: [{ x: sc(a.x + a.w / 2), y: height - sc(a.y) }, { x: sc(a.x), y: height - sc(a.y + a.h) }, { x: sc(a.x + a.w), y: height - sc(a.y + a.h) }], borderColor: col, borderWidth: sc(a.width || 3), opacity });
      else if (a.type === 'line') p.drawLine({ start: { x: sc(a.x), y: height - sc(a.y) }, end: { x: sc(a.x + a.w), y: height - sc(a.y + a.h) }, thickness: sc(a.width || 3), color: col, opacity, dashArray: dash });
      else if (a.type === 'gline') p.drawLine({ start: { x: sc(a.x1), y: height - sc(a.y1) }, end: { x: sc(a.x2), y: height - sc(a.y2) }, thickness: sc(a.width || 3), color: col, opacity, dashArray: dash });
      else if (a.type === 'gtri') p.drawPolygon({ points: a.pts.map((pt) => ({ x: sc(pt.x), y: height - sc(pt.y) })), borderColor: col, borderWidth: sc(a.width || 3), opacity });
      else if (a.type === 'garc') {
        const segs = 36;
        let sweep = a.end - a.start;
        while (sweep < 0) sweep += 2 * Math.PI;
        let d = '';
        for (let i = 0; i <= segs; i++) {
          const t = a.start + sweep * (i / segs);
          const x = a.center.x + Math.cos(t) * a.radius;
          const y = a.center.y + Math.sin(t) * a.radius;
          d += `${i === 0 ? 'M' : 'L'} ${sc(x)} ${height - sc(y)} `;
        }
        p.drawSvgPath(d, { borderColor: col, borderWidth: sc(a.width || 3), opacity });
      }
      else if (a.type === 'text') {
        const lines = String(a.value || '').split('\n');
        const size = a.size || 16;
        const lineH = size * 1.25;
        lines.forEach((ln, idx) => {
          p.drawText(ln, { x: sc(a.x), y: height - sc(a.y + idx * lineH), size: sc(size), font, color: col, opacity });
        });
      }
    }
  }
  return await out.save();
}

async function saveWithFileSystem(doc) {
  try {
    const bytes = await buildAnnotatedPdfBytes(doc);
    if (doc.fileHandle) {
      const writable = await doc.fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      // Actualizar key por nuevo tamaño
      const newKey = doc.name + '-' + bytes.length;
      const saved = store.get('econhub:annots', {});
      saved[newKey] = doc.annots;
      store.set('econhub:annots', saved);
      addHist(`Guardado en archivo local: ${doc.name}`);
      toast('PDF reemplazado con anotaciones editables', 'ok');
      return true;
    }
    if ('showSaveFilePicker' in window) {
      const handle = await showSaveFilePicker({ suggestedName: doc.name.replace(/\.pdf$/i,'')+'-anotado.pdf', types:[{description:'PDF',accept:{'application/pdf':['.pdf']}}] });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
      doc.fileHandle = handle;
      // Persist handle via IndexedDB (simple: store in global)
      window._lastHandle = handle;
      const saved = store.get('econhub:annots', {});
      const newKey = doc.name + '-' + bytes.length;
      saved[newKey] = doc.annots;
      store.set('econhub:annots', saved);
      addHist(`Guardado como ${handle.name}`);
      toast('PDF guardado localmente', 'ok');
      return true;
    }
  } catch(e) {
    if (e.name !== 'AbortError') toast('Guardado local falló: '+e.message, 'err');
  }
  return false;
}

function initUi() {
  $('#pdfInput').addEventListener('change', (e) => handleFiles(e.target.files));
  const dz = $('#pdfDrop');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
  dz.addEventListener('dragleave', () => dz.style.borderColor = '');
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.style.borderColor = ''; handleFiles(e.dataTransfer.files); });
  $('#pdfWorkspace').addEventListener('dragover', (e) => e.preventDefault());
  $('#pdfWorkspace').addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });

  $('#zoomIn').addEventListener('click', () => setScale(state.scale * 1.25));
  $('#zoomOut').addEventListener('click', () => setScale(state.scale / 1.25));
  $('#zoomVal').addEventListener('click', () => setScale(1));
  $('#zoomVal').addEventListener('dblclick', () => setScale(1));
  $('#fitBtn').addEventListener('click', fitWidth);
  $('#fsBtn').addEventListener('click', toggleFullscreen);
  ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach((evt) => {
    document.addEventListener(evt, () => {
      const btn = $('#fsBtn');
      const isFs = isFullscreen();
      if (btn) {
        btn.innerHTML = isFs ? '<i class="ri-fullscreen-exit-line"></i>' : '<i class="ri-fullscreen-line"></i>';
        btn.title = isFs ? 'Salir de pantalla completa (Esc o F)' : 'Pantalla completa (F)';
      }
      setTimeout(() => {
        scheduleRenderVisible();
        if (isFs) fitWidth();
      }, 150);
    });
  });
  const ws = $('#pdfWorkspace');
  // Ctrl+rueda = zoom anclado al cursor (la rueda normal desplaza en ambos ejes)
  ws.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setScale(state.scale * factor, { anchorX: e.clientX, anchorY: e.clientY });
  }, { passive: false });

  // ---- Paneo: herramienta Mano (H) · barra espaciadora · botón central ----
  let spaceHeld = false;
  let panDrag = null;
  const toolCursor = () => {
    const t = window.EconHub.tools?.getState?.()?.tool;
    return t === 'hand' ? 'grab' : t === 'select-text' ? 'text' : t === 'select' ? 'default' : 'crosshair';
  };
  const isHandTool = () => window.EconHub.tools?.getState?.()?.tool === 'hand';
  const wantsPan = (e) => e.button === 1 || (e.button === 0 && (isHandTool() || spaceHeld));

  ws.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
  ws.addEventListener('pointerdown', (e) => {
    if (!wantsPan(e)) return;
    e.preventDefault();
    panDrag = { x: e.clientX, y: e.clientY, left: ws.scrollLeft, top: ws.scrollTop, cursor: ws.style.cursor };
    ws.classList.remove('pdf-pan-ready');
    ws.classList.add('pdf-panning');
    ws.style.cursor = 'grabbing';
    try { ws.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  ws.addEventListener('pointermove', (e) => {
    if (!panDrag) return;
    e.preventDefault();
    ws.scrollLeft = panDrag.left - (e.clientX - panDrag.x);
    ws.scrollTop = panDrag.top - (e.clientY - panDrag.y);
  });
  const endPan = () => {
    if (!panDrag) return;
    const prev = panDrag.cursor;
    panDrag = null;
    ws.classList.remove('pdf-panning');
    if (spaceHeld) { ws.classList.add('pdf-pan-ready'); ws.style.cursor = 'grab'; }
    else { ws.classList.remove('pdf-pan-ready'); ws.style.cursor = prev || toolCursor(); }
  };
  ws.addEventListener('pointerup', endPan);
  ws.addEventListener('pointercancel', endPan);
  ws.addEventListener('mouseleave', (e) => { if (panDrag && e.buttons === 0) endPan(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return;
    if (e.target instanceof Element && e.target.matches('input, textarea, select, button, [contenteditable]')) return;
    if (!(location.hash || '').includes('pdf')) return;
    spaceHeld = true;
    if (!panDrag) { ws.classList.add('pdf-pan-ready'); ws.style.cursor = 'grab'; }
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ' && e.code !== 'Space') return;
    spaceHeld = false;
    if (!panDrag) { ws.classList.remove('pdf-pan-ready'); ws.style.cursor = toolCursor(); }
  });
  if (window.EconHub.pdf) window.EconHub.pdf.isPanning = () => spaceHeld || !!panDrag;
  $('#textLayerChk').addEventListener('change', (e) => {
    state.textLayer = e.target.checked;
    const doc = activeDoc();
    if (doc) {
      doc.wrappers.forEach((w) => { w.rendered = false; });
      setReadMode(state.readMode);
      scheduleRenderVisible();
    }
  });
  $('#pageNum').addEventListener('change', () => goToPage(+$('#pageNum').value));
  $('#pgPrev').addEventListener('click', () => goToPage(state.page - 1));
  $('#pgNext').addEventListener('click', () => goToPage(state.page + 1));

  // dropdowns de la barra
  const closeDropdowns = () => {
    const dd1 = $('#pdfDocMenu'), dd2 = $('#readModeMenu');
    [dd1, dd2].forEach((m) => {
      if (m && !m.classList.contains('hidden')) {
        gsap.to(m, { scale: 0.96, opacity: 0, y: -6, duration: 0.18, ease: 'power2.in', onComplete: () => m.classList.add('hidden') });
      }
    });
  };
  const openDropdown = (btn, menu) => {
    const m = $(menu);
    const wasHidden = m.classList.contains('hidden');
    closeDropdowns();
    if (wasHidden) {
      const rect = btn.getBoundingClientRect();
      m.classList.remove('hidden');
      m.style.position = 'fixed';
      // centrado bajo el botón (ancho aprox. del dropdown = 330px)
      m.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - 165, window.innerWidth - 330))}px`;
      m.style.top = `${rect.bottom + 8}px`;
      m.style.right = 'auto';
      m.style.zIndex = '9999';
      gsap.killTweensOf(m);
      gsap.set(m, { scale: 0.9, opacity: 0, y: -16, transformOrigin: 'top left' });
      gsap.to(m, { scale: 1, opacity: 1, y: 0, duration: 0.58, ease: 'back.out(1.55)' });
      gsap.fromTo(m.querySelectorAll('h4, .dropzone, .doc-item, .recent-btn, .hist-item'),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.32, stagger: 0.055, delay: 0.1, ease: 'power2.out', clearProps: 'transform,opacity' });
    }
  };
  $('#pdfDocBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown(e.currentTarget, '#pdfDocMenu');
  });
  $('#readModeBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown(e.currentTarget, '#readModeMenu');
  });
  $('#pdfMoreBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDropdown(e.currentTarget, '#pdfMoreMenu');
  });
  $('#pmmReadMode')?.addEventListener('click', () => { closeDropdowns(); $('#readModeBtn')?.click(); });
  $('#pmmFit')?.addEventListener('click', () => { closeDropdowns(); $('#fitBtn')?.click(); });
  $('#pmmZoomIn')?.addEventListener('click', () => { closeDropdowns(); $('#zoomIn')?.click(); });
  $('#pmmZoomOut')?.addEventListener('click', () => { closeDropdowns(); $('#zoomOut')?.click(); });
  $('#pmmUndo')?.addEventListener('click', () => { closeDropdowns(); $('#undoBtn')?.click(); });
  $('#pmmRedo')?.addEventListener('click', () => { closeDropdowns(); $('#redoBtn')?.click(); });
  $('#pmmSave')?.addEventListener('click', () => { closeDropdowns(); $('#saveBtn')?.click(); });
  $('#pmmDownload')?.addEventListener('click', () => { closeDropdowns(); $('#downloadBtn')?.click(); });
  $('#pmmFull')?.addEventListener('click', () => { closeDropdowns(); $('#fsBtn')?.click(); });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.pdf-dropdown') && !e.target.closest('#pdfDocBtn') && !e.target.closest('#readModeBtn') && !e.target.closest('#pdfMoreBtn')) closeDropdowns();
  });
  $('#pdfWorkspace').addEventListener('scroll', () => { clearTimeout(trackPage._t); trackPage._t = setTimeout(trackPage, 120); scheduleRenderVisible(); });
  window.addEventListener('resize', () => { clearTimeout(window._pr); window._pr = setTimeout(scheduleRenderVisible, 150); });
  $('#readModeChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip[data-rmode]');
    if (c) setReadMode(c.dataset.rmode);
  });
  $('#saveBtn').addEventListener('click', saveAnnotations);
  $('#downloadBtn').addEventListener('click', downloadPDF);
  $('#pdfDocList').addEventListener('click', (e) => {
    const it = e.target.closest('[data-doci]');
    if (!it) return;
    state.active = +it.dataset.doci;
    renderDocList();
    $('#pdfFileName').textContent = activeDoc().name;
    $('#pageCount').textContent = activeDoc().pdfDoc.numPages;
    buildWrappers(activeDoc());
    goToPage(1);
  });
  $('#pdfRecents').addEventListener('click', async (e) => {
    const delBtn = e.target.closest('[data-del-recent]');
    if (delBtn) {
      e.stopPropagation();
      const key = delBtn.dataset.delRecent;
      await pdfStorage.delete(key);
      renderRecents();
      toast('Documento eliminado de recientes', 'ok');
      return;
    }
    const b = e.target.closest('[data-recent]');
    if (!b) return;
    const key = b.dataset.recent;
    $('#pdfLoading').classList.remove('hidden');
    try {
      await loadPdf(null, { key });
    } finally {
      $('#pdfLoading').classList.add('hidden');
    }
  });
}

async function handleFiles(files) {
  const list = [...files].filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (!list.length) return toast('Solo archivos .pdf', 'err');
  $('#pdfLoading').classList.remove('hidden');
  for (const f of list) {
    await loadPdf(f);
  }
  $('#pdfLoading').classList.add('hidden');
}

export function initPdfEditor() {
  window.EconHub = { ...(window.EconHub || {}) };
  if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  window.EconHub.pdf = {
    nav: (d) => goToPage(state.page + d),
    zoom: (f) => setScale(state.scale * f),
    save: () => saveAnnotations(),
    toggleFullscreen,
    textLayerOn: () => state.textLayer && state.readMode === 'normal',
    onPagesBuilt: () => {},
  };
  state.readMode = store.get(KEYS.readMode, 'normal');
  renderChips();
  renderRecents();
  renderHist();
  initUi();
}
