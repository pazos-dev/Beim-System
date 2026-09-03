# Proposal: Mobile App — Expo Scaffold + Catalog MVP

## Intent

Introduce a greenfield **Expo / React Native** app in `apps/mobile`. BEIM has **no mobile presence** (legacy is web-only). This change stands up the monorepo-compatible mobile host and delivers the **first view-only storefront slice** (home catalog + category + product detail), mirroring `storefront-catalog`. It proves RN + pnpm/Metro + `@beim/contracts` work together before scaling to the full storefront.

## Scope

### In Scope
- `apps/mobile` Expo scaffold: package wiring, Metro config, tsconfig extends `@beim/tsconfig/react.json`, and `@beim/contracts` as a workspace dep.
- App shell + navigation (catalog home, category, product detail).
- **View-only client**: a `data-adapter` with a mock source now and an HTTP contract ready; `@beim/data` (Prisma) stays **server-side**.
- Build / typecheck / lint / test wired into turbo (`mobile#dev|build|typecheck|test`); baseline unit + smoke tests.
- `pnpm-workspace.yaml` `allowBuilds` for native Expo deps.

### Out of Scope
- Real API integration (no deployed API; deferred to a `mobile-api` change).
- Full storefront, cart, checkout, auth, payments.
- Push notifications, offline sync, deep links.
- Maestro e2e (needs device/emulator; deferred).
- `@beim/ui` consumption (package not yet present).

## Capabilities

> Contract for sdd-spec. **No legacy or main-spec mobile capability exists**; `storefront-catalog` (web) is a related-but-separate capability and its spec is NOT modified.

### New Capabilities
- `mobile-app`: Expo/RN host in `apps/mobile` — scaffold, navigation shell, catalog view, and the view-only data adapter (mock now, HTTP-ready).

### Modified Capabilities
- None.

## Approach

- **Expo (managed, SDK ~54)**: cleanest monorepo fit — Metro supports pnpm workspaces; no prebuild/dev-client for a view-only MVP (no native config plugins). Revisit when auth/camera/push land.
- **Metro + pnpm**: resolve `@beim/contracts` (pure TS + zod, **RN-safe**, no Node builtins) via Metro `watchFolders`/`resolver.nodeModulesPaths`. `@beim/data` (Prisma/postgres) is explicitly **not** importable on device.
- **Data path**: `data-adapter` interface (`listProducts`, `listCategories`, `getProductById`) returning `@beim/contracts` types — a `MockCatalogDataSource` now, `HttpCatalogDataSource` stub typed to a future API.
- Follow the `desktop-app` precedent: eslint flat config bans `@beim/data`/`@prisma/client` in mobile source.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/mobile/*` | New | Expo host package |
| `turbo.json` | Modified | `mobile#dev\|build\|typecheck\|test` |
| `pnpm-workspace.yaml` | Modified | `allowBuilds` for native Expo deps |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Metro/pnpm symlink resolution | Med | Explicit `watchFolders`; verify `@beim/contracts` bundles |
| Expo SDK drift in monorepo | Med | Pin SDK; isolate native config |
| No API to integrate | Med | Adapter decouples UI from transport |

## Rollback Plan

Orthogonal greenfield app. Revert by deleting `apps/mobile` and reverting the `turbo.json` / `pnpm-workspace.yaml` lines. No shared code path affected.

## Dependencies

- Node 20+, pnpm 11.3.0, Expo SDK.
- `@beim/contracts` (present, RN-safe).

## Success Criteria

- [ ] `pnpm build --filter @beim/mobile` + typecheck + lint + test pass (no Postgres needed).
- [ ] Catalog screen renders products/types from the adapter; empty state handled.
- [ ] Metro dev bundler resolves `@beim/contracts` without resolution errors.
- [ ] No `@beim/data` / `@prisma` import in mobile source (lint enforced).

## Assumptions

- Expo managed suffices for MVP; no custom native module yet.
- Future API will expose `@beim/contracts`-shaped JSON, so the adapter contract is stable.
