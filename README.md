# LearnersForge HQ

Group **control-plane** for LearnersForge: one super-admin dashboard across every
school instance. It can **spool** (aggregate metrics), **manage** core records, and
**enable/disable** any school — all over the shared Bluehost MySQL server.

Hosted at **https://hq.learnersforge.com** · separate repo (NOT part of per-school propagation).

## Layout
```
backend/        PHP API (no framework; mirrors the school instances' conventions)
  app/Models/DB.php          one PDO connection + safe cross-schema switching (SchoolDB::with)
  app/Controllers/           HqAuth (password + email OTP), Overview, Schools, Manage, Audit
  app/Support/               Mailer (OTP email), Audit (action log)
  config/hq.php.example      copy to config/hq.php on the server (git-ignored)
  database/hq_schema.sql     the rgabfmmy_hq control DB
  public/index.php           router + session guard
frontend/       React + Vite dashboard (same stack as the schools)
```

## How it reaches the schools
All school databases live on one MySQL server. A single MySQL user (e.g.
`rgabfmmy_hquser`) is granted on the HQ DB **and every** `rgabfmmy_<school>` DB.
HQ reads/writes each school live by switching the active schema inside
`SchoolDB::with()` (schema names are whitelisted against the `schools` registry).

Schools are **auto-discovered** (`SHOW DATABASES LIKE 'rgabfmmy_%'`) and confirmed in
the registry — no hardcoded list.

## Enable / disable (fail-open)
Suspending a school writes `platform_control.status='suspended'` into **that school's
own** database. Each school API checks it per request (migration `015_platform_control.sql`
+ `Platform::ensureActive()`), returning 503 when suspended. If the check errors, the
school stays **active** — a broken HQ can never black out every school.

## Server setup (cPanel)
1. Subdomain `hq.learnersforge.com` → Document Root `<HOME>/hq-portal`; set PHP 8.x.
2. Create DB `rgabfmmy_hq`, import `backend/database/hq_schema.sql`.
3. Create MySQL user `rgabfmmy_hquser`; **add it to** `rgabfmmy_hq` **and every school DB** (ALL PRIVILEGES).
4. Create `<HOME>/hq-api/config/hq.php` from `backend/config/hq.php.example` with real creds.
5. Create the first super-admin in `hq_users` (bcrypt the password with `password_hash`).
6. Git Version Control → clone this repo → **Deploy HEAD Commit**. The `.cpanel.yml`
   lays out `hq-api` + `hq-portal` and symlinks `hq-portal/api → hq-api/public`.

## Local dev
```
# backend
php -S localhost:8787 -t backend/public      # needs backend/config/hq.php
# frontend
cd frontend && npm install && npm run dev     # proxies /api → :8787
```
