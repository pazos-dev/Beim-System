# Uso de `@beim/api` — guía para agentes

Referencia de uso de la API (gestión + webshop): montaje, autenticación,
catálogo de endpoints, flujos en profundidad, persistencia, errores y testing.

> Verificado contra `main` post-PR #66 (cadena backend-api-database + follow-ups
> #53) y `feat/idempotencia` (issue #88): `tsc --noEmit` limpio, suite 223
> tests con Postgres (68 + 155 skipped sin Postgres), CI Quality Gates verde.
> Cada afirmación de
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

### Producción

```bash
# 1. Migraciones contra la BD de producción (idempotente; NUNCA MIGRATE_DROP_FIRST acá)
DATABASE_URL="<prod-connection-string>" pnpm --filter @beim/api db:migrate

# 2. Levantar (desde la raíz del repo)
pnpm start-api     # build (tsc -> dist/) + node dist/server.js
```

`pnpm start-api` compila y levanta en primer plano. Variables requeridas:
`DATABASE_URL` (producción), `NODE_ENV=production`, `PORT` (o el que inyecte
la plataforma). Verificado: boot `env: production` + `/health` → 200.
Notas: el server maneja `SIGTERM` con apagado graceful (cierra pool); los
secretos van por entorno de la plataforma, nunca en archivos; el repo no
tiene pipeline de deploy (CI solo valida) — el destino (servicio, systemd,
docker, PaaS) y su process manager quedan del lado de infraestructura.

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

### Límites, timeouts y cabeceras

- Bodies JSON capped a `256kb` (`express.json({ limit: "256kb" })` en
  `src/app.ts`): lo que excede se rechaza con `413` antes de llegar a handlers.
- Timeouts de servidor (`src/server.ts`): `server.setTimeout(30s)`,
  `requestTimeout 30s`, `headersTimeout 35s` — clientes lentos no retienen
  conexiones para siempre.
- Pool (`src/config/db.ts`): `connectionTimeoutMillis 5s` (checkout agota
  rápido en vez de encolar sin fin) y `statement_timeout 10s` (ninguna query
  corre más de 10s).
- Cabeceras de seguridad (`src/middleware/security-headers.ts`, global antes
  de los routers; el serve de uploads las refuerza): `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`. **Sin
  HSTS**: la app sirve HTTP plano sin TLS (termina upstream, donde pertenece
  HSTS).

## 2. Autenticación webshop (tokens opacos)

Módulo `src/modules/webshop/`: `services/auth.ts`, `repositories/pg-auth.ts`,
`webshop-token.ts`. Modelo dual (`openspec/specs/auth-identity/spec.md`):
identidades web y de gestión separadas; en DB **solo hashes SHA-256** con
expiración; token expirado o desconocido → **401 uniforme, sin emitir nada**.

- `POST /api/v1/auth/register` `{name, email, password}` → `201`. Crea
  `users` con `role='cliente'`, `is_approved=false`. **Password policy: mínimo
  12 caracteres con mayúscula, minúscula, número y símbolo** (validada con zod
  en el borde → débil da `422`). Email duplicado → `201` con `{ user: null }`
  (**anti-enumeración**: la respuesta nunca revela si el email estaba tomado).
  **La cuenta no puede loguearse hasta ser aprobada**
  (`UPDATE users SET is_approved=true ...` en dev).
- `POST /api/v1/auth/login` `{identifier (username o email), password}` →
  `200 { token, expiresAt, user }`. Password scrypt formato
  `scrypt$salt$hash`; cualquier fallo (credenciales, no aprobado,
  desconocido) → mismo `401 "Credenciales inválidas"`, sin filtrar existencia.
  El login siempre corre scrypt (hash dummy cuando no hay nada que comparar)
  para no filtrar existencia por timing.
  **Cada login revoca la sesión anterior** (`DELETE FROM webshop_sessions
  WHERE user_id` antes del `INSERT`, en una transacción): una sola sesión activa por usuario,
  TTL default 30 días (`SESSION_TTL_DAYS`).
- `POST /api/v1/auth/logout` (requiere Bearer válido) → `200 { loggedOut:
  true }`. Borra la sesión por hash de token. Idempotente: con token válido
  siempre 200, sin revelar estado de sesión. Sin token o con token ya
  revocado → `401`.
- `POST /api/v1/auth/gestion-access` `{token}` (puente): canjea un token de
  `gestion_web_access_tokens` por una sesión web con alcance. Puente inválido
  o expirado → `401 "Token de acceso inválido"`. **Single-use**: el puente se
  consume (`DELETE`) antes de emitir la sesión; un segundo canje del mismo
  token → `401`.
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
| `GET /clients` | operator | 200 | **Array directo, sin paginar** (filtra `users` con `role='cliente'`, orden por nombre); filtro `active?` (`true`/`false`/`all`, default solo activos; `false` = `is_approved=false`) |
| `GET /clients/:id` | operator | 200 | `:id` uuid |
| `POST /clients` | operator | 201 | `{name, email?, phone?}` (strict); crea pendiente (`is_approved=false`, oculto del listado default hasta aprobar) |
| `PUT /clients/:id` | operator | 200 | `{name?, email?, phone?, active?}` (merge parcial); `active:false` desaprueba + revoca sesiones, `active:true` aprueba (vía `usersService`); sin `active` no toca aprobación |
| `GET /categories` | operator | 200 | Lista; filtro `active?` (`true`/`false`/`all`, default solo activos) |
| `GET /categories/:id` | operator | 200 | Id string (ej. `mano-de-obra`) |
| `POST /categories` | **admin** | 201 | `{id, name, code}` (id string, ej. `MO`) |
| `PUT /categories/:id` | **admin** | 200 | `{name?, code?, active?}` (merge parcial; `active` → `is_active`); inexistente → 404 |
| `GET /services` | operator | 200 | Lista; filtro `active?` (`true`/`false`/`all`, default solo activos) |
| `GET /services/:id` | operator | 200 | `:id` uuid; inexistente → 404 |
| `POST /services` | **admin** | 201 | `{name, data?}` (`data` es record libre: precio, duración, etc.) |
| `PUT /services/:id` | **admin** | 200 | `{name?, data?, active?}` (merge parcial; `active` → `isActive` del documento); inexistente → 404 |
| `GET /purchases` | operator | 200 | Lista; filtro `active?` (`true`/`false`/`all`, default solo activos) |
| `GET /purchases/:id` | operator | 200 | `:id` uuid; inexistente → 404 |
| `POST /purchases` | **admin** | 201 | `{supplierName, data?}` |
| `PUT /purchases/:id` | **admin** | 200 | `{supplierName?, data?, active?}` (merge parcial; `active` → `isActive` del evento); inexistente → 404 |
| `GET /users` | **admin** | 200 | Usuarios webshop (ver abajo): `{items,total,page,limit}` (orden `created_at DESC`); filtros `role?`, `approved?` (`true`/`false`), `page?`, `limit?` |
| `POST /users/:id/approve` | **admin** | 200 | Aprueba (idempotente); desconocido → 404 |
| `PUT /users/:id/role` | **admin** | 200 | `{role: cliente\|admin\|superadmin}`; fuera de lista → 422; desconocido → 404 |
| `POST /users/:id/disable` | **admin** | 200 | Desaprueba + revoca sesiones webshop (idempotente); desconocido → 404 |

Todo objeto strict: claves desconocidas → `422` (ej. mandar `unitPrice` en una
línea de venta se rechaza en el borde; el precio lo fija el servidor).

### Baja lógica de catálogo (issue #87)

Una sola forma de baja: `PUT` con `active?` opcional (sin endpoint disable
separado, sin borrado físico). Los listados excluyen inactivos por defecto;
`active=false` muestra solo inactivos, `active=all` todo (el filtro llega
como string de query y se convierte con `transform`, nunca con cast
booleano). Detalle de persistencia: `categories.is_active` es columna real
(migración `0003`); `services`/`purchases` no tienen tabla propia en el
schema vendored y guardan `isActive` dentro de su JSON (`app_settings` /
`audit_logs`, ausente = activo); clientes mapea a `users.is_approved`.

### Usuarios webshop (issue #85)

Administración de identidades webshop (`src/modules/gestion/services/users.ts`,
`repositories/pg-users.ts`; tests en
`src/modules/gestion/users-admin.test.ts`). Las cuatro rutas exigen guard
`admin` (sin identidad → 404, rol no permitido → 403) y responden el usuario
público `{id, name, email, username, role, isApproved}` — **`password_hash`
nunca se selecciona ni se expone**.

- `GET /users`: filtros `role?` (lista cerrada `cliente/admin/superadmin`),
  `approved?` (`"true"`/`"false"` como string de query, convertido a boolean
  con `transform`), `page?`/`limit?` (default 1/20, máx 100). Orden
  `created_at DESC`.
- `POST /users/:id/approve`: `is_approved=true`. Desbloquea el login (las
  cuentas no aprobadas dan 401 uniforme). Idempotente.
- `PUT /users/:id/role`: cambia el rol con la lista cerrada validada **antes**
  de tocar la DB (rol inválido → 422, sin chocar el check constraint
  `users_role_check`). El efecto es inmediato: una sesión Bearer existente
  resuelve el rol por join en cada request.
- `POST /users/:id/disable`: `is_approved=false` + `DELETE FROM
  webshop_sessions WHERE user_id` (el token vigente pasa a 401 y el login
  queda bloqueado). Idempotente.

**Dos modelos de identidad**: `users` (webshop: clientes y admins web;
`role` con check `cliente/admin/superadmin`, passwords scrypt, `is_approved`)
es lo único que opera este cambio. `gestion_users` (consola: username,
password, rol default `vendedor`, `active`) más `gestion_web_access_tokens` y
la matriz `gestion_role_permissions` (sin usar) pertenecen al **login de
consola y la emisión de sesiones `gestion_users`, un issue futuro separado**:
no hay rutas de consola acá y no se toca ninguna de esas tablas.

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
| `POST /orders/:id/payment-preference` | 201 | Preferencia MercadoPago (guard token); ver abajo |
| `POST /webhooks/mercadopago` | 200 | IPN de MercadoPago (sin token, firma `x-signature`); ver abajo |
| `POST /checkout-sessions` | 201 | Ver abajo |
| `POST /uploads/product-image` | 201 | **Solo admin** (Bearer con rol admin); body binario crudo; ver §8 |
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

### MercadoPago: preferences + webhook IPN (issue #84)

Flujo completo ("order then pay" con dinero real):

1. `POST /orders` crea la orden pendiente (chequea stock, no reserva).
2. `POST /orders/:id/payment-preference` (guard token; `:id` con validación
   laxa porque `orders.id` es TEXT con filas legacy no-uuid) mintea una
   preferencia **nueva** en MercadoPago (`external_reference` = id de la
   orden) y persiste `mp_preference_id` (pisa la anterior, sin reuso).
   Responde `201 {preferenceId, initPoint}`; el comprador paga en `initPoint`.
3. MercadoPago llama `POST /webhooks/mercadopago` (IPN, **sin token**: se
   autentica con el header `x-signature` firmado con el secret; ausente o
   inválido → `403`). La ruta responde `200 {status, orderId?}` en todos los
   casos de negocio para que MP deje de reintentar.
4. Con pago `approved` y orden pendiente, en **una transacción**: la orden
   pasa a `'Pagado'` (`paid_at`, `mp_payment_id`, `stock_committed=true`) y
   cada línea con producto decrementa stock con el mismo contrato de
   `sales-batch` (`FOR UPDATE` + guard). Líneas sin producto se saltan.
5. **Oversell** (otra venta vació el stock entre la orden y el IPN): la orden
   **queda pagada** con `stock_committed=false`, se sigue con las demás
   líneas y el evento queda `paid_oversell` (reposición/conciliación manual;
   **sin reembolsos automáticos**).
6. El resto no mueve la orden: `type` no-`payment` → `ignored`; orden
   desconocida → `unmapped`; orden no pendiente (pagada o futuros
   cancelados) → `noop`; pago no aprobado → `not_approved` (el vocabulario
   de estados de MP no se mapea 1:1 a propósito).

Idempotencia: MP reintenta cada ~15 min hasta recibir 2xx. La tabla
`webhook_events` (clave primaria `(provider, event_id)`, primer INSERT gana)
absorbe duplicados y reordenamientos; por eso la firma **no** valida
frescura de `ts`. Sin `MP_WEBHOOK_SECRET` el webhook da `503`, sin
`MP_ACCESS_TOKEN` la preference (y la consulta del pago) da `503`, y si MP
está caído también `503`.

Envs (los 3 opcionales; solo se exigen cuando se usan):

| Variable | Uso |
|---|---|
| `MP_ACCESS_TOKEN` | Bearer server-side para crear preferences y consultar pagos |
| `MP_WEBHOOK_SECRET` | Secreto de firma del header `x-signature` |
| `MP_NOTIFICATION_URL` | URL pública que viaja como `notification_url` de la preferencia |

Test vs prod: en sandbox se usan credenciales y usuarios de prueba de MP
(prefijo `TEST-`); `MP_NOTIFICATION_URL` debe ser alcanzable por MP (en dev,
un túnel hacia el local). En prod, URL pública https y credenciales
productivas. En el dashboard de MP se configuran las notificaciones IPN
para el tópico `payment` apuntando a
`https://<tu-api>/api/v1/webhooks/mercadopago`.

Seguridad/privacidad: el payload del pago puede traer datos del pagador —
los logs solo registran `id` + `status` (+ `orderId`). El body del IPN usa
schema catchall (nunca strict): MP manda muchos campos y las claves extra
no deben dar 422. Pendiente (follow-up, no en este cambio): `back_urls`
de retorno al storefront.

### Integración frontend: cómo cobrar con Checkout Pro

Receta para el storefront (o cualquier cliente). La única fuente de verdad
del pago es `payment_status` vía API: **nunca** des por pagada una orden
porque el usuario "volvió" del checkout (fase 1 no configura `back_urls` y
el usuario puede cerrar la pestaña).

**⚠️ Requisito previo (issue #90 pendiente): hoy no hay CORS** — un front en
otro origen queda bloqueado por el browser. Hasta que exista `CORS_ORIGINS`,
serví el front mismo-origen (o proxy dev `/api → backend`). Nada de lo de
abajo funciona cross-origin sin eso.

Paso a paso:

1. **Login** → `POST /api/v1/auth/login {identifier, password}` → guarda el
   `token` (memoria; nunca `localStorage` compartido ni logs).
2. **Crear orden** → `POST /api/v1/orders {customer, items: [{productId
   (uuid), quantity}]}` con `Authorization: Bearer <token>` → `201` con el
   `id` y el `total` server-side. Muestra ese total, no uno calculado en el
   front.
3. **Crear preferencia** → `POST /api/v1/orders/:id/payment-preference`
   (mismo Bearer) → `201 {preferenceId, initPoint}`. Cada llamada pisa la
   anterior: reintentar el pago = pedir preference nueva, sin problema.
4. **Redirigir** → `window.location.href = initPoint`. El usuario paga en
   MercadoPago (tarjeta, dinero en cuenta o efectivo según lo habilitado).
5. **Esperar confirmación por polling** → `GET /api/v1/orders/:id` cada 3–5 s
   hasta ~2 min: `payment_status === "Pagado"` → muestra confirmación con el
   nº de orden. Si no llega, muestra "pago en proceso, te avisamos" (el IPN
   suele tardar segundos; MP reintenta cada ~15 min ante fallos).
6. **Rechazado o abandono**: la orden sigue `Pendiente de pago` (los estados
   no-aprobados no la tocan a propósito) → ofrece "reintentar" (vuelve al
   paso 3) sin crear otra orden.

Ejemplo mínimo:

```js
const api = "https://<tu-api>/api/v1";
const auth = { Authorization: `Bearer ${token}` };

const order = await (await fetch(`${api}/orders`, {
  method: "POST", headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ customer: "Lucía Fernández", items: [{ productId, quantity: 1 }] })
})).json();
const pref = await (await fetch(`${api}/orders/${order.data.order.id}/payment-preference`, {
  method: "POST", headers: auth
})).json();
window.location.href = pref.data.initPoint; // cobrar en MercadoPago

// Al volver (o en la pantalla de espera): polling hasta "Pagado"
async function esperarPago(orderId, intentos = 24) {
  for (let i = 0; i < intentos; i++) {
    const r = await (await fetch(`${api}/orders/${orderId}`, { headers: auth })).json();
    if (r.data.order.paymentStatus === "Pagado") return r.data.order;
    await new Promise((t) => setTimeout(t, 5000));
  }
  return null; // "pago en proceso, te avisamos"
}
```

**Probar en sandbox**: credenciales y usuarios de prueba de MP (comprador y
vendedor `TEST-`), tarjetas de prueba (una aprobada, una rechazada, una
pendiente) desde la doc de MP; `MP_NOTIFICATION_URL` con túnel al local para
que el IPN llegue en dev. Casos a cubrir: aprobado → `Pagado` + stock -1;
rechazado → sigue pendiente + reintento OK; webhook duplicado → sin doble
efecto; firma inválida → 403 (probar con `curl` sin `x-signature`).

### Idempotencia con `Idempotency-Key` (issue #88)

Los tres creates reintentables aceptan el header `Idempotency-Key: <uuid>` y
devuelven la misma respuesta ante reintentos (timeouts, doble tap) sin
duplicar el recurso (`src/middleware/idempotency.ts`, tabla
`idempotency_keys` de la migración `0004`):

| Ruta | Scope |
|---|---|
| `POST /sales-batch` | `sales-batch` |
| `POST /orders` | `orders` |
| `POST /checkout-sessions` | `checkout` |

Reglas:

- **Sin header**: comportamiento actual (cada request ejecuta, sin marca).
- **Key presente pero no-UUID** → `422 VALIDATION_ERROR` (sin dependencia
  externa: regex propia).
- La key se particiona por `(key, scope, user_id)`: el mismo UUID en otro
  scope o de otro usuario no colisiona. Sin identidad el middleware pasa de
  largo y el guard de auth decide (está montado después del guard, antes de
  `validate`).
- **Replay**: misma key + mismo cuerpo → `res.status(guardado).json(cuerpo)`
  exacto (mismo status y body original) con el header
  `Idempotent-Replayed: true`, sin ejecutar el handler.
- **Misma key + cuerpo distinto** (bug del cliente) → `422`.
- **Key en curso** (el dueño aún no respondió) → `409 CONFLICT` (`"Solicitud
  en curso, reintente"`).
- **TTL 24h** (`expires_at`): vencida, el reintento re-ejecuta y crea un
  recurso nuevo; hay además una limpieza oportunista de vencidas por request
  (indexada en `expires_at`).
- Solo se guardan respuestas `2xx` (persistidas antes de responder); los
  fallos (incluido un `422` de `validate` posterior) borran la fila: **los
  errores nunca envenenan la key**.

Ejemplo:

```bash
KEY=$(uuidgen)
curl -X POST /api/v1/orders -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $KEY" -d '{"customer":"Lucía","items":[...]}'
# reintento seguro: mismo KEY + mismo body → 201 original + Idempotent-Replayed: true
```

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

`POST /uploads/product-image` (**solo admin**: requiere Bearer con rol
`administrador`/`administrador_principal`/`admin`/`superadmin`; cliente →
`403`): body binario crudo, **el
Content-Type decide la extensión** (png/jpeg/gif/webp/avif — SVG excluido a
propósito: contenido activo = XSS almacenado), nunca el
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
tablas de sesiones webshop/checkout + `gestion_web_access_tokens`; 0002:
columnas `mp_*`/`paid_at` en orders + tabla `webhook_events`). Nada la
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

Rate limiting (`src/middleware/rate-limit.ts`, contadores en memoria =
alcance single-instance: N instancias no comparten buckets): el trío auth
(login/register/gestion-access) admite 10 req/min por IP; las escrituras
(órdenes/checkout/uploads/webhook MP) 60 req/min por IP. Excedido → `429
TOO_MANY_REQUESTS`.

| Code | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Schema zod (clave extra, campo faltante/mal tipo, UUID inválido, `productId` texto en órdenes, pagos que no suman el total, moneda mixta) |
| `AUTHENTICATION_REQUIRED` | 401 | Sin token webshop / token basura o expirado / login inválido o no aprobado / puente inválido |
| `FORBIDDEN` | 403 | Identidad con rol no permitido (ej. operador creando catálogo) |
| `NOT_FOUND_OR_FORBIDDEN` | 404 | Sin identidad en gestión; catch-all; lectura ajena (orden/recibo/producto no publicado); sesión de caja inexistente |
| `CONFLICT` | 409 | Fecha de caja duplicada; sesión abierta existente; segundo checkout pendiente; cierre/movimiento sobre caja cerrada; recibo ya anulado |
| `INSUFFICIENT_STOCK` | 409 | Cantidad sobre stock (venta y órdenes) |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Upload con tipo no imagen o sin Content-Type |
| `PAYLOAD_TOO_LARGE` | 413 | Upload sobre `MAX_UPLOAD_BYTES` |
| `TOO_MANY_REQUESTS` | 429 | Rate limit excedido (trío auth: 10/min/IP; órdenes/checkout/uploads: 60/min/IP) |
| `DEPENDENCY_UNAVAILABLE` | 503 | Webhook sin `MP_WEBHOOK_SECRET`, preference/consulta de pago sin `MP_ACCESS_TOKEN`, o MercadoPago caído (timeout 8s / no-2xx) |
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
