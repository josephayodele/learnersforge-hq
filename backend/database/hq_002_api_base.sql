-- hq_002_api_base.sql — add an explicit API base URL to the school registry.
-- Most schools serve their API same-origin (https://<domain>/api/v1, derived from
-- `domain`); a few (e.g. sjac via api.sjacedu.ng) use a different host, so this
-- column lets HQ hand the mobile app the exact base. Run once on rgabfmmy_hq.
ALTER TABLE `schools` ADD COLUMN IF NOT EXISTS `api_base_url` VARCHAR(255) NULL AFTER `domain`;
