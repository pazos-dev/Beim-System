-- 0003-catalog-active (issue #87) — update/deactivate de catálogo.
--
-- WHY: los listados deben excluir inactivos por defecto y PUT con `active`
-- mapea a `is_active`. Solo `categories` existe como tabla propia en el
-- schema vendored (sin tocar, por contrato): recibe la columna real
-- `is_active`. `services` vive como documentos jsonb en `app_settings`
-- (clave 'gestion.services.<uuid>') y `purchases` como eventos en
-- `audit_logs` (action 'purchase.create'): sin tabla propia, el flag vive
-- dentro del JSON como `isActive` (ausente = activo, legacy compatible).
-- Los clientes son filas de `users` con role='cliente': sin columna nueva,
-- `active` mapea a `is_approved` vía usersService (approve/disable).
--
-- Every statement is idempotent so db:migrate re-runs are no-ops,
-- matching the schema.sql/seed.sql contract.

alter table categories add column if not exists is_active boolean not null default true;

-- Backfill: legacy service docs without the flag count as active.
update app_settings
set value = value || '{"isActive": true}'::jsonb
where key like 'gestion.services.%'
  and not (value ? 'isActive');

-- Backfill: legacy purchase events without the flag count as active.
update audit_logs
set details = details || '{"isActive": true}'::jsonb
where action = 'purchase.create'
  and not (details ? 'isActive');
