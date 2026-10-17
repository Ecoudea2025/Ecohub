<?php
// UdeA proxy para EJPSD0020E: convierte WAS third-party cookie en first-party (localhost)
// Usa cURL si está disponible, si no fallback a file_get_contents
session_start();
$allowed = ['udearroba.udea.edu.co', 'www.udea.edu.co'];
$url = $_GET['url'] ?? 'https://udearroba.udea.edu.co/home/';
if (!filter_var($url, FILTER_VALIDATE_URL)) { http_response_code(400); exit('URL inválida'); }
$host = parse_url($url, PHP_URL_HOST);
if (!in_array($host, $allowed, true)) { http_response_code(403); exit('Host no permitido'); }

// Cookie jar temporal en el directorio temporal del sistema (fuera del repositorio)
$cookieFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ecohub_proxy_' . md5(session_id() ?: 'guest') . '.txt';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$body = file_get_contents('php://input');

// Cargar cookies previas
$cookieHeader = '';
if (is_file($cookieFile)) {
    $c = @file_get_contents($cookieFile);
    if ($c) {
        // Formato netscape o simple: extraer líneas con cookie
        $lines = explode("\n", $c);
        $cookies = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            $parts = explode("\t", $line);
            if (count($parts) >= 7) $cookies[] = $parts[5] . '=' . $parts[6];
            elseif (strpos($line, '=') !== false) $cookies[] = $line;
        }
        if (!empty($cookies)) $cookieHeader = implode('; ', $cookies);
        // Fallback: si el archivo es simple lista de Set-Cookie raw, usarlo tal cual
        if (empty($cookies) && strpos($c, '=') !== false && strpos($c, "\t") === false) {
            $cookieHeader = trim(str_replace("\r\n", "; ", $c));
        }
    }
}

if (function_exists('curl_init')) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
    curl_setopt($ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT'] ?? 'Mozilla/5.0');
    curl_setopt($ch, CURLOPT_HEADER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    curl_setopt($ch, CURLOPT_TIMEOUT, 25);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        if ($contentType) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: ' . $contentType]);
    } elseif ($cookieHeader) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Cookie: ' . $cookieHeader]);
    }
    $response = curl_exec($ch);
    if ($response === false) {
        http_response_code(502);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Proxy error: " . curl_error($ch);
        curl_close($ch);
        exit;
    }
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $headerStr = substr($response, 0, $headerSize);
    $bodyOut = substr($response, $headerSize);
    $contentTypeOut = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: 'text/html';
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
} else {
    // Fallback file_get_contents
    $headers = ['User-Agent: ' . ($_SERVER['HTTP_USER_AGENT'] ?? 'Mozilla/5.0')];
    if ($cookieHeader) $headers[] = 'Cookie: ' . $cookieHeader;
    if ($contentType) $headers[] = 'Content-Type: ' . $contentType;
    $opts = [
        'http' => [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'content' => $body,
            'follow_location' => 1,
            'max_redirects' => 5,
            'ignore_errors' => true,
            'timeout' => 25,
        ],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
    ];
    $ctx = stream_context_create($opts);
    $bodyOut = @file_get_contents($url, false, $ctx);
    if ($bodyOut === false) {
        http_response_code(502);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Proxy error: no se pudo conectar a $host";
        exit;
    }
    $contentTypeOut = 'text/html';
    $httpCode = 200;
    if (isset($http_response_header)) {
        foreach ($http_response_header as $h) {
            if (stripos($h, 'Content-Type:') === 0) $contentTypeOut = trim(substr($h, 13));
            if (stripos($h, 'HTTP/') === 0) $httpCode = (int)substr($h, 9, 3);
            if (stripos($h, 'Set-Cookie:') === 0) {
                $cookieVal = trim(substr($h, 11));
                // Guardar cookie simple
                file_put_contents($cookieFile, $cookieVal . "\n", FILE_APPEND);
            }
        }
    }
}

header('Content-Type: ' . $contentTypeOut);
http_response_code($httpCode);

if (stripos($contentTypeOut, 'text/html') !== false) {
    $base = 'https://' . $host . '/';
    if (stripos($bodyOut, '<head') !== false) {
        $bodyOut = preg_replace('/<head[^>]*>/i', '$0<base href="' . htmlspecialchars($base, ENT_QUOTES) . '">', $bodyOut, 1);
    }
    $inject = '<script>(function(){document.addEventListener("click",function(e){var a=e.target.closest("a[href]");if(!a)return;var h=a.getAttribute("href");if(!h||h.startsWith("javascript:")||h.startsWith("mailto:")||h.startsWith("#"))return;try{var u=new URL(h, location.href);if(u.hostname==="' . $host . '"){e.preventDefault();location.href="/Ecohub/api/udea-proxy.php?url="+encodeURIComponent(u.href);}}catch(e){}},true);})();</script>';
    $bodyOut = str_replace('</body>', $inject . '</body>', $bodyOut);
    if (strpos($bodyOut, $inject) === false) $bodyOut .= $inject;
}

echo $bodyOut;
