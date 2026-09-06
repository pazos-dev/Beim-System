-- 0001-webshop-auth-catalog (PR 4) — webshop module needs.
--
-- WHY published columns: the vendored schema.sql (untouched, per contract)
-- has NO `published` flag on `products` or `promo_slides`, yet the webshop
-- spec (webshop-api/spec.md) requires "published products" and "published
-- slides". PR 4 decides the semantics: an EXPLICIT visibility flag,
-- independent of stock (an out-of-stock product stays visible as "agotado")
-- and of the marketing `badge`. Default `true` keeps every legacy/seed row
-- visible without editing the vendored seed.sql.
--
-- WHY new tables: auth-identity/spec.md requires "store only token hashes
-- with expiry". `webshop_sessions` holds webshop client sessions (sha256 hash
-- + expiry, one active session per user). `checkout_sessions` mints the
-- Stripe-style sessions whose payment stays unpaid until the webhook
-- (webshop-api/spec.md "Order then pay"); the vendored schema has no
-- equivalent table.
--
-- Every statement is idempotent (IF NOT EXISTS) so db:migrate re-runs are
-- no-ops, matching the schema.sql/seed.sql contract.

alter table products add column if not exists published boolean not null default true;
alter table promo_slides add column if not exists published boolean not null default true;

create table if not exists webshop_sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_webshop_sessions_user on webshop_sessions(user_id);

create table if not exists checkout_sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  order_id text not null references orders(id) on delete cascade,
  payment_method_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_checkout_sessions_order on checkout_sessions(order_id);