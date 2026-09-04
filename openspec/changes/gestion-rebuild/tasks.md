# Tareas: Reconstrucción de la aplicación de gestión

**Estado:** **Objetivo futuro (Future target)**. Este apply solo produce el set documental y este `tasks.md`, ejecutando `GR-0.1`; código y decisiones posteriores quedan sin marcar.

## Previsión de carga de revisión

Total **3.200–3.900 líneas**; docs 220, shared 280, shell 340, identidad 300, JSON 360, órdenes 540→2 PR, stock 580→2 PR, cash 340, admin 360, parity 320. Cada PR ≤400.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Preflight: `auto-chain` + `feature-branch-chain` seleccionados; falta aprobar cada slice.

### Suggested Work Units

| U | PR/base | Test | Runtime harness | R |
|---|---|---|---|---|
| 0 | PR1@tracker docs≤220 | `git diff --check` | N/A-docs | docs |
| 1 | PR2@PR1 shared≤280 | `pnpm test` | N/A-handlers | shared |
| 2 | PR3@PR2 shell≤340 | `pnpm test` | `pnpm dev`/E2E-auth | shell |
| 3 | PR4@PR3 identity≤300 | `pnpm test` | `pnpm dev`/E2E-login | identity |
| 4 | PR5@PR4 JSON≤360 | `pnpm test` | `pnpm dev`/bootstrap | JSON |
| 5 | PR6@PR5 unlock≤120 | revisión docs | N/A-decisión | política |
| 6 | PR7@PR6 orders≤400 | `pnpm test` | `pnpm dev`/E2E-order | orders |
| 7 | PR8@PR7 print≤400 | `pnpm test` | `pnpm dev`/E2E-print | print |
| 8 | PR9@PR8 stock≤400 | `pnpm test` | `pnpm dev`/E2E-transfer | stock |
| 9 | PR10@PR9 sales≤400 | `pnpm test` | `pnpm dev`/E2E-sale | sales |
| 10 | PR11@PR10 cash≤340 | `pnpm test` | `pnpm dev`/E2E-cash | cash |
| 11 | PR12@PR11 admin≤360 | `pnpm test` | `pnpm dev`/E2E-restore | admin |
| 12 | PR13@PR12 parity≤320 | `pnpm test` | `pnpm dev`/E2E-dry-run | parity |

**Clave:** D=dependencias; O=owner/límite; F=archivos; A=aceptación; T=unit/integration/component/E2E/negative; V=evidencia; R=reversión. Código: RED→GREEN.

## Fases y orden

F0 docs → F1 shared/shell → F2 identity/JSON → F3 orders → F4 stock/comercio → F5 cash/reportes → F6 admin/backups → F7 parity/migración.

- [x] **GR-0.1** — D=raíz;O=docs;F=`apps/gestion/docs/{AGENTS.md,constitution.md,plan.md,stacks.md,spec.md,tasks.md}`;A=crear seis docs ES+roles+enlaces raíz AGENTS/constitution/spec/plan/tasks;T=U/I/C/E=N/A,N documental;V=`git diff --check`;R=F.
- [x] **GR-SHARED.1** — D=0.1;O=handler→dominio→JSON;F=`apps/gestion/src/server/handlers/`,`apps/gestion/src/server/data/{json-store.ts,schemas.ts}`,`apps/gestion/data/audit.json`;A=8 errores+hash/replay+tokens+AUDIT_FAILURE;T=U/I/N RED→GREEN,C/E=N/A;V=`pnpm test`;R=F.
- [x] **GR-SHELL.1** — D=shared;O=middleware/handler;F=`apps/gestion/middleware.ts`,`apps/gestion/e2e/`;A=RED sin/invalid cookie o permiso⇒denegar sin datos/mutación;T=I/E/N RED,U/C=N/A;V=`pnpm test`;R=pruebas.
- [x] **GR-SHELL.2** — D=.1;O=presentación;F=`apps/gestion/app/app/{layout,page,dashboard}/page.tsx`,`apps/gestion/src/components/{ui,features}/`;A=navegación+búsqueda+período+foco+Escape+carga/error;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F.
- [ ] **GR-ID.1** — D=shell;O=AuthHandler→users/session;F=`apps/gestion/app/login/page.tsx`,`apps/gestion/app/api/gestion/**/route.ts`,`apps/gestion/data/{users.json,role-permissions.json,audit.json}`;A=5 roles+login inválido+actor falsificado+banner+auditoría;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F.
- [ ] **GR-JSON.1** — D=identity;O=EntityRepository/owner;F=`apps/gestion/src/server/data/{repositories,json-store.ts,schemas.ts}`,`apps/gestion/data/*.json`,`apps/gestion/app/api/gestion/**/route.ts`;A=bootstrap+Zod+4→5+temp-rename+conflicto+API caída no durable;T=U/I/E/N RED→GREEN,C=N/A;V=`pnpm test`;R=F.
- [ ] **GR-ORDERS.0** — D=JSON;O=privacidad;F=`apps/gestion/docs/{constitution.md,plan.md,spec.md}`;A=decidir unlock fuera de `ordenes.json`/print o `datos-desbloqueo.json` restringido;bloquea .1/.2;T=U/I/C/E=N/A,N documental;V=decisión docs;R=política.
- [ ] **GR-ORDERS.1** — D=.0+JSON;O=OrderHandler/Repository;F=`apps/gestion/src/lib/domain/orders/`,`apps/gestion/src/server/handlers/`,`apps/gestion/app/api/gestion/ordenes/**/route.ts`,`apps/gestion/data/ordenes.json`;A=alta/duplicado+grafo+stock/pago atómico+reintento;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=rutas/F.
- [ ] **GR-ORDERS.2** — D=.1;O=UI/print;F=`apps/gestion/app/app/ordenes/page.tsx`,`apps/gestion/src/components/features/`,`apps/gestion/e2e/`;A=preview+2 copias+sin secreto+denegación;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=UI/flag.
- [ ] **GR-STOCK.1** — D=orders;O=inventario;F=`apps/gestion/src/lib/domain/inventory/`,`apps/gestion/app/api/gestion/{productos,compras,stock}/**/route.ts`,`apps/gestion/data/{productos,categorias,servicios,movimientos-stock,compras}.json`;A=CRUD/rol+transferencia+costo ponderado+rollback;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F.
- [ ] **GR-STOCK.2** — D=.1;O=CommerceHandler;F=`apps/gestion/app/api/gestion/ventas/**/route.ts`,`apps/gestion/data/{ventas,productos,movimientos-stock,ordenes}.json`,`apps/gestion/e2e/`;A=pagos exactos+descuento único+retorno/anulación idempotentes;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F.
- [ ] **GR-CASH.1** — D=stock;O=Cash/ReportQueryHandler;F=`apps/gestion/src/lib/domain/{cash,reports}/`,`apps/gestion/app/api/gestion/{caja,reportes}/**/route.ts`,`apps/gestion/data/sesiones-caja.json`;A=esperado determinista+netos+contabilidad+CSV;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F.
- [ ] **GR-ADMIN.1** — D=cash+identity;O=Admin/backup;F=`apps/gestion/app/api/gestion/admin/**/route.ts`,`apps/gestion/data/{menu,users,role-permissions}.json`,`apps/gestion/data/backups/`;A=árbol sin ciclos+roles+backup+restore/rollback;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=F/snapshot.
- [ ] **GR-PARITY.1** — D=admin+.0;O=MigrationHandler/Repository;F=`apps/gestion/app/api/gestion/admin/migration/**/route.ts`,`apps/gestion/fixtures/*.json`,`apps/gestion/data/{migration-map,migration-state}.json`;A=mapping ambiguo+secreto+estado+API caída+cutover bloquean;T=U/I/C/E/N RED→GREEN;V=`pnpm test`;R=mappings,legado intacto.

Las filas N/A de amenazas se omiten; GR-SHELL.1 es el RED aplicable de routing. No modificar legacy, CI, PostgreSQL, despliegue ni cutover.
