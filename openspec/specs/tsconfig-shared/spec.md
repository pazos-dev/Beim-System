# Shared TypeScript Configurations Specification

## Purpose

Defines the `@beim/tsconfig` package: a set of shared TypeScript configurations that all packages and apps in the monorepo MUST extend. Provides ultra-strict base, Node.js, and React/React Native presets.

## Requirements

### Requirement: Ultra-Strict Base Configuration

`base.json` MUST enable all of: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals`, `noUnusedParameters`, `forceConsistentCasingInFileNames`, `esModuleInterop`, `skipLibCheck`, `resolveJsonModule`, `isolatedModules`, `verbatimModuleSyntax`, `declaration`, `declarationMap`, `sourceMap`, `incremental`. Target MUST be `ES2022`, module MUST be `ESNext`, moduleResolution MUST be `Bundler`.

#### Scenario: Base config is valid tsconfig

- GIVEN base.json exists at packages/tsconfig/base.json
- WHEN `tsc --showConfig` resolves a tsconfig extending base.json
- THEN all compiler options are recognized and no errors occur

#### Scenario: Strict flags enforce safety

- GIVEN a TypeScript file with an unchecked index access
- WHEN compiled with a tsconfig extending base.json
- THEN the compiler emits an error for the unchecked access

### Requirement: Node Configuration

`node.json` MUST extend `./base.json` and override `module` to `NodeNext`, `moduleResolution` to `NodeNext`, and `types` to `["node"]`. Target MUST remain `ES2022`.

#### Scenario: Node config resolves NodeNext modules

- GIVEN a package tsconfig extends `@beim/tsconfig/node.json`
- WHEN the package uses `import fs from 'node:fs'`
- THEN TypeScript resolves the import without errors

### Requirement: React Configuration

`react.json` MUST extend `./base.json` and add JSX support for React/React Native. It MUST set `jsx` to `"react-jsx"` (or `"react-jsxdev"` for dev), and include `"dom"` and `"dom.iterable"` in `lib`. It SHOULD NOT override `module` or `moduleResolution` (apps choose their own).

#### Scenario: React config enables JSX

- GIVEN a package tsconfig extends `@beim/tsconfig/react.json`
- WHEN a `.tsx` file contains JSX syntax
- THEN TypeScript compiles without "Cannot use JSX" errors

#### Scenario: React config inherits strict base

- GIVEN react.json extends base.json
- WHEN a TypeScript file violates a strict rule (e.g., unused parameter)
- THEN the compiler still emits the strict-rule error

### Requirement: Package Distribution

`package.json` in `packages/tsconfig` MUST declare name `@beim/tsconfig`, version `0.0.0`, `private: true`, and `files` array listing `base.json`, `node.json`, `react.json`. All three JSON files MUST exist on disk.

#### Scenario: All config files declared in files array

- GIVEN package.json lists `files: ["base.json", "node.json", "react.json"]`
- WHEN `ls packages/tsconfig/` runs
- THEN all three `.json` files are present on disk

#### Scenario: Workspace consumer resolves config

- GIVEN a package in the monorepo has `"extends": "@beim/tsconfig/base.json"` in its tsconfig
- WHEN `pnpm install` runs at root
- THEN pnpm resolves `@beim/tsconfig` from the workspace and the tsconfig extends correctly
