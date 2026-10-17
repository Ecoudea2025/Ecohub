// econhub · links.js — mis páginas con portadas modernas (favicon + gradiente animado)
import { $, store, toast } from './app.js';
import { KEYS } from './data.js';

const FIXED = { title: 'Ecoudea — Mi proyecto', url: 'https://ecoudea2025.github.io/Ecoudea/', fixed: true };

const GRADS = [
  ['#069a7e', '#127599', '#5f4786'],
  ['#33691e', '#6c9a06', '#ffc107'],
  ['#127599', '#5f4786', '#069a7e'],
  ['#ffc107', '#6c9a06', '#33691e'],
  ['#5f4786', '#069a7e', '#127599'],
];

function gradFor(url) {
  let h = 7;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADS[h % GRADS.length];
}

function domain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function getLinks() {
  return [FIXED, ...store.get(KEYS.links, [])];
}

function saveLinks(links) {
  store.set(KEYS.links, links.filter((l) => !l.fixed));
  render();
}

function render() {
  const grid = $('#linksGrid');
  grid.innerHTML = getLinks().map((l, i) => {
    const [c1, c2, c3] = gradFor(l.url);
    const dom = domain(l.url);
    return `
    <div class="link-card" data-reveal>
      <div class="lc-cover" style="--lc-c1:${c1};--lc-c2:${c2};--lc-c3:${c3}">
        <div class="lc-favicon">
          <i class="ri-global-line" style="position:absolute;font-size:1.4rem;opacity:0.9"></i>
        </div>
        <div class="lc-domain">${dom}</div>
      </div>
      <div class="lc-body">
        <div class="lc-title"><i class="${l.fixed ? 'ri-star-fill' : 'ri-link-m'}"></i> ${l.title}</div>
        <div class="lc-url">${l.url}</div>
        <div class="lc-foot">
          <div>
            ${l.fixed ? '' : `<button class="lc-edit" data-edit="${i}" title="Editar"><i class="ri-pencil-line"></i></button>
            <button class="lc-edit" data-del="${i}" title="Eliminar"><i class="ri-delete-bin-line"></i></button>`}
          </div>
          <a class="btn btn-primary btn-sm lc-open" href="${l.url}" target="_blank" rel="noopener"><i class="ri-external-link-line"></i> Abrir</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

function openEditor(link = null) {
  const title = prompt('Título del enlace:', link?.title || '');
  if (title === null) return;
  const url = prompt('URL:', link?.url || 'https://');
  if (url === null) return;
  if (!url.startsWith('http')) return toast('URL inválida', 'err');
  const links = getLinks().filter((l) => !l.fixed);
  if (link) {
    const idx = links.findIndex((x) => x.url === link.url);
    if (idx >= 0) links[idx] = { title, url };
  } else {
    links.push({ title, url });
  }
  saveLinks(links);
  toast(link ? 'Enlace actualizado' : 'Enlace añadido', 'ok');
}

export function initLinks() {
  render();
  $('#addLinkBtn').addEventListener('click', () => openEditor());
  $('#linksGrid').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    if (ed) { const links = getLinks(); openEditor(links[+ed.dataset.edit]); }
    const del = e.target.closest('[data-del]');
    if (del) {
      const links = getLinks().filter((l) => !l.fixed);
      if (confirm(`¿Eliminar "${links[+del.dataset.del].title}"?`)) {
        links.splice(+del.dataset.del, 1);
        saveLinks(links);
      }
    }
  });
}
