-- 0006-stock-lots — purpose-segregated stock lots (change clean-arch-infrastructure).
--
-- APPROVED DELTA (only new DDL in this slice): creates `stock_lots` and seeds
-- exactly one initial `venta` lot per legacy `products.stock > 0` with
-- `remaining = initial = stock`, so the lot-sum reconciles with the prior
-- stock. The whole file runs inside the migrator's implicit transaction;
-- `LOCK TABLE ... SHARE ROW EXCLUSIVE` serializes against concurrent
-- `guardDecrement` row locks while the seed reads legacy stock. Re-runs are
-- no-ops (`IF NOT EXISTS` + deterministic `seed-<product-id>` ids with
-- `ON CONFLICT DO NOTHING`). The legacy `products.stock` column stays: it is
-- decremented alongside the lots, keeping `stock = sum(remaining)`.
--
-- DOWN (tested round-trip, applied manually — never auto-applied):
-- DOWN: DROP TABLE IF EXISTS stock_lots;

create table if not exists stock_lots (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  initial_qty integer not null check (initial_qty > 0),
  remaining_qty integer not null check (remaining_qty >= 0),
  unit_cost numeric(12,2) not null default 0,
  currency text not null default 'UYU' check (currency in ('UYU', 'USD', 'USDT')),
  sale_price numeric(12,2),
  sale_price_currency text not null default 'UYU' check (sale_price_currency in ('UYU', 'USD', 'USDT')),
  purpose text not null check (purpose in ('venta', 'taller')),
  acquired_via text not null default '',
  supplier_lot text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_lots_product on stock_lots(product_id);
create index if not exists idx_stock_lots_fifo on stock_lots(product_id, purpose, created_at) where remaining_qty > 0;

LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE;

insert into stock_lots (id, product_id, initial_qty, remaining_qty, unit_cost, purpose, acquired_via, created_at)
select 'seed-' || p.id, p.id, p.stock, p.stock, 0, 'venta', 'migracion', now()
from products p
where p.stock > 0
on conflict (id) do nothing;
