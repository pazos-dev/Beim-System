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
npx vitest run src/contracts/contract-freeze.test.ts src/app.test.ts src/docs/openapi.test.ts src/errors/errors.test.ts src/domain/shared/types.test.ts src/domain/shared/ports.test.ts src/domain/shared/error-catalog.test.ts src/domain/user/user.test.ts src/composition-root.test.ts src/infrastructure/persistence/error-map.test.ts src/application/shared/unit-of-work.test.ts src/config/db.test.ts

echo "== domain import scan (src/domain must stay framework-free) =="
if grep -rEn "from ['\"](express|pg|supertest)|from ['\"]\.\./(modules|infrastructure|config|db|middleware|observability)" src/domain/; then
  echo "forbidden import in src/domain (see gate output above)" >&2
  exit 1
fi

echo "GATE OK"
