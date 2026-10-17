// econhub · agenda.js — calendario privado (Google Calendar de econhub)
// Persistencia: localStorage + espejo plan/agenda.json vía api/sync.php (editable por opencode)
import { $, $$, store, toast, bus } from './app.js';
import { CATEGORIES, catColor, KEYS, AGENDA_SCHEMA, uid, todayISO, addDaysISO, fmtDate } from './data.js';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DOWS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

let agenda = structuredClone(AGENDA_SCHEMA);
let view = 'month';
let cursor = new Date();
let selectedDate = todayISO();
let syncTimer = null;
let lastLocalEdit = 0;

export function getAgenda() { return agenda; }

export async function reloadAgenda() {
  await loadFromServer();
  renderCalendar();
}
export function logChange(text, agent = 'econhub') {
  agenda.changelog.unshift({ ts: new Date().toISOString(), agent, text });
  agenda.changelog = agenda.changelog.slice(0, 200);
}

function persist(server = true) {
  lastLocalEdit = Date.now();
  store.set(KEYS.agenda, agenda);
  if (server) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncToServer, 900);
  }
  bus.dispatchEvent(new CustomEvent('agenda:changed', { detail: agenda }));
}

async function syncToServer() {
  try {
    const res = await fetch('api/sync.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: agenda }),
    });
    const j = await res.json();
    if (j.ok) bus.dispatchEvent(new CustomEvent('agenda:synced'));
    else toast('No se pudo sincronizar la agenda: ' + (j.error || ''), 'err');
  } catch {
    toast('Sin sync: el espejo plan/agenda.json no se actualizó', 'err');
  }
}

async function loadFromServer() {
  try {
    const res = await fetch('api/sync.php');
    const j = await res.json();
    if (!j.ok || !j.data) return;
    const remote = j.data;
    // Preferir la versión más reciente: si localStorage tiene cambios posteriores, se sobreescriben después.
    const local = store.get(KEYS.agenda);
    if (local && Array.isArray(local.changelog) && local.changelog.length && lastLocalEdit === 0) {
      const localTs = local.changelog[0]?.ts || '';
      const remoteTs = remote.changelog?.[0]?.ts || '';
      if (localTs >= remoteTs) return; // local ya está al día (o más)
    }
    agenda = { ...AGENDA_SCHEMA, ...remote, changelog: remote.changelog || [] };
    store.set(KEYS.agenda, agenda);
    bus.dispatchEvent(new CustomEvent('agenda:changed', { detail: agenda }));
  } catch { /* offline: seguir con localStorage */ }
}

function eventOccursOn(ev, date) {
  if (ev.date === date) return true;
  if (!ev.recurring || ev.recurring === 'none') return false;
  if (ev.date > date) return false;
  const start = new Date(ev.date + 'T12:00:00');
  const target = new Date(date + 'T12:00:00');
  const diffDays = Math.round((target - start) / 86400000);
  if (ev.recurring === 'daily') return true;
  if (ev.recurring === 'weekly') return diffDays % 7 === 0;
  if (ev.recurring === 'monthly') return start.getDate() === target.getDate();
  return false;
}

function eventsOn(date) {
  return agenda.events.filter((e) => eventOccursOn(e, date) && !e.done);
}
function tasksOn(date) {
  return agenda.tasks.filter((t) => t.date === date);
}

/* ---------- Render ---------- */
function calTitle() {
  const d = cursor;
  if (view === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (view === 'week') {
    const mon = addDaysISO(dateToISO(d), 1 - ((d.getDay() + 6) % 7));
    const sun = addDaysISO(mon, 6);
    return `${fmtDate(mon)} — ${fmtDate(sun)}`;
  }
  return fmtDate(dateToISO(d));
}

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function evChip(ev, date) {
  const time = ev.allDay ? '' : `<small>${ev.start || ''}${ev.end ? '–' + ev.end : ''}</small>`;
  return `<div class="cal-ec ${ev.done ? 'done' : ''}" data-ecid="${ev.id}" title="${ev.title}" style="background:${catColor(ev.category)}">
    ${ev.start ? ev.start + ' ' : ''}${ev.title}
  </div>`;
}

function renderCalendar() {
  const cal = $('#calendar');
  const titleEl = $('#calTitle');
  if (titleEl) titleEl.textContent = calTitle();
  const iso = dateToISO(cursor);
  const curSelected = selectedDate || todayISO();
  if (view === 'month') {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const gridStart = addDaysISO(dateToISO(first), -offset);
    let html = '<div class="cal-m-grid cal-m-dow">' + DOWS.map((d) => `<div>${d}</div>`).join('') + '</div><div class="cal-m-grid">';
    const today = todayISO();
    for (let i = 0; i < 42; i++) {
      const d = addDaysISO(gridStart, i);
      const inMonth = d.slice(0, 7) === iso.slice(0, 7);
      const evs = eventsOn(d);
      const ts = tasksOn(d);
      const doneDay = ts.length > 0 && ts.every((t) => t.done);
      const isSel = d === curSelected;
      html += `<div class="cal-cell ${inMonth ? '' : 'other'} ${d === today ? 'today' : ''} ${isSel ? 'selected' : ''}" data-date="${d}">
        <span class="dnum ${doneDay ? 'done-day' : ''}">${+d.slice(8)}</span>
        ${evs.slice(0, 3).map((e) => evChip(e, d)).join('')}
        ${evs.length > 3 ? `<div class="cal-ec" style="background:var(--panel-2);color:var(--muted)">+${evs.length - 3} más</div>` : ''}
        ${ts.slice(0, 1).map((t) => `<div class="cal-ec ${t.done ? 'done' : ''}" title="Tarea: ${t.title}" style="background:${catColor(t.category)}">• ${t.title}</div>`).join('')}
      </div>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  } else if (view === 'week') {
    const mon = addDaysISO(iso, 1 - ((cursor.getDay() + 6) % 7));
    let html = '<div class="cal-w-list">';
    for (let i = 0; i < 7; i++) {
      const d = addDaysISO(mon, i);
      const evs = eventsOn(d);
      const ts = tasksOn(d);
      const isToday = d === todayISO();
      const isSel = d === curSelected;
      html += `<div class="cal-w-day ${isToday ? 'today' : ''} ${isSel ? 'selected' : ''}" data-date="${d}">
        <h4>${fmtDate(d)} ${isToday ? '<span class="badge accent-badge">Hoy</span>' : ''}</h4>
        ${evs.length + ts.length ? '' : '<small style="color:var(--muted)">Sin compromisos</small>'}
        ${evs.map((e) => `<div class="cal-event ${e.done ? 'done' : ''}" data-evid="${e.id}" style="--ev-c:${catColor(e.category)}">
          <span class="ce-time">${e.allDay ? 'Todo el día' : e.start || ''}</span>
          <div class="ce-body"><b>${e.title}</b><small>${e.notes || (e.recurring && e.recurring !== 'none' ? 'Recurrente ' + e.recurring : '')}</small></div>
        </div>`).join('')}
        ${ts.map((t) => `<div class="cal-event ${t.done ? 'done' : ''}" data-taskid="${t.id}" style="--ev-c:${catColor(t.category)}">
          <span class="ce-time">${t.estMin ? '~' + t.estMin + 'm' : ''}</span>
          <div class="ce-body"><b>${t.title}</b><small>Tarea · ${t.priority || 'med'}</small></div>
        </div>`).join('')}
      </div>`;
    }
    html += '</div>';
    cal.innerHTML = html;
  } else {
    const evs = eventsOn(iso);
    const ts = tasksOn(iso);
    const all = [...evs.map((e) => ({ ...e, kind: 'e' })), ...ts.map((t) => ({ ...t, kind: 't' }))]
      .sort((a, b) => (a.start || '99').localeCompare(b.start || '99'));
    cal.innerHTML = `<div class="cal-day-list">
      ${all.length ? all.map((it) => it.kind === 'e'
        ? `<div class="cal-event ${it.done ? 'done' : ''}" data-evid="${it.id}" style="--ev-c:${catColor(it.category)}">
            <span class="ce-time">${it.allDay ? 'Todo el día' : it.start || ''}</span>
            <div class="ce-body"><b>${it.title}</b><small>${it.notes || ''}</small></div>
          </div>`
        : `<div class="cal-event ${it.done ? 'done' : ''}" data-taskid="${it.id}" style="--ev-c:${catColor(it.category)}">
            <span class="ce-time">${it.estMin ? '~' + it.estMin + 'm' : ''}</span>
            <div class="ce-body"><b>${it.title}</b><small>Tarea · ${it.priority || 'med'}</small></div>
          </div>`).join('')
        : '<p class="today-empty">Día libre. ¡Aprovecha!</p>'}
    </div>`;
  }
  renderDayTasks();
  renderChangelog();
}

function renderDayTasks() {
  const box = $('#dayTasks');
  const date = selectedDate || todayISO();
  const ts = tasksOn(date);
  box.innerHTML = ts.length ? ts.map((t) => `
    <div class="task-item ${t.done ? 'done' : ''}" data-taskid="${t.id}">
      <input type="checkbox" ${t.done ? 'checked' : ''} aria-label="Completar">
      <span class="t-prio" style="background:${t.priority === 'high' ? '#ef5350' : t.priority === 'low' ? '#9e9e9e' : '#ffc107'}"></span>
      <span class="t-title">${t.title}</span>
      ${t.estMin ? `<small style="color:var(--muted)">${t.estMin}m</small>` : ''}
      <button class="t-del" title="Eliminar"><i class="ri-close-line"></i></button>
    </div>`).join('')
    : '<p class="today-empty">Sin tareas para este día.</p>';
}

function renderChangelog() {
  const box = $('#changelog');
  box.innerHTML = agenda.changelog.slice(0, 25).map((c) => `
    <div class="chg-item">
      <span class="chg-ts">${new Date(c.ts).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${c.agent}</span>
      ${c.text}
    </div>`).join('') || '<p class="today-empty">Sin actividad aún.</p>';
}

/* ---------- Modal eventos ---------- */
let editingEventId = null;
function openEventModal(date, ev = null) {
  editingEventId = ev?.id || null;
  $('#evTitle').textContent = ev ? 'Editar evento' : 'Nuevo evento';
  $('#evName').value = ev?.title || '';
  $('#evDate').value = ev?.date || date;
  $('#evAllDay').checked = ev?.allDay || false;
  $('#evStart').value = ev?.start || '';
  $('#evEnd').value = ev?.end || '';
  $('#evRecur').value = ev?.recurring || 'none';
  $('#evCat').value = ev?.category || 'estudio';
  $('#evNotes').value = ev?.notes || '';
  $('#evDelete').classList.toggle('hidden', !ev);
  $('#eventModal').classList.remove('hidden');
}

function closeModal(id) { $('#' + id).classList.add('hidden'); }

function saveEvent(e) {
  e.preventDefault();
  const start = $('#evAllDay').checked ? null : ($('#evStart').value || null);
  const end = $('#evAllDay').checked ? null : ($('#evEnd').value || null);
  if (start && end && end <= start) return toast('La hora de fin debe ser después del inicio', 'err');
  const data = {
    title: $('#evName').value.trim(),
    date: $('#evDate').value,
    start,
    end,
    allDay: $('#evAllDay').checked,
    recurring: $('#evRecur').value,
    category: $('#evCat').value,
    notes: $('#evNotes').value.trim(),
  };
  if (!data.title || !data.date) return toast('Título y fecha son obligatorios', 'err');
  if (editingEventId) {
    const ev = agenda.events.find((x) => x.id === editingEventId);
    if (ev) Object.assign(ev, data);
    logChange(`Actualizado evento "${data.title}" (${data.date})`);
  } else {
    agenda.events.push({ id: uid(), done: false, ...data });
    logChange(`Añadido evento "${data.title}" (${data.date})`);
  }
  closeModal('eventModal');
  persist();
  renderCalendar();
  toast(editingEventId ? 'Evento actualizado' : 'Evento creado', 'ok');
  editingEventId = null;
}

/* ---------- ICS ---------- */
function icsDate(d, t) {
  const base = d.replace(/-/g, '');
  if (!t) return base;
  return base + 'T' + t.replace(':', '') + '00';
}
function exportICS() {
  if (!agenda.events.length) return toast('No hay eventos para exportar', 'err');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//econhub//ES', 'CALSCALE:GREGORIAN'];
  for (const ev of agenda.events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@econhub`);
    lines.push(`SUMMARY:${ev.title.replace(/[;,]/g, '\\$&')}`);
    lines.push(`DTSTART:${icsDate(ev.date, ev.start)}`);
    if (ev.end && !ev.allDay) lines.push(`DTEND:${icsDate(ev.date, ev.end)}`);
    if (ev.allDay) lines.push('DTEND;VALUE=DATE:' + icsDate(addDaysISO(ev.date, 1)));
    if (ev.recurring && ev.recurring !== 'none') {
      const r = ev.recurring === 'daily' ? 'FREQ=DAILY' : ev.recurring === 'weekly' ? 'FREQ=WEEKLY' : 'FREQ=MONTHLY';
      lines.push('RRULE:' + r);
    }
    if (ev.notes) lines.push(`DESCRIPTION:${ev.notes.replace(/[;,]/g, '\\$&')}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'econhub-agenda.ics';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('ICS exportado — impórtalo en Google Calendar', 'ok');
}

function importICS(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const txt = String(reader.result).replace(/\r\n/g, '\n');
    const vevents = txt.split(/BEGIN:VEVENT/).slice(1);
    let added = 0;
    for (const block of vevents) {
      const get = (k) => {
        const m = block.match(new RegExp(k + '[^:]*:(.*?)(?=\\n[A-Z][A-Z;]|$)', 's'));
        return m ? m[1].trim() : '';
      };
      const dtstart = get('DTSTART');
      if (!/^\d{8}/.test(dtstart)) continue;
      const date = dtstart.slice(0, 4) + '-' + dtstart.slice(4, 6) + '-' + dtstart.slice(6, 8);
      const hasTime = dtstart.includes('T');
      const start = hasTime ? dtstart.slice(9, 11) + ':' + dtstart.slice(11, 13) : null;
      const rrule = get('RRULE');
      const recurring = rrule.includes('DAILY') ? 'daily' : rrule.includes('WEEKLY') ? 'weekly' : rrule.includes('MONTHLY') ? 'monthly' : 'none';
      const title = get('SUMMARY') || 'Evento importado';
      agenda.events.push({ id: uid(), title, date, start, end: null, allDay: !hasTime, recurring, category: 'estudio', notes: get('DESCRIPTION'), done: false });
      added++;
    }
    if (added) {
      logChange(`Importados ${added} eventos desde .ics`);
      persist();
      renderCalendar();
      toast(`${added} eventos importados`, 'ok');
    } else toast('No se encontraron eventos en el archivo', 'err');
  };
  reader.readAsText(file);
}

/* ---------- Notificaciones ---------- */
let bellTimer = null;
function setupBell() {
  const btn = $('#bellBtn');
  if (!btn) return;
  const syncBell = () => {
    const isOk = !!store.get('econhub:notif', false);
    btn.classList.toggle('on', isOk);
    btn.setAttribute('aria-pressed', String(isOk));
    return isOk;
  };
  syncBell();

  btn.addEventListener('click', async () => {
    const isOk = !!store.get('econhub:notif', false);
    if (isOk) {
      store.set('econhub:notif', false);
      syncBell();
      if (bellTimer) { clearInterval(bellTimer); bellTimer = null; }
      toast('Recordatorios desactivados');
      return;
    }
    if (!('Notification' in window)) return toast('Tu navegador no soporta notificaciones', 'err');
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      store.set('econhub:notif', true);
      syncBell();
      toast('Recordatorios activados. Avisaré de tus eventos.', 'ok');
      checkReminders();
      if (!bellTimer) bellTimer = setInterval(checkReminders, 60000);
    } else {
      toast('Permiso denegado', 'err');
    }
  });

  if (store.get('econhub:notif', false)) {
    checkReminders();
    if (!bellTimer) bellTimer = setInterval(checkReminders, 60000);
  }
}
let notified = new Set();
function checkReminders() {
  if (!store.get('econhub:notif', false)) return;
  const now = new Date();
  const iso = todayISO();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const ev of eventsOn(iso)) {
    if (!ev.start || ev.done) continue;
    const [h, m] = ev.start.split(':').map(Number);
    const startMin = h * 60 + m;
    const key = ev.id + iso;
    if (startMin - nowMin <= 10 && startMin - nowMin > 0 && !notified.has(key)) {
      notified.add(key);
      try {
        new Notification('econhub — ' + ev.title, { body: `Empieza a las ${ev.start}`, tag: key });
      } catch { /* noop */ }
    }
  }
}

/* ---------- Init ---------- */
export function initAgenda() {
  const local = store.get(KEYS.agenda);
  if (local && Array.isArray(local.events)) agenda = { ...AGENDA_SCHEMA, ...local };
  window.EconHub = { ...(window.EconHub || {}), getAgenda, logChange, catColor, reloadAgenda, refresh: renderCalendar };

  loadFromServer().then(() => {
    bus.dispatchEvent(new CustomEvent('agenda:changed', { detail: agenda }));
    renderCalendar();
  });

  const sel = $('#evCat');
  sel.innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.name}</option>`).join('');

  $('#calPrev').addEventListener('click', () => {
    cursor = view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
      : view === 'week' ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7)
      : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    renderCalendar();
  });
  $('#calNext').addEventListener('click', () => {
    cursor = view === 'month' ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      : view === 'week' ? new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7)
      : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    renderCalendar();
  });
  $('#calToday').addEventListener('click', () => { cursor = new Date(); selectedDate = todayISO(); renderCalendar(); });

  /* Drag & drop de eventos entre días (vista mes) */
  let dragEv = null;
  $('#calendar').addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.cal-ec[data-ecid]');
    if (!chip || view !== 'month') return;
    dragEv = { id: chip.dataset.ecid, from: chip.closest('.cal-cell')?.dataset.date || null };
    chip.style.opacity = '0.4';
  });
  $('#calendar').addEventListener('pointerenter', (e) => {
    if (!dragEv) return;
    $$('.cal-cell.drag-over').forEach((c) => c.classList.remove('drag-over'));
    const cell = e.target.closest('.cal-cell');
    if (cell) cell.classList.add('drag-over');
  }, true);
  $('#calendar').addEventListener('pointerup', (e) => {
    if (!dragEv) return;
    $$('.cal-cell.drag-over').forEach((c) => c.classList.remove('drag-over'));
    const cell = e.target.closest('.cal-cell');
    if (cell && cell.dataset.date && cell.dataset.date !== dragEv.from) {
      const ev = agenda.events.find((x) => x.id === dragEv.id);
      if (ev) {
        ev.date = cell.dataset.date;
        logChange(`Movido "${ev.title}" a ${ev.date}`);
        persist();
        renderCalendar();
        toast('Evento movido', 'ok');
      }
    }
    dragEv = null;
  });

  /* Selector de mes/año (clic en el título) */
  const picker = document.createElement('div');
  picker.className = 'cal-picker hidden';
  document.querySelector('.cal-toolbar').appendChild(picker);
  const renderPicker = () => {
    const y = cursor.getFullYear();
    picker.innerHTML = `
      <div class="cp-year"><button class="icon-btn" id="cpPrevY" title="Año anterior"><i class="ri-arrow-left-s-line"></i></button>
        <b>${y}</b>
        <button class="icon-btn" id="cpNextY" title="Año siguiente"><i class="ri-arrow-right-s-line"></i></button></div>
      <div class="cp-grid">${MONTHS.map((m, i) => `<button class="cp-month ${i === cursor.getMonth() ? 'on' : ''}" data-m="${i}">${m.slice(0, 3)}</button>`).join('')}</div>`;
    picker.querySelector('#cpPrevY').addEventListener('click', (ev) => { ev.stopPropagation(); cursor = new Date(y - 1, cursor.getMonth(), 1); renderPicker(); renderCalendar(); });
    picker.querySelector('#cpNextY').addEventListener('click', (ev) => { ev.stopPropagation(); cursor = new Date(y + 1, cursor.getMonth(), 1); renderPicker(); renderCalendar(); });
    picker.querySelectorAll('.cp-month').forEach((b) => b.addEventListener('click', () => {
      cursor = new Date(y, +b.dataset.m, 1);
      picker.classList.add('hidden');
      renderCalendar();
    }));
  };
  $('#calTitle').addEventListener('click', (e) => {
    e.stopPropagation();
    renderPicker();
    picker.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.cal-picker') && !e.target.closest('#calTitle')) picker.classList.add('hidden');
  });
  renderPicker();
  $$('#calViewSeg .seg-btn').forEach((b) => b.addEventListener('click', () => {
    $$('#calViewSeg .seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    view = b.dataset.view;
    renderCalendar();
  }));
  $('#addEventBtn').addEventListener('click', () => openEventModal(selectedDate || todayISO()));
  $('#calendar').addEventListener('click', (e) => {
    const cell = e.target.closest('.cal-cell, .cal-w-day');
    if (cell && cell.dataset.date) {
      selectedDate = cell.dataset.date;
      $$('.cal-cell.selected, .cal-w-day.selected').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      renderDayTasks();
      return;
    }
    const chip = e.target.closest('.cal-ec[data-ecid]');
    if (chip) {
      const ev = agenda.events.find((x) => x.id === chip.dataset.ecid);
      if (ev) openEventModal(ev.date, ev);
    }
    const evi = e.target.closest('[data-evid]');
    if (evi) {
      const ev = agenda.events.find((x) => x.id === evi.dataset.evid);
      if (ev) openEventModal(ev.date, ev);
    }
    const tsk = e.target.closest('[data-taskid]');
    if (tsk) {
      const t = agenda.tasks.find((x) => x.id === tsk.dataset.taskid);
      if (t) { t.done = !t.done; logChange(`Tarea "${t.title}" marcada ${t.done ? 'hecha' : 'pendiente'}`); persist(); renderCalendar(); }
    }
  });
  $('#dayTasks').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.t-del');
    if (delBtn) {
      const item = delBtn.closest('[data-taskid]');
      if (!item) return;
      const tid = item.dataset.taskid;
      const t = agenda.tasks.find((x) => x.id === tid);
      if (t) {
        agenda.tasks = agenda.tasks.filter((x) => x.id !== tid);
        logChange(`Eliminada tarea "${t.title}"`);
        persist();
        renderCalendar();
        toast('Tarea eliminada', 'ok');
      }
      return;
    }
    const chk = e.target.closest('input[type="checkbox"]');
    if (chk) {
      const item = chk.closest('[data-taskid]');
      if (!item) return;
      const tid = item.dataset.taskid;
      const t = agenda.tasks.find((x) => x.id === tid);
      if (t) {
        t.done = chk.checked;
        logChange(`Tarea "${t.title}" marcada ${t.done ? 'hecha' : 'pendiente'}`);
        persist();
        renderCalendar();
      }
    }
  });
  $('#eventForm').addEventListener('submit', saveEvent);
  $('#evDelete').addEventListener('click', () => {
    if (!editingEventId) return;
    const ev = agenda.events.find((x) => x.id === editingEventId);
    if (ev && confirm(`¿Eliminar "${ev.title}"?`)) {
      agenda.events = agenda.events.filter((x) => x.id !== editingEventId);
      logChange(`Eliminado evento "${ev.title}"`);
      closeModal('eventModal');
      persist();
      renderCalendar();
      editingEventId = null;
    }
  });
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) return;
    const t = { id: uid(), title, date: selectedDate || todayISO(), category: 'estudio', priority: 'med', estMin: null, done: false };
    agenda.tasks.push(t);
    logChange(`Añadida tarea "${title}" para ${t.date}`);
    $('#taskTitle').value = '';
    persist();
    renderCalendar();
    toast('Tarea añadida', 'ok');
  });
  $('#icsExport').addEventListener('click', exportICS);
  $('#icsImport').addEventListener('click', () => $('#icsFile').click());
  $('#icsFile').addEventListener('change', (e) => {
    if (e.target.files[0]) importICS(e.target.files[0]);
    e.target.value = '';
  });
  setupBell();

  $$('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

  renderCalendar();
  $('#calTitle').textContent = calTitle();
  bus.addEventListener('route:changed', (e) => {
    if (e.detail === 'agenda') { $('#calTitle').textContent = calTitle(); renderDayTasks(); renderChangelog(); }
  });
}
