<?php
// app/Controllers/HqAuth.php — HQ super-admin auth: password + email OTP (2FA).
class HqAuth {

    // Step 1: email + password. On success, email a 6-digit code and ask for it.
    public static function login(): void {
        $b     = body();
        $email = strtolower(trim($b['email'] ?? ''));
        $pass  = (string) ($b['password'] ?? '');
        if ($email === '' || $pass === '') respond(null, 422, 'Email and password are required');

        $u = DB::one('SELECT * FROM hq_users WHERE email = ? AND is_active = 1', [$email]);
        // Uniform error so an attacker cannot tell which emails exist.
        if (!$u || !password_verify($pass, $u['password_hash'])) {
            respond(null, 401, 'Invalid email or password');
        }

        // 2FA disabled for this account → sign in directly.
        if ((int) $u['twofa_enabled'] === 0) {
            $tok = self::issueSession((int) $u['id']);
            DB::run('UPDATE hq_users SET last_login_at = NOW() WHERE id = ?', [$u['id']]);
            Audit::log(self::pub($u), 'login', null, null, null, 'HQ sign-in (no 2FA)');
            respond(['token' => $tok, 'user' => self::pub($u)]);
        }

        $ttl  = (int) cfg('otp_ttl_minutes', 10);
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        DB::exec(
            'INSERT INTO hq_login_otps (user_id, code_hash, expires_at, ip) VALUES (?,?,?,?)',
            [$u['id'], password_hash($code, PASSWORD_BCRYPT), date('Y-m-d H:i:s', time() + 60 * $ttl), clientIp()]
        );
        $sent = Mailer::otp($email, (string) $u['name'], $code, $ttl);
        respond(['otp_required' => true, 'email' => $email, 'sent' => $sent]);
    }

    // Step 2: email + the 6-digit code → issue a session token.
    public static function verify(): void {
        $b     = body();
        $email = strtolower(trim($b['email'] ?? ''));
        $code  = preg_replace('/\D/', '', (string) ($b['code'] ?? ''));
        if ($email === '' || $code === '') respond(null, 422, 'Email and code are required');

        $u = DB::one('SELECT * FROM hq_users WHERE email = ? AND is_active = 1', [$email]);
        if (!$u) respond(null, 401, 'Invalid email or password');

        $otp = DB::one(
            'SELECT * FROM hq_login_otps WHERE user_id = ? AND consumed_at IS NULL ORDER BY id DESC LIMIT 1',
            [$u['id']]
        );
        if (!$otp)                                 respond(null, 401, 'No pending code — please sign in again');
        if (strtotime($otp['expires_at']) < time()) respond(null, 401, 'Code expired — please sign in again');
        if ((int) $otp['attempts'] >= 5)            respond(null, 429, 'Too many attempts — please sign in again');

        DB::run('UPDATE hq_login_otps SET attempts = attempts + 1 WHERE id = ?', [$otp['id']]);
        if (!password_verify($code, $otp['code_hash'])) respond(null, 401, 'Incorrect code');

        DB::run('UPDATE hq_login_otps SET consumed_at = NOW() WHERE id = ?', [$otp['id']]);
        $tok = self::issueSession((int) $u['id']);
        DB::run('UPDATE hq_users SET last_login_at = NOW() WHERE id = ?', [$u['id']]);
        Audit::log(self::pub($u), 'login', null, null, null, 'HQ sign-in');
        respond(['token' => $tok, 'user' => self::pub($u)]);
    }

    public static function me(): void {
        $u = hqGuard();
        respond(['user' => ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role']]]);
    }

    public static function logout(): void {
        $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (strpos($h, 'Bearer ') === 0) {
            DB::run('DELETE FROM hq_sessions WHERE token = ?', [substr($h, 7)]);
        }
        respond(['ok' => true]);
    }

    private static function issueSession(int $userId): string {
        $tok = bin2hex(random_bytes(32)); // 64 hex chars
        DB::exec(
            'INSERT INTO hq_sessions (user_id, token, expires_at, ip, user_agent) VALUES (?,?,?,?,?)',
            [
                $userId,
                $tok,
                date('Y-m-d H:i:s', time() + 3600 * (int) cfg('session_ttl_hours', 12)),
                clientIp(),
                substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
            ]
        );
        return $tok;
    }

    private static function pub(array $u): array {
        return ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role']];
    }
}
