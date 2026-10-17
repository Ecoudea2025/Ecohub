// econhub · ocr.js — OCR de alta precisión con Tesseract.js (carga lazy)
// Extracción de coordenadas reales (bbox), capa sintética fiel y caché por documento
import { $, toast } from './app.js';
import { getPdfState } from './pdf-editor.js';

let tesseractLoaded = false;
let currentWorker = null;
let currentWorkerLang = null;
let workerInitPromise = null;
let ocrQueue = Promise.resolve();

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', res);
      existing.addEventListener('error', () => rej(new Error('No se pudo cargar Tesseract')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('No se pudo cargar Tesseract (verifica la conexión)'));
    document.head.appendChild(s);
  });
}

function activePageWrapper() {
  const s = getPdfState();
  const doc = s.docs[s.active];
  if (!doc) return null;
  return doc.wrappers.find((x) => x.pageNum === s.page) || null;
}

function activePageCanvas() {
  const w = activePageWrapper();
  if (!w || !w.canvas) return null;
  const out = document.createElement('canvas');
  out.width = w.canvas.width;
  out.height = w.canvas.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(w.canvas, 0, 0);
  return out;
}

export async function ensureWorker(lang = 'spa+eng') {
  if (currentWorker && currentWorkerLang === lang) {
    return currentWorker;
  }
  if (workerInitPromise) {
    await workerInitPromise;
    if (currentWorker && currentWorkerLang === lang) return currentWorker;
  }

  workerInitPromise = (async () => {
    if (!tesseractLoaded && !window.Tesseract) {
      await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
      tesseractLoaded = true;
    }
    if (currentWorker && currentWorkerLang !== lang) {
      try { await currentWorker.terminate(); } catch { /* noop */ }
      currentWorker = null;
    }
    const create = async (targetLang) => {
      return await Tesseract.createWorker(targetLang, 1, {
        logger: (m) => {
          const loading = $('#pdfLoading');
          if (loading && m.status === 'recognizing text') {
            const pct = Math.round((m.progress || 0) * 100);
            loading.innerHTML = `<i class="ri-loader-4-line spin"></i> OCR ${pct}%…`;
            loading.classList.remove('hidden');
          }
        },
      });
    };
    let worker;
    try {
      worker = await create(lang);
    } catch {
      // Fallback a solo spa si spa+eng falla
      worker = await create('spa');
      lang = 'spa';
    }
    currentWorker = worker;
    currentWorkerLang = lang;
    return worker;
  })();

  const res = await workerInitPromise;
  workerInitPromise = null;
  return res;
}

function groupWordsIntoLines(words) {
  if (!words || !words.length) return [];
  const sorted = [...words].sort((a, b) => a.baseY - b.baseY || a.baseX - b.baseX);
  const lines = [];

  sorted.forEach((w) => {
    let line = lines.find((l) => Math.abs(l.baseY - w.baseY) < Math.max(w.baseH, l.baseH) * 0.65);
    if (!line) {
      line = {
        baseX: w.baseX,
        baseY: w.baseY,
        baseW: w.baseW,
        baseH: w.baseH,
        words: [],
      };
      lines.push(line);
    }
    line.words.push(w);
    line.baseY = Math.min(line.baseY, w.baseY);
    line.baseH = Math.max(line.baseH, w.baseH);
  });

  return lines.map((l) => {
    l.words.sort((a, b) => a.baseX - b.baseX);
    const minX = Math.min(...l.words.map((w) => w.baseX));
    const maxX = Math.max(...l.words.map((w) => w.baseX + w.baseW));
    return {
      text: l.words.map((w) => (w.text || '').trim()).filter(Boolean).join(' '),
      baseX: minX,
      baseY: l.baseY,
      baseW: maxX - minX,
      baseH: l.baseH,
    };
  });
}

/**
 * Renderiza o reposiciona la capa de texto OCR a partir de datos en caché para la escala actual.
 * Usa un span por palabra (coordenadas reales de Tesseract) para que la selección y el
 * resaltador tengan precisión a nivel de palabra; cae a líneas si no hay palabras.
 */
export function applyOcrLayer(w, ocrData) {
  if (!w || !w.textDiv || !ocrData) return;
  w.textDiv.innerHTML = '';
  w.textDiv.style.setProperty('--scale-factor', String(w.scale || 1));
  const zoom = w.scale || 1;

  const frag = document.createDocumentFragment();

  let words = Array.isArray(ocrData.words)
    ? ocrData.words.filter((wd) => wd && (wd.text || '').trim() && wd.baseW > 0 && wd.baseH > 0)
    : [];

  // Fallback: repartir cada línea en palabras proporcionalmente si Tesseract no dio words
  if (!words.length && ocrData.lines && ocrData.lines.length) {
    ocrData.lines.forEach((ln) => {
      const parts = (ln.text || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length || !(ln.baseW > 0)) return;
      const total = parts.reduce((s, p) => s + p.length, 0) || 1;
      let cx = ln.baseX;
      parts.forEach((p) => {
        const ww = ln.baseW * (p.length / total);
        words.push({ text: p, baseX: cx, baseY: ln.baseY, baseW: ww, baseH: ln.baseH });
        cx += ww;
      });
    });
  }

  if (words.length) {
    // Orden de lectura (línea por y, luego x) e índice de línea para agrupar
    const ordered = [...words].sort((a, b) => a.baseY - b.baseY || a.baseX - b.baseX);
    let lineIdx = -1;
    let lastY = null;
    let lastH = 0;
    for (const wd of ordered) {
      const text = (wd.text || '').trim();
      if (!text) continue;
      if (lastY === null || Math.abs(wd.baseY - lastY) > Math.max(wd.baseH, lastH) * 0.65) {
        lineIdx++;
        lastY = wd.baseY;
        lastH = wd.baseH;
      } else {
        lastH = Math.max(lastH, wd.baseH);
      }

      const cssX = wd.baseX * zoom;
      const cssY = wd.baseY * zoom;
      const cssW = Math.max(6, wd.baseW * zoom);
      const cssH = Math.max(6, wd.baseH * zoom);

      const span = document.createElement('span');
      span.className = 'ocr-line ocr-word';
      span.textContent = text;
      Object.assign(span.style, {
        position: 'absolute',
        left: `${cssX}px`,
        top: `${cssY}px`,
        width: `${cssW}px`,
        height: `${cssH}px`,
        fontSize: `${Math.max(6, cssH * 0.85)}px`,
        lineHeight: `${cssH}px`,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'transparent',
        whiteSpace: 'pre',
        transformOrigin: '0% 0%',
      });
      span.dataset.baseX = String(wd.baseX);
      span.dataset.baseY = String(wd.baseY);
      span.dataset.baseW = String(wd.baseW);
      span.dataset.baseH = String(wd.baseH);
      span.dataset.text = text;
      span.dataset.line = String(lineIdx);
      frag.appendChild(span);
    }
  } else if (ocrData.lines && ocrData.lines.length) {
    // Último recurso: líneas completas
    for (const ln of ocrData.lines) {
      const text = (ln.text || '').trim();
      if (!text) continue;
      const cssX = ln.baseX * zoom;
      const cssY = ln.baseY * zoom;
      const cssW = Math.max(10, ln.baseW * zoom);
      const cssH = Math.max(8, ln.baseH * zoom);
      const span = document.createElement('span');
      span.className = 'ocr-line';
      span.textContent = text;
      Object.assign(span.style, {
        position: 'absolute',
        left: `${cssX}px`,
        top: `${cssY}px`,
        width: `${cssW}px`,
        height: `${cssH}px`,
        fontSize: `${Math.max(8, cssH * 0.85)}px`,
        lineHeight: `${cssH}px`,
        fontFamily: 'Inter, system-ui, sans-serif',
        color: 'transparent',
        whiteSpace: 'pre',
        transformOrigin: '0% 0%',
      });
      span.dataset.baseX = String(ln.baseX);
      span.dataset.baseY = String(ln.baseY);
      span.dataset.baseW = String(ln.baseW);
      span.dataset.baseH = String(ln.baseH);
      span.dataset.text = text;
      frag.appendChild(span);
    }
  }

  w.textDiv.appendChild(frag);
  w.textDiv.style.display = '';
  w.textDiv.dataset.hasOcr = '1';
}

/**
 * Ejecuta OCR en una página específica de un documento, extrayendo cajas y cacheando.
 */
export async function ocrPage(w, doc, lang = 'spa+eng') {
  if (!w || !doc || !w.canvas) return;

  // Si ya está cacheado para este doc/página, solo re-aplicar
  doc.ocrCache = doc.ocrCache || {};
  if (doc.ocrCache[w.pageNum]) {
    applyOcrLayer(w, doc.ocrCache[w.pageNum]);
    return doc.ocrCache[w.pageNum];
  }

  if (w.ocrRunning) return;
  w.ocrRunning = true;
  w.ocrPending = true;

  // Instantánea congelada del canvas para que re-renders de pdf.js no interfieran
  const canvasCopy = document.createElement('canvas');
  canvasCopy.width = w.canvas.width || 1;
  canvasCopy.height = w.canvas.height || 1;
  const ctxCopy = canvasCopy.getContext('2d');
  ctxCopy.drawImage(w.canvas, 0, 0);

  const canvasW = canvasCopy.width;
  const canvasH = canvasCopy.height;
  const cssW = parseFloat(w.wrap.style.width) || (canvasW / (window.devicePixelRatio || 1));
  const zoom = w.scale || 1;
  const pxToBase = (cssW / canvasW) / zoom;

  // Encadenar en la cola para no sobrecargar CPU, con recuperación de fallos
  return (ocrQueue = ocrQueue.catch(() => {}).then(async () => {
    try {
      const worker = await ensureWorker(lang);
      const recognizePromise = worker.recognize(canvasCopy);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('OCR Timeout: el reconocimiento tardó demasiado')), 25000)
      );

      const { data } = await Promise.race([recognizePromise, timeoutPromise]);
      if (!data || !data.text || data.text.trim().length < 4) {
        w.ocrRunning = false;
        return null;
      }

      const words = [];
      const lines = [];

      if (data.words && data.words.length) {
        for (const wd of data.words) {
          const txt = (wd.text || '').trim();
          if (!txt || !wd.bbox) continue;
          const bx0 = wd.bbox.x0 * pxToBase;
          const by0 = wd.bbox.y0 * pxToBase;
          const bw = (wd.bbox.x1 - wd.bbox.x0) * pxToBase;
          const bh = (wd.bbox.y1 - wd.bbox.y0) * pxToBase;
          words.push({
            text: txt,
            baseX: bx0,
            baseY: by0,
            baseW: bw,
            baseH: bh,
            confidence: wd.confidence || 0,
          });
        }
      }

      if (data.lines && data.lines.length) {
        for (const ln of data.lines) {
          const txt = (ln.text || '').trim();
          if (!txt || !ln.bbox) continue;
          const bx0 = ln.bbox.x0 * pxToBase;
          const by0 = ln.bbox.y0 * pxToBase;
          const bw = (ln.bbox.x1 - ln.bbox.x0) * pxToBase;
          const bh = (ln.bbox.y1 - ln.bbox.y0) * pxToBase;
          lines.push({
            text: txt,
            baseX: bx0,
            baseY: by0,
            baseW: bw,
            baseH: bh,
          });
        }
      }

      // Si por alguna razón words está vacío pero hay texto en líneas
      if (!words.length && lines.length) {
        lines.forEach(ln => {
          const parts = ln.text.split(/\s+/).filter(Boolean);
          const partW = ln.baseW / Math.max(1, parts.length);
          parts.forEach((p, idx) => {
            words.push({
              text: p,
              baseX: ln.baseX + idx * partW,
              baseY: ln.baseY,
              baseW: partW * 0.92,
              baseH: ln.baseH,
              confidence: 80,
            });
          });
        });
      }

      const ocrResult = {
        text: data.text,
        words,
        lines,
        pageNum: w.pageNum,
        ts: Date.now(),
      };

      doc.ocrCache[w.pageNum] = ocrResult;
      applyOcrLayer(w, ocrResult);
      return ocrResult;
    } catch (err) {
      console.warn('[OCR Error]', err);
      if (err?.message?.includes('Timeout') && currentWorker) {
        try { await currentWorker.terminate(); } catch {}
        currentWorker = null;
      }
    } finally {
      w.ocrRunning = false;
      w.ocrPending = false;
      const loading = $('#pdfLoading');
      if (loading) {
        loading.classList.add('hidden');
        loading.innerHTML = '<i class="ri-loader-4-line spin"></i> Procesando…';
      }
    }
  }));
}

export function initOcr() {
  window.EconHub = {
    ...(window.EconHub || {}),
    ocr: { ocrPage, applyOcrLayer },
  };
}
