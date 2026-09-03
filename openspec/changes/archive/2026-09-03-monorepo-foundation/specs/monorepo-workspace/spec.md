# Monorepo Workspace Specification

## Purpose

Defines the root workspace infrastructure: pnpm workspaces, Turborepo task pipeline, root dev tooling (prettier, typescript), project documentation, and agent delegation contract.

## Requirements

### Requirement: Workspace Structure

The system MUST use pnpm workspaces with `apps/*` and `packages/*` as workspace globs. The `packageManager` field in root `package.json` MUST pin `pnpm@11.3.0`.

#### Scenario: Workspace resolution

- GIVEN a package.json exists at root with `packageManager: "pnpm@11.3.0"`
- AND pnpm-workspace.yaml lists `apps/*` and `packages/*`
- WHEN `pnpm install` runs at root
- THEN dependencies resolve without errors across all workspace packages

### Requirement: Task Pipeline

The system MUST define a Turborepo task pipeline in `turbo.json` with tasks: `build`, `dev`, `lint`, `typecheck`, `test`, `generate`, `clean`. The `build` task MUST depend on `^build` and declare outputs `dist/**` and `.next/**`. The `dev`, `generate`, and `clean` tasks MUST be non-cacheable. `lint`, `typecheck`, and `test` MUST depend on `^build`.

#### Scenario: Build cascade

- GIVEN a workspace with package A depending on package B
- WHEN `turbo run build` executes
- THEN B builds before A (topological order via `^build`)

#### Scenario: Dev mode is never cached

- GIVEN turbo.json defines `dev` with `cache: false`
- WHEN `turbo run dev` executes
- THEN no task output is restored from cache

### Requirement: Root Scripts

Root `package.json` MUST delegate `dev`, `build`, `lint`, `typecheck`, `test`, `generate`, and `clean` to `turbo run <task>`. A `format` script MUST run `prettier --write .`.

#### Scenario: Format command runs prettier

- GIVEN root package.json defines `"format": "prettier --write ."`
- WHEN `pnpm format` executes at root
- THEN prettier formats all matched files without crashing

### Requirement: Formatting

A prettier configuration file MUST exist at the repository root. The config SHOULD enforce consistent formatting (semicolons, single quotes, trailing commas, 100-char print width are recommended defaults).

#### Scenario: No prettier config file

- GIVEN no prettier config exists at root
- WHEN `prettier --check .` runs
- THEN prettier falls back to defaults (this scenario documents the gap to be filled)

#### Scenario: Prettier config present

- GIVEN a prettier config file exists at root
- WHEN `pnpm format` runs
- THEN all source files are formatted consistently per the config

### Requirement: Git Hygiene

The `.gitignore` MUST cover at minimum: `node_modules/`, `.env`, `.env.*` (except `.env.example`), `dist/`, `coverage/`, `.turbo/`, `.next/`, `.DS_Store`, `Thumbs.db`, `.vscode/`.

#### Scenario: Generated artifacts ignored

- GIVEN .gitignore includes `dist/`, `coverage/`, `.turbo/`, `.next/`
- WHEN a build produces `dist/` output
- THEN `git status` does not list `dist/` as untracked

### Requirement: Agent Delegation Contract

A root `AGENTS.md` file MUST document the SDD delegation contract: when to delegate, how to invoke sub-agents, and the phase lifecycle (explore → propose → spec → design → tasks → apply → verify → archive).

#### Scenario: AGENTS.md exists and is non-empty

- GIVEN the change is applied
- WHEN the repo is inspected
- THEN `AGENTS.md` exists at root, is non-empty, and contains delegation instructions

### Requirement: Project Documentation

A root `README.md` MUST describe the monorepo workspace structure, list the four apps and planned packages, state prerequisites (pnpm, node), and provide a getting-started section.

#### Scenario: README describes monorepo

- GIVEN the change is applied
- WHEN a developer reads README.md
- THEN it references the workspace layout (`apps/*`, `packages/*`), lists prerequisites, and includes a "getting started" sequence

#### Scenario: README ends with newline

- GIVEN README.md is written
- WHEN the file is inspected
- THEN it ends with a trailing newline
