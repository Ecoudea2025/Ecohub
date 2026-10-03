<?php
// Ecohub — api/chat.php
// Chatbot autónomo para planificación de agenda mediante parser determinista de palabras clave.
// Reemplazo autónomo y local del agente OpenCode: no requiere LLM, API keys ni servicios externos.

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

require_once __DIR__ . '/keyword_parser.php';

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    fail('Método no permitido', 405);
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    fail('Cuerpo de la petición inválido');
}

$message = trim((string)($body['message'] ?? ''));
if ($message === '') {
    fail('Mensaje vacío');
}

$repo = realpath(__DIR__ . '/..');
if (!$repo) {
    fail('No se pudo ubicar el repositorio', 500);
}

$planDir = $repo . DIRECTORY_SEPARATOR . 'plan';
$jsonFile = $planDir . DIRECTORY_SEPARATOR . 'agenda.json';
$mdFile = $planDir . DIRECTORY_SEPARATOR . 'agenda.md';

function read_agenda(string $jsonFile): array {
    if (!is_file($jsonFile)) {
        return ['version' => 1, 'events' => [], 'tasks' => [], 'goals' => [], 'changelog' => []];
    }
    $d = json_decode((string)file_get_contents($jsonFile), true);
    if (!is_array($d)) {
        return ['version' => 1, 'events' => [], 'tasks' => [], 'goals' => [], 'changelog' => []];
    }
    foreach (['events', 'tasks', 'goals', 'changelog'] as $k) {
        if (!isset($d[$k]) || !is_array($d[$k])) $d[$k] = [];
    }
    $d['version'] = 1;
    return $d;
}

function esc(string $s): string {
    return str_replace(["\r", "\n"], ' ', trim($s));
}

function md_from(array $d): string {
    $meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    $fmt = function (string $dt) use ($meses): string {
        $t = strtotime($dt);
        return $t ? date('j', $t) . ' de ' . $meses[(int)date('n', $t) - 1] . ' de ' . date('Y', $t) : $dt;
    };
    $out = ['# Agenda de estudio — Ecohub', '', '> Generado por Ecohub. Este archivo es el espejo legible de `plan/agenda.json`.', '', '## Objetivos de la semana', ''];
    if (empty($d['goals'])) {
        $out[] = '_No hay objetivos aún._';
    } else {
        foreach ($d['goals'] as $i => $g) {
            $out[] = ($i + 1) . '. ' . esc((string)$g);
        }
    }
    $out[] = '';
    $out[] = '## Próximos eventos';
    $out[] = '';
    $events = $d['events'];
    usort($events, fn($a, $b) => strcmp($a['date'] ?? '', $b['date'] ?? ''));
    if (empty($events)) {
        $out[] = '_No hay eventos aún._';
    } else {
        foreach ($events as $e) {
            $line = '- ' . $fmt((string)($e['date'] ?? '')) . (!empty($e['start']) ? ' a las ' . esc((string)$e['start']) : '') . ': ' . esc((string)($e['title'] ?? '(sin título)'));
            if (!empty($e['recurring']) && $e['recurring'] !== 'none') $line .= ' [recursivo: ' . esc((string)$e['recurring']) . ']';
            if (!empty($e['done'])) $line .= ' [HECHO]';
            if (!empty($e['notes'])) $line .= ' — ' . esc((string)$e['notes']);
            $out[] = $line;
        }
    }
    $out[] = '';
    $out[] = '## Tareas';
    $out[] = '';
    $tasks = $d['tasks'];
    usort($tasks, fn($a, $b) => strcmp($a['date'] ?? '', $b['date'] ?? ''));
    if (empty($tasks)) {
        $out[] = '_No hay tareas aún._';
        $out[] = '';
    } else {
        $byDay = [];
        foreach ($tasks as $t) $byDay[(string)($t['date'] ?? '')][] = $t;
        ksort($byDay);
        foreach ($byDay as $day => $list) {
            $out[] = '### ' . $fmt($day);
            $out[] = '';
            foreach ($list as $t) {
                $prio = ['low' => 'baja', 'med' => 'media', 'high' => 'alta'][$t['priority'] ?? 'med'] ?? 'media';
                $min = isset($t['estMin']) && $t['estMin'] ? ' (~' . (int)$t['estMin'] . ' min)' : '';
                $done = !empty($t['done']) ? '[x]' : '[ ]';
                $cat = !empty($t['category']) ? ' (' . esc((string)$t['category']) . ')' : '';
                $out[] = '- ' . $done . ' **' . esc((string)($t['title'] ?? '(sin título)')) . '** — prioridad ' . $prio . $min . $cat;
            }
            $out[] = '';
        }
    }
    return implode("\n", $out);
}

function write_all(array $d, string $jsonFile, string $mdFile): void {
    $json = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) return;
    file_put_contents($jsonFile, $json);
    file_put_contents($mdFile, md_from($d));
}

// Procesar mensaje con el parser determinista
$parsed = KeywordParser::parse($message);

if ($parsed !== null) {
    $agenda = read_agenda($jsonFile);
    
    $newTask = [
        'id' => uniqid('t', true),
        'title' => $parsed['tarea'],
        'date' => $parsed['fecha'],
        'category' => 'estudio',
        'priority' => 'med',
        'estMin' => null,
        'done' => false,
    ];
    
    $agenda['tasks'][] = $newTask;
    $agenda['changelog'] = array_merge([
        [
            'ts' => gmdate('c'),
            'agent' => 'keyword-parser',
            'text' => 'Agente: añadida tarea "' . $parsed['tarea'] . '" (' . $parsed['fecha'] . ')'
        ]
    ], array_slice($agenda['changelog'], 0, 199));

    write_all($agenda, $jsonFile, $mdFile);

    echo json_encode([
        'ok' => true,
        'text' => "✅ Tarea añadida a tu agenda: \"{$parsed['tarea']}\" para el {$parsed['fecha']}.",
        'parsed' => $parsed,
        'applied' => 1
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Fallback informativo cuando no se detecta el patrón
echo json_encode([
    'ok' => true,
    'text' => "ℹ️ Modo autónomo (parser de palabras clave):\nNo se detectó un patrón de acción y fecha.\n\nPrueba con frases como:\n• 'Revisar informe de economía el 8 de agosto'\n• 'Enviar trabajo final 15/09'\n• 'Agendar asesoría el próximo lunes'\n• 'Pagar matrícula antes del 20 de octubre'\n• 'Confirmar asistencia mañana'",
    'parsed' => null,
    'applied' => 0
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
