// econhub · data.js — paleta, temas, modos, herramientas, modelos y config global

export const PALETTE = {
  primary: '#33691e',
  success: '#6c9a06',
  highlight: '#ffc107',
  teal: '#069a7e',
  violet: '#5f4786',
  info: '#127599',
};

export const EXTRA_SWATCHES = ['#e53935', '#fb8c00', '#fdd835', '#66bb6a', '#26a69a', '#42a5f5', '#8e24aa', '#6d4c41', '#9e9e9e', '#111111', '#ffffff', '#ff6f91'];

export const THEMES = ['oscuro', 'claro', 'cafe', 'navy', 'oceano', 'forest', 'sunset'];

export const READ_MODES = [
  { id: 'normal', name: 'Normal', icon: 'ri-sun-line', color: '#9aa8a0', filter: null },
  { id: 'oscuro', name: 'Oscuro', icon: 'ri-moon-clear-line', color: '#1f2937', filter: 'invert(0.9) hue-rotate(180deg) contrast(1.15) brightness(0.95)' },
  { id: 'sepia', name: 'Kraft', icon: 'ri-cup-line', color: '#a9744f', filter: 'invert(0.88) sepia(0.62) saturate(2.6) hue-rotate(-12deg) brightness(0.78) contrast(1.02)' },
  { id: 'navy', name: 'Navy oscuro', icon: 'ri-sailboat-line', color: '#2c5f7d', filter: 'invert(0.9) sepia(0.28) hue-rotate(190deg) saturate(1.7) brightness(0.86) contrast(1.14)' },
  { id: 'forest', name: 'Forest oscuro', icon: 'ri-tree-line', color: '#2f5d2a', filter: 'invert(0.9) sepia(0.5) hue-rotate(100deg) saturate(1.5) brightness(0.82) contrast(1.08)' },
  { id: 'contraste', name: 'Contraste', icon: 'ri-contrast-2-line', color: '#ffd54f', filter: 'invert(1) sepia(1) saturate(2.5) contrast(1.3)' },
];

export const TOOL_MODES = [
  { id: 'select', shortcut: 'V', icon: 'mouse-pointer-2', name: 'Mover', color: '#069a7e', desc: 'Selecciona y mueve anotaciones' },
  { id: 'hand', shortcut: 'H', icon: 'hand', name: 'Mano', color: '#127599', desc: 'Desplázate por el documento' },
  { id: 'pencil', shortcut: 'P', icon: 'pencil', name: 'Lápiz', color: '#ffc107', desc: 'Dibujo libre' },
  { id: 'rect', shortcut: 'R', icon: 'square', name: 'Rectángulo', color: '#6c9a06', desc: 'Shift = cuadrado' },
  { id: 'ellipse', shortcut: 'O', icon: 'circle', name: 'Óvalo', color: '#069a7e', desc: 'Shift = círculo' },
  { id: 'tri', shortcut: 'Y', icon: 'triangle', name: 'Triángulo', color: '#5f4786', desc: 'Triángulo isósceles (Y)' },
  { id: 'line', shortcut: 'L', icon: 'minus', name: 'Línea', color: '#127599', desc: 'Shift = 45°' },
  { id: 'select-text', shortcut: 'Q', icon: 'scan-text', name: 'Seleccionar', color: '#069a7e', desc: 'Seleccionar texto (OTP auto)' },
  { id: 'text', shortcut: 'S', icon: 'type', name: 'Texto', color: '#5f4786', desc: 'Haz clic para escribir' },
  { id: 'highlighter', shortcut: 'G', icon: 'highlighter', name: 'Resaltar', color: '#ffc107', desc: 'Resaltado mano + OTP (auto-detección)' },
  { id: 'eraser', shortcut: 'E', icon: 'eraser', name: 'Borrador', color: '#ef5350', desc: 'Borrador continuo' },
];

export const GEO_MODES = [
  { id: 'gline', icon: 'ruler', name: 'Línea CAD', desc: 'Arrastra: medida y ángulo exactos (90° vertical, 180° horizontal, 45° x=y)' },
  { id: 'gtri-eq', icon: 'triangle', name: 'Tri. equilátero', desc: 'Arrastra la base: tercer vértice automático' },
  { id: 'gtri-r', icon: 'crop', name: 'Tri. recto', desc: 'Base con ángulo recto en el primer vértice' },
  { id: 'gtri-ang', icon: 'sliders-horizontal', name: 'Tri. por ángulos', desc: 'Base + ángulos A y B (C = 180−A−B)' },
  { id: 'garc', icon: 'circle-dot', name: 'Arco (centro + 2)', desc: 'Centro y 2 puntos que delimitan el arco' },
];

export const CATEGORIES = [
  { key: 'estudio', name: 'Estudio', color: PALETTE.primary },
  { key: 'parcial', name: 'Parcial', color: PALETTE.highlight },
  { key: 'trabajo', name: 'Trabajo', color: PALETTE.teal },
  { key: 'examen', name: 'Examen', color: PALETTE.info },
  { key: 'personal', name: 'Personal', color: PALETTE.violet },
  { key: 'ocio', name: 'Ocio', color: PALETTE.success },
];
export const catColor = (k) => (CATEGORIES.find((c) => c.key === k) || CATEGORIES[0]).color;

export const MODELS = [
  'autonomo/keyword-parser',
  'ollama/llama3.2',
  'ollama/qwen2.5',
  'ollama/phi3',
];

export const HOME_CARDS = [
  { sec: 'pdf', icon: 'ri-file-pdf-2-line', title: 'Editor PDF', desc: 'Anota, lee en modo oscuro/sepia/navy y exporta tus PDFs con tus dibujos.', color: PALETTE.info },
  { sec: 'udea', icon: 'ri-graduation-cap-line', title: 'UdeA', desc: 'Tu plataforma de estudiante (Ude@) y el sitio institucional, a un clic.', color: PALETTE.success },
  { sec: 'herramientas', icon: 'ri-function-line', title: 'Herramientas económicas', desc: 'Calculadora, graficador, conceptos y el modelo de Solow en vivo.', color: PALETTE.teal },
  { sec: 'agenda', icon: 'ri-calendar-check-line', title: 'Agenda + Agente', desc: 'Calendario privado editable por tu agente parser autónomo.', color: PALETTE.highlight },
  { sec: 'musica', icon: 'ri-music-2-line', title: 'Música', desc: 'Playlists de estudio con tus audios en media/. La foco se activa con el pomodoro.', color: PALETTE.violet },
  { sec: 'enlaces', icon: 'ri-link-m', title: 'Mis páginas', desc: 'Tus proyectos de autoría y recursos, siempre a la mano.', color: PALETTE.primary },
];

export const LAB_CARDS = [
  { icon: 'ri-brain-line', title: 'Repaso espaciado', desc: 'Tus tarjetas de conceptos con repetición espaciada (SM-2): estudia justo lo que toca hoy.', color: PALETTE.highlight, route: 'repaso' },
  { icon: 'ri-scissors-line', title: 'Agregador académico', desc: 'Buscar documentos (arXiv, World Bank, OpenAlex…) desde econhub. El scraper que nunca funcionó, rehecho.', color: PALETTE.violet },
  { icon: 'ri-line-chart-line', title: 'Simuladores avanzados', desc: 'Solow interactivo con choques, convergencia y trayectorias; modelos exógenos.', color: PALETTE.info },
  { icon: 'ri-flask-line', title: 'Laboratorios económicos', desc: 'Experimentos con datos reales: elasticidades, inflación, mercados.', color: PALETTE.teal },
];

export const KEYS = {
  theme: 'econhub:theme',
  readMode: 'econhub:readmode',
  docs: 'econhub:docs',
  agenda: 'econhub:agenda',
  chatCfg: 'econhub:chatcfg',
  chatHist: 'econhub:chathist',
  music: 'econhub:music',
  musicState: 'econhub:musicstate',
  links: 'econhub:links',
  pdfHist: 'econhub:pdfhist',
  udaTab: 'econhub:udatab',
  hero: 'econhub:hero',
  gametree: 'econhub:gametree',
  grades: 'econhub:grades',
  repaso: 'econhub:repaso',
  plotSliders: 'econhub:plotSliders',
};

export const AGENDA_SCHEMA = {
  version: 1,
  events: [],
  tasks: [],
  goals: [],
  changelog: [],
};

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
