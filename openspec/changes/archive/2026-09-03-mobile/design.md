# Design: Mobile App — Expo Scaffold + Catalog MVP

## Technical Approach

Greenfield Expo (managed, **SDK 54**, RN 0.81.5, React 19.1.0) app in `apps/mobile` (`@beim/mobile`). Expo SDK 54 is the first with first-class **pnpm isolated-module support** (no `node-linker=hoisted` needed — confirmed by expo/expo and byCedric monorepo example). Navigation via **expo-router** (file-based). Catalog data flows only through a `data-adapter` returning `@beim/contracts` types; a `MockCatalogDataSource` backs the MVP, `HttpCatalogDataSource` is a typed stub for a future mobile-api. DB/domain stays server-side (eslint import-ban per desktop precedent). All turbo tasks green with no backend. Maps to `mobile-app` spec (6 req / 11 scenarios); scoped to the MVP slice — no real API, auth, cart, checkout, push, offline, Maestro, or `@beim/ui`.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Navigation | **expo-router** (file-based) vs react-navigation (code-based) | Router: typed routes by convention, `src/app/` mirrors Next.js `app/`, native stack built-in, less boilerplate, is the Expo default. RN: more manual wiring, but more flexible for deep custom nav. | **expo-router v6** — MVP needs 3 shallow routes; file-based keeps structure discoverable and matches the team's Next.js `app/` mental model |
| Native build | **Managed Expo** vs bare RN / prebuild | Managed: no android/ios dirs, fastest MVP, Expo Go preview. Bare: full native control but heavy setup, no need for view-only MVP. | **Managed** — no native config plugin needed (revisit when auth/camera/push land) |
| Contracts boundary | **RN-safe `@beim/contracts` only** vs `@beim/data` on-device | `@beim/contracts` is pure TS + zod (verified no Node builtins) and bundles under Metro. `@beim/data` pulls Prisma/Postgres + `@beim/domain` — not runnable on device. | **`@beim/contracts` only** — the seam is the `data-adapter`; Prisma/domain stay server-side |
| Data access | **Adapter seam (mock now)** vs direct models | Mock typed fixtures now, `HttpCatalogDataSource` typed stub later; UI never knows transport. | **`CatalogDataSource` interface** returning `@beim/contracts` types; composition root `useCatalog` defaults to Mock |
| Import boundary | eslint `no-restricted-imports` ban vs convention only | Ban is machine-enforced (desktop precedent). | **Ban `@beim/data`, `@prisma/client`, `@beim/domain`** in mobile source |

### Metro workspace resolution (pnpm)
`metro.config.js` uses `getDefaultConfig` + `watchFolders: [packages/*, apps/*]` + `resolver.nodeModulesPaths` (app `node_modules` → root `node_modules` → `.pnpm/node_modules`) + `unstable_enableSymlinks`/`unstable_enablePackageExports: true`. SDK 54 isolated deps work; no `.npmrc` override.

### pnpm allowBuilds
Add Expo/RN native packages that run postinstall: `expo`, `@expo/vector-icons`, `@expo/next-adapter`, `@react-native/community-cli-plugin`, `@react-native/virtualized-lists`, `react-native`, `fsevents`, `sharp`. Exact set is auto-listed by `pnpm approve-builds` / placeholder writes on first install; confirm each `: true`.

## Data Flow

```
Screen (src/app/*) ── useCatalog() ── CatalogDataSource ── @beim/contracts types
                                          │
                          MockCatalogDataSource (MVP) / HttpCatalogDataSource (stub)
```

`HttpCatalogDataSource` is transport-typed but not wired (no live API). Fetch errors/empty map to an empty-state screen.

## File Changes

| File | Action | Description |
|---|---|---|
| `apps/mobile/package.json` | Create | `@beim/mobile`, Expo SDK 54, expo-router, deps `@beim/contracts`; dev `@beim/tsconfig`, vitest, RTL |
| `apps/mobile/app.json` | Create | Expo config, newArchEnabled, plugin `expo-router` |
| `apps/mobile/metro.config.js` | Create | watchFolders + nodeModulesPaths (pnpm workspace) |
| `apps/mobile/tsconfig.json` | Create | extends `@beim/tsconfig/react.json`, `paths` |
| `apps/mobile/eslint.config.mjs` | Create | `no-restricted-imports` ban (desktop precedent) |
| `apps/mobile/vitest.config.ts` | Create | jsdom + react plugin + RTL |
| `apps/mobile/vitest.setup.ts` | Create | jest-dom + cleanup |
| `apps/mobile/index.js` | Create | `registerRootComponent` entry |
| `apps/mobile/src/app/_layout.tsx` | Create | expo-router Stack shell |
| `apps/mobile/src/app/index.tsx` | Create | Home catalog screen |
| `apps/mobile/src/app/category/[id].tsx` | Create | Category screen (filters by `categoryId`) |
| `apps/mobile/src/app/product/[id].tsx` | Create | Product detail screen |
| `apps/mobile/src/adapters/CatalogDataSource.ts` | Create | Interface (contracts types) |
| `apps/mobile/src/adapters/MockCatalogDataSource.ts` | Create | Typed fixtures (zod `Date`s!) |
| `apps/mobile/src/adapters/HttpCatalogDataSource.ts` | Create | Typed HTTP stub (future mobile-api) |
| `apps/mobile/src/adapters/useCatalog.ts` | Create | Composition root hook (defaults Mock) |
| `apps/mobile/src/theme/` | Create | Colors/spacing tokens |
| `apps/mobile/src/**/*.test.ts(x)` | Create | Adapter + screen tests |
| `turbo.json` | Modify | `mobile#dev\|build\|typecheck\|lint\|test` |
| `pnpm-workspace.yaml` | Modify | `allowBuilds` for Expo/RN deps |

## Interfaces / Contracts

```ts
// src/adapters/CatalogDataSource.ts
import type { Category, Product } from '@beim/contracts'
export interface CatalogDataSource {
  listProducts(): Promise<Product[]>
  listCategories(): Promise<Category[]>
  getProductById(id: string): Promise<Product | null>
}
```

Mock fixtures MUST use `new Date(...)` (Product/Category `createdAt`/`updatedAt` are `z.date()`, not strings).

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `MockCatalogDataSource` returns products/categories; `HttpCatalogDataSource` signatures typed (not `any`) | vitest (jsdom), assert schema-parses via `productSchema.parse` |
| Unit | Category filtering by `categoryId`; `getProductById` | pure function tests |
| Component | Home renders product cards (name/price+currency/image-or-placeholder); empty-state; product detail fields; category heading | react-test-renderer + @testing-library/react (RN caveats: use renderer not DOM; mock `expo-router` `useLocalSearchParams`) |
| E2E | None in MVP | Maestro deferred (needs device/emulator) |

Testable offline: adapter logic + screen render with Mock. RN render tests run in jsdom with `react-test-renderer`.

## Threat Matrix

N/A — no routing (app-level screen nav only), shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary introduced.

## Migration / Rollout

No migration. Greenfield app; `pnpm install` after wiring; Expo Go preview for manual smoke. `pnpm approve-builds` once to lock allowBuilds.

## Open Questions

- [ ] Exact allowBuilds set may vary with install-time placeholders — confirm after first `pnpm install` (not blocking).
- [ ] HTTP stub base URL for future mobile-api — deferred, not blocking.
