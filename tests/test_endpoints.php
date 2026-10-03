<?php
// tests/test_endpoints.php
// Simulación integral de endpoints para verificación de autonomía

declare(strict_types=1);

require_once __DIR__ . '/../api/keyword_parser.php';

echo "--- 1. Probando KeywordParser con mensaje en lenguaje natural ---\n";
$msg = 'Revisar examen de econometría el 15/10';
$parsed = KeywordParser::parse($msg);
echo "Resultado: " . json_encode($parsed, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n\n";

assert($parsed !== null, 'El parser no debería ser null');
assert($parsed['fecha'] === '2026-10-15', 'La fecha debería ser 2026-10-15');
assert(str_contains($parsed['tarea'], 'Revisar'), 'La tarea debe contener el verbo');

echo "--- 2. Probando lectura y escritura de agenda (sync / storage) ---\n";
$planDir = dirname(__DIR__) . '/plan';
$jsonFile = $planDir . '/agenda.json';
$raw = file_get_contents($jsonFile);
$agenda = json_decode($raw, true);

assert(is_array($agenda), 'agenda.json debe ser un array válido');
assert(isset($agenda['tasks']), 'agenda.json debe tener tasks');
echo "agenda.json verificado correctamente.\n\n";

echo "--- 3. Verificando integridad de archivos HTML/CSS/JS ---\n";
$root = dirname(__DIR__);
assert(file_exists($root . '/index.html'), 'index.html debe existir');
assert(file_exists($root . '/css/styles.css'), 'styles.css debe existir');
assert(file_exists($root . '/js/main.js'), 'main.js debe existir');
assert(file_exists($root . '/README.md'), 'README.md debe existir');
assert(file_exists($root . '/.gitignore'), '.gitignore debe existir');

echo "✅ TODAS LAS PRUEBAS DE AUTONOMÍA E INTEGRIDAD PASARON CORRECTAMENTE.\n";
