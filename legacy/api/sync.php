<?php
// econhub — bridge de sincronización: lee/escribe plan/agenda.json (whitelist)
// y regenera plan/agenda.md (espejo legible para opencode).
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

$planDir = __DIR__ . '/../plan';
$jsonFile = $planDir . '/agenda.json';
$mdFile = $planDir . '/agenda.md';
$bakFile = $planDir . '/agenda.bak.json';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function fail(string $msg, int $code = 400): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function read_json(): array {
    global $jsonFile;
    if (!is_file($jsonFile)) {
        return ['version' => 1, 'events' => [], 'tasks' => [], 'goals' => [], 'changelog' => []];
    }
    $raw = file_get_contents($jsonFile);
    $d = json_decode($raw, true);
    if (!is_array($d)) fail('agenda.json está corrupto', 500);
    foreach (['events', 'tasks', 'goals', 'changelog'] as $k) {
        if (!isset($d[$k]) || !is_array($d[$k])) $d[$k] = [];
    }
    return $d;
}

function esc(string $s): string {
    return str_replace(["\r", "\n"], ' ', trim($s));
}

function fmt_date(string $d): string {
    $t = strtotime($d);
    if (!$t) return $d;
    $meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return date('j', $t) . ' de ' . $meses[(int)date('n', $t) - 1] . ' de ' . date('Y', $t);
}

function md_from(array $d): string {
    $out = [];
    $out[] = '# Agenda de estudio — Ecohub';
    $out[] = '';
    $out[] = '> Generado por Ecohub. Este archivo es el espejo legible de `plan/agenda.json`.';
    $out[] = '';
    $out[] = '## Objetivos de la semana';
    $out[] = '';
    if (empty($d['goals'])) {
        $out[] = '_No hay objetivos aún._';
    } else {
        foreach ($d['goals'] as $i => $g) $out[] = ($i + 1) . '. ' . esc((string)$g);
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
            $t = isset($e['title']) ? esc((string)$e['title']) : '(sin título)';
            $f = fmt_date((string)($e['date'] ?? ''));
            $h = '';
            if (!empty($e['start'])) $h = ' a las ' . esc((string)$e['start']);
            $r = !empty($e['recurring']) && $e['recurring'] !== 'none' ? ' [recursivo: ' . esc((string)$e['recurring']) . ']' : '';
            $done = !empty($e['done']) ? ' [HECHO]' : '';
            $line = '- ' . $f . $h . ': ' . $t . $r . $done;
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
        foreach ($tasks as $t) {
            $byDay[(string)($t['date'] ?? '')][] = $t;
        }
        ksort($byDay);
        foreach ($byDay as $day => $list) {
            $out[] = '### ' . fmt_date($day);
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
    $out[] = '## Último cambio';
    $out[] = '';
    if (!empty($d['changelog'])) {
        $last = $d['changelog'][0];
        $out[] = '- ' . esc((string)($last['ts'] ?? '')) . ': ' . esc((string)($last['text'] ?? ''));
    }
    $out[] = '';
    return implode("\n", $out);
}

function write_all(array $d): void {
    global $jsonFile, $mdFile, $bakFile;
    $json = json_encode($d, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) fail('No se pudo serializar la agenda');
    if (is_file($jsonFile)) @copy($jsonFile, $bakFile);
    file_put_contents($jsonFile, $json, LOCK_EX);
    file_put_contents($mdFile, md_from($d), LOCK_EX);
}

if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

if ($method === 'GET' || $method === 'HEAD') {
    $data = read_json();
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['data']) || !is_array($body['data'])) fail('Body inválido');
    $d = $body['data'];
    foreach (['events', 'tasks', 'goals', 'changelog'] as $k) {
        if (!isset($d[$k]) || !is_array($d[$k])) $d[$k] = [];
    }
    $d['version'] = 1;
    $d['changelog'] = array_slice(array_values($d['changelog']), 0, 200);
    write_all($d);
    echo json_encode(['ok' => true]);
    exit;
}

fail('Método no permitido', 405);
