# Tasks: Mobile App — Expo Scaffold + Catalog MVP

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700 (21 new files + 2 modified) |
| 400-line budget risk | High |
| Chained PRs recommended | No — greenfield app, project convention: one PR per app |
| Suggested split | Single PR with work-unit commits |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Scaffold + config + adapters | PR 1 | `pnpm --filter @beim/mobile exec vitest run` | N/A — unit tests only | apps/mobile/src/adapters/* + config files |
| 2 | Screens + navigation | PR 1 | `pnpm --filter @beim/mobile exec vitest run` | N/A — jsdom render tests | apps/mobile/src/app/* |
| 3 | Monorepo wiring + verification | PR 1 | `pnpm typecheck --filter @beim/mobile && pnpm lint --filter @beim/mobile` | N/A — turbo pipeline | turbo.json + pnpm-workspace.yaml |

**Rationale**: This is a greenfield app with zero shared-code impact. Reverting means deleting `apps/mobile` and reverting 2 config lines. Single PR respects project one-PR-per-app convention. Work-unit commits keep the diff reviewable.

---

## Phase 1: Monorepo Foundation

- [x] 1.1 Add `allowBuilds` entries for Expo/RN deps to `pnpm-workspace.yaml`: `expo: true`, `@expo/vector-icons: true`, `@react-native/community-cli-plugin: true`, `@react-native/virtualized-lists: true`, `react-native: true`, `sharp: true`
- [x] 1.2 Add `mobile#dev`, `mobile#build`, `mobile#typecheck`, `mobile#lint`, `mobile#test` task overrides to `turbo.json` (mirror desktop pattern)
- [x] 1.3 Create `apps/mobile/package.json` — name `@beim/mobile`, Expo SDK 54, expo-router, deps `@beim/contracts: workspace:*`; dev deps `vitest`, `@testing-library/react-native`, `react-test-renderer`, `@beim/tsconfig: workspace:*`, `typescript`
- [x] 1.4 Create `apps/mobile/tsconfig.json` — extends `@beim/tsconfig/react.json`, paths for `@/*` → `./src/*`
- [x] 1.5 Create `apps/mobile/app.json` — Expo config with `plugins: ["expo-router"]`, `newArchEnabled: false`
- [x] 1.6 Create `apps/mobile/metro.config.js` — `getDefaultConfig` + `watchFolders` (packages/*, apps/*) + `resolver.nodeModulesPaths` (app → root → .pnpm) + `unstable_enableSymlinks` + `unstable_enablePackageExports`
- [x] 1.7 Create `apps/mobile/eslint.config.mjs` — flat config with `no-restricted-imports` ban on `@beim/data`, `@prisma/client`, `@beim/domain` (desktop precedent)
- [x] 1.8 Create `apps/mobile/vitest.config.ts` — jsdom environment, react plugin, `src/**/*.test.{ts,tsx}` include pattern
- [x] 1.9 Create `apps/mobile/vitest.setup.ts` — import `@testing-library/jest-native/extend-expect`, afterEach cleanup
- [x] 1.10 Create `apps/mobile/index.js` — `registerRootComponent` entry point

## Phase 2: Data Adapter (TDD)

- [x] 2.1 RED: Create `apps/mobile/src/adapters/__tests__/MockCatalogDataSource.test.ts` — assert `listProducts()` returns array satisfying `productSchema.parse()` per item; assert `listCategories()` returns typed categories; assert `getProductById('prod-1')` returns matching product; assert `getProductById('missing')` returns null
- [x] 2.2 GREEN: Create `apps/mobile/src/adapters/CatalogDataSource.ts` — `CatalogDataSource` interface with `listProducts(): Promise<Product[]>`, `listCategories(): Promise<Category[]>`, `getProductById(id: string): Promise<Product | null>`
- [x] 2.3 GREEN: Create `apps/mobile/src/adapters/MockCatalogDataSource.ts` — implements `CatalogDataSource` with typed fixtures (use `new Date(...)` for `createdAt`/`updatedAt`); 2 categories, 4 products
- [x] 2.4 GREEN: Create `apps/mobile/src/adapters/HttpCatalogDataSource.ts` — implements `CatalogDataSource`, constructor takes `baseUrl: string`, methods throw `Error('Not implemented')` (typed stub, no `any`)
- [x] 2.5 RED: Create `apps/mobile/src/adapters/__tests__/HttpCatalogDataSource.test.ts` — assert method signatures return `@beim/contracts` types (TypeScript compile check); assert instantiation with baseUrl doesn't throw; assert methods throw 'Not implemented'
- [x] 2.6 GREEN: Create `apps/mobile/src/adapters/useCatalog.ts` — `useCatalog()` hook returning `CatalogDataSource`; defaults to `MockCatalogDataSource` via composition root
- [x] 2.7 REFACTOR: Verify adapter tests pass — `pnpm --filter @beim/mobile exec vitest run src/adapters`

## Phase 3: Screens + Navigation (TDD)

- [x] 3.1 Create `apps/mobile/src/theme/colors.ts` and `apps/mobile/src/theme/spacing.ts` — design tokens (primary, background, text, border colors; spacing scale)
- [x] 3.2 RED: Create `apps/mobile/src/app/__tests__/index.test.tsx` — render home screen with mock adapter; assert product cards show name, price+currency; assert empty-state message when adapter returns []
- [x] 3.3 GREEN: Create `apps/mobile/src/app/_layout.tsx` — expo-router `Stack` shell wrapping home, category, product routes
- [x] 3.4 GREEN: Create `apps/mobile/src/app/index.tsx` — home screen using `useCatalog().listProducts()`, FlatList of product cards (name, price with currency, image or placeholder), empty-state Text
- [x] 3.5 RED: Create `apps/mobile/src/app/__tests__/category.test.tsx` — render category screen for `cat-1`; assert filtered products shown; assert heading displays category name
- [x] 3.6 GREEN: Create `apps/mobile/src/app/category/[id].tsx` — uses `useLocalSearchParams`, filters products by `categoryId`, renders heading + product list
- [x] 3.7 RED: Create `apps/mobile/src/app/__tests__/product.test.tsx` — render product screen for `prod-1`; assert name, price, currency, brand, model, stock displayed
- [x] 3.8 GREEN: Create `apps/mobile/src/app/product/[id].tsx` — uses `useLocalSearchParams`, fetches product by id, renders detail fields
- [x] 3.9 REFACTOR: Verify screen tests pass — `pnpm --filter @beim/mobile exec vitest run src/app`

## Phase 4: Verification

- [x] 4.1 Run `pnpm --filter @beim/mobile exec vitest run` — all adapter + screen tests pass
- [x] 4.2 Run `pnpm typecheck --filter @beim/mobile` — exit 0, no type errors
- [x] 4.3 Run `pnpm lint --filter @beim/mobile` — exit 0, no `@beim/data`/`@prisma`/`@beim/domain` imports found
- [x] 4.4 Run `pnpm test --filter @beim/mobile` — turbo test task passes (mock adapter, no backend)
- [x] 4.5 Verify `pnpm install` resolves `@beim/mobile` without errors from root
