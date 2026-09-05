# Tareas: ordenes-ui-enhancement

**Estado:** **Objetivo futuro (Future target)**. Mejora de la vista de órdenes según
`design-ordenes-ui.md` (canónico). No modificar legado, CI, PostgreSQL ni despliegue.
Encadena como nuevo PR sobre el tracker, sin reabrir `GR-ORDERS.*` archivados.

## Previsión de carga de revisión

Estimado **380–500 líneas** (según diseño con paginación server-side + boleta vendored).
Con `delivery_strategy=auto-chain` se encadena sin volver a preguntar.

| Campo | Valor |
|---|---|
| Chained PRs recommended | Yes |
| 400-line budget risk | Medium-High |
| Decision needed before apply | No (`auto-chain`) |

## Preflight

`auto` · `both` · `auto-chain` · `review_budget_lines: 400`.

## Tareas (RED→GREEN, test runner `pnpm test`, strict TDD)

### ORD-UI.1 — Schema Orden extendido (campos opcionales) ✅ DONE
- **D**: base JSON existente · **O**: `src/server/data/schemas.ts`
- **F**: `apps/gestion/src/server/data/schemas.ts`, test de schemas
- **A**: `ordenSchema` acepta opcionales `deviceBrand?`, `deviceModel?`, `deviceColor?`,
  `estimatedTime?`, `estimatedTimeUnit?`, `boletaNumero?`; JSON legacy parsea sin migración;
  Zod strip en rollback.
- **T**: unitaria schema RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.2 — Dominio órdenes: filtros, formatos, nextNumber ✅ DONE
- **D**: .1 · **O**: `src/lib/domain/orders/orden.ts`
- **F**: `apps/gestion/src/lib/domain/orders/orden.ts`, test junto a `orden.test.ts`
- **A**: `ORDER_STATE_FILTERS` (registro ordenado filterKey→`{label, estados|null}` según tabla
  normativa 11→9: todas/abiertas/en_diagnostico/presupuesto/aprobado/espera_repuesto/en_proceso
  /finalizadas/canceladas), `resolveOrderFilter`, `orderFilterCounts`, `formatEquipment`,
  `formatEstimatedDisplay` ("90 min", "2 h", "1 día"/"n días", "—"), `nextOrderNumeroValue`.
- **T**: unitaria dominio RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.3 — OrderHandler.listView (join + counts + sort + paginación + permiso boleta) ✅ DONE
- **D**: .2 · **O**: `src/server/handlers/orders.ts`
- **F**: `apps/gestion/src/server/handlers/orders.ts`, test existente `orders.test.ts`
- **A**: `listView(actor, query)` (no toca `list()`): join clientes (`clienteNombre` con fallback
  "Cliente eliminado"), filtro por grupo, `counts`, sort/paginación, `canViewBoleta`
  solo `administrador_principal`, DTO `OrderListItem` con `clienteId` conservado y sin secretos.
- **T**: unitaria/integración handler RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.4 — GET /api/gestion/ordenes con query (filtro/página/orden) ✅ DONE
- **D**: .3 · **O**: `app/api/gestion/ordenes/route.ts`
- **F**: `apps/gestion/app/api/gestion/ordenes/route.ts`, test de ruta
- **A**: query Zod (`estado`, `page`, `pageSize`, `sort`, `dir`); 400 si filterKey inválido;
  respuesta `{ ok, data: OrderListResponse }` sin secretos; auth 401/403 intacta.
- **T**: unitaria/HTTP del contrato RED→GREEN · **V**: `pnpm test` · **R**: F/R

### ORD-UI.5 — DataTable extendido (orden controlado opcional) ✅ DONE
- **D**: — · **O**: `src/components/ui/DataTable.tsx`
- **F**: `apps/gestion/src/components/ui/DataTable.tsx`, test
- **A**: props opcionales `sort`, `onSort`, `sortable` por columna, `aria-sort`; comportamiento
  por defecto idéntico (Dashboard.tsx no se afecta).
- **T**: RTL de DataTable RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.6 — Componentes feature ✅ DONE
- **D**: .2/.5 · **O**: `src/components/features/`
- **F**: `OrdersStateFilterBar.tsx` (props `{filters, activeFilter, counts, onChange}`, `aria-pressed`),
  `OrdersTable.tsx` (8 columnas, paginación URL, columna Boleta solo `canViewBoleta`),
  `CreateOrderButton.tsx` (navega a `/app/ordenes/nueva`, oculto si rol ∉ `ORDER_CREATE_ROLES`)
  + tests RTL
- **A**: render correcto, activo, contadores, "—" para vacíos, boleta ausente del DOM sin permiso.
- **T**: RTL de componentes RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.7 — Refactor /app/ordenes/page.tsx (TanStack Query + URL fuente de verdad) ✅ DONE
- **D**: .4/.6 · **O**: `app/app/ordenes/page.tsx`
- **F**: `apps/gestion/app/app/ordenes/page.tsx`, `page.test.tsx` actualizado
- **A**: `useQuery(["ordenes", {estado,page,sort,dir}])`; estado inválido → `router.replace` al
  defecto; contadores refrescan; conserva detalle + `OrderPrint`; estados loading/error/denied.
- **T**: RTL página (lista, filtrado, error, denied) RED→GREEN · **V**: `pnpm test` + `pnpm typecheck` · **R**: F

### ORD-UI.8 — Ruta /app/ordenes/nueva (Server Component + iframe + postMessage) ✅ DONE
- **D**: .7 · **O**: `app/app/ordenes/nueva/page.tsx`
- **F**: `apps/gestion/app/app/ordenes/nueva/page.tsx` + test RTL
- **A**: Server verifica sesión + `ORDER_CREATE_ROLES` (si no, redirect); calcula `nextNumber`
  con `nextOrderNumeroValue` y `v=BOLETA_VERSION`; client `<iframe sandbox="allow-scripts
  allow-same-origin allow-forms">` con listener `message` que exige
  `event.origin === window.location.origin` y `data.type === "ORDEN_CREADA"` → invalidate +
  navega; error de carga muestra mensaje.
- **T**: RTL iframe + postMessage (origen inválido ignorado) RED→GREEN · **V**: `pnpm test` · **R**: F

### ORD-UI.9 — Boleta vendored en public/boleta/ + adaptación ✅ DONE
- **D**: .4/.8 · **O**: `apps/gestion/public/boleta/` (nuevo), `next.config.mjs`
- **F**: copia de `sistema-gestion/boleta/*` (legacy intacto); lee `nextNumber` de query;
  submit → `POST /api/gestion/ordenes` con `x-idempotency-key`; éxito →
  `parent.postMessage({ type: "ORDEN_CREADA", payload }, window.location.origin)`;
  `env.BOLETA_VERSION` en next.config.
- **A**: la boleta vendored POSTea a la API existente idempotente; legacy sin cambios;
  desbloqueo NO se persiste.
- **T**: RTL/unit del flujo RED→GREEN · **V**: `pnpm test` · **R**: F (copia borrable, legacy intacto)

## Verificación final

- `pnpm test` completo sin regresiones · `pnpm typecheck` · `git diff --check`
- Un PR encadenado ≤400 líneas o auto-chain, Conventional Commit, sin atribución IA.

**No** modificar: legado `pagina-web/`/`sistema-gestion/` originales, CI, PostgreSQL,
despliegue, cutover.