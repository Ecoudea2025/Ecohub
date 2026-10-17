// econhub · calc.js — calculadora científica pro
// Precisión arbitraria con mathjs BigNumber (15-100 dígitos): cuando el resultado
// requiere muchas cifras exactas, la calculadora las entrega completas.
import { $, store, toast, bus } from './app.js';

let math = null;
let expr = '';
let lastResult = '0';
let justEvaluated = false;
let angleMode = store.get('econhub:calc_angle', 'RAD');
let precision = store.get('econhub:calcprec', 30);
const hist = store.get('econhub:calchist', []);

function loadMath() {
  if (math) return Promise.resolve(math);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjs@12.4.1/lib/browser/math.js';
    s.onload = () => {
      math = window.math;
      try { math.config({ number: 'BigNumber', precision }); } catch { /* noop */ }
      res(math);
    };
    s.onerror = () => rej(new Error('No se pudo cargar mathjs (revisa internet)'));
    document.head.appendChild(s);
  });
}

const esc = (s) => {
  let clean = s
    .replace(/÷/g, '/')
    .replace(/×/g, '*')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt')
    .replace(/%/g, '/100')
    .replace(/\|x\|/g, 'abs')
    // Infix combinations: e.g. "5 nCr 2" -> "combinations(5, 2)"
    .replace(/(\d+(?:[.,]\d+)?)\s*nCr\s*(\d+(?:[.,]\d+)?)/gi, 'combinations($1, $2)')
    .replace(/nCr\s*\(/gi, 'combinations(')
    // Logaritmos:
    // log(...) en pantalla es logaritmo decimal (base 10) -> mathjs log10(...)
    // ln(...) en pantalla es logaritmo natural (base e) -> mathjs log(...)
    .replace(/\blog\(/g, 'log10(')
    .replace(/\bln\(/g, 'log(')
    // Operador mod con espacios para evitar símbolos pegados como mod2
    .replace(/\s*mod\s*/g, ' mod ');

  // Soporte para modo grados sexagesimales (DEG) en funciones trigonométricas
  if (angleMode === 'DEG') {
    clean = clean.replace(/\b(sin|cos|tan)\(([^)]+)\)/gi, '$1(($2) deg)');
  }

  // Proteger separador de argumentos en funciones como combinations(a, b)
  clean = clean.replace(/(combinations\s*\([^,;\)]+)[,;](\s*[^,\)]+\))/gi, '$1__ARGSEP__$2');
  // Convertir comas decimales a puntos
  clean = clean.replace(/,/g, '.');
  // Restaurar separador de argumentos
  clean = clean.replace(/__ARGSEP__/g, ',');
  return clean;
};

const pretty = (s) => s
  .replace(/\//g, '÷')
  .replace(/\*/g, '×')
  .replace(/-/g, '−')
  .replace(/pi/g, 'π')
  .replace(/sqrt/g, '√')
  .replace(/\/100/g, '%')
  .replace(/log10\(/g, 'log(')
  .replace(/combinations\(/g, 'nCr(')
  .replace(/abs\(/g, '|x|(');

const ROWS = [
  [['AC', 'util'], ['(', 'fn'], [')', 'fn'], ['⌫', 'util'], ['%', 'fn'], ['÷', 'op']],
  [['sin', 'fn'], ['cos', 'fn'], ['tan', 'fn'], ['ln', 'fn'], ['log', 'fn'], ['×', 'op']],
  [['√', 'fn'], ['x²', 'fn'], ['x^y', 'fn'], ['e', 'fn'], ['π', 'fn'], ['−', 'op']],
  [['7', 'num'], ['8', 'num'], ['9', 'num'], ['exp(', 'fn'], ['|x|', 'fn'], ['+', 'op']],
  [['4', 'num'], ['5', 'num'], ['6', 'num'], ['10^x', 'fn'], ['Ans', 'fn'], ['nCr', 'fn']],
  [['1', 'num'], ['2', 'num'], ['3', 'num'], ['mod', 'fn'], ['±', 'fn'], ['=', 'eq']],
  [['00', 'num'], ['0', 'num'], [',', 'num'], ['1/x', 'fn'], ['!', 'fn']],
];

const LABELS = { 'x²': 'x²', '√': '√', '1/x': '1/x', '±': '±', 'Ans': 'Ans', '00': '00', 'x^y': 'xʸ', '10^x': '10ˣ', '|x|': '|x|', 'exp(': 'eˣ', 'nCr': 'nCr' };

function paintDisplay() {
  const d = $('#cdExpr');
  if (d) {
    if (justEvaluated) {
      d.textContent = (expr || '') + ' =';
    } else {
      d.textContent = expr || '\u00A0';
    }
  }
  const r = $('#cdResult');
  if (r) {
    if (lastResult !== 'Error') r.style.color = '';
    r.textContent = lastResult;
  }
}

function pressKey(k) {
  clearTimeout(resultTimer);

  if (justEvaluated) {
    justEvaluated = false;
    // Operaciones de encadenamiento: continúan con el resultado anterior
    if (['+', '−', '×', '÷', '^', 'mod', '%', 'x²', 'x^y'].includes(k)) {
      expr = (lastResult !== '0' && lastResult !== 'Error') ? lastResult : '';
    } else if (k === '⌫') {
      expr = '';
      lastResult = '0';
      paintDisplay();
      return;
    } else if (k === 'AC') {
      expr = '';
      lastResult = '0';
      paintDisplay();
      return;
    } else if (k !== '=') {
      // Nuevos números o funciones inician expresión limpia
      expr = '';
    }
  }

  if (k === 'AC') {
    expr = '';
    lastResult = '0';
  } else if (k === '⌫') {
    if (expr.endsWith(' mod ')) expr = expr.slice(0, -5);
    else if (expr.endsWith(' nCr ')) expr = expr.slice(0, -5);
    else expr = expr.slice(0, -1);
  } else if (k === '=') {
    evaluate();
    return;
  } else if (k === '±') {
    if (!expr || expr === '0') {
      expr = '−';
    } else {
      const m = expr.match(/([−-]?\s*\d+(?:[.,]\d+)?)$/);
      if (m) {
        const val = m[1].trim();
        const toggled = val.startsWith('−') || val.startsWith('-') ? val.replace(/^[−-]/, '') : '−' + val;
        expr = expr.slice(0, -m[0].length) + toggled;
      } else {
        expr = expr.startsWith('−') || expr.startsWith('-') ? expr.replace(/^[−-]/, '') : '−' + expr;
      }
    }
  } else if (k === 'Ans') {
    expr += (lastResult !== '0' && lastResult !== 'Error' ? lastResult : '');
  } else if (k === '1/x') {
    const match = expr.match(/(\d+(?:[.,]\d+)?|\([^)]+\))$/);
    if (match) {
      expr = expr.slice(0, -match[0].length) + '1/(' + match[0] + ')';
    } else {
      expr += '1/(';
    }
  } else if (k === '√') {
    expr += '√(';
  } else if (k === 'x²') {
    expr += '^2';
  } else if (k === 'x^y') {
    expr += '^';
  } else if (k === '10^x') {
    expr += '10^';
  } else if (k === '|x|') {
    expr += '|x|(';
  } else if (k === 'nCr') {
    if (/[\d\)]$/.test(expr.trim())) {
      expr += ' nCr ';
    } else {
      expr += 'nCr(';
    }
  } else if (k === 'mod') {
    expr += ' mod ';
  } else if (k === ',' || k === '.') {
    expr += ',';
  } else if (k === 'exp(') {
    expr += 'exp(';
  } else if (k === 'sin' || k === 'cos' || k === 'tan' || k === 'ln' || k === 'log') {
    expr += k + '(';
  } else {
    expr += k;
  }
  paintDisplay();
}

let resultTimer = null;
async function evaluate() {
  const raw = expr.trim();
  if (!raw) return;
  let s = raw;
  let open = 0;
  for (const ch of s) { if (ch === '(') open++; else if (ch === ')') open--; }
  if (open > 0) s += ')'.repeat(open);
  clearTimeout(resultTimer);
  try {
    const m = await loadMath();
    const val = m.evaluate(esc(s));
    const out = m.format(val, { precision });
    lastResult = out;
    expr = pretty(raw);
    justEvaluated = true;
    hist.unshift(`${pretty(raw)} = ${out}`);
    store.set('econhub:calchist', hist.slice(0, 12));
    renderHist();
    paintDisplay();
  } catch (err) {
    lastResult = 'Error';
    justEvaluated = false;
    const r = $('#cdResult');
    if (r) r.style.color = '#ff9b9b';
    paintDisplay();
    resultTimer = setTimeout(() => {
      lastResult = '0';
      if (r) r.style.color = '';
      paintDisplay();
    }, 1600);
  }
}

function renderHist() {
  const box = $('#calcHistList');
  if (!box) return;
  box.innerHTML = hist.slice(0, 12).map((h) => `<button class="chg-item hist-chip" data-h="${h}">${h}</button>`).join('')
    || '<p class="today-empty">Historial vacío</p>';
}

function buildCalc() {
  const box = $('#calcBody');
  box.innerHTML = `
    <div class="calc-shell">
      <div class="calc-head">
        <span class="calc-brand"><i class="ri-calculator-fill"></i> SCI·PRO</span>
        <div class="calc-head-btns">
          <button class="calc-mini-btn" id="angleBtn" title="Unidad angular (RAD o DEG)"><i class="ri-compass-3-line"></i> <b id="angleLabel">${angleMode}</b></button>
          <button class="calc-mini-btn" id="precBtn" title="Precisión de resultados"><i class="ri-settings-3-line"></i> <b id="precLabel">${precision}</b></button>
          <button class="calc-mini-btn" id="histBtn" title="Historial"><i class="ri-history-line"></i></button>
          <div class="pdf-dropdown hidden" id="histMenu" style="position:absolute;top:calc(100% + 6px);right:0">
            <h4 style="margin-top:0">Historial (clic para reutilizar)</h4>
            <div id="calcHistList"></div>
          </div>
        </div>
      </div>
      <div class="calc-display">
        <div class="cd-expr" id="cdExpr">&nbsp;</div>
        <div class="cd-result" id="cdResult">0</div>
      </div>
      <div class="calc-keypad" id="calcKeypad"></div>
    </div>`;
  const kp = $('#calcKeypad');
  kp.innerHTML = ROWS.map((row) => row.map(([k, type]) => `
    <button class="ckey ck-${type}" data-k="${k}">${LABELS[k] || k}</button>`).join('')).join('');
  kp.addEventListener('click', (e) => {
    const b = e.target.closest('.ckey[data-k]');
    if (b) pressKey(b.dataset.k);
  });

  // historial dropdown
  $('#histBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#histMenu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#histMenu, #histBtn')) $('#histMenu').classList.add('hidden');
  });
  $('#calcHistList').addEventListener('click', (e) => {
    const c = e.target.closest('.hist-chip[data-h]');
    if (!c) return;
    const h = c.dataset.h;
    const eq = h.split('=')[0].trim();
    expr = eq;
    lastResult = h.split('=').slice(1).join('=').trim();
    paintDisplay();
    evaluate();
    $('#histMenu').classList.add('hidden');
  });

  // modo angular RAD / DEG
  $('#angleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    angleMode = angleMode === 'RAD' ? 'DEG' : 'RAD';
    store.set('econhub:calc_angle', angleMode);
    $('#angleLabel').textContent = angleMode;
    toast(`Modo angular: ${angleMode}`, 'ok');
  });

  // precisión
  $('#precBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const p = prompt('Precisión en dígitos (15-100):', String(precision));
    const v = parseInt(p, 10);
    if (!isNaN(v) && v >= 15 && v <= 100) {
      precision = v;
      store.set('econhub:calcprec', precision);
      $('#precLabel').textContent = precision;
      try { math?.config({ number: 'BigNumber', precision }); } catch { /* noop */ }
      toast(`Precisión: ${precision} dígitos`, 'ok');
    }
  });

  paintDisplay();
  renderHist();
  document.addEventListener('keydown', handleKeys);
}

function handleKeys(e) {
  if (e.target instanceof Element && e.target.matches('input, textarea, select')) return;
  if (!$('#calcKeypad')) return;
  const map = { '*': '×', 'x': '×', 'X': '×', '/': '÷', '-': '−', ',': ',', '.': ',', Enter: '=', Backspace: '⌫', Escape: 'AC' };
  const k = map[e.key] ?? e.key;
  if (/^[0-9().+^%!,]$/.test(k) || ['×', '÷', '−', '=', '⌫', 'AC', 'π', 'e'].includes(k)) {
    e.preventDefault();
    pressKey(k);
  }
}

export function initCalc() {
  let built = false;
  const maybe = () => {
    if (!built && (location.hash || '').includes('herramientas')) {
      built = true;
      buildCalc();
    }
  };
  maybe();
  bus.addEventListener('route:changed', maybe);
}
