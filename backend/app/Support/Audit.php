<?php
// app/Support/Audit.php — append-only record of every HQ action.
class Audit {
    public static function log(
        array $user,
        string $action,
        ?string $schema = null,
        ?string $type = null,
        $targetId = null,
        ?string $summary = null,
        $detail = null
    ): void {
        try {
            DB::exec(
                'INSERT INTO hq_audit_log
                    (hq_user_id, hq_user_email, action, target_schema, target_type, target_id, summary, detail, ip)
                 VALUES (?,?,?,?,?,?,?,?,?)',
                [
                    $user['id']    ?? null,
                    $user['email'] ?? null,
                    $action,
                    $schema,
                    $type,
                    $targetId !== null ? (string) $targetId : null,
                    $summary,
                    $detail !== null ? (is_string($detail) ? $detail : json_encode($detail)) : null,
                    clientIp(),
                ]
            );
        } catch (\Throwable $e) {
            // Never let an audit-log failure break the action it is recording.
        }
    }
}
