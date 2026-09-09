# clean-arch-kernel Specification

## Purpose

Canonical kernel for `apps/gestion` slice-0: shared types, `Result`, error codes, and the single canonical `Role` home with a backward-compatible re-export shim.

## Requirements

### Requirement: Canonical Role type

The system MUST define `Role` exactly once in `src/kernel/` as a const object plus extracted union type (TypeScript const-types pattern, no bare union).

#### Scenario: Role resolves from kernel

- GIVEN a page imports `Role` from `src/kernel/`
- WHEN `pnpm typecheck` runs in `apps/gestion`
- THEN the import resolves with zero errors
- AND `Role` values equal the frozen API role set

#### Scenario: No duplicate Role definitions

- GIVEN the kernel defines `Role`
- WHEN a grep scans `apps/gestion/src` for `type Role =`
- THEN exactly one definition exists (the kernel one)

### Requirement: Kernel Result and errors

The system MUST expose `Result<T, E>` (`ok`/`err`) and `createGestionError` with stable `ERROR_CODES` from `src/kernel/` with no I/O dependencies.

#### Scenario: Use-case returns typed error

- GIVEN a use-case fails validation
- WHEN it returns `err(createGestionError(ERROR_CODES.VALIDATION_ERROR))`
- THEN the caller matches on `ok`/`err` without throwing
- AND the error code is stable across releases

### Requirement: Role re-export shim

The system MUST keep a re-export shim at the old server-handler `Role` path so existing imports compile unchanged during slice-0.

#### Scenario: Old imports keep compiling

- GIVEN a page still imports `Role` from the old server-handler path
- WHEN `pnpm typecheck` runs in `apps/gestion`
- THEN compilation succeeds with zero errors
- AND the shim type is identical to the kernel `Role`

#### Scenario: Shim removal is safe

- GIVEN all pages import `Role` from `src/kernel/`
- WHEN the shim file is deleted
- THEN `pnpm typecheck` still passes
