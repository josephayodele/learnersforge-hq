<?php
// app/Support/Mailer.php — minimal HTML mail via PHP mail() (same approach as the
// school instances). Used to deliver the login OTP.
class Mailer {
    public static function otp(string $to, string $name, string $code, int $ttlMin): bool {
        $app  = cfg('app_name', 'LearnersForge HQ');
        $from = cfg('mail_from', 'no-reply@learnersforge.com');
        $subject = "$app verification code: $code";

        $safeName = htmlspecialchars($name !== '' ? $name : 'there', ENT_QUOTES);
        $html =
            '<div style="font-family:Arial,Helvetica,sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#1f2937">'
          . '<h2 style="margin:0 0 8px;color:#0f172a">' . htmlspecialchars($app, ENT_QUOTES) . '</h2>'
          . '<p style="margin:0 0 16px">Hi ' . $safeName . ', use this code to finish signing in:</p>'
          . '<div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;border-radius:10px;'
          . 'padding:16px;text-align:center;color:#0f172a">' . htmlspecialchars($code, ENT_QUOTES) . '</div>'
          . '<p style="margin:16px 0 0;font-size:13px;color:#64748b">This code expires in ' . (int)$ttlMin
          . ' minutes. If you did not try to sign in, you can ignore this email.</p>'
          . '</div>';

        $headers  = "MIME-Version: 1.0\r\n";
        $headers .= "Content-Type: text/html; charset=UTF-8\r\n";
        $headers .= 'From: ' . $app . ' <' . $from . ">\r\n";

        return @mail($to, $subject, $html, $headers);
    }
}
