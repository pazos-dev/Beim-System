-- 0006-stock-lots.down (change clean-arch-infrastructure, Unit 3, task 2.4).
--
-- Rollback for 0006-stock-lots: drops the lots table; the legacy
-- `products.stock` column (kept and decremented alongside the lots) remains
-- the source of truth, so no stock quantity is lost. Never runs inside
-- db:migrate (migrate.ts skips *.down.sql) — apply manually.

drop table if exists stock_lots;
