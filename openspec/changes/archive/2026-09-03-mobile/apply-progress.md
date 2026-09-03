# Apply Progress: Mobile App — Expo Scaffold + Catalog MVP

**Change**: mobile
**Mode**: Strict TDD
**Delivery**: auto-chain, one cohesive PR with 3 work-unit commits, `size:exception` (greenfield, ~700 changed lines > 400 budget)
**Status**: 31/31 tasks complete — Ready for verify

## Confirmed Delivery Decision

- Delivery strategy: `auto-chain`
- Chain strategy: `size-exception` (orchestrator accepted over-400-line single PR for greenfield app, per one-PR-per-app project convention)
- Work-unit commits: 3 (scaffold+adapters / screens+navigation / wiring+verification), all conventional, English, no AI attribution. **No push performed.**

## Completed Tasks

### Phase 1: Monorepo Foundation (1.1–1.10)

- [x] 1.1 `allowBuilds` added to `pnpm-workspace.yaml`: expo, react-native, @expo/vector-icons, @react-native/community-cli-plugin, @react-native/virtualized-lists, sharp (kept existing prisma/electron/esbuild entries)
- [x] 1.2 `turbo.json` `mobile#dev|build|typecheck|lint|test` overrides (mirrors desktop pattern)
- [x] 1.3 `apps/mobile/package.json` — `@beim/mobile`, Expo ~54, expo-router ~6, @beim/contracts workspace:*; dev deps vitest, react-test-renderer, @beim/tsconfig, @vitejs/plugin-react, eslint, typescript
- [x] 1.4 `apps/mobile/tsconfig.json` — extends `@beim/tsconfig/react.json`, `@/*` → `./src/*`
- [x] 1.5 `apps/mobile/app.json` — expo-router plugin, newArchEnabled false, platforms ios/android
- [x] 1.6 `apps/mobile/metro.config.js` — watchFolders + root nodeModulesPaths + unstable_enableSymlinks (SDK 54 native pnpm support)
- [x] 1.7 `apps/mobile/eslint.config.mjs` — no-restricted-imports ban on @beim/data, @prisma/client, @beim/domain (desktop precedent); node globals for metro/index config
- [x] 1.8 `apps/mobile/vitest.config.ts` — jsdom, react plugin, src/**/*.test.{ts,tsx}
- [x] 1.9 `apps/mobile/vitest.setup.ts` — global react-native mock + cleanup
- [x] 1.10 `apps/mobile/index.js` — registerRootComponent via expo-router/entry

### Phase 2: Data Adapter (TDD) (2.1–2.7)

- [x] 2.1 RED `MockCatalogDataSource.test.ts` (4 tests) — schema-valid products, typed categories, by-id, null-on-miss
- [x] 2.2 GREEN `CatalogDataSource.ts` interface (contracts Product/Category types)
- [x] 2.3 GREEN `MockCatalogDataSource.ts` — 2 categories, 4 products, `new Date(...)` fixtures
- [x] 2.4 GREEN `HttpCatalogDataSource.ts` — typed stub (baseUrl), methods throw `Error('Not implemented')`, no `any`
- [x] 2.5 RED `HttpCatalogDataSource.test.ts` (5 tests) — signature typed check, instantiation, each method throws
- [x] 2.6 GREEN `useCatalog.ts` — composition root defaulting to MockCatalogDataSource
- [x] 2.7 REFACTOR — `vitest run src/adapters`: 9 tests pass

### Phase 3: Screens + Navigation (TDD) (3.1–3.9)

- [x] 3.1 `src/theme/colors.ts`, `spacing.ts`, `index.ts` — design tokens
- [x] 3.2 RED `src/app/__tests__/index.test.tsx` (2 tests) — product cards (name, price+currency), empty-state
- [x] 3.3 GREEN `src/app/_layout.tsx` — expo-router Stack shell (3 routes)
- [x] 3.4 GREEN `src/app/index.tsx` — home FlatList of ProductCards + empty-state
- [x] 3.5 RED `src/app/__tests__/category.test.tsx` — cat-1 filtered products + heading
- [x] 3.6 GREEN `src/app/category/[id].tsx` — filters by categoryId, heading
- [x] 3.7 RED `src/app/__tests__/product.test.tsx` (2 tests) — detail fields + not-found
- [x] 3.8 GREEN `src/app/product/[id].tsx` — detail rendering + not-found fallback
- [x] 3.9 REFACTOR — `vitest run src/app`: 5 tests pass

### Phase 4: Verification (4.1–4.5)

- [x] 4.1 `pnpm --filter @beim/mobile exec vitest run` — 14 tests pass (5 files)
- [x] 4.2 `pnpm --filter @beim/mobile exec tsc --noEmit` — exit 0
- [x] 4.3 `pnpm --filter @beim/mobile exec eslint .` — exit 0; no @beim/data/@prisma/@beim/domain imports in src
- [x] 4.4 `pnpm test` (turbo, all packages incl. mobile) — 10 tasks successful
- [x] 4.5 `pnpm install` from root — resolves @beim/mobile, native deps build allowed, exit 0
- (extra) Root `pnpm typecheck` — 10 tasks successful
- (extra) Root `pnpm build` — 7 tasks successful incl. mobile `expo export` (ios+android bundles)

## Verification Evidence

| Gate | Command | Result |
|------|---------|--------|
| Install | `pnpm install` | exit 0, native deps allowed |
| Tests | `pnpm --filter @beim/mobile exec vitest run` | 14 passed (5 files) |
| Typecheck | `pnpm --filter @beim/mobile exec tsc --noEmit` | exit 0 |
| Lint | `pnpm --filter @beim/mobile exec eslint .` | exit 0, no banned imports |
| Root typecheck | `pnpm typecheck` | 10 tasks successful |
| Root test | `pnpm test` | 10 tasks successful |
| Root build | `pnpm build` | 7 tasks successful |
| Bundle | `pnpm --filter @beim/mobile run build` (`expo export`) | ios+android bundles emitted |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1/2.3 | `src/adapters/__tests__/MockCatalogDataSource.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (4) | ✅ 4 cases | ✅ Clean |
| 2.2 | `CatalogDataSource.ts` | Unit | N/A (new) | ➖ Structural type | ✅ via 2.1 use | ➖ Single | ✅ Clean |
| 2.4 | `HttpCatalogDataSource.ts` | Unit | N/A (new) | (via 2.5) | ✅ | ➖ Single | ✅ Clean |
| 2.5 | `src/adapters/__tests__/HttpCatalogDataSource.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed (5) | ✅ 5 cases | ✅ Clean |
| 2.6 | `useCatalog.ts` | Unit | N/A (new) | (via screens) | ✅ | ➖ Single | ✅ Clean |
| 3.2/3.4 | `src/app/__tests__/index.test.tsx` | Integration (render) | N/A (new) | ✅ Written | ✅ Passed (2) | ✅ 2 cases | ✅ Clean |
| 3.5/3.6 | `src/app/__tests__/category.test.tsx` | Integration (render) | N/A (new) | ✅ Written | ✅ Passed (1) | ➖ 1 scenario | ✅ Clean |
| 3.7/3.8 | `src/app/__tests__/product.test.tsx` | Integration (render) | N/A (new) | ✅ Written | ✅ Passed (2) | ✅ 2 cases | ✅ Clean |

### Test Summary
- **Total tests written/passing**: 14 (5 files)
- **Layers used**: Unit (9), Integration/render (5)
- **Approval tests**: None — greenfield, no refactoring of existing behavior
- **Pure functions created**: `CatalogDataSource` seam + adapters (typed, no side effects)

## Work Unit Evidence

| Work Unit | Focused test command & result | Runtime harness & result | Rollback boundary |
|-----------|-------------------------------|--------------------------|-------------------|
| 1 — Scaffold+config+adapters | `pnpm --filter @beim/mobile exec vitest run src/adapters` → 9 passed | `pnpm --filter @beim/mobile run build` → expo export ios+android OK | Revert config files + `apps/mobile/src/adapters/*`, `src/test/*`, theme |
| 2 — Screens+navigation | `pnpm --filter @beim/mobile exec vitest run src/app` → 5 passed | N/A — render tests against RN mock; no runtime device boundary in env | Revert `apps/mobile/src/app/*` |
| 3 — Monorepo wiring+verify | `pnpm typecheck` (10 tasks) + `pnpm lint` + `pnpm test` + `pnpm build` all green | N/A — turbo pipeline; no live backend/DB in env | Revert `turbo.json` + `pnpm-workspace.yaml` allowBuilds entries |

## Deviations from Design

1. **Testing library**: Design said "react-test-renderer + @testing-library/react (RN caveats)". `@testing-library/react-native` cannot be loaded under plain node (react-native's untranspiled JS uses `typeof __DEV__`), so component tests use `react-test-renderer` + a lightweight renderable `react-native` mock + a `renderRN` helper. This keeps tests green offline and matches the design's stated RN caveat (use renderer not DOM). `@testing-library/react-native` was therefore **not** added as a dependency.
2. **Metro config**: Design suggested `resolver.nodeModulesPaths` incl. `node_modules/.pnpm` and `unstable_enablePackageExports`. SDK 54 pnpm support makes pointing at `.pnpm` break `expo-router/entry` resolution; removed `.pnpm` path and package-exports flag, kept watchFolders + root nodeModulesPaths + symlinks. `expo export` now resolves `@beim/contracts` and emits bundles.
3. **app.json platforms**: Design omitted web; removed `"web"` from platforms so `expo export` targets native without requiring react-native-web.
4. **vitest.setup**: Replaced `@testing-library/jest-native` (needs jest/NativeMatchers, incompatible with vitest) with a global `react-native` mock + RN cleanup. Adapter/screen tests use vitest-native assertions.
5. **price rendering**: Price rendered as a single template string (`${currency} ${price}`) per RN Text node so text-based assertions are stable.

## Issues Found

- React Native cannot be parsed/executed by plain Node under vitest jsdom — required a renderable `react-native` mock (`src/test/__mocks__/react-native.ts`) plus global `vi.mock` in setup. This is an accepted, documented consequence of offline RN testing.
- Two `expo-router@6.0.24` peer variants exist in the pnpm store (from transitive peer resolution); `pnpm why` confirms single logical version — non-blocking.
- Turbo `no output files found for task #test` warnings are pre-existing across all workspace packages and non-fatal.
- `react-test-renderer` emits `act(...)`/deprecation stderr warnings during tests; benign, no assertions fail.

## Remaining Tasks

None — all 31 tasks complete. Ready for `sdd-verify`.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `apps/mobile/package.json` | Created | `@beim/mobile` workspace package |
| `apps/mobile/app.json` | Created | Expo config (ios/android) |
| `apps/mobile/tsconfig.json` | Created | extends @beim/tsconfig/react.json |
| `apps/mobile/metro.config.js` | Created | pnpm workspace Metro resolution |
| `apps/mobile/eslint.config.mjs` | Created | import-ban + node globals |
| `apps/mobile/vitest.config.ts` | Created | jsdom + react plugin |
| `apps/mobile/vitest.setup.ts` | Created | RN mock + cleanup |
| `apps/mobile/index.js` | Created | expo-router entry |
| `apps/mobile/src/adapters/*` | Created | CatalogDataSource, Mock, Http stub, useCatalog |
| `apps/mobile/src/adapters/__tests__/*` | Created | adapter tests (9) |
| `apps/mobile/src/app/*` | Created | expo-router screens + _layout |
| `apps/mobile/src/app/__tests__/*` | Created | screen tests (5) |
| `apps/mobile/src/theme/*` | Created | design tokens |
| `apps/mobile/src/test/*` | Created | RN mock + renderRN helper |
| `turbo.json` | Modified | mobile#* task overrides |
| `pnpm-workspace.yaml` | Modified | allowBuilds for Expo/RN deps |
| `pnpm-lock.yaml` | Modified | lockfile after install |

## Commits (work units, not pushed)

1. `feat(mobile): scaffold @beim/mobile workspace and catalog data adapters`
2. `feat(mobile): add expo-router catalog, category, and product screens`
3. `feat(mobile): wire mobile tasks into turbo and pnpm allowBuilds`

## Next

Run `sdd-verify` against `openspec/changes/mobile/specs/mobile-app/spec.md` (6 req / 14 scenarios — count per the authoritative spec file).
