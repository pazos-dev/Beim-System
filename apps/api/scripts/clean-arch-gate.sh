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
src/infrastructure/persistence/error-map.test.ts src/infrastructure/persistence/pg-user-session.test.ts src/infrastructure/persistence/pg-user-session.pg.test.ts src/infrastructure/persistence/pg-product-lots.test.ts src/infrastructure/persistence/pg-product-lots.pg.test.ts src/infrastructure/errors/toAppError.test.ts

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

echo "GATE OK"
