-- 0004-idempotency (issue #88) — POST idempotency keys.
--
-- WHY: client retries (timeouts, double taps) must not duplicate sales,
-- orders or checkout sessions. The idempotency middleware stores one row per
-- (key, scope, user_id): the first request owns the key and persists its
-- response; replays with the same key + payload return the stored response
-- without re-executing the handler.
--
-- Every statement is idempotent so db:migrate re-runs are no-ops,
-- matching the schema.sql/seed.sql contract.

create table if not exists idempotency_keys (
  key text not null,
  scope text not null,
  user_id text not null,
  request_hash text not null,
  response_status integer null,
  response_json jsonb null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (key, scope, user_id)
);
create index if not exists idx_idempotency_expires on idempotency_keys(expires_at);
