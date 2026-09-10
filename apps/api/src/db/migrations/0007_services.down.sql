-- 0007_services.down (change clean-arch-infrastructure, Unit 4, task 2.6).
--
-- Rollback for 0007_services: drops the dedicated table; reads fall back to
-- the app_settings docs (`gestion.services.<uuid>`) through the adapter
-- dual-read. Docs rows are never touched, so no data created before the
-- table existed is lost. Never runs inside db:migrate (migrate.ts skips
-- *.down.sql) — apply manually.

drop table if exists services;
