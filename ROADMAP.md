# ROADMAP (Ecohub to Android Daily Driver)

Este documento rastrea el progreso de la transformación de Ecohub en una app Android nativa (Kotlin + Compose) de uso diario.

## Sprint 0 — Auditoría y Setup
- [x] Auditoría de módulos y clasificación (Sirve / Reenfocar / Eliminar).
- [x] Documentar `MIGRATION.md` (plan de migración y estrategia).
- [x] Crear `AGENTS.md` con reglas permanentes.
- [x] Actualizar `.gitignore`.
- [x] Crear este `ROADMAP.md`.
- [x] Setup del proyecto Android (`/android`): Gradle, Compose, Material 3, tema claro/oscuro, navegación base.

## Sprint 1 — Validación End-to-End
- [x] Migrar **Calculadora**: UI mobile nativa, teclado grande de uso diario/gastos.

## Sprint 2 — Módulos Simples (Esfuerzo S)
- [x] Migrar **Calculadora de Promedios**: UI nativa, teclado numérico.
- [x] Migrar **Agenda**: Vista de lista en móvil, notificaciones/recordatorios locales Android.

## Sprint 3 — Módulos Medios (Esfuerzo M)
- [ ] Migrar **Lector PDF**: scroll fluido, zoom con pinch, intent filters para PDFs locales.
- [ ] Migrar **Música (Reproductor)**: controles táctiles grandes, integración con notificaciones de Android Media.
- [ ] Migrar **Tablero**: canvas nativo o solución híbrida adaptada al touch.
- [ ] Migrar **Enlaces ("Mis links frecuentes")**: guardar URL + favicon, grid nativo de iconos, tap para abrir en Chrome Custom Tabs.

## Sprint 4 — Módulos Complejos (Esfuerzo L)
- [ ] Migrar **Dashboard (Inicio)**: widgets cotidianos (hábitos, notas, tareas).
- [ ] Migrar **Universidad/Académico**: reenfocar "UdeA" a algo general (fechas, links de portales).
- [ ] **Archivar código web antiguo**: mover HTML/JS original a `/legacy/`.

## Sprint 5 — Nuevas features "daily driver"
- [ ] **"¿Cuánto me falta para el final?"**: contador de días/semanas hasta una fecha objetivo.
- [ ] **Recordatorios rápidos**: crear en 2 taps.
- [ ] **Notas rápidas**: captura instantánea, guardado local.
- [ ] **Hábitos diarios**: checkbox diario, racha, vista semanal.
- [ ] **Temporizador Pomodoro**: integrado con notificaciones.
- [ ] **Tema dinámico**: Material You (Android 12+).
- [ ] **Cambio de nombre e icono de app**: mediante `activity-alias` dinámico.

## Sprint 6 — Estabilidad y Publicación
- [ ] Auditoría de crashes nativos (Crashlytics/Logcat).
- [ ] Test de UI en múltiples tamaños (5", 6.1", 6.7", tablet/landscape).
- [ ] Optimización de memoria y R8/ProGuard.
