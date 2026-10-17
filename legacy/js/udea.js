// econhub · udea.js — iframes con pestañas: Ude@ (estudiante) y UdeA (institucional)
// Fix EJPSD0020E WASReqURL: requiere Storage Access API para cookies third-party
import { $, $$, store, toast } from './app.js';
import { KEYS } from './data.js';

const TABS = {
  udearroba: { label: 'Ude@ — Estudiante', url: 'https://udearroba.udea.edu.co/home/' },
  institucional: { label: 'UdeA — Institucional', url: 'https://www.udea.edu.co/' },
};

let activeTab = store.get(KEYS.udaTab, 'udearroba');

export function initUdea() {
  $$('#udeaTabs .tab').forEach((t) => {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      store.set(KEYS.udaTab, activeTab);
      render();
    });
  });
  $('#udeaReload').addEventListener('click', () => {
    const iframe = $('#frame-' + activeTab);
    // Forzar recarga limpia con cache bypass para regenerar WASReqURL cookie
    const url = new URL(iframe.src);
    url.searchParams.set('_econhub_reload', Date.now());
    iframe.src = url.toString();
    toast('Recargando…');
  });
  $('#udeaExternal').addEventListener('click', () => {
    window.open(TABS[activeTab].url, '_blank', 'noopener');
  });
  // Banner de cookies WAS
  const cookieBtn = $('#udeaCookieBtn');
  const cookieBanner = $('#udeaCookieBanner');
  const cookieExt = $('#udeaCookieExternal');
  if (cookieBtn) cookieBtn.addEventListener('click', activateCookies);
  if (cookieExt) cookieExt.addEventListener('click', () => window.open(TABS[activeTab].url, '_blank', 'noopener'));
  // Botones de proxy local (solución definitiva para Edge Estricto/Equilibrado)
  const proxyBtn = $('#udeaProxyBtn');
  const proxyBtn2 = $('#udeaProxyBtn2');
  const loadViaProxy = () => {
    const iframe = document.getElementById('frame-' + activeTab);
    const proxyUrl = 'api/udea-proxy.php?url=' + encodeURIComponent(TABS[activeTab].url);
    iframe.src = proxyUrl;
    showBanner(false);
    toast('Cargando UdeA vía proxy local (cookies first-party)…', 'ok');
  };
  if (proxyBtn) proxyBtn.addEventListener('click', loadViaProxy);
  if (proxyBtn2) proxyBtn2.addEventListener('click', loadViaProxy);
  
  // Auto-mostrar banner si hay error de cookies o third-party bloqueadas
  checkCookieAccess();

  // Detectar error EJPSD0020E dentro del iframe si es accesible
  ['frame-udearroba', 'frame-institucional'].forEach(id => {
    const f = document.getElementById(id);
    if (!f) return;
    f.addEventListener('load', () => {
      try {
        const doc = f.contentDocument;
        if (doc && doc.body && /EJPSD0020E|No se ha encontrado la cookie/i.test(doc.body.innerText)) {
          showBanner(true);
        }
      } catch (e) {
        // cross-origin: no podemos leer, ignorar (el banner ya se muestra por hasStorageAccess)
      }
      // Si tras 2s el iframe sigue en about:blank o error, mostrar ayuda
      if (!f.src || f.src === 'about:blank') showBanner(true);
    });
  });

  render();
}

function showBanner(show) {
  const b = $('#udeaCookieBanner');
  if (!b) return;
  b.classList.toggle('hidden', !show);
}

async function checkCookieAccess() {
  try {
    const isEdge = /Edg\//.test(navigator.userAgent);
    // Si el navegador soporta Storage Access API y estamos bloqueados, mostrar banner
    if ('hasStorageAccess' in document) {
      const hasAccess = await document.hasStorageAccess();
      if (!hasAccess) {
        showBanner(true);
        if (isEdge) console.info('[UdeA] Edge detectado: requiere Storage Access para WAS cookies');
      }
    }
    // Si cookies deshabilitadas globalmente
    if (!navigator.cookieEnabled) showBanner(true);
    // Edge Strict/Balanced puede bloquear aun con hasStorageAccess true -> mostrar pista si el iframe falla
    if (isEdge && !showBanner._shown) {
      // No forzar banner solo por ser Edge, pero preparar mensaje
    }
  } catch { /* ignorar */ }
}

async function activateCookies() {
  const btn = $('#udeaCookieBtn');
  const orig = btn ? btn.innerHTML : '';
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Activando…'; }
    
    // 1. Intentar Storage Access API (Chrome 119+, Firefox)
    if ('requestStorageAccess' in document) {
      try {
        await document.requestStorageAccess();
        toast('Acceso a cookies concedido', 'ok');
      } catch (e) {
        // Si falla, intentar vía iframe
        const iframe = document.getElementById('frame-' + activeTab);
        if (iframe && 'requestStorageAccess' in iframe) {
          try { await iframe.requestStorageAccess(); } catch {}
        }
        throw e;
      }
    }
    
    // 2. Precalentar cookies WAS: hacer fetch con credentials include al entry point
    try {
      await fetch(TABS[activeTab].url, { method: 'GET', credentials: 'include', mode: 'no-cors' });
    } catch {}

    // 3. Recargar iframe con bypass de cache
    const iframe = document.getElementById('frame-' + activeTab);
    if (iframe) {
      const url = new URL(iframe.src);
      url.searchParams.set('_econhub_reload', Date.now());
      iframe.src = url.toString();
    }
    showBanner(false);
    toast('Cookies activadas. Recargando UdeA…', 'ok');
  } catch (e) {
    const isEdge = /Edg\//.test(navigator.userAgent);
    // Intentar automáticamente vía proxy local como fallback definitivo
    try {
      const iframe = document.getElementById('frame-' + activeTab);
      const proxyUrl = 'api/udea-proxy.php?url=' + encodeURIComponent(TABS[activeTab].url);
      iframe.src = proxyUrl;
      showBanner(false);
      toast('Activando vía proxy local… Si funciona, ya no necesitas cambiar la configuración de Edge.', 'ok');
      return;
    } catch {}
    const edgeMsg = isEdge
      ? 'Edge bloqueó las cookies de terceros (Prevención de rastreo Estricta/Equilibrada). Probando vía proxy local… Si no funciona, ve a edge://settings/content/cookies → "Permitir" y añade [*.]udea.edu.co y http://localhost.'
      : 'No se pudo activar automáticamente. Probando vía proxy local…';
    // Fallback: abrir en pestaña nueva donde las cookies son first-party
    toast(edgeMsg, 'err');
    window.open(TABS[activeTab].url, '_blank', 'noopener');
    // Instrucción manual
    showBanner(true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

function render() {
  $$('#udeaTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === activeTab));
  $('#frame-udearroba').classList.toggle('hidden', activeTab !== 'udearroba');
  $('#frame-institucional').classList.toggle('hidden', activeTab !== 'institucional');
}
