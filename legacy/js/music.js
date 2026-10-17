// econhub · music.js — reproductor HTML5 con playlists (media/ + playlist.json)
import { $, $$, store, toast } from './app.js';
import { KEYS, uid } from './data.js';

let playlists = [];
let activePl = null;
let trackIdx = -1;
const mode = { shuffle: false, repeat: false };

function persist() {
  store.set(KEYS.music, playlists);
}

async function loadPlaylists() {
  const user = store.get(KEYS.music, []);
  try {
    const res = await fetch('playlist.json');
    const j = await res.json();
    const base = (j.playlists || []).map((p) => ({ id: p.id, name: p.name, color: p.color, tracks: p.tracks || [] }));
    playlists = base.map((bp) => {
      const existing = user.find((u) => u.id === bp.id);
      if (existing && existing.tracks && existing.tracks.length > 0) return existing;
      return bp;
    });
    user.forEach((u) => {
      if (!playlists.some((p) => p.id === u.id)) playlists.push(u);
    });
  } catch {
    playlists = user;
  }
  if (!playlists.length) playlists = [{ id: 'focus', name: 'Focus · Estudio', color: '#069a7e', tracks: [] }];
  activePl = store.get('econhub:activepl', playlists[0].id);
  if (!playlists.some((p) => p.id === activePl)) activePl = playlists[0].id;
  persist();
  renderPlaylists();
  renderTracks();
}

function renderPlaylists() {
  const box = $('#playlistList');
  box.innerHTML = playlists.map((p) => `
    <div class="pl-item ${p.id === activePl ? 'active' : ''}" data-plid="${p.id}">
      <span class="pl-dot" style="background:${p.color}"></span>
      <span class="pl-name">${p.name}</span>
      <span class="pl-count">${p.tracks.length}</span>
      <button class="pl-del" data-pldel="${p.id}" title="Eliminar playlist"><i class="ri-delete-bin-line"></i></button>
    </div>`).join('');
}

async function validateTrack(src) {
  try {
    const res = await fetch(src, { method: 'HEAD' });
    return res.ok;
  } catch { return false; }
}

async function renderTracks(animateFlip = false) {
  const box = $('#trackList');
  const pl = playlists.find((p) => p.id === activePl);
  if (!pl) return;
  if (animateFlip && window.gsap) {
    const state = window.Flip?.getState(box.children);
    box.innerHTML = pl.tracks.length ? pl.tracks.map((t, i) => `
      <div class="track-item ${i === trackIdx ? 'playing' : ''}" data-tidx="${i}" title="${t.missing ? 'Archivo no encontrado: ' + t.src : t.src}">
        <span class="tk-idx">${i + 1}</span>
        <span class="tk-name">${t.title}</span>
        ${t.missing ? '<span class="tk-missing">no encontrado</span>' : ''}
        <button class="tk-del" data-tdel="${i}"><i class="ri-close-line"></i></button>
      </div>`).join('') : '<p class="today-empty" style="padding:8px 4px">Playlist vacía. Añade tracks como media/mi-cancion.mp3</p>';
    if (state && box.children.length) Flip.from(state, { duration: 0.5, stagger: 0.05, absolute: true, ease: 'power3.out' });
  } else {
    box.innerHTML = '';
    const frag = document.createDocumentFragment();
    pl.tracks.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'track-item' + (i === trackIdx ? ' playing' : '');
      el.dataset.tidx = i;
      el.title = t.missing ? 'Archivo no encontrado: ' + t.src : t.src;
      el.innerHTML = `<span class="tk-idx">${i + 1}</span><span class="tk-name"></span>${t.missing ? '<span class="tk-missing">no encontrado</span>' : ''}<button class="tk-del" data-tdel="${i}"><i class="ri-close-line"></i></button>`;
      el.querySelector('.tk-name').textContent = t.title;
      frag.appendChild(el);
    });
    if (!pl.tracks.length) box.innerHTML = '<p class="today-empty" style="padding:8px 4px">Playlist vacía. Añade tracks como media/mi-cancion.mp3</p>';
    else box.appendChild(frag);
  }
  $('#npPlaylist').textContent = pl.name;
}

const audio = () => $('#audioEl');

function loadTrack(i) {
  const pl = playlists.find((p) => p.id === activePl);
  if (!pl || !pl.tracks.length) return;
  const total = pl.tracks.length;
  const idx = ((i % total) + total) % total;
  trackIdx = idx;
  const t = pl.tracks[idx];
  if (t.missing) { renderTracks(); return; }
  const a = audio();
  a.src = t.src;
  a.volume = $('#plVolume').value / 100;
  $('#npTitle').textContent = t.title;
  $('#mpTitle').textContent = t.title;
  $('#mpPl').textContent = pl.name;
  $('#miniPlayer').classList.remove('hidden');
  renderTracks();
  a.play().catch(() => {
    t.missing = true;
    renderTracks();
    toast('No se pudo reproducir ' + t.src, 'err');
  });
}

function nextIdx() {
  const pl = playlists.find((p) => p.id === activePl);
  if (!pl || !pl.tracks.length) return -1;
  if (mode.shuffle) return Math.floor(Math.random() * pl.tracks.length);
  return trackIdx + 1;
}

function setPlayIcon(playing) {
  const plBtn = $('#plPlay i');
  const mpBtn = $('#mpPlay i');
  if (plBtn) plBtn.className = playing ? 'ri-pause-fill' : 'ri-play-fill';
  if (mpBtn) mpBtn.className = playing ? 'ri-pause-fill' : 'ri-play-fill';

  const mp = $('#miniPlayer');
  const disc = $('#mpDisc');
  const npArt = $('#npArt');
  const eqBars = $('#eqBars');

  if (mp) mp.classList.toggle('is-playing', playing);
  if (disc) disc.classList.toggle('is-spinning', playing);
  if (npArt) npArt.classList.toggle('playing', playing);
  if (eqBars) eqBars.classList.toggle('active', playing);
}

function persistState() {
  store.set(KEYS.musicState, { activePl, trackIdx, shuffle: mode.shuffle, repeat: mode.repeat, volume: $('#plVolume').value });
}

export function initMusic() {
  loadPlaylists().then(() => {
    const st = store.get(KEYS.musicState, {});
    if (st.activePl) activePl = st.activePl;
    mode.shuffle = !!st.shuffle;
    mode.repeat = !!st.repeat;
    if (st.volume) $('#plVolume').value = st.volume;
    trackIdx = st.trackIdx ?? -1;
    $('#plShuffle').classList.toggle('on', mode.shuffle);
    $('#plRepeat').classList.toggle('on', mode.repeat);
    renderPlaylists();
    renderTracks();
  });

  $('#playlistList').addEventListener('click', (e) => {
    const pl = e.target.closest('[data-plid]');
    if (pl && !e.target.closest('[data-pldel]')) { activePl = pl.dataset.plid; trackIdx = -1; renderPlaylists(); renderTracks(true); }
    const del = e.target.closest('[data-pldel]');
    if (del) {
      const p = playlists.find((x) => x.id === del.dataset.pldel);
      if (p && confirm(`¿Eliminar "${p.name}"?`)) {
        playlists = playlists.filter((x) => x.id !== p.id);
        if (activePl === p.id) activePl = playlists[0]?.id || null;
        persist(); renderPlaylists(); renderTracks();
      }
    }
  });

  $('#trackList').addEventListener('click', (e) => {
    const it = e.target.closest('[data-tidx]');
    if (it && !e.target.closest('[data-tdel]')) loadTrack(+it.dataset.tidx);
    const del = e.target.closest('[data-tdel]');
    if (del) {
      const pl = playlists.find((p) => p.id === activePl);
      pl.tracks.splice(+del.dataset.tdel, 1);
      if (trackIdx >= del.dataset.tdel && trackIdx > 0) trackIdx--;
      persist(); renderTracks(true);
    }
  });

  $('#plAdd').addEventListener('click', () => {
    const name = prompt('Nombre de la playlist:');
    if (!name) return;
    playlists.push({ id: uid(), name, color: '#069a7e', tracks: [] });
    persist(); renderPlaylists();
  });

  $('#trackAdd').addEventListener('click', async () => {
    const src = prompt('Ruta del audio (ej: media/mi-cancion.mp3):');
    if (!src) return;
    const pl = playlists.find((p) => p.id === activePl);
    const ok = await validateTrack(src);
    const title = src.split('/').pop().replace(/\.[^.]+$/, '');
    pl.tracks.push({ title, src, missing: !ok });
    persist();
    renderTracks(true);
    toast(ok ? 'Track añadido' : 'Track añadido, pero no se encontró el archivo', ok ? 'ok' : 'err');
  });

  $('#plPlay').addEventListener('click', () => {
    const a = audio();
    if (a.paused && a.src) a.play();
    else if (!a.src) { const pl = playlists.find((p) => p.id === activePl); if (pl?.tracks.length) loadTrack(0); }
    else a.pause();
  });
  $('#mpPlay')?.addEventListener('click', () => $('#plPlay').click());

  $('#plNext')?.addEventListener('click', () => {
    const pl = playlists.find((p) => p.id === activePl);
    if (pl && pl.tracks.length) {
      const n = nextIdx();
      if (n >= 0) loadTrack(n);
    }
  });
  $('#mpNext')?.addEventListener('click', () => $('#plNext').click());

  $('#plPrev')?.addEventListener('click', () => {
    const pl = playlists.find((p) => p.id === activePl);
    if (pl && pl.tracks.length) {
      const prev = (trackIdx - 1 + pl.tracks.length) % pl.tracks.length;
      loadTrack(prev);
    }
  });
  $('#mpPrev')?.addEventListener('click', () => $('#plPrev').click());

  $('#plShuffle')?.addEventListener('click', () => { mode.shuffle = !mode.shuffle; $('#plShuffle').classList.toggle('on', mode.shuffle); persistState(); });
  $('#plRepeat')?.addEventListener('click', () => { mode.repeat = !mode.repeat; $('#plRepeat').classList.toggle('on', mode.repeat); persistState(); });
  $('#mpClose')?.addEventListener('click', () => $('#miniPlayer').classList.add('hidden'));

  const a = audio();
  a.addEventListener('play', () => setPlayIcon(true));
  a.addEventListener('pause', () => setPlayIcon(false));
  a.addEventListener('ended', () => {
    if (mode.repeat) { a.currentTime = 0; a.play(); }
    else { const n = nextIdx(); if (n >= 0) loadTrack(n); else setPlayIcon(false); }
  });
  a.addEventListener('timeupdate', () => {
    if (!a.duration) return;
    const pct = (a.currentTime / a.duration) * 100;
    $('#plSeek').value = (pct / 100) * 1000;
    $('#curTime').textContent = fmt(a.currentTime);
    $('#durTime').textContent = fmt(a.duration);
    const mpBar = $('#mpProgress');
    if (mpBar) mpBar.style.width = pct + '%';
  });
  a.addEventListener('loadedmetadata', () => { $('#durTime').textContent = fmt(a.duration); });
  a.addEventListener('error', () => {
    const pl = playlists.find((p) => p.id === activePl);
    const t = pl?.tracks[trackIdx];
    if (t) { t.missing = true; persist(); renderTracks(); }
  });
  $('#plSeek').addEventListener('input', (e) => {
    const a2 = audio();
    if (a2.duration) a2.currentTime = (e.target.value / 1000) * a2.duration;
  });
  $('#plVolume').addEventListener('input', (e) => { audio().volume = e.target.value / 100; persistState(); });

  window.addEventListener('beforeunload', persistState);
}

function fmt(s) {
  s = Math.floor(s || 0);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
