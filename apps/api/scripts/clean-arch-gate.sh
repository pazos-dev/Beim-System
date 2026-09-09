#!/usr/bin/env bash
# Per-slice contract gate (slice 0.5, change clean-architecture-backend).
#
# Every future slice runs this BEFORE and AFTER its change; both runs must
# print GATE OK with an empty git diff on src/contracts/__snapshots__/.
# A snapshot mismatch means the slice changed the contract: either revert
# or update the fixture deliberately (never loosen the freeze test).
# DB-free by design: full `vitest run` needs Postgres, this gate does not.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== typecheck =="
npx tsc --noEmit

echo "== DB-free contract tests =="
npx vitest run src/contracts/contract-freeze.test.ts src/app.test.ts src/docs/openapi.test.ts src/errors/errors.test.ts src/domain/shared/types.test.ts src/domain/shared/ports.test.ts src/domain/shared/error-catalog.test.ts src/domain/user/user.test.ts src/domain/product/product.test.ts src/domain/product/stock-lot.test.ts src/domain/service/service.test.ts src/domain/venta/venta.test.ts src/domain/pago/pago.test.ts src/domain/receipt/receipt.test.ts src/domain/cash-session/cash-session.test.ts src/domain/stock-journal/stock-journal.test.ts src/domain/settings/settings.test.ts src/application/auth/handlers.test.ts src/application/catalog/product-handlers.test.ts src/application/catalog/service-handlers.test.ts src/composition-root.test.ts src/infrastructure/persistence/error-map.test.ts src/infrastructure/persistence/pg-user-session.test.ts src/infrastructure/persistence/pg-user-session.pg.test.ts src/infrastructure/persistence/pg-product-lots.test.ts src/infrastructure/persistence/pg-product-lots.pg.test.ts src/infrastructure/persistence/pg-service.test.ts src/infrastructure/persistence/pg-service.pg.test.ts src/infrastructure/persistence/pg-cash.test.ts src/infrastructure/persistence/pg-cash.pg.test.ts src/infrastructure/persistence/pg-pago.test.ts src/infrastructure/persistence/pg-pago.pg.test.ts src/infrastructure/persistence/pg-idempotency.test.ts src/infrastructure/persistence/pg-idempotency.pg.test.ts src/infrastructure/persistence/pg-venta.test.ts src/infrastructure/persistence/pg-venta.pg.test.ts src/infrastructure/persistence/pg-receipt.test.ts src/infrastructure/persistence/pg-receipt.pg.test.ts src/infrastructure/persistence/pg-settings.test.ts src/infrastructure/persistence/pg-settings.pg.test.ts src/infrastructure/storage/s3-storage.adapter.test.ts src/infrastructure/payments/mp-preference-gateway.test.ts src/infrastructure/payments/mp-webhook-verifier.test.ts src/infrastructure/errors/toAppError.test.ts src/infrastructure/db/pool.test.ts src/infrastructure/clock/system-clock.test.ts src/infrastructure/uuid/system-uuid.test.ts src/application/shared/unit-of-work.test.ts src/application/sales-batch/sales-batch.test.ts src/application/receipts/receipts.test.ts src/application/payments/payments.test.ts src/application/cash/cash.test.ts src/application/orders/orders.test.ts src/application/creates/creates.test.ts src/application/uploads/uploads.test.ts src/application/ticket/ticket.test.ts src/application/queries/queries.test.ts src/application/queries/queries-passthrough.test.ts src/config/db.test.ts src/interface/http/error-matrix.test.ts src/interface/http/edge/edge-parity.test.ts src/interface/http/user/router.test.ts src/middleware/auth.test.ts src/middleware/cors.test.ts src/middleware/validate.test.ts src/middleware/rate-limit.test.ts src/middleware/rate-limit-store.test.ts src/interface/http/product/router.test.ts src/interface/http/service/router.test.ts src/interface/http/venta/router.test.ts src/interface/http/receipt/router.test.ts src/interface/http/caja/router.test.ts src/interface/http/pago/router.test.ts

echo "== application import scan (src/application stays framework-free) =="
if grep -rEn "from ['\"](express|supertest|zod)|from ['\"]pg['\"]|from ['\"]\.\./(modules|infrastructure|config|db|middleware|observability)" src/application/queries/ src/application/creates/; then
  echo "forbidden import in application slice (see gate output above)" >&2
  exit 1
fi

echo "== domain import scan (src/domain must stay framework-free) =="
if grep -rEn "from ['\"](express|pg|supertest)|from ['\"]\.\./(modules|infrastructure|config|db|middleware|observability)" src/domain/; then
  echo "forbidden import in src/domain (see gate output above)" >&2
  exit 1
fi

echo "== application production import scan (queries prod never touches the edge) =="
if grep -rEn "infrastructure/persistence/error-map" src/application/queries/queries.ts src/application/queries/ports.ts; then
  echo "forbidden error-map import in queries production code (test-only)" >&2
  exit 1
fi

echo "== infrastructure import scan (only the pool factory constructs Pool) =="
if grep -rln "new Pool(" src/infrastructure/ --include="*.ts" | grep -v "\.test\.ts" | grep -v "src/infrastructure/db/pool.ts"; then
  echo "forbidden Pool construction outside src/infrastructure/db/pool.ts" >&2
  exit 1
fi

echo "== SDK import scan (drivers stay in src/infrastructure only) =="
if grep -rEn "from ['\"][^'\"]*(aws-sdk|mercadopago)" src/domain/ src/application/ --include="*.ts"; then
  echo "forbidden SDK import outside src/infrastructure (see gate output above)" >&2
  exit 1
fi

echo "== interface import scan (routers stay thin: no pg/adapters/mappers) =="
if grep -rEn "from ['\"]pg['\"]|/adapters/|/mappers/|infrastructure/persistence/error-map|from ['\"][^'\"]*(aws-sdk|mercadopago)|from ['\"]\.\./\.\./(modules|infrastructure|config|db)/" src/interface/ --include="*.ts" | grep -v "\.test\.ts"; then
  echo "forbidden import in src/interface production code (routers call handlers only)" >&2
  exit 1
fi


echo "== interface edge import scan (no raw pg/modules/infrastructure in the HTTP skin) =="
if grep -rEn "from ['\"]pg['\"]|from ['\"][^'\"]*modules/|from ['\"][^'\"]*infrastructure/" src/interface/ --include="*.ts" | grep -v "\.test\.ts"; then
  echo "forbidden import in src/interface (see gate output above)" >&2
  exit 1
fi

echo "== edge shim scan (legacy middleware paths stay pure re-exports until cutover PR8) =="
for shim in src/middleware/auth.ts src/middleware/validate.ts src/middleware/idempotency.ts src/middleware/rate-limit.ts src/middleware/rate-limit-store.ts src/middleware/cors.ts src/middleware/security-headers.ts src/middleware/request-log.ts; do
  if ! grep -q 'export \* from "\.\./interface/http/edge/' "$shim"; then
    echo "middleware shim drift in $shim: legacy paths must only re-export the edge module" >&2
    exit 1
  fi
done

echo "GATE OK"
