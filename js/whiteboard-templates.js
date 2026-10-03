// econhub · whiteboard-templates.js — presets de economía para el tablero
// Cada preset es un conjunto de "skeletons" para convertToExcalidrawElements.
// Regla: TODOS los puntos son relativos y no negativos salvo las flechas que
// suben (se anclan abajo), porque `width: 0` se sustituye por 100 y torcía
// los ejes. Se usan `points` explícitos + width/height absolutos.

/** Segmento (línea o flecha) de (x,y) a (x+dx, y+dy). */
function seg(x, y, dx, dy, color, o = {}) {
  return {
    type: o.arrow ? 'arrow' : 'line',
    x, y,
    points: [[0, 0], [dx, dy]],
    width: Math.abs(dx),
    height: Math.abs(dy),
    strokeColor: color,
    strokeWidth: o.w || 2,
    ...(o.dashed ? { strokeStyle: 'dashed' } : {}),
  };
}

/** Ejes P (vertical) y Q (horizontal) con origen abajo-izquierda. */
function ejes(color, L = 340) {
  return [
    seg(0, L, L, 0, color, { arrow: true, w: 2 }),          // Q →
    seg(0, L, 0, -L, color, { arrow: true, w: 2 }),         // P ↑
    { type: 'text', x: L + 10, y: L - 34, text: 'Q', fontSize: 24, strokeColor: color },
    { type: 'text', x: 10, y: -12, text: 'P', fontSize: 24, strokeColor: color },
  ];
}

export const BOARD_TEMPLATES = [
  {
    id: 'ejes',
    name: 'Ejes P/Q',
    desc: 'Ejes coordenados con flechas: precio y cantidad.',
    build: (P) => ({ elements: ejes(P.teal) }),
  },
  {
    id: 'oferta-demanda',
    name: 'Oferta y demanda',
    desc: 'Curvas S y D, equilibrio E* y excedentes.',
    build: (P) => {
      const L = 340, muted = P.muted || '#868e96';
      // S sube (pendiente +), D baja (pendiente −). Simétricas: se cruzan al centro.
      const s = { x: 0.15 * L, y: L, dx: 0.65 * L, dy: -0.85 * L };
      const d = { x: 0.15 * L, y: 0.15 * L, dx: 0.65 * L, dy: 0.85 * L };
      return {
        elements: [
          ...ejes(muted, L),
          seg(s.x, s.y, s.dx, s.dy, P.teal, { w: 3 }),
          seg(d.x, d.y, d.dx, d.dy, P.highlight, { w: 3 }),
          { type: 'ellipse', x: d.x + d.dx * 0.5 - 6, y: d.y + d.dy * 0.5 - 6, width: 12, height: 12, strokeColor: P.primary, backgroundColor: P.primary },
          { type: 'text', x: s.x + s.dx + 10, y: s.y + s.dy - 26, text: 'S', fontSize: 28, strokeColor: P.teal },
          { type: 'text', x: d.x + d.dx + 10, y: d.y + d.dy - 26, text: 'D', fontSize: 28, strokeColor: P.highlight },
          { type: 'text', x: d.x + d.dx * 0.5 + 14, y: d.y + d.dy * 0.5 - 34, text: 'E*', fontSize: 24, strokeColor: P.primary },
        ],
      };
    },
  },
  {
    id: 'matriz-pagos',
    name: 'Matriz de pagos 2×2',
    desc: 'Juego simultáneo: estrategias A y B con pagos (x, y).',
    build: (P) => {
      const c = 120, muted = P.muted || '#868e96';
      const cell = (i, j) => ({ type: 'rectangle', x: c * (i + 1), y: c * (j + 1), width: c, height: c, strokeColor: P.teal, backgroundColor: 'transparent', strokeWidth: 2 });
      const pay = (i, j) => ({ type: 'text', x: c * (i + 1) + 34, y: c * (j + 1) + 44, text: 'x, y', fontSize: 22, strokeColor: muted });
      return {
        elements: [
          cell(0, 0), cell(1, 0), cell(0, 1), cell(1, 1),
          { type: 'text', x: c + 32, y: 10, text: 'B1', fontSize: 22, strokeColor: P.info },
          { type: 'text', x: 2 * c + 32, y: 10, text: 'B2', fontSize: 22, strokeColor: P.info },
          { type: 'text', x: 10, y: c + 46, text: 'A1', fontSize: 22, strokeColor: P.violet },
          { type: 'text', x: 10, y: 2 * c + 46, text: 'A2', fontSize: 22, strokeColor: P.violet },
          pay(0, 0), pay(1, 0), pay(0, 1), pay(1, 1),
        ],
      };
    },
  },
  {
    id: 'tendencia',
    name: 'Recta de tendencia',
    desc: 'Ejes + tendencia punteada para regresión o series.',
    build: (P) => {
      const L = 340, muted = P.muted || '#868e96';
      return {
        elements: [
          ...ejes(muted, L),
          seg(0.1 * L, L - 0.15 * L, 0.7 * L, -0.62 * L, P.highlight, { w: 3, dashed: true }),
          { type: 'text', x: 0.78 * L, y: 0.12 * L, text: 'tendencia', fontSize: 22, strokeColor: P.highlight },
        ],
      };
    },
  },
  {
    id: 'nota',
    name: 'Nota de clase',
    desc: 'Título + líneas guía para una explicación a mano.',
    build: (P) => {
      const muted = P.muted || '#868e96';
      return {
        elements: [
          { type: 'text', x: 0, y: 0, text: 'Título de la explicación', fontSize: 32, strokeColor: P.teal },
          seg(0, 50, 420, 0, muted, { w: 2 }),
          { type: 'text', x: 0, y: 70, text: 'Escribe aquí las ideas clave…', fontSize: 22, strokeColor: muted },
        ],
      };
    },
  },
  {
    id: 'postit',
    name: 'Nota adhesiva (Post-it)',
    desc: 'Post-it cuadrado con fondo para apuntes rápidos.',
    build: () => ({
      elements: [
        {
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 220,
          height: 190,
          strokeColor: '#eab308',
          backgroundColor: '#fef08a',
          fillStyle: 'solid',
          strokeWidth: 2,
          roundness: { type: 3 },
          roughness: 1,
        },
        {
          type: 'text',
          x: 18,
          y: 22,
          width: 184,
          text: 'Idea / Apunte…',
          fontSize: 20,
          strokeColor: '#1e293b',
        },
      ],
    }),
  },
  {
    id: 'fpp',
    name: 'Frontera de producción',
    desc: 'FPP cóncava: costo de oportunidad creciente.',
    build: (P) => {
      const L = 340, muted = P.muted || '#868e96';
      const pts = [[0, 0.1 * L], [0.25 * L, 0.2 * L], [0.5 * L, 0.35 * L], [0.75 * L, 0.6 * L], [L, 0.9 * L]];
      return {
        elements: [
          ...ejes(muted, L),
          { type: 'line', x: 0, y: 0, points: pts, width: L, height: 0.9 * L, strokeColor: P.highlight, strokeWidth: 3 },
          { type: 'text', x: 0.42 * L, y: 0.05 * L, text: 'FPP', fontSize: 24, strokeColor: P.highlight },
        ],
      };
    },
  },
];
