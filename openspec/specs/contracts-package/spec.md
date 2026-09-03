# Contracts Package Specification

## Purpose

Defines `@beim/contracts`: the shared Zod schema + TypeScript type foundation for the monorepo. Single source of truth for domain shapes consumed by all layers.

## Requirements

### Requirement: Package Identity

The package SHALL be named `@beim/contracts`, marked `private: true`, and located at `packages/contracts/`.

#### Scenario: Package resolves in workspace

- GIVEN `packages/contracts/package.json` declares `name: "@beim/contracts"` and `private: true`
- WHEN `pnpm install` runs at root
- THEN pnpm resolves `@beim/contracts` without errors

### Requirement: Ultra-Strict TypeScript Config

The package tsconfig SHALL extend `@beim/tsconfig/base.json` and set `outDir`, `rootDir`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `incremental: true`.

#### Scenario: Config compiles under ultra-strict base

- GIVEN tsconfig extends `@beim/tsconfig/base.json`
- WHEN `tsc --noEmit` runs
- THEN no errors from `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, or `verbatimModuleSyntax`

#### Scenario: Zero unused declarations

- GIVEN a source file with an unused local variable
- WHEN compiled with the package tsconfig
- THEN `noUnusedLocals` emits an error

### Requirement: Barrel Export

`src/index.ts` SHALL re-export all schemas and inferred types from per-entity modules. Consumers SHALL import from `@beim/contracts` only.

#### Scenario: Import resolves all schemas

- GIVEN `src/index.ts` exports all entity schemas and enums
- WHEN a consumer writes `import { userSchema } from '@beim/contracts'`
- THEN the import resolves and the schema validates correctly

#### Scenario: No re-export leakage

- GIVEN internal implementation details exist in submodules
- WHEN `src/index.ts` is inspected
- THEN only public schemas and types are re-exported

### Requirement: Vitest Test Runner

Vitest SHALL be a workspace devDependency. The package `test` script SHALL run `vitest run`. Root `pnpm test --filter @beim/contracts` SHALL execute and pass.

#### Scenario: Root test command reaches package

- GIVEN `packages/contracts/package.json` defines `"test": "vitest run"`
- WHEN `pnpm test --filter @beim/contracts` runs at root
- THEN Vitest executes and exits 0

#### Scenario: Test failure surfaces at root

- GIVEN a test file contains a failing assertion
- WHEN `pnpm test --filter @beim/contracts` runs
- THEN the command exits non-zero with failure details

### Requirement: Source Structure

The package SHALL have `src/index.ts` as entry point. Each entity SHALL have its own module file. Enums SHALL be co-located with schemas.

#### Scenario: Entry point is index.ts

- GIVEN the package defines `"main"` or `"exports"` pointing to `src/index.ts`
- WHEN the package is consumed by another workspace package
- THEN imports resolve to `src/index.ts`

#### Scenario: Entity modules are separate files

- GIVEN each entity has a dedicated module
- WHEN a module is imported individually (e.g., `@beim/contracts/user`)
- THEN only that entity's schema and type are available
