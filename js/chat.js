// econhub · chat.js — chatbot planeador: opencode (por defecto), Ollama, OpenAI-compatible
// opencode edita plan/agenda.json directamente (vía api/chat.php); los otros proveedores
// devuelven JSON de acciones que la página aplica a la agenda.
import { $, $$, store, toast, bus } from './app.js';
import { MODELS, KEYS, CATEGORIES, uid, todayISO, addDaysISO } from './data.js';

let _animeMod = null;
const anime = () => (_animeMod ||= import('animejs'));

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let cfg = store.get(KEYS.chatCfg, { provider: 'autonomous', model: MODELS[0], url: '', key: '' });

function agendaContext() {
  const a = window.EconHub?.getAgenda?.() || { events: [], tasks: [], goals: [], changelog: [] };
  return JSON.stringify({
    hoy: todayISO(),
    eventos: a.events.slice(0, 40),
    tareas: a.tasks.slice(0, 60),
    objetivos: a.goals,
  });
}

const APPLY_SYSTEM = `Eres el planeador de Ecohub, el hub personal de un estudiante de Economía de la Universidad de Antioquia.
El usuario te describe sus pendientes y tú planificas sin saturar: máximo ~5 tareas grandes por día, reparte la carga entre días disponibles y respeta los eventos existentes.
RESPONDE ÚNICAMENTE con un JSON válido (sin markdown, sin texto fuera del JSON) con esta forma:
{"summary":"resumen breve en español de lo que planeaste","actions":[{"op":"add_task","title":"...","date":"YYYY-MM-DD","category":"estudio","priority":"low|med|high","estMin":60},{"op":"add_event","title":"...","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","allDay":false,"recurring":"none","category":"estudio","notes":"..."},{"op":"add_goal","text":"..."},{"op":"del_task","id":"..."},{"op":"del_event","id":"..."}]}
- Usa fechas YYYY-MM-DD reales (hoy es ${todayISO()}).
- Si el usuario no da fechas, distribuye tareas en los próximos días sin saturar.
- categories válidas: ${CATEGORIES.map((c) => c.key).join(', ')}.
Contexto actual de la agenda: ${agendaContext()}
Petición del usuario: `;

function addMsg(role, text) {
  const box = $('#chatMessages');
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
  if (!reduced()) {
    anime().then(({ animate }) => {
      animate(el, {
        scale: [0.86, 1], y: [12, 0], opacity: [0, 1],
        duration: 440, ease: 'spring({ stiffness: 200, damping: 15 })',
      });
    });
  }
  return el;
}

function setBusy(on) {
  $('#chatBusy').classList.toggle('hidden', !on);
  $('#chatSend').disabled = on;
}

function applyActions(parsed) {
  const a = window.EconHub?.getAgenda?.();
  if (!a || !parsed?.actions?.length) return;
  let changed = 0;
  const log = window.EconHub?.logChange;
  for (const act of parsed.actions) {
    if (act.op === 'add_task') {
      const date = act.date && act.date.length === 10 ? act.date : todayISO();
      a.tasks.push({ id: uid(), title: act.title, date, category: act.category || 'estudio', priority: act.priority || 'med', estMin: act.estMin || null, done: false });
      if (log) log(`Agente: añadida tarea "${act.title}" (${date})`, 'opencode-web');
      changed++;
    } else if (act.op === 'add_event') {
      const date = act.date && act.date.length === 10 ? act.date : todayISO();
      a.events.push({ id: uid(), title: act.title, date, start: act.start || null, end: act.end || null, allDay: !!act.allDay, recurring: act.recurring || 'none', category: act.category || 'estudio', notes: act.notes || '', done: false });
      if (log) log(`Agente: añadido evento "${act.title}" (${date})`, 'opencode-web');
      changed++;
    } else if (act.op === 'add_goal' && act.text) {
      a.goals.push(act.text);
      if (log) log(`Agente: nuevo objetivo "${act.text}"`, 'opencode-web');
      changed++;
    } else if (act.op === 'del_task' && act.id) {
      a.tasks = a.tasks.filter((t) => t.id !== act.id);
      changed++;
    } else if (act.op === 'del_event' && act.id) {
      a.events = a.events.filter((e) => e.id !== act.id);
      changed++;
    }
  }
  if (changed) {
    store.set(KEYS.agenda, a);
    bus.dispatchEvent(new CustomEvent('agenda:changed', { detail: a }));
    syncViaServer(a);
    window.EconHub.refresh?.();
  }
}

async function syncViaServer(a) {
  try {
    await fetch('api/sync.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: a }) });
  } catch { /* sin sync */ }
}

async function askOllamaOpenAI(provider, messages) {
  const base = provider === 'ollama' ? 'http://localhost:11434/v1' : (cfg.url || 'http://localhost:11434/v1');
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.key) headers['Authorization'] = 'Bearer ' + cfg.key;
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: cfg.model.replace(/^[^/]*\//, ''), messages, temperature: 0.4, max_tokens: 1600 }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || '';
}

function parseJsonBlock(text) {
  const m = text.match(/```json\s*([\s\S]*?)```/);
  const clean = (m ? m[1] : text).replace(/^[^{\[]+/, '').replace(/[^}\]]+$/, '').trim();
  try { return JSON.parse(clean); } catch { return null; }
}

async function sendMessage(rawMessage, mode = 'chat') {
  const msg = rawMessage.trim();
  if (!msg) return;
  addMsg('user', msg);
  $('#chatInput').value = '';
  const hist = store.get(KEYS.chatHist, []);
  hist.push({ role: 'user', content: msg });
  store.set(KEYS.chatHist, hist.slice(-30));
  setBusy(true);
  try {
    let reply = '';
    if (cfg.provider === 'autonomous' || cfg.provider === 'opencode') {
      const res = await fetch('api/chat.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          model: cfg.model,
          mode,
          agenda: window.EconHub?.getAgenda?.() ?? null,
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'El bridge no respondió');
      reply = j.text || 'El agente no respondió texto.';
      await window.EconHub.reloadAgenda?.();
    } else {
      const content = APPLY_SYSTEM + msg;
      const raw = await askOllamaOpenAI(cfg.provider, [{ role: 'user', content }]);
      const parsed = parseJsonBlock(raw);
      if (parsed && Array.isArray(parsed.actions)) {
        applyActions(parsed);
        reply = parsed.summary || 'He actualizado tu agenda.';
      } else {
        reply = raw;
      }
    }
    addMsg('bot', reply);
    const h2 = store.get(KEYS.chatHist, []);
    h2.push({ role: 'assistant', content: reply });
    store.set(KEYS.chatHist, h2.slice(-30));
  } catch (err) {
    addMsg('err', 'No pude contactar al agente: ' + err.message);
  } finally {
    setBusy(false);
  }
}

function fillModels(sel) {
  sel.innerHTML = MODELS.map((m) => `<option value="${m}">${m}</option>`).join('')
    + `<option value="__custom__">otro… (escribe tu modelo)</option>`;
  sel.value = MODELS.includes(cfg.model) ? cfg.model : '__custom__';
}

export function initChat() {
  const label = $('#chatModelLabel');
  label.textContent = cfg.provider + ' · ' + cfg.model;

  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage($('#chatInput').value);
  });
  $('#chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chatForm').requestSubmit(); }
    setTimeout(() => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px'; }, 0);
  });
  $('#chatSuggests').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-s]');
    if (chip) sendMessage(chip.dataset.s);
  });

  /* Config modal */
  const ccModel = $('#ccModel');
  fillModels(ccModel);
  $('#ccProvider').value = cfg.provider;
  $('#ccUrl').value = cfg.url;
  $('#ccKey').value = cfg.key;
  const syncVis = () => {
    $('#ccUrlWrap').classList.toggle('hidden', $('#ccProvider').value !== 'openai');
    $('#ccKeyWrap').classList.toggle('hidden', $('#ccProvider').value !== 'openai');
  };
  $('#ccProvider').addEventListener('change', syncVis);
  syncVis();
  $('#chatConfigBtn').addEventListener('click', () => $('#chatConfigModal').classList.remove('hidden'));
  $('#chatConfigForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const model = ccModel.value === '__custom__' ? ($('#ccModel').selectedOptions[0] ? prompt('Modelo (formato provider/modelo):') : '') : ccModel.value;
    if (!model || !model.includes('/')) return toast('Modelo inválido: usa formato provider/modelo', 'err');
    cfg = {
      provider: $('#ccProvider').value,
      model,
      url: $('#ccUrl').value.trim(),
      key: $('#ccKey').value.trim(),
    };
    store.set(KEYS.chatCfg, cfg);
    label.textContent = cfg.provider + ' · ' + cfg.model;
    $('#chatConfigModal').classList.add('hidden');
    toast('Configuración del agente guardada', 'ok');
  });

  /* Plan de proyecto */
  $('#chatSuggests').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-s]');
    if (chip && chip.dataset.s.includes('proyecto')) {
      e.preventDefault();
      $('#projectModal').classList.remove('hidden');
    }
  });
  $('#projectForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#pjTitle').value.trim();
    const deadline = $('#pjDeadline').value;
    const context = $('#pjContext').value.trim();
    if (!title || !deadline || !context) return toast('Completa todos los campos', 'err');
    $('#projectModal').classList.add('hidden');
    const msg = `Tengo un proyecto titulado "${title}" con fecha límite el ${deadline}. Contexto: ${context}. Genera un plan semanal por etapas: reparte el trabajo en sesiones diarias realistas (máx ~5 tareas grandes por día), añade los eventos y tareas a la agenda con sus fechas, y sugiere cómo empezar hoy.`;
    sendMessage(msg, 'project');
    $('#pjTitle').value = ''; $('#pjDeadline').value = ''; $('#pjContext').value = '';
  });

  // escucha la apertura del proyecto por el chip general
  const chips = $$('#chatSuggests .chip');
  chips[1]?.addEventListener('click', () => { $('#projectModal').classList.remove('hidden'); });
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => $('#' + b.dataset.close).classList.add('hidden')));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));
}
