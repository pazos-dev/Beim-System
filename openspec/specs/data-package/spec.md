# data-package Specification

## Purpose

Bootstrap `packages/data`: workspace entry, Prisma client generation, and public interface exposing the mapper, seed, and data-access modules.

## Requirements

### Requirement: Workspace Registration

`packages/data` SHALL be a pnpm workspace package with name `@beim/data`.

#### Scenario: Package resolves in monorepo

- GIVEN the monorepo is installed via `pnpm install`
- WHEN a consumer imports `@beim/data`
- THEN the import resolves to `packages/data/src/index.ts`

### Requirement: Prisma Client Generation

The package SHALL expose a generated Prisma client importable as `@beim/data/prisma`.

#### Scenario: Client importable after generate

- GIVEN `prisma generate` has run in `packages/data`
- WHEN consumer code imports the Prisma client
- THEN the import resolves to the generated `@prisma/client` types

### Requirement: Public API Surface

The package SHALL export mapper functions, seed runner, and data-access helpers from `src/index.ts`.

#### Scenario: All modules re-exported

- GIVEN the package is built
- WHEN consumer code imports from `@beim/data`
- THEN mapper, seed, and data-access functions are available as named exports

### Requirement: TypeScript Strictness

The package MUST compile under the monorepo's ultra-strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).

#### Scenario: Typecheck passes

- GIVEN the monorepo tsconfig is applied
- WHEN `pnpm typecheck` runs across the workspace
- THEN `packages/data` produces zero type errors
