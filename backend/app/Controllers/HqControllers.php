<?php
// app/Controllers/HqControllers.php — HQ aggregate, registry, manage & audit.
// Every handler requires a valid HQ session (hqGuard). Write actions additionally
// require the 'superadmin' or 'manager' role; destructive deletes require 'superadmin'.

// ─── OverviewController ───────────────────────────────────────────────────────
class OverviewController {

    // Live stats for one school, computed inside its own database.
    public static function statsFor(string $schema): array {
        return SchoolDB::with($schema, static function () {
            $students = (int) (DB::one('SELECT COUNT(*) c FROM students s JOIN users u ON u.id = s.user_id WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL')['c'] ?? 0);
            $staff    = (int) (DB::one('SELECT COUNT(*) c FROM staff s JOIN users u ON u.id = s.user_id WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL')['c'] ?? 0);
            $collected   = (float) (DB::one('SELECT COALESCE(SUM(amount),0) t FROM payments')['t'] ?? 0);
            $outstanding = (float) (DB::one("SELECT COALESCE(SUM(balance),0) t FROM invoices WHERE status <> 'paid'")['t'] ?? 0);
            $att = DB::one("SELECT ROUND(100 * SUM(status='present') / NULLIF(COUNT(*),0)) rate, COUNT(*) marked FROM attendance WHERE date = CURDATE()") ?? [];
            $exams = (int) (DB::one('SELECT COUNT(*) c FROM exams')['c'] ?? 0);
            $g = DB::one('SELECT COUNT(*) entries, COUNT(DISTINCT student_id) graded, ROUND(AVG(score),1) avg FROM grades') ?? [];

            return [
                'students'          => $students,
                'staff'             => $staff,
                'fees_collected'    => $collected,
                'fees_outstanding'  => $outstanding,
                'attendance_today'  => isset($att['rate']) && $att['rate'] !== null ? (int) $att['rate'] : null,
                'attendance_marked' => (int) ($att['marked'] ?? 0),
                'exams'             => $exams,
                'results'           => [
                    'entries'         => (int) ($g['entries'] ?? 0),
                    'graded_students' => (int) ($g['graded'] ?? 0),
                    'avg_score'       => isset($g['avg']) && $g['avg'] !== null ? (float) $g['avg'] : null,
                ],
            ];
        });
    }

    public static function index(): void {
        hqGuard();
        $schools = DB::query('SELECT * FROM schools WHERE is_registered = 1 ORDER BY sort_order, name');

        $totals = [
            'schools'          => 0,
            'active'           => 0,
            'suspended'        => 0,
            'unreachable'      => 0,
            'students'         => 0,
            'staff'            => 0,
            'fees_collected'   => 0.0,
            'fees_outstanding' => 0.0,
            'exams'            => 0,
        ];
        $per = [];

        foreach ($schools as $s) {
            $totals['schools']++;
            ($s['status'] === 'suspended') ? $totals['suspended']++ : $totals['active']++;

            $row = [
                'id'     => (int) $s['id'],
                'slug'   => $s['slug'],
                'name'   => $s['name'],
                'domain' => $s['domain'],
                'status' => $s['status'],
                'color'  => $s['color'],
            ];
            try {
                $st = self::statsFor($s['db_schema']);
                $row = array_merge($row, $st, ['ok' => true]);
                $totals['students']         += $st['students'];
                $totals['staff']            += $st['staff'];
                $totals['fees_collected']   += $st['fees_collected'];
                $totals['fees_outstanding'] += $st['fees_outstanding'];
                $totals['exams']            += $st['exams'];
            } catch (\Throwable $e) {
                $row['ok'] = false;
                $row['error'] = 'unreachable';
                $totals['unreachable']++;
            }
            $per[] = $row;
        }

        respond(['totals' => $totals, 'schools' => $per, 'generated_at' => date('c')]);
    }
}

// ─── SchoolsController ────────────────────────────────────────────────────────
class SchoolsController {

    private static function find(int $id): array {
        $s = DB::one('SELECT * FROM schools WHERE id = ?', [$id]);
        if (!$s) respond(null, 404, 'School not found');
        return $s;
    }

    // Registry list + each school's live on/off status (read from its own DB).
    public static function index(): void {
        hqGuard();
        $rows = DB::query('SELECT * FROM schools ORDER BY sort_order, name');
        $out = [];
        foreach ($rows as $s) {
            $control = null;
            if ((int) $s['is_registered'] === 1) {
                try {
                    $control = SchoolDB::with($s['db_schema'], static fn() =>
                        DB::one('SELECT status, message, updated_by, updated_at FROM platform_control WHERE id = 1'));
                } catch (\Throwable $e) {
                    $control = null;
                }
            }
            $out[] = [
                'id'               => (int) $s['id'],
                'slug'             => $s['slug'],
                'name'             => $s['name'],
                'db_schema'        => $s['db_schema'],
                'domain'           => $s['domain'],
                'color'            => $s['color'],
                'is_registered'    => (int) $s['is_registered'],
                'status'           => $control['status'] ?? $s['status'],
                'suspended_reason' => $s['suspended_reason'],
                'control'          => $control,
            ];
        }
        respond(['schools' => $out]);
    }

    // Candidate school databases on this account + whether each is already registered.
    public static function discover(): void {
        hqGuard(['superadmin', 'manager']);
        $prefix = (string) cfg('db_prefix', '');
        $hq = DB::hqSchema();
        $registered = [];
        foreach (DB::query('SELECT db_schema FROM schools') as $r) $registered[$r['db_schema']] = true;

        $out = [];
        foreach (DB::listSchemas($prefix) as $db) {
            if ($db === $hq) continue;
            $name = SchoolDB::probeName($db);
            $out[] = [
                'db_schema'     => $db,
                'detected_name' => $name,
                'is_school'     => $name !== null,
                'registered'    => isset($registered[$db]),
            ];
        }
        respond(['candidates' => $out, 'prefix' => $prefix]);
    }

    public static function register(): void {
        $user = hqGuard(['superadmin', 'manager']);
        $b = body();
        $schema = trim($b['db_schema'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_]+$/', $schema)) respond(null, 422, 'Invalid schema name');
        if (DB::one('SELECT id FROM schools WHERE db_schema = ?', [$schema])) respond(null, 409, 'That database is already registered');

        $name = trim($b['name'] ?? '');
        if ($name === '') $name = SchoolDB::probeName($schema) ?? $schema;
        $slug = trim($b['slug'] ?? '');
        if ($slug === '') $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)), '-') ?: $schema;
        if (DB::one('SELECT id FROM schools WHERE slug = ?', [$slug])) $slug .= '-' . substr(md5($schema), 0, 4);

        $domain = trim($b['domain'] ?? '');
        $color  = trim($b['color'] ?? '');
        $nid = DB::exec(
            'INSERT INTO schools (slug, name, db_schema, domain, color, is_registered) VALUES (?,?,?,?,?,1)',
            [$slug, $name, $schema, $domain ?: null, $color ?: null]
        );
        Audit::log($user, 'school.register', $schema, 'school', $nid, "Registered $name");
        respond(['id' => $nid], 201, 'School registered');
    }

    public static function update(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::find($id);
        $b = body();
        $fields = [];
        $params = [];
        foreach (['name', 'slug', 'domain', 'color', 'sort_order'] as $f) {
            if (array_key_exists($f, $b)) { $fields[] = "`$f` = ?"; $params[] = ($b[$f] === '' ? null : $b[$f]); }
        }
        if (!$fields) respond(null, 422, 'Nothing to update');
        $params[] = $id;
        DB::run('UPDATE schools SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        Audit::log($user, 'school.update', $s['db_schema'], 'school', $id, 'Updated school registry');
        respond(['ok' => true]);
    }

    public static function suspend(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::find($id);
        $b = body();
        $reason = trim($b['reason'] ?? '');
        $message = trim($b['message'] ?? '');
        if ($message === '') $message = 'This school portal is temporarily unavailable. Please contact your administrator.';

        SchoolDB::with($s['db_schema'], static function () use ($message, $user) {
            DB::run(
                'INSERT INTO platform_control (id, status, message, updated_by) VALUES (1, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), message = VALUES(message), updated_by = VALUES(updated_by)',
                ['suspended', $message, $user['email']]
            );
        });
        DB::run(
            'UPDATE schools SET status = ?, suspended_reason = ?, suspended_at = NOW(), suspended_by = ? WHERE id = ?',
            ['suspended', $reason ?: null, $user['email'], $id]
        );
        Audit::log($user, 'school.suspend', $s['db_schema'], 'school', $id, $reason !== '' ? "Suspended: $reason" : 'Suspended');
        respond(['ok' => true, 'status' => 'suspended']);
    }

    public static function resume(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::find($id);
        SchoolDB::with($s['db_schema'], static function () use ($user) {
            DB::run(
                'INSERT INTO platform_control (id, status, message, updated_by) VALUES (1, ?, NULL, ?)
                 ON DUPLICATE KEY UPDATE status = VALUES(status), message = NULL, updated_by = VALUES(updated_by)',
                ['active', $user['email']]
            );
        });
        DB::run('UPDATE schools SET status = ?, suspended_reason = NULL, suspended_at = NULL, suspended_by = ? WHERE id = ?',
            ['active', $user['email'], $id]);
        Audit::log($user, 'school.resume', $s['db_schema'], 'school', $id, 'Resumed');
        respond(['ok' => true, 'status' => 'active']);
    }
}

// ─── ManageController ─────────────────────────────────────────────────────────
class ManageController {

    private static function school(int $id): array {
        $s = DB::one('SELECT * FROM schools WHERE id = ? AND is_registered = 1', [$id]);
        if (!$s) respond(null, 404, 'School not found');
        return $s;
    }

    // Rich per-school drill-down.
    public static function detail(int $id): void {
        hqGuard();
        $s = self::school($id);
        $detail = SchoolDB::with($s['db_schema'], static function () {
            return [
                'info' => DB::one('SELECT id, name, code, email, phone, address, motto, logo_url, established, term_system, active FROM schools WHERE deleted_at IS NULL ORDER BY id LIMIT 1'),
                'by_class' => DB::query('SELECT c.id, c.name, COUNT(st.id) students FROM classes c LEFT JOIN students st ON st.class_id = c.id AND st.deleted_at IS NULL WHERE c.deleted_at IS NULL GROUP BY c.id, c.name ORDER BY c.name'),
                'genders' => DB::query('SELECT u.gender, COUNT(*) c FROM students s JOIN users u ON u.id = s.user_id WHERE s.deleted_at IS NULL AND u.deleted_at IS NULL GROUP BY u.gender'),
                'recent_payments' => DB::query('SELECT p.amount, p.payment_date, p.method, CONCAT(u.first_name, " ", u.last_name) student FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN students st ON st.id = i.student_id JOIN users u ON u.id = st.user_id ORDER BY p.id DESC LIMIT 8'),
            ];
        });
        respond([
            'school' => ['id' => (int) $s['id'], 'name' => $s['name'], 'slug' => $s['slug'], 'domain' => $s['domain'], 'status' => $s['status']],
            'stats'  => OverviewController::statsFor($s['db_schema']),
            'detail' => $detail,
        ]);
    }

    // ── Settings / branding ──
    public static function settings(int $id): void {
        hqGuard();
        $s = self::school($id);
        $info = SchoolDB::with($s['db_schema'], static fn() =>
            DB::one('SELECT id, name, code, email, phone, address, motto, logo_url, established, term_system, active FROM schools WHERE deleted_at IS NULL ORDER BY id LIMIT 1'));
        respond(['settings' => $info]);
    }

    public static function updateSettings(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        SchoolDB::with($s['db_schema'], static function () use ($b) {
            $sc = DB::one('SELECT id FROM schools WHERE deleted_at IS NULL ORDER BY id LIMIT 1');
            if (!$sc) respond(null, 404, 'School record missing');
            $fields = [];
            $params = [];
            foreach (['name', 'email', 'phone', 'address', 'motto', 'logo_url', 'term_system', 'active'] as $k) {
                if (array_key_exists($k, $b)) { $fields[] = "`$k` = ?"; $params[] = ($b[$k] === '' ? null : $b[$k]); }
            }
            if (!$fields) respond(null, 422, 'Nothing to update');
            $params[] = $sc['id'];
            DB::run('UPDATE schools SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        });
        Audit::log($user, 'settings.update', $s['db_schema'], 'school_settings', $id, 'Updated school settings');
        respond(['ok' => true]);
    }

    // ── Students ──
    public static function students(int $id): void {
        hqGuard();
        $s = self::school($id);
        $search = trim($_GET['search'] ?? '');
        $page   = max(1, (int) ($_GET['page'] ?? 1));
        $limit  = min(100, max(1, (int) ($_GET['per_page'] ?? 25)));
        $offset = ($page - 1) * $limit;

        $res = SchoolDB::with($s['db_schema'], static function () use ($search, $limit, $offset) {
            $where = 'u.deleted_at IS NULL AND s.deleted_at IS NULL';
            $p = [];
            if ($search !== '') {
                $where .= ' AND (u.first_name LIKE ? OR u.last_name LIKE ? OR s.student_id LIKE ?)';
                $w = "%$search%"; $p = [$w, $w, $w];
            }
            $total = (int) (DB::one("SELECT COUNT(*) c FROM students s JOIN users u ON u.id = s.user_id WHERE $where", $p)['c'] ?? 0);
            $pp = $p; $pp[] = $limit; $pp[] = $offset;
            $rows = DB::query(
                "SELECT s.id, s.student_id, s.class_id, s.guardian_name, s.guardian_phone, s.guardian_email, s.admission_date,
                        u.first_name, u.last_name, u.email, u.phone, u.gender, u.date_of_birth, u.is_active, c.name class_name
                 FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id
                 WHERE $where ORDER BY u.last_name, u.first_name LIMIT ? OFFSET ?",
                $pp
            );
            return ['rows' => $rows, 'total' => $total];
        });
        respond([
            'students' => $res['rows'],
            'meta' => ['total' => $res['total'], 'page' => $page, 'per_page' => $limit, 'pages' => max(1, (int) ceil($res['total'] / $limit))],
        ]);
    }

    public static function updateStudent(int $id, int $sid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        SchoolDB::with($s['db_schema'], static function () use ($sid, $b) {
            $row = DB::one('SELECT id, user_id FROM students WHERE id = ?', [$sid]);
            if (!$row) respond(null, 404, 'Student not found');
            $uf = []; $up = [];
            foreach (['first_name', 'last_name', 'phone', 'gender', 'date_of_birth', 'address', 'is_active'] as $f) {
                if (array_key_exists($f, $b)) { $uf[] = "`$f` = ?"; $up[] = ($b[$f] === '' ? null : $b[$f]); }
            }
            if ($uf) { $up[] = $row['user_id']; DB::run('UPDATE users SET ' . implode(', ', $uf) . ' WHERE id = ?', $up); }
            $sf = []; $sp = [];
            foreach (['class_id', 'guardian_name', 'guardian_phone', 'guardian_email', 'admission_date'] as $f) {
                if (array_key_exists($f, $b)) { $sf[] = "`$f` = ?"; $sp[] = ($b[$f] === '' ? null : $b[$f]); }
            }
            if ($sf) { $sp[] = $sid; DB::run('UPDATE students SET ' . implode(', ', $sf) . ' WHERE id = ?', $sp); }
        });
        Audit::log($user, 'student.update', $s['db_schema'], 'student', $sid, 'Updated student');
        respond(['ok' => true]);
    }

    public static function deleteStudent(int $id, int $sid): void {
        $user = hqGuard(['superadmin']);
        $s = self::school($id);
        SchoolDB::with($s['db_schema'], static function () use ($sid) {
            $row = DB::one('SELECT user_id FROM students WHERE id = ?', [$sid]);
            if (!$row) respond(null, 404, 'Student not found');
            DB::run('UPDATE students SET deleted_at = NOW() WHERE id = ?', [$sid]);
            DB::run('UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [$row['user_id']]);
        });
        Audit::log($user, 'student.delete', $s['db_schema'], 'student', $sid, 'Soft-deleted student');
        respond(['ok' => true]);
    }

    // ── Staff ──
    public static function staff(int $id): void {
        hqGuard();
        $s = self::school($id);
        $rows = SchoolDB::with($s['db_schema'], static fn() => DB::query(
            'SELECT st.id, st.staff_id, st.department, st.designation, st.qualification, st.hire_date, st.salary_grade,
                    u.first_name, u.last_name, u.email, u.phone, u.gender, u.is_active, u.role
             FROM staff st JOIN users u ON u.id = st.user_id
             WHERE st.deleted_at IS NULL AND u.deleted_at IS NULL ORDER BY u.last_name, u.first_name'));
        respond(['staff' => $rows]);
    }

    public static function updateStaff(int $id, int $sid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        SchoolDB::with($s['db_schema'], static function () use ($sid, $b) {
            $row = DB::one('SELECT user_id FROM staff WHERE id = ?', [$sid]);
            if (!$row) respond(null, 404, 'Staff not found');
            $uf = []; $up = [];
            foreach (['first_name', 'last_name', 'phone', 'gender', 'is_active'] as $f) {
                if (array_key_exists($f, $b)) { $uf[] = "`$f` = ?"; $up[] = ($b[$f] === '' ? null : $b[$f]); }
            }
            if ($uf) { $up[] = $row['user_id']; DB::run('UPDATE users SET ' . implode(', ', $uf) . ' WHERE id = ?', $up); }
            $sf = []; $sp = [];
            foreach (['department', 'designation', 'qualification', 'hire_date', 'salary_grade', 'bank_name', 'account_number'] as $f) {
                if (array_key_exists($f, $b)) { $sf[] = "`$f` = ?"; $sp[] = ($b[$f] === '' ? null : $b[$f]); }
            }
            if ($sf) { $sp[] = $sid; DB::run('UPDATE staff SET ' . implode(', ', $sf) . ' WHERE id = ?', $sp); }
        });
        Audit::log($user, 'staff.update', $s['db_schema'], 'staff', $sid, 'Updated staff');
        respond(['ok' => true]);
    }

    public static function deleteStaff(int $id, int $sid): void {
        $user = hqGuard(['superadmin']);
        $s = self::school($id);
        SchoolDB::with($s['db_schema'], static function () use ($sid) {
            $row = DB::one('SELECT user_id FROM staff WHERE id = ?', [$sid]);
            if (!$row) respond(null, 404, 'Staff not found');
            DB::run('UPDATE staff SET deleted_at = NOW() WHERE id = ?', [$sid]);
            DB::run('UPDATE users SET deleted_at = NOW(), is_active = 0 WHERE id = ?', [$row['user_id']]);
        });
        Audit::log($user, 'staff.delete', $s['db_schema'], 'staff', $sid, 'Soft-deleted staff');
        respond(['ok' => true]);
    }

    // ── Classes ──
    public static function classes(int $id): void {
        hqGuard();
        $s = self::school($id);
        $rows = SchoolDB::with($s['db_schema'], static fn() => DB::query(
            'SELECT c.id, c.name, c.level, c.form, c.arm, c.capacity, COUNT(st.id) students
             FROM classes c LEFT JOIN students st ON st.class_id = c.id AND st.deleted_at IS NULL
             WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name'));
        respond(['classes' => $rows]);
    }

    public static function createClass(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        $name = trim($b['name'] ?? '');
        if ($name === '') respond(null, 422, 'Class name is required');
        $nid = SchoolDB::with($s['db_schema'], static function () use ($b, $name) {
            $sc = DB::one('SELECT id FROM schools ORDER BY id LIMIT 1');
            $ay = DB::one('SELECT id FROM academic_years WHERE is_current = 1 ORDER BY id DESC LIMIT 1')
                ?? DB::one('SELECT id FROM academic_years ORDER BY id DESC LIMIT 1');
            if (!$sc || !$ay) respond(null, 409, 'This school has no academic year set up yet');
            return DB::exec(
                'INSERT INTO classes (school_id, academic_year_id, name, level, form, arm, capacity) VALUES (?,?,?,?,?,?,?)',
                [$sc['id'], $ay['id'], $name, $b['level'] ?? null, $b['form'] ?? null, $b['arm'] ?? null, (int) ($b['capacity'] ?? 40)]
            );
        });
        Audit::log($user, 'class.create', $s['db_schema'], 'class', $nid, "Created class $name");
        respond(['id' => $nid], 201);
    }

    public static function updateClass(int $id, int $cid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        SchoolDB::with($s['db_schema'], static function () use ($cid, $b) {
            if (!DB::one('SELECT id FROM classes WHERE id = ?', [$cid])) respond(null, 404, 'Class not found');
            $f = []; $p = [];
            foreach (['name', 'level', 'form', 'arm', 'capacity'] as $k) {
                if (array_key_exists($k, $b)) { $f[] = "`$k` = ?"; $p[] = ($b[$k] === '' ? null : $b[$k]); }
            }
            if (!$f) respond(null, 422, 'Nothing to update');
            $p[] = $cid;
            DB::run('UPDATE classes SET ' . implode(', ', $f) . ' WHERE id = ?', $p);
        });
        Audit::log($user, 'class.update', $s['db_schema'], 'class', $cid, 'Updated class');
        respond(['ok' => true]);
    }

    public static function deleteClass(int $id, int $cid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        SchoolDB::with($s['db_schema'], static function () use ($cid) {
            if (!DB::one('SELECT id FROM classes WHERE id = ? AND deleted_at IS NULL', [$cid])) respond(null, 404, 'Class not found');
            $n = (int) (DB::one('SELECT COUNT(*) c FROM students WHERE class_id = ? AND deleted_at IS NULL', [$cid])['c'] ?? 0);
            if ($n > 0) respond(null, 409, "Cannot delete: $n student(s) are still in this class");
            DB::run('UPDATE classes SET deleted_at = NOW() WHERE id = ?', [$cid]);
        });
        Audit::log($user, 'class.delete', $s['db_schema'], 'class', $cid, 'Deleted class');
        respond(['ok' => true]);
    }

    // ── Fee structures ──
    public static function fees(int $id): void {
        hqGuard();
        $s = self::school($id);
        $rows = SchoolDB::with($s['db_schema'], static fn() => DB::query(
            'SELECT f.id, f.name, f.amount, f.fee_type, f.term_id, f.class_id, c.name class_name, t.name term_name
             FROM fee_structures f LEFT JOIN classes c ON c.id = f.class_id LEFT JOIN terms t ON t.id = f.term_id
             ORDER BY f.id DESC'));
        respond(['fee_structures' => $rows]);
    }

    public static function createFee(int $id): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        $name = trim($b['name'] ?? '');
        if ($name === '') respond(null, 422, 'Fee name is required');
        $amount = (float) ($b['amount'] ?? 0);
        $nid = SchoolDB::with($s['db_schema'], static function () use ($b, $name, $amount) {
            $sc = DB::one('SELECT id FROM schools ORDER BY id LIMIT 1');
            $term = (isset($b['term_id']) && $b['term_id']) ? (int) $b['term_id']
                : (int) (DB::one('SELECT id FROM terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1')['id']
                    ?? (DB::one('SELECT id FROM terms ORDER BY id DESC LIMIT 1')['id'] ?? 0));
            if (!$sc || !$term) respond(null, 409, 'This school has no term set up yet');
            return DB::exec(
                'INSERT INTO fee_structures (school_id, term_id, class_id, name, amount, fee_type) VALUES (?,?,?,?,?,?)',
                [$sc['id'], $term, ($b['class_id'] ?? null) ?: null, $name, $amount, $b['fee_type'] ?? 'tuition']
            );
        });
        Audit::log($user, 'fee.create', $s['db_schema'], 'fee_structure', $nid, "Created fee $name");
        respond(['id' => $nid], 201);
    }

    public static function updateFee(int $id, int $fid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        $b = body();
        SchoolDB::with($s['db_schema'], static function () use ($fid, $b) {
            if (!DB::one('SELECT id FROM fee_structures WHERE id = ?', [$fid])) respond(null, 404, 'Fee not found');
            $f = []; $p = [];
            foreach (['name', 'amount', 'fee_type', 'class_id', 'term_id'] as $k) {
                if (array_key_exists($k, $b)) { $f[] = "`$k` = ?"; $p[] = ($b[$k] === '' ? null : $b[$k]); }
            }
            if (!$f) respond(null, 422, 'Nothing to update');
            $p[] = $fid;
            DB::run('UPDATE fee_structures SET ' . implode(', ', $f) . ' WHERE id = ?', $p);
        });
        Audit::log($user, 'fee.update', $s['db_schema'], 'fee_structure', $fid, 'Updated fee');
        respond(['ok' => true]);
    }

    public static function deleteFee(int $id, int $fid): void {
        $user = hqGuard(['superadmin', 'manager']);
        $s = self::school($id);
        SchoolDB::with($s['db_schema'], static function () use ($fid) {
            if (!DB::one('SELECT id FROM fee_structures WHERE id = ?', [$fid])) respond(null, 404, 'Fee not found');
            DB::run('DELETE FROM fee_structures WHERE id = ?', [$fid]);
        });
        Audit::log($user, 'fee.delete', $s['db_schema'], 'fee_structure', $fid, 'Deleted fee');
        respond(['ok' => true]);
    }

    // ── Results (read) ──
    public static function results(int $id): void {
        hqGuard();
        $s = self::school($id);
        $data = SchoolDB::with($s['db_schema'], static function () {
            $term = DB::one('SELECT id, name FROM terms WHERE is_current = 1 ORDER BY id DESC LIMIT 1')
                ?? DB::one('SELECT id, name FROM terms ORDER BY id DESC LIMIT 1');
            $tid = (int) ($term['id'] ?? 0);
            return [
                'term'    => $term,
                'overall' => DB::one('SELECT COUNT(*) entries, COUNT(DISTINCT student_id) graded, ROUND(AVG(score),1) avg_score FROM grades WHERE term_id = ?', [$tid]),
                'by_class' => DB::query(
                    'SELECT c.name class, COUNT(DISTINCT g.student_id) graded, ROUND(AVG(g.score),1) avg_score
                     FROM grades g JOIN students st ON st.id = g.student_id JOIN classes c ON c.id = st.class_id
                     WHERE g.term_id = ? GROUP BY c.id, c.name ORDER BY c.name', [$tid]),
                'by_subject' => DB::query(
                    'SELECT sub.name subject, COUNT(*) entries, ROUND(AVG(g.score),1) avg_score
                     FROM grades g JOIN subjects sub ON sub.id = g.subject_id
                     WHERE g.term_id = ? GROUP BY sub.id, sub.name ORDER BY avg_score DESC', [$tid]),
            ];
        });
        respond($data);
    }
}

// ─── AuditController ──────────────────────────────────────────────────────────
class AuditController {
    public static function index(): void {
        hqGuard();
        $limit = min(200, max(1, (int) ($_GET['per_page'] ?? 50)));
        $rows = DB::query(
            'SELECT id, hq_user_email, action, target_schema, target_type, target_id, summary, ip, created_at
             FROM hq_audit_log ORDER BY id DESC LIMIT ?', [$limit]
        );
        respond(['audit' => $rows]);
    }
}

// ─── MobileController ─────────────────────────────────────────────────────────
// PUBLIC school directory for the student mobile app. No auth: the app calls this
// before login to let a student pick their school and learn its API base URL.
// Each school's `domain` in the registry should be its portal host (e.g.
// "portal.sjacedu.ng"); the student API then lives at https://<domain>/api/v1.
class MobileController {
    private static function urls(?string $domain): array {
        $host = preg_replace('#^https?://#', '', trim((string) $domain));
        $host = rtrim($host, '/');
        if ($host === '') return ['domain' => null, 'web' => null, 'api_base' => null];
        return ['domain' => $host, 'web' => "https://$host", 'api_base' => "https://$host/api/v1"];
    }

    // Active schools only — a suspended school is hidden from the app.
    public static function schools(): void {
        $rows = DB::query("SELECT slug, name, domain, color FROM schools WHERE is_registered = 1 AND status = 'active' ORDER BY sort_order, name");
        $out = [];
        foreach ($rows as $s) {
            $out[] = ['slug' => $s['slug'], 'name' => $s['name'], 'color' => $s['color']] + self::urls($s['domain']);
        }
        respond(['schools' => $out]);
    }

    public static function school(string $slug): void {
        $s = DB::one('SELECT slug, name, domain, color, status FROM schools WHERE slug = ? AND is_registered = 1', [$slug]);
        if (!$s) respond(null, 404, 'School not found');
        respond(['slug' => $s['slug'], 'name' => $s['name'], 'color' => $s['color'], 'status' => $s['status']] + self::urls($s['domain']));
    }
}
