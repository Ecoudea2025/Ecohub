<?php
// Ecohub — tests/test_keyword_parser.php
// Pruebas unitarias para el parser determinista de palabras clave y fechas.

declare(strict_types=1);

require_once __DIR__ . '/../api/keyword_parser.php';

// Fijar fecha de referencia determinista para pruebas: viernes 2026-10-02
$referenceDate = new DateTimeImmutable('2026-10-02');

$testCases = [
    [
        'name' => 'Caso 1: Día de mes en palabras ("8 de agosto")',
        'input' => 'Revisar el informe de macroeconomía el 8 de agosto',
        'expected_verb_in_task' => 'revisar',
        'expected_date' => '2026-08-08',
    ],
    [
        'name' => 'Caso 2: Formato numérico DD/MM ("15/09")',
        'input' => 'Enviar trabajo final 15/09',
        'expected_verb_in_task' => 'enviar',
        'expected_date' => '2026-09-15',
    ],
    [
        'name' => 'Caso 3: Día relativo ("el próximo lunes")',
        'input' => 'Agendar reunión con el profesor el próximo lunes',
        'expected_verb_in_task' => 'agendar',
        'expected_date' => '2026-10-05', // El viernes 02 de octubre -> siguiente lunes es 05 de octubre
    ],
    [
        'name' => 'Caso 4: Conector y fecha con mes ("antes del 20 de octubre")',
        'input' => 'Pagar matrícula antes del 20 de octubre',
        'expected_verb_in_task' => 'pagar',
        'expected_date' => '2026-10-20',
    ],
    [
        'name' => 'Caso 5: Relativo inmediato ("mañana")',
        'input' => 'Confirmar asistencia al seminario mañana',
        'expected_verb_in_task' => 'confirmar',
        'expected_date' => '2026-10-03', // 2026-10-02 + 1 día
    ],
];

echo "============================================================\n";
echo "ECOHUB — TESTS UNITARIOS: KEYWORD PARSER (MODO AUTÓNOMO)\n";
echo "Fecha de referencia fijada: " . $referenceDate->format('Y-m-d (l)') . "\n";
echo "============================================================\n\n";

$passed = 0;
$failed = 0;

foreach ($testCases as $index => $tc) {
    $num = $index + 1;
    $result = KeywordParser::parse($tc['input'], $referenceDate);

    if ($result === null) {
        echo "❌ [FALLO] {$tc['name']}\n";
        echo "   Entrada: '{$tc['input']}'\n";
        echo "   Error: El parser devolvió null.\n\n";
        $failed++;
        continue;
    }

    $errors = [];

    // Validar estructura
    if (!isset($result['fecha'], $result['tarea'], $result['texto_original'])) {
        $errors[] = "Faltan claves obligatorias en la salida estructurada.";
    }

    // Validar fecha ISO8601
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $result['fecha'])) {
        $errors[] = "La fecha '{$result['fecha']}' no cumple con el formato ISO8601 (YYYY-MM-DD).";
    } elseif ($result['fecha'] !== $tc['expected_date']) {
        $errors[] = "Fecha esperada '{$tc['expected_date']}', obtenida '{$result['fecha']}'.";
    }

    // Validar que el texto original coincida
    if ($result['texto_original'] !== $tc['input']) {
        $errors[] = "El texto original no coincide exactamente.";
    }

    // Validar presencia del verbo en la tarea
    if (stripos($result['tarea'], $tc['expected_verb_in_task']) === false) {
        $errors[] = "La tarea '{$result['tarea']}' no contiene el verbo '{$tc['expected_verb_in_task']}'.";
    }

    if (empty($errors)) {
        echo "✅ [PASÓ] {$tc['name']}\n";
        echo "   Entrada:         '{$tc['input']}'\n";
        echo "   Fecha ISO8601:   {$result['fecha']}\n";
        echo "   Tarea extraída:  '{$result['tarea']}'\n\n";
        $passed++;
    } else {
        echo "❌ [FALLO] {$tc['name']}\n";
        echo "   Entrada: '{$tc['input']}'\n";
        foreach ($errors as $err) {
            echo "   Error: {$err}\n";
        }
        echo "\n";
        $failed++;
    }
}

echo "============================================================\n";
echo "RESULTADOS: {$passed} pasadas, {$failed} fallidas de " . count($testCases) . " pruebas.\n";
echo "============================================================\n";

if ($failed > 0) {
    exit(1);
}

exit(0);
