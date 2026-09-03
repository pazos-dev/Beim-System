# BEIM System Tech

TypeScript monorepo for the BEIM ecosystem — storefront web, admin panel, desktop app, and mobile app, built on shared domain packages.

## Architecture

```
apps/
├── web/          # Public storefront (React 19 + Vite)
├── gestion/     # Admin panel (React 19 + Vite)
├── desktop/     # Desktop app (Electron + React)
└── mobile/      # Mobile app (React Native)

packages/
├── tsconfig/    # Shared TypeScript configs (@beim/tsconfig)
├── contracts/   # API contracts & types
├── domain/      # Business logic (framework-free)
├── data/        # Data access layer (Drizzle + PostgreSQL)
└── ui/          # Shared UI components
```

**Orchestration**: Turborepo handles task scheduling and caching.  
**Package manager**: pnpm 11.3.0 (pinned via `packageManager`).  
**TypeScript**: Ultra-strict config — `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and more.

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [pnpm](https://pnpm.io/) 11.3.0 (installed automatically via Corepack)

Enable Corepack to use the pinned pnpm version:

```bash
corepack enable
```

## Getting Started

1. Clone the repository:

   ```bash
   git clone https://github.com/beimtecnologia/beim-system-tech.git
   cd bei-system-tech
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Start development:

   ```bash
   pnpm dev
   ```

4. Build all packages:

   ```bash
   pnpm build
   ```

5. Format code:

   ```bash
   pnpm format
   ```

## Project Structure

| Path                  | Description                                              |
| --------------------- | -------------------------------------------------------- |
| `apps/*`              | Application workspaces (web, gestion, desktop, mobile)   |
| `packages/*`          | Shared libraries (tsconfig, contracts, domain, data, ui) |
| `turbo.json`          | Turborepo task pipeline configuration                    |
| `pnpm-workspace.yaml` | pnpm workspace glob definitions                          |
| `AGENTS.md`           | AI agent delegation contract and SDD workflow            |

## Legacy Sources

The original BEIM system lives in two legacy directories that will be ported into this monorepo:

- `pagina-web/` — Vanilla JS storefront + Node.js API server
- `sistema-gestion/` — Vanilla JS admin panel

These directories are preserved during the transition and will be removed once all functionality is migrated.

## License

Private — Beim Tecnología.
