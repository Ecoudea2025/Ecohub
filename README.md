# Ecohub — Hub de Estudio para Economía

**Ecohub** es una plataforma web modular, autónoma y privada diseñada como espacio de trabajo integral para estudiantes y profesionales de Economía. Integra herramientas de cálculo, visualización matemática, simulación de modelos macroeconómicos, resolución de árboles de decisión en teoría de juegos, editor/anotador de documentos PDF, pizarra interactiva y un sistema de agenda académica con asistente local.

---

## 🚀 Inicio Rápido

El proyecto está diseñado para funcionar de manera **100% autónoma**, sin necesidad de servicios externos, bases de datos complejas ni dependencias pesadas de compilación.

### Requisitos previos
- Navegador web moderno (Chrome, Edge, Firefox, Safari).
- PHP 8.0 o superior (solo para persistencia de agenda y proxy local).

### Ejecución local

#### Opción 1: Script directo (Windows)
Doble clic en `iniciar.bat` o desde la terminal:
```powershell
.\iniciar.bat
```
Abre en tu navegador: `http://localhost:8000`

#### Opción 2: Servidor PHP integrado
```bash
php -S localhost:8000
```
Luego visita `http://localhost:8000` en tu navegador.

#### Opción 3: Internet Information Services (IIS)
Configurado para servirse directamente en `http://localhost/Ecohub` mediante el archivo `web.config` incluido.

---

## 🛠️ Módulos y Funcionalidades

1. **Editor de PDF Pro (`#/pdf`):**
   - Lectura con modos oscuro, sepia y navy.
   - Anotación manual, dibujo libre, resaltado, zoom vectorial y exportación de PDFs con anotaciones incrustadas.
   - Reconocimiento óptico de caracteres (OCR) client-side mediante Tesseract.js.
2. **Herramientas Económicas (`#/herramientas`):**
   - Calculadora científica con historial de operaciones y soporte trigonométrico.
   - Graficador 2D/3D con Plotly para funciones económicas (curvas de indiferencia, IS-LM, frontera de posibilidades).
   - Simulador interactivo en vivo del Modelo de Crecimiento de Solow-Swan con parámetros dinámicos.
3. **Teoría de Juegos (`#/herramientas`):**
   - Constructor y solucionador interactivo de árboles de decisiones para juegos extensivos (equilibrio perfecto en subjuegos, inducción hacia atrás, exportación a LaTeX/istgame y SVG).
4. **Agenda y Planificación (`#/agenda`):**
   - Calendario académico interactivo para seguimiento de eventos, entregas y tareas pendientes.
   - Sincronización local bidireccional (`plan/agenda.json` y `plan/agenda.md`).
   - Asistente de lenguaje natural local con parser determinista de fechas y acciones.
5. **Pizarra Interactiva:**
   - Dibujo técnico, fórmulas matemáticas y diagramas económicos con soporte para librerías de símbolos matemáticos (`.excalidrawlib`).
6. **Repaso Espaciado (`#/laboratorios`):**
   - Sistema de tarjetas de estudio implementando el algoritmo SuperMemo 2 (SM-2) en almacenamiento local.
7. **Control de Calificaciones:**
   - Estimador de promedio ponderado semestral y acumulado por asignaturas.

---

## 🤖 Asistente de Agenda: Parser de Palabras Clave

El sistema de planificación de agenda incorpora un motor de lenguaje natural local y determinista (`api/keyword_parser.php`), diseñado para operar sin necesidad de conexión a internet, API keys ni modelos de lenguaje externos (LLMs).

> [!WARNING]
> **Limitación explícita:**
> *Reemplazo básico del agente original. Solo detecta patrones predefinidos.*

### Patrones y verbos detectados

El parser analiza oraciones en español identificando:
- **Verbos de acción:** `crear`, `enviar`, `revisar`, `agendar`, `confirmar`, `pagar`, `reunir`.
- **Patrones de fecha:**
  - *Día de mes en texto:* `"8 de agosto"`, `"20 de octubre"`, `"15 septiembre"`.
  - *Mes y día:* `"agosto 8"`, `"octubre 20"`.
  - *Formato numérico:* `"15/09"`, `"08/08"`, `"20/10/2026"`.
  - *Fechas relativas:* `"hoy"`, `"mañana"`, `"pasado mañana"`, `"próximo lunes"`, `"este viernes"`.

### Formato de salida estructurada
Al procesar una petición válida, el sistema genera la estructura:
```json
{
  "fecha": "YYYY-MM-DD",
  "tarea": "descripción de la acción a realizar",
  "texto_original": "texto completo introducido por el usuario"
}
```
Y añade automáticamente la tarea a la agenda del estudiante.

---

## 🧪 Pruebas Automatizadas (QA)

Para verificar el correcto funcionamiento del parser de lenguaje natural y la integridad del código:

### 1. Pruebas unitarias del parser
Ejecutar la suite de pruebas automatizadas:
```bash
php tests/test_keyword_parser.php
```
Debe reportar:
```
RESULTADOS: 5 pasadas, 0 fallidas de 5 pruebas.
```

### 2. Comprobación sintáctica
```bash
# Validar PHP
php -l api/sync.php
php -l api/storage.php
php -l api/keyword_parser.php
php -l api/chat.php
php -l api/udea-proxy.php

# Validar JavaScript ES Modules
node --check js/main.js
```

---

## 🔒 Privacidad y Autonomía

- **Cero telemetría externa:** No se envían datos de navegación, tareas ni contenidos personales a servidores de terceros.
- **Libre de secretos:** No requiere variables de entorno (`.env`), tokens de autenticación ni suscripciones de pago.
- **Persistencia local:** La información se guarda exclusivamente en el almacenamiento local del navegador (`localStorage`) y en archivos JSON/SQLite locales gestionados por el usuario.

---

## 📄 Licencia

Distribuido bajo licencia MIT. Consulta el archivo `LICENSE` para más información.
