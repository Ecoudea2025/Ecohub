# ROADMAP (Ecohub to Android Daily Driver)

Este documento rastrea el progreso de la transformación de Ecohub en una app Android de uso diario.

## FASE 0 — Auditoría y setup
- [x] Auditoría de módulos y clasificación (Sirve / Reenfocar / Eliminar).
- [x] Documentar `MIGRATION.md` (plan de migración y estrategia).
- [x] Crear `AGENTS.md` con reglas permanentes.
- [x] Actualizar `.gitignore`.
- [x] Crear este `ROADMAP.md`.

## FASE 1 — Módulos que SÍ sirven (mejorar para mobile)
Estos módulos se conservan pero se mejoran para ser mobile-first:
- [ ] **Calculadora de promedios**: UI mobile, teclado numérico grande, resultados grandes.
- [ ] **Reproductor (Música)**: controles táctiles grandes, integración con notificaciones multimedia.
- [ ] **Lector PDF**: scroll fluido, zoom con pinch, modo nocturno.
- [ ] **Tablero**: responsive, cards apilables en móvil, sin desbordes.
- [ ] **Agenda**: vista de lista en móvil, recordatorios locales.

## FASE 2 — Módulos que necesitan reenfoque
- [ ] **Enlaces**: rediseñar como "Mis links frecuentes" (guardar URL + favicon automático, grid de iconos grandes, búsqueda rápida, ordenamiento por uso).

## FASE 3 — Eliminar/reemplazar (Economía y Labs)
- [ ] Eliminar **Labs** del menú principal.
- [ ] Eliminar módulos de **Economía** del menú principal.
- [ ] Reenfocar código de Economía si sirve para algo cotidiano (ej. calculadora de gastos).

## FASE 4 — Nuevas features "daily driver"
- [ ] **"¿Cuánto me falta para el final?"**: contador de días/semanas hasta una fecha objetivo.
- [ ] **Recordatorios rápidos**: crear en 2 taps, notificación local.
- [ ] **Notas rápidas**: captura instantánea, guardado local, búsqueda.
- [ ] **Hábitos diarios**: checkbox diario, racha, vista semanal.
- [ ] **Temporizador Pomodoro**: integrado con el módulo de enfoque.
- [ ] **Modo oscuro/claro + tema dinámico**: Material You, Android 12+.
- [ ] **Cambio de nombre de app**: usar `activity-alias` para nombre e icono personalizados.
- [ ] **Generador de logo simple**: elegir icono de galería + color de fondo, generar bitmap.

## FASE 5 — Estabilidad y polish
- [ ] Auditoría de crashes (NullPointerException, etc.).
- [ ] Test en múltiples tamaños de pantalla (emulador: 5", 6.1", 6.7", tablet).
- [ ] Optimización de memoria (ViewModel, Context leaks).
- [ ] Reducción de tamaño de APK (R8/ProGuard, remover dependencias no usadas).
