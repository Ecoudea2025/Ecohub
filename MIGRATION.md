# Estrategia de Migración a Android (MIGRATION.md)

Este documento describe el análisis de los módulos actuales de Ecohub (aplicación web legada) y el plan definitivo para transformarla en una aplicación Android nativa ("daily driver").

## 1. Auditoría de Módulos Actuales

| Módulo Web Actual | Clasificación Inicial | Esfuerzo Estimado | Acción Requerida / Destino | Confirmación del Usuario |
|---|---|---|---|---|
| Inicio (`sec-inicio`) | ⚠️ Reenfocar | **L** | Adaptar a Dashboard cotidiano (hábitos, notas, tareas del día). | Sí |
| Lector PDF (`sec-pdf`) | ✅ Sirve | **M** | Mejorar UX (scroll fluido, pinch to zoom). | Sí |
| UdeA (`sec-udea`) | ⚠️ Reenfocar | **L** | Renombrar a "Universidad/Académico". Mantener horarios, fechas, links. Eliminar específico de economía. | Sí - Aprobado reenfoque |
| Calculadora (`herramientas/calculadora`) | ⚠️ Reenfocar | **S** | Convertir en calculadora de uso diario / gastos. | Sí |
| Graficadora (`herramientas/graficadora`) | ❌ Eliminar | - | Archivar en `/legacy/` (Fase 3). | Sí |
| Conceptos Económicos (`herramientas/conceptos`) | ❌ Eliminar | - | Archivar en `/legacy/` (Fase 3). | Sí |
| Modelos de Crecimiento (`herramientas/modelos`) | ❌ Eliminar | - | Archivar en `/legacy/` (Fase 3). | Sí |
| Promedios (`herramientas/promedios`) | ✅ Sirve | **S** | Mejorar UI mobile, teclado numérico. | Sí |
| Juegos / Árboles (`herramientas/juegos`) | ❌ Eliminar | - | Archivar en `/legacy/` (Fase 3). | Sí |
| Agenda (`sec-agenda`) | ✅ Sirve | **S** | Vista de lista móvil, notificaciones locales. | Sí |
| Música (`sec-musica`) | ✅ Sirve | **M** | Controles táctiles grandes, notificaciones media. | Sí |
| Enlaces (`sec-enlaces`) | ⚠️ Reenfocar | **M** | Renombrar a "Mis links frecuentes", rediseñar. | Sí |
| Tablero (`sec-tablero`) | ✅ Sirve | **M** | Responsive, apilable, sin desbordes. | Sí |
| Laboratorios (`sec-laboratorios`) | ❌ Eliminar | - | Archivar en `/legacy/` (Fase 3). | Sí |
| `math-teacher-library.excalidrawlib` | ❌ Eliminar | - | Archivar en `/legacy/` en la Fase 3. | Sí - Confirmado |
| `mathematical-symbols.excalidrawlib`| ❌ Eliminar | - | Archivar en `/legacy/` en la Fase 3. | Sí - Confirmado |
| `_basicapi.pdf` | ❌ Eliminar | - | Archivar en `/legacy/` en la Fase 3. | Sí - Confirmado |


## 2. Decisión Tecnológica Definitiva

Tras evaluar las rutas disponibles, la decisión oficial de arquitectura es **Ruta A (Kotlin + Jetpack Compose nativo)**.

- **Ruta A (Kotlin + Compose nativo)**: **APROBADA como destino único**. Todo el desarrollo se enfocará en esta pila tecnológica.
- **Ruta B (PWA)**: **DESCARTADA**. Construir un puente PWA implica doble esfuerzo de mantenimiento de UI que no aporta al objetivo final.
- **Ruta C (WebView wrapper)**: **VETADA permanentemente**. Va en contra del principio de "app estable sin solapamientos" y diseño nativo.

*Nota Estratégica*: En la Fase 1 se creará un proyecto Android vacío en el repositorio, coexistiendo con la app web actual. Se migrará módulo por módulo. Una vez migrado el último módulo útil, la app web se moverá a una carpeta `/legacy/` para su archivo definitivo (no se borrará el código de inmediato).


## 3. Estructura Objetivo del Repositorio

Para soportar la convivencia inicial y posterior archivado, el repositorio adoptará la siguiente estructura:

```text
/
├── AGENTS.md
├── MIGRATION.md
├── ROADMAP.md
├── README.md
├── legacy/           # app web actual (solo lectura, se moverá aquí al final de la transición)
│   └── web/
├── android/          # Proyecto Android nativo (Compose)
│   ├── app/
│   │   └── src/main/java/...
│   ├── build.gradle.kts
│   └── settings.gradle.kts
└── docs/             # Documentación del proyecto
```

## 4. Orden de Migración Propuesto

1. **Sprint 0**: Setup del proyecto Android (Compose + Material 3, tema claro/oscuro, navegación base).
2. **Sprint 1**: Módulo más simple para validar pipeline end-to-end → **Calculadora**.
3. **Sprint 2**: Módulos "S" restantes → **Promedios**, **Agenda**.
4. **Sprint 3**: Módulos "M" → **Lector PDF**, **Música**, **Tablero**, **Enlaces**.
5. **Sprint 4**: Módulos "L" → **Dashboard (Inicio)**, **Académico (UdeA reenfocado)**.
6. **Sprint 5**: Features nuevas del prompt original (contador "cuánto falta", recordatorios rápidos, notas, hábitos, Pomodoro, temas dinámicos).
7. **Sprint 6**: Estabilidad, auditoría final, tests, publicación.
