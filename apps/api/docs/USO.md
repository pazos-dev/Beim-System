# Uso de `@beim/api` — guía para agentes

Referencia de uso de la API (gestión + webshop): montaje, autenticación,
catálogo de endpoints, flujos en profundidad, persistencia, errores y testing.

> Verificado contra `main` post-PR #66 (cadena backend-api-database + follow-ups
> #53): `tsc --noEmit` limpio, suite 167 tests con Postgres
> (55 + 112 skipped sin Postgres), CI Quality Gates verde. Cada afirmación de
> comportamiento cita archivo:línea o test que la prueba. Los contratos
> normativos viven en `openspec/specs/*`; esto es guía operativa, no spec.

## 1. Puesta en marcha y montaje

### Arranque rápido

```bash
# una sola vez: BD de dev + migraciones + env
createdb beim_api                                          # si no existe
cp apps/api/.env.example apps/api/.env                    # editar DATABASE_URL
pnpm --filter @beim/api db:migrate                        # schema + seed + migrations (idempotente)

# levantar el backend (desde la raíz del repo)
pnpm dev-api                                              # → http://localhost:4000 (tsx watch)
```

`pnpm dev-api` es el atajo raíz (`package.json`: `pnpm --filter @beim/api
dev`). Requiere `DATABASE_URL` (o `PGDATABASE`+`PGUSER`) configurado: sin eso
el boot falla con error explícito. Verificado funcionalmente: levanta
`[api] listening on http://localhost:4000`, `/health` → 200,
`/api/v1/products` → 200 con el seed. Otros comandos útiles:
`pnpm --filter @beim/api test|typecheck|build` (ver `apps/api/README.md`).

### Montaje interno

Boot (`src/server.ts`): valida env con zod, crea la app con
`resolveBearerIdentity` (ver §3) y escucha en `PORT` (default 4000).
`SIGINT/SIGTERM` → cierra el server y después el pool (`pool.end()`).

Ensamblado (`src/app.ts:19-52`):

1. `x-powered-by` off + `express.json()`.
2. Inyección de identidad (soporta resolvers async; si el resolver tira, 500
   fail-loud, nunca anonimiza en silencio).
3. `GET /health` → `200 { ok: true, data: { status: "ok" } }` (sin auth).
4. `app.use("/api/v1", webshopRouter)` **primero**, después `gestionRouter`
   (paths disjuntos por diseño; el catálogo/autenticación públicos no deben
   quedar opacados).
5. Catch-all → `NotFoundError` (404) y `errorHandler` central al final.

Todo request mutante o gated pasa por `requireRole(...)` o
`requireWebshopToken()` + `validate(schema)` (zod strict) + `asyncHandler`.
Los handlers nunca hacen try/catch: tiran errores de dominio y el middleware
central los traduce una sola vez. Creates → `201`, resto → `200`, siempre con
envelope (§6).

## 2. Autenticación webshop (tokens opacos)

Módulo `src/modules/webshop/`: `services/auth.ts`, `repositories/pg-auth.ts`,
`webshop-token.ts`. Modelo dual (`openspec/specs/auth-identity/spec.md`):
identidades web y de gestión separadas; en DB **solo hashes SHA-256** con
expiración; token expirado o desconocido → **401 uniforme, sin emitir nada**.

- `POST /api/v1/auth/register` `{name, email, password≥8}` → `201`. Crea
  `users` con `role='cliente'`, `is_approved=false`. Email duplicado → `409`.
  **La cuenta no puede loguearse hasta ser aprobada**
  (`UPDATE users SET is_approved=true ...` en dev).
- `POST /api/v1/auth/login` `{identifier (username o email), password}` →
  `200 { token, expiresAt, user }`. Password scrypt formato
  `scrypt$salt$hash`; cualquier fallo (credenciales, no aprobado,
  desconocido) → mismo `401 "Credenciales inválidas"`, sin filtrar existencia.
  **Cada login revoca la sesión anterior** (`DELETE FROM webshop_sessions
  WHERE user_id` antes del `INSERT`): una sola sesión activa por usuario,
  TTL default 30 días (`SESSION_TTL_DAYS`).
- `POST /api/v1/auth/gestion-access` `{token}` (puente): canjea un token de
  `gestion_web_access_tokens` por una sesión web con alcance. Puente inválido
  o expirado → `401 "Token de acceso inválido"`.
- Uso: `Authorization: Bearer <token>`. `requireWebshopToken()` resuelve
  `token → sha256 → webshop_sessions JOIN users` (con `expires_at > now()` en
  servidor) y adjunta `{ userId, roles: [role] }`. Fallo (header ausente,
  esquema malformado, sesión desconocida/expirada) → `401
  AUTHENTICATION_REQUIRED` uniforme.

## 3. Autorización gestión (roles + identidad resuelta)

`src/middleware/auth.ts`: `requireRole(...allowed)` lee `req.identity`.

| Situación | Respuesta |
|---|---|
| Sin identidad | `404 NOT_FOUND_OR_FORBIDDEN` (nunca una pista de que el recurso existe) |
| Identidad con rol no permitido | `403 FORBIDDEN` |
| Identidad con rol permitido | pasa |

Roles (`src/modules/gestion/router.ts:43-44`):

- `OPERATOR = vendedor, tecnico, caja, administrador, administrador_principal`
  → operar y leer; crear clientes, tickets, ventas, caja, movimientos.
- `ADMIN = administrador, administrador_principal, admin, superadmin` →
  además **crear** categorías, servicios y compras.

Resolución en producción (`src/server.ts`): `createApp({ resolveIdentity:
resolveBearerIdentity })` — el mismo Bearer de webshop verificado en servidor.
**Alcance honesto**: `users.role` solo admite `cliente/admin/superadmin`
(check constraint en `schema.sql`), así que esto desbloquea las rutas con gate
ADMIN para sesiones admin/superadmin; los roles de operador
(vendedor/tecnico/caja/…) siguen fail-closed (404) hasta que exista emisión de
sesiones de `gestion_users`. En tests, la identidad se inyecta
(`createApp({ resolveIdentity: () => ({ userId, roles }) })`).

## 4. Endpoints de gestión (`/api/v1`, guard `operator`/`admin`)

| Método y path | Guard | Éxito | Notas |
|---|---|---|---|
| `POST /sales-batch` | operator | 201 | Venta atómica, ver §5 |
| `GET /receipts/next-number` | operator | 200 | Preview de secuencia (desde 1000), **no reserva** |
| `GET /receipts` | operator | 200 | Filtros `client?`, `paymentMethod?`, `from?`, `to?` (YYYY-MM-DD), `page?`, `limit?` (default 1/20, máx 100); orden `receipt_number DESC`; responde `{items,total,page,limit}` |
| `POST /receipts` | operator | 201 | Ticket de reparación (ver §7); `repairStatus` default DB `'Ingresado'` |
| `GET /receipts/:id` | operator | 200 | `:id` uuid |
| `POST /receipts/:id/annul` | operator | 200 | Anulación con restauración, ver §7 |
| `GET /financial-state` | operator | 200 | Singleton |
| `PUT /financial-state` | operator | 200 | **Merge**: los campos enviados pisan, el resto se preserva |
| `GET /cash-sessions/current` | operator | 200 | Abierta actual; sin abierta → 404 |
| `GET /cash-sessions` | operator | 200 | Orden `business_date DESC` |
| `POST /cash-sessions` | operator | 201 | `{businessDate: YYYY-MM-DD, openingAmount ≥ 0, notes?}`; ver §7 |
| `POST /cash-sessions/:id/close` | operator | 200 | `{countedAmount ≥ 0}`; calcula diferencia |
| `POST /cash-sessions/:id/movements` | operator | 201 | `{type: ingreso\|egreso\|ajuste, amount > 0, notes?}`; solo sesión abierta |
| `GET /stock-movements` | operator | 200 | Filtros `productId?`, `from?`, `to?` |
| `POST /stock-movements` | operator | 201 | `{productId, movementType: entrada\|salida, quantity > 0, detail?}` |
| `GET /clients` | operator | 200 | **Array directo, sin paginar** (filtra `users` con `role='cliente'`, orden por nombre) |
| `GET /clients/:id` | operator | 200 | `:id` uuid |
| `POST /clients` | operator | 201 | `{name, email?, phone?}` (strict) |
| `GET /categories` | operator | 200 | Lista |
| `GET /categories/:id` | operator | 200 | Id string (ej. `mano-de-obra`) |
| `POST /categories` | **admin** | 201 | `{id, name, code}` (id string, ej. `MO`) |
| `GET /services` | operator | 200 | Lista |
| `POST /services` | **admin** | 201 | `{name, data?}` (`data` es record libre: precio, duración, etc.) |
| `GET /purchases` | operator | 200 | Lista |
| `POST /purchases` | **admin** | 201 | `{supplierName, data?}` |

Todo objeto strict: claves desconocidas → `422` (ej. mandar `unitPrice` en una
línea de venta se rechaza en el borde; el precio lo fija el servidor).

## 5. Deep-dive: `POST /sales-batch` (venta mostrador atómica)

Body: `{clientName*, clientId*, clientPhone?, deviceBrand?, deviceModel?,
deviceColor?, imeiSerial?, reportedIssue?, services?: string[], items*:
[{productId*, quantity: int>0}], payments?: [{method*, amount ≥ 0}]}`.
`productId` es string libre (valen los ids del seed como `cargador-rapido`);
`services` es array de strings a nivel raíz (las líneas **no** aceptan
servicios ni precios).

Pasos (`services/sales-batch.ts`, una sola transacción, rollback completo):

1. Por línea: `SELECT ... FOR UPDATE` del producto → check de stock
   (`quantity > stock` → `409 INSUFFICIENT_STOCK`) → **precio server-side**
   (`getPricesByIds`; el cliente nunca fija precio).
2. Total = Σ precio×cantidad. Si hay `payments`, deben sumar **exacto** el
   total → si no, `422`.
3. Inserta receipt + líneas + pagos. `201 { receipt, items:
   [{productId, quantity, unitPrice}], total }`.

Efecto colateral exacto: **decrementa `products.stock` sin journalizar fila
de `stock.movement`** (el journal de movimientos se registra explícito vía
`POST /stock-movements`). Para auditar una venta: `GET /receipts?client=` +
`GET /stock-movements?productId=`.

## 6. Deep-dive: webshop — order-then-pay

Rutas (guard `requireWebshopToken`, 401 uniforme sin token/válido):

| Método y path | Éxito | Notas |
|---|---|---|
| `GET /products` | 200 | Solo `published=true`; filtros `category` (exacto), `search` (ILIKE nombre/marca/modelo); `{page,limit,total,totalPages,items}` (page default 1, limit default 20, máx 100; orden `created_at ASC`) |
| `GET /products/:id` | 200 | Solo publicados; ajeno/oculto → 404 |
| `GET /promo-slides` | 200 | Slides promocionales |
| `POST /orders` | 201 | Ver abajo |
| `GET /orders` | 200 | **Solo propias**; `{page,limit,total,items}` (sin `totalPages`) |
| `GET /orders/:id` | 200 | Solo propia; ajena → 404 (sin leak) |
| `POST /checkout-sessions` | 201 | Ver abajo |
| `POST /uploads/product-image` | 201 | Body binario crudo; ver §8 |
| `GET /uploads/:filename` | 200 | Filename validado (`uuid.ext`); inválido/ausente → 404 |

`POST /orders {customer*, email?, phone?, ci?, rut?, address?, shipping?,
comments?, items* [{productId: uuid*, quantity 1..100}]}`:

- **OJO agente**: `productId` exige **UUID** (zod). Los ids texto del seed
  (`cargador-rapido`) dan `422` acá (en sales-batch sí valen). Para tests,
  plantar productos propios con id `randomUUID()` (ver
  `repair-shop-orders.test.ts:seedWorkshopCatalog`).
- Por línea: producto **publicado** con `FOR UPDATE` + check de stock (sin
  stock → 409; desconocido/oculto → 404; monedas mezcladas → 422) + precio
  server-side. `user_id` se guarda **en el mismo INSERT**.
- Defaults: `status 'Pendiente'`, `payment_status 'Pendiente de pago'`,
  `stock_committed=false`. **La orden chequea stock pero no reserva nada**.
- `201 { order, items }`.

`POST /checkout-sessions {orderId: uuid*, paymentMethodId?}` ("order-then-pay"):

1. La orden debe existir **y ser propia** (ajena → 404) y seguir
   `'Pendiente de pago'` (si no → 409).
2. **Una sola sesión pendiente por orden**: si ya hay una con
   `status='pending'` → `409`.
3. Mintea `{id, url: <CHECKOUT_BASE_URL>/checkout/<id>, status: "pending",
   orderId, expiresAt}` (TTL default 60 min). El pago sigue impago hasta que
   el **webhook** (fuera de alcance) lo marque; nada más en este cambio lo
   modifica.

## 7. Deep-dive: tickets, caja y estado financiero

**Receipts** (`services/receipts.ts`): `POST` acepta datos del cliente +
equipo (`deviceBrand/Model/Color`, `imeiSerial`, `reportedIssue`) + `services`
+ `price/quoteTotal/paymentStatus/payload`. El servicio solo defaultea
`payload={}`; el resto de defaults son de DB (`repair_status 'Ingresado'`,
`quote_status 'Borrador'`, `payment_status 'Pendiente'`).
`POST /:id/annul` en una transacción: 404 si no existe, 409 si ya está
`Cancelado`; restaura stock de las partes consumidas (`stock = stock + qty`);
marca `repair_status='Cancelado', payment_status='Sin abonar', price='0'`;
revierte cada movimiento original con `amount > 0` insertando su negativo
(mismo método y fecha; nunca reversa reversas). Devuelve
`{receipt, restoredItems, reversedMovements}`.

**Caja** (`services/cash-sessions.ts`): `POST /cash-sessions` es un `INSERT`
con doble guarda (`WHERE NOT EXISTS` abierta **y** fecha única) → 409 si ya
hay abierta o la fecha existe (carrera por fecha → 409 por violación unique).
Movimientos solo en sesión `open` (cerrada → 409; inexistente → 404) y se
journalizan en `audit_logs` (`cash.movement`). `close` persiste
`counted_amount`, `difference = counted − expected`, `closed_at`; doble
cierre → 409. `current` = última abierta; `list` por fecha desc.

**Financial-state**: singleton (`INSERT ... ON CONFLICT`); `PUT` hace merge.

## 8. Uploads

`POST /uploads/product-image` (con token): body binario crudo, **el
Content-Type decide la extensión** (png/jpeg/gif/webp/avif/svg), nunca el
contenido. Tipo desconocido → `415` **antes** de leer un byte; header
ausente → `415` (desde el fix #53); sobre el tope (`MAX_UPLOAD_BYTES`,
default 5 MB) → `413` sin escribir nada. Guarda `<uuid>.<ext>` en
`UPLOADS_DIR` y devuelve `{url: /api/v1/uploads/<uuid>.<ext>}`.
`GET /uploads/:filename` valida el formato estricto (uuid + extensión
permitida): inválido o ausente → 404, nunca un error de filesystem.

## 9. Persistencia

Pool compartido creado desde `DATABASE_URL` **al evaluar el módulo**
(`src/config/db.ts`) — por eso los tests que importan el grafo fijan
`process.env.DATABASE_URL` antes del import dinámico (patrón `app.test.ts`).
`withTransaction(async (tx) => ...)` ejecuta el callback en una transacción;
los repos aceptan `TxClient` para reusarla (sin transacciones anidadas).

Migraciones (`src/db/migrate.ts`, idempotente): aplica `schema.sql` +
`seed.sql` vendered del legacy y `migrations/` (0001: flag `published` +
tablas de sesiones webshop/checkout + `gestion_web_access_tokens`). Nada la
corre en boot ni en tests. `MIGRATE_DROP_FIRST=1` dropea el schema — **solo
dev**.

Tests con DB real (`src/db/testDb.ts`): `setupTestDatabase()` crea+migra la
BD de `TEST_DATABASE_URL` en `beforeAll` y la dropea en `afterAll`
(**rechaza cualquier BD que no termine en `_test`**; la de dev nunca se toca).
`describePg` = `describe` con Postgres, `describe.skip` sin él: en CI DB-free
las suites de integración skipean en vez de romper (verificado: 55 passed +
112 skipped). Desactiva el paralelismo por archivo (`vitest.config.ts`).

## 10. Testing para agentes (cómo trabajar acá)

```bash
cd apps/api
npx tsc --noEmit                                   # typecheck
NODE_ENV=test npx vitest run                       # suite completa (requiere PG en 5432)
TEST_DATABASE_URL=postgres://beim@127.0.0.1:59999/beim_api_test NODE_ENV=test npx vitest run   # modo CI: skips
NODE_ENV=test npx vitest run src/modules/.../X.test.ts   # un archivo
```

Patrones obligatorios en tests nuevos:

- Integración con PG: `describePg` + `setupTestDatabase()` + `process.env.DATABASE_URL ??= ...` antes de imports dinámicos.
- Gestión: helper `appWith({roles})` (`createApp({resolveIdentity: ...})`);
  `OPERATOR=["vendedor"]`, `ADMIN=["administrador"]`; matriz 404 anónimo /
  403 rol ajeno siempre que se toque un guard.
- Webshop con usuario: `seedUser()` + `login()` (SQL + API) o
  `register` + `UPDATE users SET is_approved=true` + `login` (flujo completo);
  Bearer en `Authorization`.
- Productos para órdenes: `seedProduct` con id `randomUUID()` (el schema de
  orden exige UUID); `categoryId` existente en el archivo (ej. `"celulares"`).
- Aserciones sobre envelope: éxito `body.data`, error
  `{ok:false, error:{code}}` con el `code` exacto de la taxonomía (§11).
- Unit puro DB-free (ej. `bearer-identity.test.ts`): `describe`/`it` normal,
  inyectar dependencias, sin importar nada que conecte.

## 11. Tabla de errores (cuándo ocurre cada uno)

| Code | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Schema zod (clave extra, campo faltante/mal tipo, UUID inválido, `productId` texto en órdenes, pagos que no suman el total, moneda mixta) |
| `AUTHENTICATION_REQUIRED` | 401 | Sin token webshop / token basura o expirado / login inválido o no aprobado / puente inválido |
| `FORBIDDEN` | 403 | Identidad con rol no permitido (ej. operador creando catálogo) |
| `NOT_FOUND_OR_FORBIDDEN` | 404 | Sin identidad en gestión; catch-all; lectura ajena (orden/recibo/producto no publicado); sesión de caja inexistente |
| `CONFLICT` | 409 | Email duplicado; fecha de caja duplicada; sesión abierta existente; segundo checkout pendiente; cierre/movimiento sobre caja cerrada; recibo ya anulado |
| `INSUFFICIENT_STOCK` | 409 | Cantidad sobre stock (venta y órdenes) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Upload con tipo no imagen o sin Content-Type |
| `PAYLOAD_TOO_LARGE` | 413 | Upload sobre `MAX_UPLOAD_BYTES` |
| `DEPENDENCY_UNAVAILABLE` | 503 | Dependencia caída (reservado) |
| `INTERNAL_ERROR` | 500 | Resolver que tira / error no dominio (nunca filtra el mensaje original; se loguea) |

## 12. Convenciones (no negociar)

- **zod strict en el borde**: nada de claves extra, nada de precios del cliente.
- **Precios y totales siempre server-side** (ventas y órdenes).
- **Ownership por `user_id`**: lecturas ajenas → 404, nunca 403 (no filtrar existencia).
- **Solo `published=true` es visible** en catálogo, independiente de stock.
- **Órdenes chequean stock, no reservan** (`stock_committed=false` hasta el webhook).
- **Una sesión activa por usuario** (el login revoca la anterior); **una
  sesión de checkout pendiente por orden**.
- Errores de dominio se tiran (`AppError` de la taxonomía), jamás try/catch
  por ruta; rutas async siempre con `asyncHandler`.
- Commits en inglés (conventional), mensajes/prs/docs en español neutro.
  No tocar `pagina-web/`, `sistema-gestion/` ni ramas ajenas.
