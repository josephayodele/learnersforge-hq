-- hq_schema.sql — LearnersForge HQ (group control-plane) database.
--
-- Lives in its OWN database (suggested name: `rgabfmmy_hq`), completely separate
-- from every school's database. It holds ONLY control-plane data:
--   hq_users       : super-admin accounts that can sign in to HQ
--   hq_login_otps  : short-lived email one-time codes (2FA, issued after password)
--   hq_sessions    : issued bearer tokens (after password + OTP)
--   schools        : the registry of schools HQ manages (name, DB schema, domain, status)
--   hq_audit_log   : every HQ action, for accountability
--
-- School data itself is NEVER copied here. HQ reads/writes each school's own
-- database live, via a MySQL user granted on every `rgabfmmy_*` schema.
-- Safe to run more than once (IF NOT EXISTS).

CREATE DATABASE IF NOT EXISTS `rgabfmmy_hq`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `rgabfmmy_hq`;

-- ── Super-admin accounts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hq_users` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(160) NOT NULL,
  `email`         VARCHAR(190) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('superadmin','manager','viewer') NOT NULL DEFAULT 'viewer',
  `twofa_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Email OTP codes (2FA) ──────────────────────────────────────────────────────
-- Issued after a correct password; the plain code is emailed, only its hash is kept.
CREATE TABLE IF NOT EXISTS `hq_login_otps` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT UNSIGNED NOT NULL,
  `code_hash`   VARCHAR(255) NOT NULL,
  `expires_at`  DATETIME NOT NULL,
  `attempts`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `consumed_at` DATETIME NULL,
  `ip`          VARCHAR(45) NULL,
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_otp_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `hq_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Bearer sessions (after password + OTP) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hq_sessions` (
  `id`           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`      INT UNSIGNED NOT NULL,
  `token`        CHAR(64) NOT NULL UNIQUE,
  `expires_at`   DATETIME NOT NULL,
  `created_at`   DATETIME DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` DATETIME NULL,
  `ip`           VARCHAR(45) NULL,
  `user_agent`   VARCHAR(255) NULL,
  KEY `idx_sess_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `hq_users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── School registry ────────────────────────────────────────────────────────────
-- Auto-discovered from SHOW DATABASES LIKE 'rgabfmmy_%' and confirmed here. The
-- canonical status also lives in each school's own `platform_control` row (which is
-- what the school API actually checks); HQ keeps the two in sync when toggling.
CREATE TABLE IF NOT EXISTS `schools` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug`             VARCHAR(60) NOT NULL UNIQUE,
  `name`             VARCHAR(160) NOT NULL,
  `db_schema`        VARCHAR(190) NOT NULL UNIQUE,
  `domain`           VARCHAR(190) NULL,
  `status`           ENUM('active','suspended') NOT NULL DEFAULT 'active',
  `suspended_reason` VARCHAR(255) NULL,
  `suspended_at`     DATETIME NULL,
  `suspended_by`     VARCHAR(190) NULL,
  `color`            VARCHAR(16) NULL,
  `sort_order`       INT NOT NULL DEFAULT 0,
  `is_registered`    TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Audit log ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `hq_audit_log` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `hq_user_id`    INT UNSIGNED NULL,
  `hq_user_email` VARCHAR(190) NULL,
  `action`        VARCHAR(60) NOT NULL,
  `target_schema` VARCHAR(190) NULL,
  `target_type`   VARCHAR(60) NULL,
  `target_id`     VARCHAR(60) NULL,
  `summary`       VARCHAR(255) NULL,
  `detail`        TEXT NULL,
  `ip`            VARCHAR(45) NULL,
  `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_audit_user` (`hq_user_id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── First super-admin ──────────────────────────────────────────────────────────
-- Create your HQ login. Generate the hash in PHP:  password_hash('your-pass', PASSWORD_BCRYPT)
-- then paste it below and run this INSERT (keep it OUT of git once filled with a real hash).
-- INSERT INTO `hq_users` (`name`,`email`,`password_hash`,`role`,`twofa_enabled`)
-- VALUES ('Joseph Adegbola','you@example.com','<bcrypt-hash-here>','superadmin',1);
