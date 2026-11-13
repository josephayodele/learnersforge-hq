<?php
// app/Models/DB.php — HQ data layer.
//
// ONE PDO connection, made as the cross-schema MySQL user whose default database
// is the HQ control DB (rgabfmmy_hq). Central/control-plane tables are queried
// normally. School data is read/written INSIDE SchoolDB::with(), which switches
// the active schema to a whitelisted school database and restores the HQ database
// afterward — so the very same SQL the school instances use can be reused verbatim.
class DB {
    private static ?PDO $pdo = null;
    private static string $hq = '';

    private static function cfg(): array {
        static $c = null;
        if ($c === null) { $c = require dirname(__DIR__, 2) . '/config/hq.php'; }
        return $c;
    }

    public static function conn(): PDO {
        if (self::$pdo === null) {
            $cfg = self::cfg()['db'];
            self::$hq = $cfg['dbname'];
            $dsn = "mysql:host={$cfg['host']};port={$cfg['port']};dbname={$cfg['dbname']};charset=utf8mb4";
            self::$pdo = new PDO($dsn, $cfg['username'], $cfg['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        }
        return self::$pdo;
    }

    public static function hqSchema(): string { self::conn(); return self::$hq; }

    public static function query(string $sql, array $params = []): array {
        $stmt = self::conn()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public static function one(string $sql, array $params = []): ?array {
        $stmt = self::conn()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    public static function exec(string $sql, array $params = []): int {
        $stmt = self::conn()->prepare($sql);
        $stmt->execute($params);
        return (int) self::conn()->lastInsertId();
    }

    public static function run(string $sql, array $params = []): int {
        $stmt = self::conn()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    // Switch the active database. $schema MUST already be validated by the caller
    // (SchoolDB validates against the registry + a strict name pattern).
    public static function useSchema(string $schema): void {
        self::conn()->exec('USE `' . str_replace('`', '``', $schema) . '`');
    }

    // School databases visible to the HQ user (i.e. the ones it was granted on).
    // Not a prepared statement: SHOW DATABASES doesn't reliably accept a bound
    // LIKE parameter across MySQL/MariaDB, so list all and filter by prefix in PHP.
    public static function listSchemas(string $prefix): array {
        $rows = self::conn()->query('SHOW DATABASES')->fetchAll();
        $out = [];
        foreach ($rows as $r) {
            $name = array_values($r)[0];
            if ($prefix === '' || strncmp($name, $prefix, strlen($prefix)) === 0) {
                $out[] = $name;
            }
        }
        return $out;
    }
}

// Runs a callback with the active database switched to a school's schema, then
// always restores the HQ database (even if the callback throws).
class SchoolDB {
    private static ?array $registered = null;

    private static function isValidName(string $schema): bool {
        return (bool) preg_match('/^[A-Za-z0-9_]+$/', $schema);
    }

    public static function isRegistered(string $schema): bool {
        if (!self::isValidName($schema)) return false;
        if (self::$registered === null) {
            self::$registered = [];
            foreach (DB::query('SELECT db_schema FROM schools WHERE is_registered = 1') as $r) {
                self::$registered[$r['db_schema']] = true;
            }
        }
        return isset(self::$registered[$schema]);
    }

    // For registered schools only (used by all read/manage endpoints).
    public static function with(string $schema, callable $fn) {
        if (!self::isRegistered($schema)) {
            throw new RuntimeException('Unknown or unregistered school schema: ' . $schema);
        }
        try {
            DB::useSchema($schema);
            return $fn();
        } finally {
            DB::useSchema(DB::hqSchema());
        }
    }

    // Read a candidate school's display name during discovery (schema not yet in
    // the registry). Name-pattern validated; any error yields null.
    public static function probeName(string $schema): ?string {
        if (!self::isValidName($schema)) return null;
        try {
            DB::useSchema($schema);
            $r = DB::one('SELECT name FROM schools WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
        } catch (\Throwable $e) {
            $r = null;
        } finally {
            DB::useSchema(DB::hqSchema());
        }
        return $r['name'] ?? null;
    }
}
