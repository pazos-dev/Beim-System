-- 0005-gestion-sessions (issue #153) — console login sessions.
--
-- WHY a separate table: webshop sessions (`webshop_sessions`, migration 0001)
-- authenticate `users` rows (role cliente/admin/superadmin), while console
-- identities live in `gestion_users` (operator roles like vendedor/tecnico).
-- The two realms never mix in one table: `gestion_sessions` holds console
-- session tokens (sha256 hash + expiry, one active session per console user),
-- resolved by the bearer identity fallback for `requireRole` gates.
--
-- Every statement is idempotent (IF NOT EXISTS) so db:migrate re-runs are
-- no-ops, matching the schema.sql/seed.sql contract.

create table if not exists gestion_sessions (
  token_hash text primary key,
  gestion_user_id uuid not null references gestion_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gestion_sessions_user on gestion_sessions(gestion_user_id);
