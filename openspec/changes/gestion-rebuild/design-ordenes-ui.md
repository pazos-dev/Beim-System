# Diseño: Mejora UI de Órdenes (ordenes-ui-enhancement)

Sub-diseño del change `gestion-rebuild`. Cubre las delta specs `ordenes-list`, `ordenes-state-filter` y `ordenes-create-iframe`. Estado de todo lo aquí descrito: **Objetivo futuro (Future target)** hasta evidencia de verificación.

## Enfoque técnico

Extender el schema `Orden` con campos opcionales (sin migración), añadir una proyección enriquecida server-side (`listView`) con join de clientes, filtros de grupo, contadores, paginación y orden; refactorizar la vista `/app/ordenes` con TanStack Query (patrón ya adoptado en el repo) y componentes nuevos; y crear `/app/ordenes/nueva` con iframe a una copia *vendored* de la boleta legacy servida desde `public/`.

## Decisiones de arquitectura

### D1: Migración de schema Orden — campos opcionales

**Elección**: añadir a `ordenSchema`: `deviceBrand`/`deviceModel`/`deviceColor` (`z.string().trim().min(1).max(60).optional()`), `estimatedTime` (`z.number().int().positive().optional()`), `estimatedTimeUnit` (`z.enum(["min","h","d"]).optional()`), `boletaNumero` (`z.string().min(1).max(40).optional()`).
**Alternativas**: migración con rewrite de `ordenes.json` y bump de versión de documento.
**Rationale**: Zod `.optional()` parsea los registros actuales (2 órdenes sin campos, **Línea base observada**) sin tocar datos; no hay migración ni bump de versión. `boletaNumero` da fuente de datos a la columna Boletahidden (la spec no define origen). En rollback, el schema viejo *strippea* campos extra (Zod non-strict): quedan inertes.

### D2: Extensión de API — método nuevo `listView`, no tocar `list()`

**Elección**: `OrderHandler.listView(actor, query)` compone `stores.ordenes.list` + `readOrEmpty(clientes)`, filtra por grupo, calcula contadores, ordena y pagina en servidor. Query validada con Zod: `estado` (filterKey), `page≥1` (def. 1), `pageSize` (def. 25, máx. 100), `sort ∈ {numero, clienteNombre, estado, total}` (def. `numero`), `dir ∈ {asc,desc}` (def. `asc`). FilterKey inválido → 400 `VALIDATION_ERROR`; el cliente redirige a `?estado=en_diagnostico`.
**Alternativas**: mutar `list()` (rompe contrato actual y tests existentes); join client-side (la spec exige join en servidor).
**Rationale**: `list()` queda intacto (blast radius: solo la route GET actual); fallo cerrado ante entrada inválida.

### D3: Mapeo de filtros en dominio compartido

**Elección**: en `src/lib/domain/orders/orden.ts`: `ORDER_STATE_FILTERS` (registro ordenado filterKey → `{ label, estados: readonly StateToken[] | null }`, `null` = Todas), `resolveOrderFilter(key)` y `orderFilterCounts(ordenes)`. Servidor los usa para filtrar/contar; cliente para renderizar botones.
**Alternativas**: duplicar el mapeo en cliente y servidor; módulo nuevo.
**Rationale**: una sola fuente de verdad; el usuario lo ubicó en `orden.ts`; dominio puro testeable sin IO. Nota: la spec titula "12→8" pero su tabla normativa lista 11 estados → 9 filtros (incluye "Todas"); se sigue la tabla, que es lo que verifican los escenarios.

### D4: Columnas derivadas precomputadas en servidor

**Elección**: `formatEquipment(o)` (concatena marca/modelo/color omitiendo ausentes) y `formatEstimatedDisplay(o)` ("90 min", "2 h", "1 día"/"n días"; "—" si falta dato) en dominio; el DTO ya trae `equipment` y `estimatedDisplay`.
**Rationale**: formateo puro testeado una vez; el cliente solo renderiza.

### D5: OrdersTable compone DataTable extendido (no componente nuevo desde cero)

**Elección**: extender `ui/DataTable.tsx` con orden controlado opcional (`sort`, `onSort`, columna `sortable`, `aria-sort` en el header). Props nuevas opcionales; comportamiento por defecto idéntico. `OrdersTable` (feature) define las 8 columnas y añade controles de paginación sincronizados con URL; pasa `visibleRowLimit={pageSize}` para no cortar a 10.
**Alternativas**: tabla nueva duplicando markup; paginación "Mostrar más" del genérico.
**Rationale**: DataTable ya resuelve loading/error/empty con tests; su único caller (`Dashboard.tsx`) no se afecta; el orden es server-side (correcto con paginación), imposible con el límite client-side actual.

### D6: Fetch con TanStack Query, URL como fuente de verdad del filtro

**Elección**: `useQuery(["ordenes", { estado, page, sort, dir }])` en la página; `QueryProvider` ya envuelve `/app` (commit `6f58f9f`). Estado inválido → `router.replace` al defecto. Contadores se refrescan por `invalidateQueries` tras mutaciones y `ORDEN_CREADA`.
**Alternativas**: fetch plano + `useState` (patrón actual de la página).
**Rationale**: la spec exige actualización sin recarga; el repo ya adoptó TanStack Query con bootstrap cache. El rol del actor se lee del bootstrap cache para el botón Crear (defensa real sigue server-side).

### D7: Vista `/app/ordenes/nueva` — Server Component + iframe sandbox

**Elección**: Server Component verifica sesión y `ORDER_CREATE_ROLES` (si no, redirect a lista), calcula `nextNumber` con nueva función de dominio `nextOrderNumeroValue` (misma regla de sufijo que `nextOrderNumero`) y pasa `v` = `BOLETA_VERSION` (timestamp de build inyectado vía `env` en `next.config.mjs`). Client component: `<iframe sandbox="allow-scripts allow-same-origin allow-forms" src="/boleta/index.html?v=…&nextNumber=…">`, listener `message` que exige `event.origin === window.location.origin` y `data.type === "ORDEN_CREADA"` → invalida `["ordenes"]` y navega a `/app/ordenes?estado=todas`. Error de carga → mensaje "Formulario de creación no disponible" en el contenedor.
**Rationale**: `nextNumber` calculado en servidor (contrato de spec); sandbox mínimo que permite scripts + cookies same-origin; origen verificado = fallo cerrado ante mensajes ajenos.

### D8: Boleta vendored en `public/boleta/`, legacy intacto

**Elección**: copiar `sistema-gestion/boleta/*` a `apps/gestion/public/boleta/` (artefacto nuevo; `sistema-gestion/` NO se modifica) y adaptar la copia: lee `nextNumber` del query string; submit → `fetch POST /api/gestion/ordenes` con `x-idempotency-key` (UUID por intento) mapeando equipo/tiempo al input extendido; éxito → `parent.postMessage({ type: "ORDEN_CREADA", payload }, window.location.origin)`.
**Rationale**: la spec exige que la escritura ocurra en el iframe y que notifique al padre; la boleta legacy original no hace ninguna de las dos. Desbloqueo NO se persiste (decisión del proposal padre: minimizar secretos).

### D9: Columna Boletahidden — permiso server-side por rol

**Elección**: `listView` incluye `boletaNumero` en los ítems y `canViewBoleta: true` en la respuesta SOLO si `actor.role === "administrador_principal"`. `OrdersTable` renderiza la columna únicamente con ese flag.
**Alternativas**: enviar el dato y ocultar con `display: none`; feature flag de entorno.
**Rationale**: la spec exige "no visible ni accesible en DOM" sin permiso: no enviar el dato es el fallo cerrado más fuerte (ni en red). La spec permite "rol principal o feature flag"; se elige rol verificable en servidor.

## Flujo de datos

    /app/ordenes (cliente)
        │ useQuery ──► GET /api/gestion/ordenes?estado&page&sort&dir
        │                   │ AuthService → OrderHandler.listView
        │                   │     ├─ ordenes.list (ownership)
        │                   │     ├─ readOrEmpty(clientes) → join displayName
        │                   │     ├─ resolveOrderFilter + orderFilterCounts
        │                   │     └─ sort/pagina + proyección OrderListItem
        │                   └─ { items, counts, page, pageSize, totalItems, canViewBoleta }
        ▼
    StateFilterBar (counts) + OrdersTable (DataTable)
    Crear orden → /app/ordenes/nueva (server: sesión+rol, nextNumber, v)
        │ iframe /boleta/index.html → POST /api/gestion/ordenes (idempotente)
        │ postMessage ORDEN_CREADA (origen verificado)
        ▼
    invalidate ["ordenes"] → /app/ordenes?estado=todas

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `src/server/data/schemas.ts` | Modificar | 6 campos opcionales en `ordenSchema` (D1) |
| `src/lib/domain/orders/orden.ts` | Modificar | `ORDER_STATE_FILTERS`, `resolveOrderFilter`, `orderFilterCounts`, `formatEquipment`, `formatEstimatedDisplay`, `nextOrderNumeroValue`; `createOrderInputSchema` extendido |
| `src/server/handlers/orders.ts` | Modificar | `listView` con join, filtro, counts, sort, paginación, permiso boleta (D2/D9) |
| `app/api/gestion/ordenes/route.ts` | Modificar | Query Zod, respuesta enriquecida, 400 inválido |
| `src/components/ui/DataTable.tsx` | Modificar | Orden controlado opcional (D5) |
| `src/components/features/OrdersStateFilterBar.tsx` | Crear | Props `{ filters, activeFilter, counts, onChange }`, `aria-pressed` |
| `src/components/features/OrdersTable.tsx` | Crear | 8 columnas, paginación URL, columna boleta condicional |
| `src/components/features/CreateOrderButton.tsx` | Crear | Navega a `/app/ordenes/nueva`; oculto si rol ∉ `ORDER_CREATE_ROLES` |
| `app/app/ordenes/page.tsx` | Refactor | TanStack Query + componentes nuevos; conserva detalle e `OrderPrint` |
| `app/app/ordenes/nueva/page.tsx` | Crear | Server: sesión/rol/nextNumber/v + client: iframe y postMessage |
| `public/boleta/*` | Crear | Copia vendored adaptada (D8); legacy intacto |
| `next.config.mjs` | Modificar | `env.BOLETA_VERSION` = timestamp de build |
| Tests | Crear/actualizar | Dominio, handler, route, componentes, `page.test.tsx`, página `nueva` |

## Interfaces / Contratos

```ts
// DTO de lista (respuesta GET)
interface OrderListItem {
  id: string; numero: string; clienteId: string; clienteNombre: string;
  equipment: string; estado: StateToken; estimatedDisplay: string;
  total: number; paymentStatus: OrderPaymentStatus; version: number;
  boletaNumero?: string; // solo administrador_principal
}
interface OrderListResponse {
  items: OrderListItem[]; counts: Record<OrderFilterKey, number>;
  page: number; pageSize: number; totalItems: number; canViewBoleta: boolean;
}
type OrderFilterKey = "todas" | "abiertas" | "en_diagnostico" | "presupuesto"
  | "aprobado" | "espera_repuesto" | "en_proceso" | "finalizadas" | "canceladas";
// postMessage iframe → padre
{ type: "ORDEN_CREADA", payload: { numero: string; id?: string } }
```

`clienteId` se conserva en el DTO para reusar `OrderPrint` sin cambios. La columna Etapa usa `STATE_TOKEN_LABELS` client-side.

## Estrategia de pruebas

TDD estricto (`strict_tdd: true`): RED antes de cada cambio. Comando: `pnpm test`.

| Capa | Qué | Enfoque |
|---|---|---|
| Unidad (Vitest) | Mapeo 11→9, counts, formatos ("—", "1 día"), schema opcional parsea JSON legacy, `nextOrderNumeroValue` | Dominio puro, junto a `orden.test.ts` |
| Unidad handler | `listView`: join, "Cliente eliminado", filtro grupo, counts, sort/paginación, boleta solo principal | `orders.test.ts` existente, fixtures en memoria |
| Contrato route | Query válida/inválida (400), 401 sin sesión, shape del envelope | Tests de route existentes como patrón |
| Componentes | FilterBar (9 botones, activo, badges), OrdersTable (columnas, "—", empty, boleta oculta), CreateOrderButton (rol) | Testing Library en `features/__tests__/` |
| Página | Lista con QueryClient wrapper; `/nueva`: iframe src con `v`/`nextNumber`, sandbox, postMessage origen inválido ignorado, `ORDEN_CREADA` navega | Actualizar `page.test.tsx`; nuevo test |
| E2E | No observado en el repo | Fuera de alcance |

## Threat Matrix

N/A — el diseño no cambia routing de comandos, shell, subprocesos, automatización VCS/PR, clasificación de ejecutables ni integración de procesos. La nueva ruta es una página Next.js; la superficie iframe se gobierna con sandbox, verificación de origen y escritura solo vía API existente (D7/D8).

## Migración / Rollout

Sin migración de datos (D1). Rollout: PR único o cadena; la ruta `/app/ordenes/nueva` es aditiva. Reversión: revert del PR; los campos extra en `ordenes.json` quedan inertes para el schema anterior (strip de Zod); `public/boleta/` se elimina con el revert sin tocar `sistema-gestion/`.

## Open Questions

- [ ] La spec titula "12 estados → 8 filtros" pero su tabla define 11 → 9 (incluye "Todas"); se sigue la tabla. Confirmar en verify.
- [ ] Origen real de `boletaNumero` (¿número de boleta fiscal legacy?) — se asume campo opcional de la orden.
- [ ] ¿Feature flag adicional para Boletahidden? Se implementa solo por rol (la spec lo permite).
