# INSTRUCCIONES PERMANENTES PARA AGENTES (Ecohub)

Estas reglas se aplican a todo agente de IA que contribuya al proyecto Ecohub. El objetivo es transformar Ecohub en una app Android "daily driver", estable y usable en celular.

## Reglas de trabajo
- Trabaja SIEMPRE sobre la rama `main` (o crea ramas feature siguiendo el patrón `feat/nombre-tarea`).
- Cada cambio debe ser **atómico**: una tarea = un PR. No mezcles features distintas.
- Antes de modificar, lee TODO el archivo afectado y el `AGENTS.md`.
- Si una tarea requiere cambios en múltiples archivos, lista primero los archivos que tocarás y espera confirmación si hay ambigüedad.
- Ejecuta los tests existentes después de cada cambio. Si no hay tests, créalos para la funcionalidad que modifiques.
- Documenta cada cambio en el PR con: qué se hizo, por qué, archivos tocados, cómo probarlo.

## Reglas de UI/UX (obligatorias)
- **Mobile-first**: TODO debe verse bien en pantallas de 5" a 7". Cero scroll horizontal, cero elementos cortados.
- **Sin solapamientos**: usa `WindowInsets`, `Modifier.imePadding()`, `safeDrawingPadding()` donde aplique.
- **Diseño consistente**: usa Material 3 (Compose) o el sistema de diseño existente. No mezcles estilos.
- **Accesibilidad**: contraste mínimo 4.5:1, tamaños táctiles ≥ 48dp.
- **Rendimiento**: evita recomposiciones innecesarias, usa `LazyColumn`/`LazyRow` para listas.

## CÓMO TRABAJAR CADA DÍA (protocolo diario)
Cada vez que se te invoque, sigue este protocolo:
1. Lee `AGENTS.md` y el estado actual del repo.
2. Revisa si hay un PR abierto tuyo sin mergear. Si lo hay, espera.
3. Elige UNA tarea de la fase actual (la primera pendiente en `ROADMAP.md`).
4. Antes de codear: escribe en un comentario del PR el plan (qué archivos, qué cambios).
5. Implementa, testea, y abre el PR.
6. En el PR, incluye:
   - Título: `[Fase X] Descripción breve`
   - Cuerpo: qué, por qué, cómo probar, screenshots si aplica.
   - Marca la tarea como completada en un `ROADMAP.md`.

## RESTRICCIONES
- ❌ NO introduzcas dependencias nuevas sin justificarlo y sin verificar que sean estables y mantenidas.
- ❌ NO uses APIs que requieran API keys (a menos que sea imprescindible y el usuario lo confirme).
- ❌ NO hagas refactors masivos que rompan la app; cambios incrementales.
- ❌ NO cambies el stack tecnológico sin consultar.
- ✅ SIEMPRE prioriza que la app funcione en celular sobre cualquier otra cosa.
- ✅ SIEMPRE documenta supuestos y limitaciones.
- Si algo es ambiguo, PREGUNTA antes de asumir.

## CHECKLIST RÁPIDO (verificar antes de cerrar PR)
- [ ] La app compila sin errores.
- [ ] Los tests pasan.
- [ ] No hay solapamientos en móvil (5").
- [ ] No hay scroll horizontal.
- [ ] La funcionalidad nueva es usable en 3 taps o menos.
- [ ] Documentación actualizada (si aplica).
