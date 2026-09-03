# Delta for Domain Package

## ADDED Requirements

### Requirement: Package Configuration

The `@beim/domain` package SHALL be a private TypeScript ESM package with `@beim/contracts` as its sole workspace dependency.

#### Scenario: Package metadata correct

- GIVEN `packages/domain/package.json` exists
- WHEN inspected
- THEN `name` equals `@beim/domain`
- AND `type` equals `module`
- AND `private` is `true`
- AND `@beim/contracts` is `"workspace:*"` in `dependencies`

#### Scenario: No infrastructure dependencies

- GIVEN the `@beim/domain` package
- WHEN dependencies are audited
- THEN no Prisma, HTTP, database, or framework packages appear
- AND only `vitest` and `@beim/tsconfig` appear in `devDependencies`

### Requirement: TypeScript Configuration

The package SHALL extend `@beim/tsconfig/base.json` and compile under ultra-strict mode.

#### Scenario: tsconfig extends base

- GIVEN `packages/domain/tsconfig.json` exists
- WHEN read
- THEN `extends` equals `@beim/tsconfig/base.json`
- AND `rootDir` is `src`

#### Scenario: Ultra-strict compilation

- GIVEN the package source
- WHEN `tsc --noEmit` runs
- THEN no type errors are reported

### Requirement: Test Runner

The package SHALL use Vitest with co-located test files matching `src/**/*.test.ts`.

#### Scenario: Vitest config present

- GIVEN `packages/domain/vitest.config.ts` exists
- WHEN loaded
- THEN test files match `src/**/*.test.ts`
- AND environment is `node`

#### Scenario: Test script exits clean

- GIVEN the package is installed
- WHEN `pnpm --filter @beim/domain test` executes
- THEN the process exits with code 0

### Requirement: Barrel Exports

The package SHALL export all domain modules through a single `src/index.ts` barrel.

#### Scenario: All modules accessible

- GIVEN `@beim/domain` is imported
- WHEN domain functions are accessed
- THEN all 10 modules are available from the root import
