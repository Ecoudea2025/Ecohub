<?php
// Ecohub — api/storage.php
// Motor de base de datos local persistente con SQLite (PDO)
// Inmune al borrado de cookies, datos del navegador y modo incógnito.

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$dbFile = $dataDir . DIRECTORY_SEPARATOR . 'ecohub.sqlite';
$backupsDir = $dataDir . DIRECTORY_SEPARATOR . 'backups';

if (!is_dir($dataDir)) {
    @mkdir($dataDir, 0777, true);
}
if (!is_dir($backupsDir)) {
    @mkdir($backupsDir, 0777, true);
}

function get_db(): PDO {
    global $dbFile;
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $pdo = new PDO('sqlite:' . $dbFile);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Optimizaciones SQLite de alta concurrencia y fiabilidad
    $pdo->exec('PRAGMA journal_mode = WAL;');
    $pdo->exec('PRAGMA synchronous = NORMAL;');
    $pdo->exec('PRAGMA busy_timeout = 5000;');

    $pdo->exec('CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );');

    $pdo->exec('CREATE TABLE IF NOT EXISTS meta_info (
        key TEXT PRIMARY KEY,
        val TEXT
    );');

    return $pdo;
}

function normalize_ts($ts, int $fallback): int {
    if (!isset($ts) || !is_numeric($ts)) return $fallback;
    $num = (float)$ts;
    if ($num > 9999999999) {
        $num = $num / 1000;
    }
    return (int)$num;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

try {
    $db = get_db();

    // 1. EXPORTAR BACKUP
    if ($action === 'export') {
        $stmt = $db->query('SELECT key, value, updated_at FROM kv_store');
        $rows = $stmt->fetchAll();
        $payload = [
            'app' => 'Ecohub',
            'version' => 1,
            'exported_at' => gmdate('Y-m-d\TH:i:s\Z'),
            'count' => count($rows),
            'data' => []
        ];
        foreach ($rows as $r) {
            $val = json_decode($r['value'], true);
            $payload['data'][$r['key']] = ($val !== null || $r['value'] === 'null') ? $val : $r['value'];
        }

        // Guardar copia de seguridad automática en el disco del servidor
        $snapshotFile = $backupsDir . DIRECTORY_SEPARATOR . 'ecohub_backup_' . date('Ymd_His') . '.json';
        @file_put_contents($snapshotFile, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

        // Descarga directa si es pedida desde navegador
        if (isset($_GET['download'])) {
            header('Content-Disposition: attachment; filename="ecohub_backup_' . date('Ymd') . '.json"');
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // 2. OBTENER DATOS (GET)
    if ($method === 'GET') {
        if (!empty($_GET['key'])) {
            $stmt = $db->prepare('SELECT value, updated_at FROM kv_store WHERE key = ?');
            $stmt->execute([$_GET['key']]);
            $row = $stmt->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['status' => 'not_found', 'key' => $_GET['key']]);
                exit;
            }
            $parsed = json_decode($row['value'], true);
            echo json_encode([
                'status' => 'ok',
                'key' => $_GET['key'],
                'value' => ($parsed !== null || $row['value'] === 'null') ? $parsed : $row['value'],
                'updated_at' => (int)$row['updated_at']
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Devolver todas las claves para rehidratación completa
        $stmt = $db->query('SELECT key, value, updated_at FROM kv_store');
        $rows = $stmt->fetchAll();
        $data = [];
        $meta = [];
        foreach ($rows as $r) {
            $parsed = json_decode($r['value'], true);
            $data[$r['key']] = ($parsed !== null || $r['value'] === 'null') ? $parsed : $r['value'];
            $meta[$r['key']] = (int)$r['updated_at'];
        }

        echo json_encode([
            'status' => 'ok',
            'count' => count($data),
            'data' => $data,
            'timestamps' => $meta
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    // 3. GUARDAR / ACTUALIZAR DATOS (POST)
    if ($method === 'POST') {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true);

        if (!is_array($body)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'msg' => 'JSON inválido']);
            exit;
        }

        $now = time();

        // Modo Importar Backup completo
        if ($action === 'import' && isset($body['data']) && is_array($body['data'])) {
            $db->beginTransaction();
            $stmt = $db->prepare('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)');
            $imported = 0;
            foreach ($body['data'] as $k => $v) {
                $valStr = is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $stmt->execute([$k, $valStr, $now]);
                $imported++;
            }
            $db->commit();
            echo json_encode(['status' => 'ok', 'imported' => $imported]);
            exit;
        }

        // Modo Lote (Batch)
        if (isset($body['batch']) && is_array($body['batch'])) {
            $db->beginTransaction();
            $stmt = $db->prepare('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)');
            $saved = 0;
            foreach ($body['batch'] as $item) {
                if (empty($item['key'])) continue;
                $valStr = is_string($item['value']) ? $item['value'] : json_encode($item['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $ts = normalize_ts($item['updated_at'] ?? null, $now);
                $stmt->execute([$item['key'], $valStr, $ts]);
                $saved++;
            }
            $db->commit();
            echo json_encode(['status' => 'ok', 'saved' => $saved]);
            exit;
        }

        // Modo Clave única
        if (!isset($body['key'])) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'msg' => 'Falta "key"']);
            exit;
        }

        $key = (string)$body['key'];
        $val = $body['value'] ?? null;
        $valStr = is_string($val) ? $val : json_encode($val, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $ts = normalize_ts($body['updated_at'] ?? null, $now);

        $stmt = $db->prepare('INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)');
        $stmt->execute([$key, $valStr, $ts]);

        echo json_encode(['status' => 'ok', 'key' => $key, 'updated_at' => $ts]);
        exit;
    }

    // 4. ELIMINAR CLAVE (DELETE)
    if ($method === 'DELETE') {
        $key = $_GET['key'] ?? '';
        if (empty($key)) {
            $raw = file_get_contents('php://input');
            $b = json_decode($raw, true);
            if (!empty($b['key'])) $key = (string)$b['key'];
        }

        if (empty($key)) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'msg' => 'Falta "key" para eliminar']);
            exit;
        }

        $stmt = $db->prepare('DELETE FROM kv_store WHERE key = ?');
        $stmt->execute([$key]);

        echo json_encode(['status' => 'ok', 'deleted' => $key]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['status' => 'error', 'msg' => 'Método no permitido']);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'msg' => $e->getMessage()]);
}
