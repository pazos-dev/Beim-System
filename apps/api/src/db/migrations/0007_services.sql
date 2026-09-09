-- 0007_services (change clean-arch-infrastructure, Unit 4) — dedicated Service table.
--
-- WHY a new table: services live as jsonb docs in app_settings under the key
-- 'gestion.services.<uuid>' ({ name, data, isActive }) with no price column,
-- while the v3 Service aggregate carries a Money price plus updated_at. Reads
-- stay dual (table first, key-prefixed docs fallback in PgServiceAdapter), so
-- this migration backfills nothing: pre-migration rows keep serving from docs
-- until their first save. Rollback is 0007_services.down.sql (drops the table).
--
-- Every statement is idempotent (IF NOT EXISTS) so db:migrate re-runs are
-- no-ops, matching the schema.sql/seed.sql contract.

create table if not exists services (
  id uuid primary key,
  name text not null,
  price_amount numeric not null default 0,
  price_currency text not null default 'UYU' check (price_currency in ('UYU', 'USD', 'USDT')),
  active boolean not null default true,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
