# Ecohub — Guía para Agentes de Desarrollo (AI Coding Assistants)

Este documento contiene directrices, arquitectura y buenas prácticas para asistentes y agentes de desarrollo de software (Antigravity, Claude, Copilot, etc.) que trabajen en el codebase de **Ecohub**.

---

## 1. Visión del Proyecto

**Ecohub** es el entorno y hub de estudio personal de un estudiante de Economía de la Universidad de Antioquia (UdeA). Combina:
- Visor y anotador de PDFs académicos (pdf.js).
- Calculadora científica de alta precisión con historial y modos trigonométricos.
- Generador de árboles de decisiones para Teoría de Juegos (istgame, LaTeX, SVG/PNG).
- Gráficos y simuladores interactivos de conceptos económicos.
- Calendario/agenda académica con sincronización local y bridge PHP.
- Chatbot planificador alimentado por `opencode`.
- Reproductor musical ambiental y enlaces de estudio.

Se sirve en entorno local vía IIS o servidor PHP integrado:
- URL de producción local: `http://localhost/Ecohub`
- Servidor alternativo de desarrollo: `iniciar.bat` (PHP en `http://localhost:8000`)

---

## 2. Pila Tecnológica & Arquitectura

- **Frontend:** Vanilla JavaScript moderno (ES Modules nativos), CSS3 personalizado (variables, diseño adaptativo, temas oscuro/claro).
- **Librerías de Animación:**
  - [GSAP 3.12.5](https://greensock.com/gsap/) (`ScrollTrigger`, `Flip`)
  - [Anime.js 4.5.0](https://animejs.com/) (importmap ES module)
- **Backend / Bridges:**
  - PHP 8+ en carpeta `api/`:
    - `api/sync.php`: lee y escribe `plan/agenda.json` con validación estricta.
    - `api/keyword_parser.php`: parser determinista de palabras clave y fechas en lenguaje natural.
    - `api/chat.php`: procesa mensajes mediante el parser determinista autónomo y aplica los cambios a la agenda.
- **Directorio `plan/`:**
  - `agenda.json`: Fuente de la verdad de eventos y tareas.
  - `agenda.md`: Espejo legible en Markdown generado automáticamente.

---

## 3. Convenciones de Desarrollo

1. **Sin dependencias pesadas innecesarias:** Mantener vanilla JS con módulos ES nativos (`import`/`export`). No introducir bundlers (Webpack, Vite) a menos que sea solicitado explícitamente.
2. **Preservar almacenamiento persistente:** No alterar las claves de `localStorage` de forma destructiva; garantizar retrocompatibilidad.
3. **Animaciones accesibles:** Respetar siempre `prefers-reduced-motion` mediante `window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
4. **Diseño Responsive:** Probar elementos en resoluciones de escritorio (1280px+) y móviles (<768px).

---

## 4. Control de Calidad (QA)

Antes de finalizar cualquier tarea de desarrollo, ejecutar obligatoriamente:

```powershell
# Validación sintáctica de scripts PHP
php -l api/sync.php
php -l api/chat.php

# Validación sintáctica de scripts JS
Get-Content js\*.js -Raw | node --input-type=module --check
```

Sin placeholders, sin APIs ficticias y sin errores no controlados en la consola del navegador.
