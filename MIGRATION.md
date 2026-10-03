# Estrategia de Migración a Android (MIGRATION.md)

Este documento describe el análisis de los módulos actuales de Ecohub (una aplicación web basada en HTML, JS, CSS, PHP) y las posibles rutas tecnológicas para transformarla en una aplicación Android nativa ("daily driver").

## 1. Auditoría de Módulos Actuales

| Módulo Web Actual | Clasificación Inicial | Acción Requerida / Destino | Confirmación del Usuario |
|---|---|---|---|
| Inicio (`sec-inicio`) | ⚠️ Reenfocar | Adaptar a Dashboard cotidiano (hábitos, notas, tareas del día) | No |
| Lector PDF (`sec-pdf`) | ✅ Sirve | Mejorar UX (scroll fluido, pinch to zoom) | No |
| UdeA (`sec-udea`) | ❌ Eliminar / ⚠️ Reenfocar | Posiblemente eliminar del main si no aporta al "daily driver". | **Sí** |
| Calculadora (`herramientas/calculadora`) | ⚠️ Reenfocar | Convertir en calculadora de uso diario / gastos. | No |
| Graficadora (`herramientas/graficadora`) | ❌ Eliminar | Eliminar (Fase 3). | No |
| Conceptos Económicos (`herramientas/conceptos`) | ❌ Eliminar | Eliminar (Fase 3). | No |
| Modelos de Crecimiento (`herramientas/modelos`) | ❌ Eliminar | Eliminar (Fase 3). | No |
| Promedios (`herramientas/promedios`) | ✅ Sirve | Mejorar UI mobile, teclado numérico. | No |
| Juegos / Árboles (`herramientas/juegos`) | ❌ Eliminar | Eliminar (Fase 3). | No |
| Agenda (`sec-agenda`) | ✅ Sirve | Vista de lista móvil, notificaciones locales. | No |
| Música (`sec-musica`) | ✅ Sirve | Controles táctiles grandes, notificaciones media. | No |
| Enlaces (`sec-enlaces`) | ⚠️ Reenfocar | Renombrar a "Mis links frecuentes", rediseñar. | No |
| Tablero (`sec-tablero`) | ✅ Sirve | Responsive, apilable, sin desbordes. | No |
| Laboratorios (`sec-laboratorios`) | ❌ Eliminar | Eliminar del menú principal. | No |
| `math-teacher-library.excalidrawlib` | ⚠️ Reenfocar / ❌ Eliminar | Recursos de pizarra. Eliminar si no es útil para uso diario. | **Sí** |
| `mathematical-symbols.excalidrawlib` | ⚠️ Reenfocar / ❌ Eliminar | Recursos de pizarra. Eliminar si no es útil para uso diario. | **Sí** |
| `_basicapi.pdf` | ❌ Eliminar | Documento irrelevante para daily driver. | **Sí** |


## 2. Opciones de Migración Tecnológica

Para lograr la meta de una aplicación Android estable y usable en celular ("daily driver"), tenemos tres rutas principales de migración:

| Ruta | Pros | Contras | Esfuerzo | Riesgo | Veredicto |
|---|---|---|---|---|---|
| **A. Rewrite nativo Kotlin + Compose** | Mejor UX, rendimiento, Material 3 real, control total. | Reescribir todo (lógica y UI), requiere más tiempo de desarrollo. | Alto | Medio | Destino final recomendado. |
| **B. PWA (manifest + service worker)** | Rápido, sin necesidad de Play Store, reusa el código web actual. | Limitaciones de OS Android (notificaciones, widgets, iconos dinámicos). | Bajo | Bajo | Puente temporal. |
| **C. WebView wrapper (Capacitor/Cordova)** | Desarrollo rápido, reutiliza la base de código, acceso limitado a APIs nativas. | UX "no nativa", problemas de rendimiento, sensación de "sitio web empaquetado". | Medio | Medio | Puente aceptable (solo con aprobación). |

### Recomendación Estratégica
- **Corto Plazo**: Si el objetivo es tener una validación rápida en un dispositivo móvil con el código existente, se sugiere la ruta **B (PWA)**, mientras se diseñan las nuevas vistas nativas.
- **Largo Plazo**: La visión definitiva del proyecto exige que sea 100% nativa. Por ende, la ruta **A (Rewrite en Compose)** es el destino final inevitable. Iremos reemplazando módulo a módulo creando el proyecto Android e implementando cada vista nativa.

*Nota: La opción C (WebViewWrapper) contradice el espíritu "estable sin solapamientos" y no se implementará salvo aprobación explícita.*


## 3. Preguntas abiertas para el usuario (Pendientes de Aprobación)

1. **Ruta de migración**: ¿Apruebas que iniciemos creando una estructura nativa base en Kotlin + Compose (Ruta A) para migrar los módulos gradualmente, o prefieres envolver la app temporalmente en una PWA (Ruta B)?
2. **Archivos académicos (`*.excalidrawlib`, `_basicapi.pdf`)**: ¿Confirmas la eliminación de estos archivos en la Fase 3, o los reenfocamos de alguna manera útil para el "daily driver"?
3. **Módulo UdeA (`sec-udea`)**: Este módulo es altamente específico. ¿Se retira por completo de la app de uso diario, o se reconfigura de alguna forma?
