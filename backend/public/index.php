<?php
// public/index.php — LearnersForge HQ API entry point. PHP 7.4+.
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');

// ── Config ─────────────────────────────────────────────────────────────────────
$cfgPath = dirname(__DIR__) . '/config/hq.php';
if (!is_file($cfgPath)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['status' => 'error', 'data' => null, 'message' => 'HQ config missing on server']);
    exit;
}
$GLOBALS['CFG'] = require $cfgPath;

// ── CORS ───────────────────────────────────────────────────────────────────────
// The app is served same-origin via the /api symlink; these origins mainly cover
// local development.
$allowed = $GLOBALS['CFG']['allowed_origins'] ?? [];
$origin  = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
}
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json; charset=UTF-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Autoload ───────────────────────────────────────────────────────────────────
$base = dirname(__DIR__);
require $base . '/app/Models/DB.php';
require $base . '/app/Support/Mailer.php';
require $base . '/app/Support/Audit.php';
require $base . '/app/Controllers/HqAuth.php';
require $base . '/app/Controllers/HqControllers.php';

// ── Helpers ────────────────────────────────────────────────────────────────────
function respond($data, int $code = 200, string $message = 'success'): void {
    http_response_code($code);
    echo json_encode([
        'status'  => $code < 400 ? 'success' : 'error',
        'data'    => $data,
        'message' => $message,
    ]);
    exit;
}

function body(): array {
    $raw = file_get_contents('php://input');
    return json_decode($raw ?: '{}', true) ?? [];
}

function cfg(string $key, $default = null) {
    return $GLOBALS['CFG'][$key] ?? $default;
}

function clientIp(): string {
    $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($fwd !== '') return trim(explode(',', $fwd)[0]);
    return $_SERVER['REMOTE_ADDR'] ?? '';
}

// Require a valid HQ session; optionally require one of $roles.
function hqGuard(array $roles = []): array {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') !== 0) respond(null, 401, 'Unauthenticated');
    $token = substr($header, 7);

    $u = DB::one(
        'SELECT u.id, u.name, u.email, u.role, u.is_active, s.id AS sid, s.expires_at
         FROM hq_sessions s JOIN hq_users u ON u.id = s.user_id
         WHERE s.token = ?',
        [$token]
    );
    if (!$u || (int) $u['is_active'] !== 1 || strtotime($u['expires_at']) < time()) {
        respond(null, 401, 'Session expired — please sign in again');
    }
    if ($roles && !in_array($u['role'], $roles, true)) {
        respond(null, 403, 'You do not have permission for that action');
    }
    DB::run('UPDATE hq_sessions SET last_seen_at = NOW() WHERE id = ?', [$u['sid']]);
    return $u;
}

// ── Parse URI ──────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$uri    = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Served at hq.learnersforge.com/api (symlink) and /api/v1; strip either prefix.
$uri = preg_replace('#^/api(?:/v1)?#', '', $uri);
$uri = '/' . trim($uri, '/');

// ── Route ──────────────────────────────────────────────────────────────────────
try {
    if ($uri === '/' && $method === 'GET') {
        respond(['service' => 'LearnersForge HQ API', 'ok' => true]);
    }

    // Mobile school directory (PUBLIC — the student app calls this before login)
    elseif ($uri === '/mobile/schools' && $method === 'GET') MobileController::schools();
    elseif (preg_match('#^/mobile/schools/([A-Za-z0-9_-]+)$#', $uri, $mm) && $method === 'GET') MobileController::school($mm[1]);

    // Auth (public)
    elseif ($uri === '/auth/login'  && $method === 'POST') HqAuth::login();
    elseif ($uri === '/auth/verify' && $method === 'POST') HqAuth::verify();
    elseif ($uri === '/auth/me'     && $method === 'GET')  HqAuth::me();
    elseif ($uri === '/auth/logout' && $method === 'POST') HqAuth::logout();

    // Group overview + audit
    elseif ($uri === '/overview' && $method === 'GET') OverviewController::index();
    elseif ($uri === '/audit'    && $method === 'GET') AuditController::index();

    // Schools registry
    elseif ($uri === '/schools/discover' && $method === 'GET')  SchoolsController::discover();
    elseif ($uri === '/schools'          && $method === 'GET')  SchoolsController::index();
    elseif ($uri === '/schools'          && $method === 'POST') SchoolsController::register();

    // Per-school: /schools/{id}[/sub[/{id2}]]
    elseif (preg_match('#^/schools/(\d+)(/[a-z]+(?:/\d+)?)?$#', $uri, $mm)) {
        $sid = (int) $mm[1];
        $sub = $mm[2] ?? '';

        if ($sub === '') {
            if     ($method === 'GET') ManageController::detail($sid);
            elseif ($method === 'PUT') SchoolsController::update($sid);
            else respond(null, 405, 'Method not allowed');
        }
        elseif ($sub === '/suspend'  && $method === 'POST') SchoolsController::suspend($sid);
        elseif ($sub === '/resume'   && $method === 'POST') SchoolsController::resume($sid);
        elseif ($sub === '/detail'   && $method === 'GET')  ManageController::detail($sid);
        elseif ($sub === '/settings' && $method === 'GET')  ManageController::settings($sid);
        elseif ($sub === '/settings' && $method === 'PUT')  ManageController::updateSettings($sid);
        elseif ($sub === '/students' && $method === 'GET')  ManageController::students($sid);
        elseif ($sub === '/staff'    && $method === 'GET')  ManageController::staff($sid);
        elseif ($sub === '/classes'  && $method === 'GET')  ManageController::classes($sid);
        elseif ($sub === '/classes'  && $method === 'POST') ManageController::createClass($sid);
        elseif ($sub === '/fees'     && $method === 'GET')  ManageController::fees($sid);
        elseif ($sub === '/fees'     && $method === 'POST') ManageController::createFee($sid);
        elseif ($sub === '/results'  && $method === 'GET')  ManageController::results($sid);
        elseif (preg_match('#^/students/(\d+)$#', $sub, $m2)) {
            if     ($method === 'PUT')    ManageController::updateStudent($sid, (int) $m2[1]);
            elseif ($method === 'DELETE') ManageController::deleteStudent($sid, (int) $m2[1]);
            else respond(null, 405, 'Method not allowed');
        }
        elseif (preg_match('#^/staff/(\d+)$#', $sub, $m2)) {
            if     ($method === 'PUT')    ManageController::updateStaff($sid, (int) $m2[1]);
            elseif ($method === 'DELETE') ManageController::deleteStaff($sid, (int) $m2[1]);
            else respond(null, 405, 'Method not allowed');
        }
        elseif (preg_match('#^/classes/(\d+)$#', $sub, $m2)) {
            if     ($method === 'PUT')    ManageController::updateClass($sid, (int) $m2[1]);
            elseif ($method === 'DELETE') ManageController::deleteClass($sid, (int) $m2[1]);
            else respond(null, 405, 'Method not allowed');
        }
        elseif (preg_match('#^/fees/(\d+)$#', $sub, $m2)) {
            if     ($method === 'PUT')    ManageController::updateFee($sid, (int) $m2[1]);
            elseif ($method === 'DELETE') ManageController::deleteFee($sid, (int) $m2[1]);
            else respond(null, 405, 'Method not allowed');
        }
        else respond(null, 404, 'Not found');
    }

    else respond(null, 404, 'Not found');

} catch (\Throwable $e) {
    respond(null, 500, 'Server error');
}
