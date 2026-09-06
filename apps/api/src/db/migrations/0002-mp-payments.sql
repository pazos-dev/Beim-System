-- 0002-mp-payments (issue #84) — MercadoPago payments needs.
--
-- WHY new columns on orders: the vendored schema.sql (untouched, per
-- contract) tracks payment with free-text `payment_status` and has no
-- provider fields. `mp_preference_id` stores the latest checkout preference
-- minted for the order (a new preference overwrites it), `mp_payment_id`
-- the approved MP payment id, and `paid_at` when the webhook flipped the
-- order to 'Pagado'.
--
-- WHY webhook_events: MercadoPago retries IPN notifications until it gets a
-- 2xx, so the same event can arrive many times (and out of order). The
-- (provider, event_id) primary key makes the first insert win
-- (ON CONFLICT DO NOTHING) — that is the idempotency contract the payments
-- service relies on instead of timestamp freshness.
--
-- Every statement is idempotent (IF NOT EXISTS) so db:migrate re-runs are
-- no-ops, matching the schema.sql/seed.sql contract.

alter table orders add column if not exists mp_preference_id text;
alter table orders add column if not exists mp_payment_id text;
alter table orders add column if not exists paid_at timestamptz;

create table if not exists webhook_events (
  provider text not null default 'mercadopago',
  event_id text not null,
  order_id text null references orders(id) on delete set null,
  status text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);
