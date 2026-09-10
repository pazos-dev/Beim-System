# Consumo de la API `@beim/api` — guía para el front

Guía de consumo (no de operación). Montaje, despliegue y testing viven en
`docs/USO.md`. Contratos normativos en `openspec/specs/*`.
Fuentes de esta guía: `src/contracts/__snapshots__/openapi-routes.snapshot.json`,
`envelope-matrix.snapshot.json`, `src/errors/taxonomy.ts`,
`src/cutover/mounting.ts` (guards vigentes) y `src/db/bootstrap-admin.ts`.

## 1. Base URL

| Entorno | Base URL |
|---|---|
| Desarrollo | `http://localhost:4000` |
| Producción | valor de la variable `BEIM_API_BASE_URL` (la provee el entorno; nunca hardcodear un dominio en el front) |

Todos los paths de negocio cuelgan de `<base>/api/v1`. Utilidades fuera del
prefijo: `GET /health` (liveness, sin BD), `GET /ready` (readiness, con BD;
caída → `503`), `GET /openapi.json` (contrato, sin auth), `GET /docs`
(Swagger UI, solo fuera de producción), `GET /metrics` (Prometheus; la
plataforma debe restringirlo).

Contrato OpenAPI generado en `src/docs/openapi.ts`; ante duda, `GET /openapi.json`
manda sobre esta guía.

## 2. Autenticación

### Consola de gestión (el caso de este front)

```http
POST /api/v1/auth/gestion-login
Content-Type: application/json

{ "username": "<usuario de consola>", "password": "<su contraseña>" }
```

- `200 { ok: true, data: { token, expiresAt, user: { id, username, name, role } } }`.
- El `username` es exacto (no acepta email) y el `role` viene de la fila en
  BD: el cliente nunca lo envía (`docs/USO.md` §2).
- Uso posterior: `Authorization: Bearer <token>` (sensible a mayúsculas,
  con un espacio tras `Bearer`). Guardar el token en memoria; nunca en logs.
- Fallos (desconocido, inactivo, password mal) → mismo `401` uniforme
  `"Credenciales inválidas"`, sin filtrar existencia.
- Cada login revoca la sesión anterior: una sola sesión activa por usuario
  (TTL default 30 días, `SESSION_TTL_DAYS`).
- `POST /api/v1/auth/logout` acepta Bearer de ambos reinos y responde
  `200 { loggedOut: true }` (idempotente con sesión válida; token
  muerto/ausente → `401`).
- Errores del cuarteto auth: `422` (body inválido), `401`, `429` (ver §9).

### Tienda webshop (referencia, no es este front)

`POST /api/v1/auth/register` → `201` (cuenta `cliente` pendiente de
aprobación; email duplicado → `201 { user: null }` anti-enumeración);
`POST /api/v1/auth/login { identifier, password }` → `200 { token,
expiresAt, user }`; `POST /api/v1/auth/gestion-access { token }` canjea un
puente de un solo uso (segundo canje → `401`).

### Crear el admin de desarrollo (sin exponer credenciales)

El registro crea clientes sin aprobar y aprobar exige ser admin: el primer
admin entra por CLI, nunca por la API. Generar la contraseña localmente
(password manager o generador del equipo; mínimo 12 caracteres) y pasarla
solo por entorno, jamás en repo, docs ni logs:

```bash
ADMIN_EMAIL=<email del admin> ADMIN_PASSWORD='<contraseña generada>' \
  [ADMIN_NAME=<nombre>] pnpm --filter @beim/api db:bootstrap-admin [--yes]
```

Idempotente: mismo email = promueve a `admin` + rota la password (sirve para
recuperar acceso). En producción exige `--yes` explícito. Implementación:
`src/db/bootstrap-admin.ts`.

## 3. Roles y matriz de auth

Roles consola (`OPERATOR_ROLES` en `src/cutover/mounting.ts:86-94`):

- `OPERATOR` = `vendedor, tecnico, caja, administrador, administrador_principal`
  (+ `admin, superadmin` webshop en el montaje) → operar y leer.
- `ADMIN` = `administrador, administrador_principal, admin, superadmin` →
  además **crear/editar** categorías, servicios y compras, y administrar
  usuarios y auditoría.
- Excepción: `PUT /invoice-settings` exige solo `administrador_principal`
  (`administrador` → `403`).

| Situación | Respuesta | Código |
|---|---|---|
| Sin identidad (sin Bearer o sesión muerta) en ruta gestión | `404` | `NOT_FOUND_OR_FORBIDDEN` (a propósito: nunca revela que el recurso existe) |
| Identidad con rol no permitido | `403` | `FORBIDDEN` |
| Token webshop ausente/inválido/expirado en tienda | `401` | `AUTHENTICATION_REQUIRED` uniforme |
| Webhook MP sin firma o firma inválida | `403` | `FORBIDDEN` |
| Rol permitido | pasa | — |

Nota: los tokens de consola autorizan las rutas `requireRole` de gestión;
las rutas de tienda (`orders`, `checkout-sessions`, `payment-preference`)
exigen sesión webshop (`tokenGuard`): un Bearer de consola ahí da `401`.

## 4. Envelopes y tabla de errores

Éxito (creates → `201`, resto → `200`; el PDF del ticket es la excepción,
ver §10):

```json
{ "ok": true, "data": { "...": "..." } }
```

Error (una sola traducción central en el `errorHandler`):

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

El front debe ramificar por `error.code`, no por el mensaje.
Taxonomía completa (`src/errors/taxonomy.ts`, 11 códigos):

| code | HTTP | Cuándo lo ve el front |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Body/query inválido (zod strict: clave extra, tipo mal, UUID inválido, `productId` texto en órdenes, pagos que no suman, `from > to`, rango > 366d, `Idempotency-Key` no-UUID, misma key + cuerpo distinto) |
| `AUTHENTICATION_REQUIRED` | 401 | Falta token / token muerto / login inválido |
| `FORBIDDEN` | 403 | Rol sin permiso; webhook sin firma válida |
| `NOT_FOUND_OR_FORBIDDEN` | 404 | Sin identidad en gestión; recurso inexistente; lectura ajena (orden/recibo/producto oculto); catch-all de ruta desconocida |
| `CONFLICT` | 409 | Caja duplicada (fecha/abierta), segundo checkout pendiente, key en curso, cierre/movimiento sobre caja cerrada, recibo ya anulado |
| `INSUFFICIENT_STOCK` | 409 | `quantity > stock` (venta mostrador y órdenes) |
| `PAYLOAD_TOO_LARGE` | 413 | Upload sobre `MAX_UPLOAD_BYTES` (default 5 MB) o JSON > 256 kb |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Upload con tipo no permitido o sin `Content-Type` |
| `TOO_MANY_REQUESTS` | 429 | Rate limit excedido (ver §9) |
| `DEPENDENCY_UNAVAILABLE` | 503 | MP sin configurar/caído; `GET /ready` con PG caído |
| `INTERNAL_ERROR` | 500 | Fallo no de dominio (nunca filtra detalles; pedir `X-Request-Id` al backend) |

Cada request devuelve `X-Request-Id` (8 chars): incluirlo al reportar un `500`.

## 5. Paginación y filtros (reglas globales)

- Paginación (`src/interface/http/dtos/pagination.ts`): `page?` default `1`
  (mínimo 1), `limit?` default `20`, máximo `100`. Los listados gestión
  responden `{ items, total, page, limit }`. Tienda: `GET /products`
  añade `totalPages`; `GET /orders` responde `{ page, limit, total, items }`.
- Todo objeto es strict: claves de query o body desconocidas → `422`.
- Formatos: fechas `from?`/`to?` en `YYYY-MM-DD`; `active?`/`approved?` llegan
  como string `"true"`/`"false"` (`"all"` = todo donde aplique); ordenamientos
  fijos por ruta (no parametrizables).
- Sin PII en agregados: reportes y auditoría devuelven conteos/ids, nunca
  bodies, tokens ni passwords.

## 6. Catálogo de rutas

Auth: `—` = pública; `token` = Bearer webshop (`401` sin él);
`operator` / `admin` = Bearer consola con ese gate (`404` sin identidad,
`403` con rol ajeno). Códigos por ruta según `envelope-matrix.snapshot.json`.

### Auth y salud (públicas salvo logout)

| Método + path | Auth | Query/filtros | Errores |
|---|---|---|---|
| `POST /auth/register` → 201 | — | — | `422`, `429` |
| `POST /auth/login` | — | — | `401`, `422`, `429` |
| `POST /auth/gestion-login` | — | — | `401`, `422`, `429` |
| `POST /auth/gestion-access` | — | — | `401`, `422`, `429` |
| `POST /auth/logout` | bearer (ambos reinos) | — | `401` |
| `GET /health`, `GET /metrics` | — | — | — |
| `GET /ready` | — | — | `503` |

### Gestión: ventas, tickets, caja, stock (`operator`)

| Método + path | Auth | Query/filtros | Errores |
|---|---|---|---|
| `POST /sales-batch` → 201 | operator | `Idempotency-Key` UUID opcional | `404`, `403`, `422`, `409` (+`INSUFFICIENT_STOCK`) |
| `GET /receipts` | operator | `client?`, `paymentMethod?`, `from?`, `to?`, `page?`, `limit?`; orden `receipt_number DESC` | `404`, `403`, `422` |
| `GET /receipts/next-number` | operator | — (preview desde 1000, no reserva) | `404`, `403` |
| `POST /receipts` → 201 | operator | creación fuerza `repairStatus='Ingresado'` aunque se envíe otro | `404`, `403`, `422` |
| `GET /receipts/:id` | operator | `:id` uuid | `404`, `403`, `422` |
| `POST /receipts/:id/status` | operator | body `{ status }` enum 5 estados (ver §8); `Cancelado` → `422` (usar `annul`) | `404`, `403`, `422` |
| `POST /receipts/:id/annul` | operator | restaura stock + reversa movimientos con negativos | `404`, `403`, `422`, `409` |
| `GET /receipts/:id/invoice` | operator | PDF inline (ver §10) | `404`, `403`, `422` |
| `GET /invoice-settings` | operator | `{}` si nunca se guardó | `404`, `403` |
| `PUT /invoice-settings` | **solo `administrador_principal`** | reemplazo total, todo opcional | `404`, `403`, `422` |
| `GET /financial-state` | operator | singleton | `404`, `403` |
| `PUT /financial-state` | operator | merge: lo enviado pisa, el resto se preserva | `404`, `403`, `422` |
| `GET /cash-sessions/current` | operator | abierta actual; sin abierta → `404` | `404`, `403` |
| `GET /cash-sessions` | operator | orden `business_date DESC` | `404`, `403` |
| `POST /cash-sessions` → 201 | operator | `{ businessDate, openingAmount ≥ 0, notes? }`; duplicada → `409` | `404`, `403`, `422`, `409` |
| `POST /cash-sessions/:id/close` | operator | `{ countedAmount ≥ 0 }`; doble cierre → `409` | `404`, `403`, `422`, `409` |
| `POST /cash-sessions/:id/movements` → 201 | operator | `{ type: ingreso\|egreso\|ajuste, amount > 0, notes? }`; solo sesión abierta | `404`, `403`, `422`, `409` |
| `GET /stock-movements` | operator | `productId?`, `from?`, `to?` | `404`, `403`, `422` |
| `POST /stock-movements` → 201 | operator | `{ productId, movementType: entrada\|salida, quantity > 0, detail? }` | `404`, `403`, `422` |

### Gestión: clientes, catálogo, compras (`operator` lee; `admin` escribe)

| Método + path | Auth | Query/filtros | Errores |
|---|---|---|---|
| `GET /clients` | operator | `search?` (nombre/email), `active?` (`true`/`false`/`all`, default activos), `page?`, `limit?`; responde `{ items, total, page, limit }` | `404`, `403`, `422` |
| `GET /clients/:id` | operator | `:id` uuid | `404`, `403`, `422` |
| `POST /clients` → 201 | operator | `{ name, email?, phone? }`; crea pendiente (`is_approved=false`, oculto del listado default) | `404`, `403`, `422` |
| `PUT /clients/:id` | operator | `{ name?, email?, phone?, active? }` merge parcial (`active:false` desaprueba + revoca sesiones) | `404`, `403`, `422` |
| `GET /categories`, `GET /services`, `GET /purchases` | operator | `active?` (`true`/`false`/`all`, default activos) | `404`, `403`, `422` |
| `GET /categories/:id` | operator | id string (ej. `mano-de-obra`) | `404`, `403` |
| `GET /services/:id`, `GET /purchases/:id` | operator | `:id` uuid | `404`, `403`, `422` |
| `POST /categories` → 201 | **admin** | `{ id, name, code }` | `404`, `403`, `422` |
| `PUT /categories/:id` | **admin** | `{ name?, code?, active? }` merge | `404`, `403`, `422` |
| `POST /services` → 201 | **admin** | `{ name, data? }` (`data` record libre) | `404`, `403`, `422` |
| `PUT /services/:id` | **admin** | `{ name?, data?, active? }` merge | `404`, `403`, `422` |
| `POST /purchases` → 201 | **admin** | `{ supplierName, data? }` | `404`, `403`, `422` |
| `PUT /purchases/:id` | **admin** | `{ supplierName?, data?, active? }` merge | `404`, `403`, `422` |

### Gestión: usuarios, auditoría, reportes (`admin` / `operator`)

| Método + path | Auth | Query/filtros | Errores |
|---|---|---|---|
| `GET /users` | admin | `role?` (`cliente\|admin\|superadmin`), `approved?`, `page?`, `limit?`; orden `created_at DESC` | `404`, `403`, `422` |
| `POST /users/:id/approve` | admin | idempotente | `404`, `403`, `422` |
| `PUT /users/:id/role` | admin | `{ role: cliente\|admin\|superadmin }`; fuera de lista → `422` | `404`, `403`, `422` |
| `POST /users/:id/disable` | admin | desaprueba + revoca sesiones (idempotente) | `404`, `403`, `422` |
| `GET /gestion-users` | admin | `role?` (lista consola), `active?`, `search?` (username/nombre), `page?`, `limit?` | `404`, `403`, `422` |
| `POST /gestion-users` → 201 | admin | `{ username, name, password, role }`; duplicado → `201 { user: null }` | `404`, `403`, `422` |
| `PUT /gestion-users/:id/role` | admin | `{ role: vendedor\|tecnico\|caja\|administrador\|administrador_principal }` | `404`, `403`, `422` |
| `POST /gestion-users/:id/disable`, `.../enable` | admin | idempotentes (disable revoca sesiones) | `404`, `403`, `422` |
| `POST /gestion-users/:id/password` | admin | `{ password }` (misma policy: 12+ con mayúscula, minúscula, número y símbolo) → `{ passwordReset: true }` | `404`, `403`, `422` |
| `GET /audit-logs` | admin | `actor?` (uuid), `action?` (exacto), `from?`, `to?`, `page?`, `limit?`; orden `created_at DESC`; sin PII | `404`, `403`, `422` |
| `GET /reports/sales-summary` | operator | `from?`, `to?` (default últimos 30d, máx 366d) | `404`, `403`, `422` |
| `GET /reports/cash-summary` | operator | mismo rango que ventas | `404`, `403`, `422` |
| `GET /reports/top-products` | operator | `from?`, `to?`, `limit?` (default 20, máx 100) | `404`, `403`, `422` |
| `GET /reports/stock-valuation` | operator | sin rango (foto actual + flag stock bajo) | `404`, `403` |
| `GET /reports/repairs-by-status` | operator | sin rango (conteos con ceros) | `404`, `403` |

### Tienda webshop (Bearer tienda; públicas las de catálogo)

| Método + path | Auth | Query/filtros | Errores |
|---|---|---|---|
| `GET /products` | — | `category` (exacto), `search` (nombre/marca/modelo), `page?`, `limit?` (máx 100); solo `published=true`, orden `created_at ASC` | `422` |
| `GET /products/:id` | — | solo publicados; oculto → `404` | `404`, `422` |
| `GET /promo-slides` | — | — | — |
| `GET /orders` | token | propias; `{ page, limit, total, items }` | `401`, `422` |
| `POST /orders` → 201 | token | `productId` exige **UUID** (los ids texto del seed dan `422`); `Idempotency-Key` opcional | `401`, `422`, `409` (+`INSUFFICIENT_STOCK`), `429` |
| `GET /orders/:id` | token | solo propia; ajena → `404` | `401`, `404`, `422` |
| `POST /orders/:id/cancel` | token | idempotente; pagada/no-pendiente → `409` | `401`, `404`, `422`, `409`, `429` |
| `POST /checkout-sessions` → 201 | token | una sola pendiente por orden (segunda → `409`); `Idempotency-Key` opcional | `401`, `422`, `409`, `429` |
| `POST /orders/:id/payment-preference` → 201 | token | mintea preferencia MP (pisa la anterior); sin `MP_ACCESS_TOKEN` o MP caído → `503` | `401`, `404`, `422`, `503`, `429` |
| `POST /webhooks/mercadopago` | firma `x-signature` (sin Bearer) | responde `200 { status, orderId? }` en casos de negocio para frenar reintentos | `403`, `503`, `429` |
| `POST /uploads/product-image` → 201 | Bearer admin tienda o consola admin | binario crudo (ver §8) | `401`, `403`, `413`, `415`, `429` |
| `GET /uploads/:filename` | — | formato `uuid.ext`; inválido/ausente → `404` | `404` |

## 7. Idempotencia (`Idempotency-Key`)

Los tres creates reintentables la aceptan: `POST /sales-batch`
(scope `sales-batch`), `POST /orders` (`orders`), `POST /checkout-sessions`
(`checkout`). Implementación: `src/interface/http/edge/idempotency.ts`,
tabla `idempotency_keys`.

- Sin header: comportamiento normal (cada request ejecuta).
- Key presente pero no-UUID → `422 VALIDATION_ERROR`.
- La key se particiona por `(key, scope, user_id)`: el mismo UUID en otro
  scope o de otro usuario no colisiona.
- Replay (misma key + mismo cuerpo) → mismo status y body original + header
  `Idempotent-Replayed: true`, sin re-ejecutar.
- Misma key + cuerpo distinto → `422` (bug del cliente: generar otra key).
- Key en curso (el dueño aún no respondió) → `409 CONFLICT` (`"Solicitud en
  curso, reintente"`).
- TTL 24 h: vencida, el reintento re-ejecuta y crea un recurso nuevo.
- Solo se guardan respuestas `2xx`; los fallos nunca envenenan la key.

```js
const key = crypto.randomUUID();
await fetch(`${API}/sales-batch`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
  body: JSON.stringify(mismoBody),
});
// Reintento ante timeout: misma key + mismo body.
```

## 8. Máquina de estados del ticket

`POST /receipts/:id/status { status }` (enum cerrado de 5; fuera del enum →
`422`). `Cancelado` nunca es destino (→ `422`, usar `POST
/receipts/:id/annul`). Mismo estado → `200` idempotente sin `UPDATE`.

| Desde | Hacia permitidos |
|---|---|
| `Ingresado` | `En reparación` |
| `En reparación` | `Listo`, `Ingresado` |
| `Listo` | `Entregado`, `En reparación` |
| `Entregado` | — (terminal) |
| `Cancelado` | — (terminal; solo vía `annul`) |

## 9. Rate limits (`429 TOO_MANY_REQUESTS`)

Fijos por IP + ruta (`src/interface/http/edge/rate-limit.ts`; bypass en
`NODE_ENV=test`; fail-open si Redis falla: el request pasa y se cuenta en
memoria):

| Bucket | Límite | Rutas |
|---|---|---|
| Auth | 10 req/min | `login`, `register`, `gestion-access`, `gestion-login` |
| Escrituras | 60 req/min | `orders`, `checkout-sessions`, `orders/:id/cancel`, `payment-preference`, `webhooks/mercadopago`, `sales-batch`, `uploads/product-image` |

Excedido → `429 { ok: false, error: { code: "TOO_MANY_REQUESTS" } }`.
Estrategia front: reintento con backoff + jitter; no reintentar `422`/`403`
sin cambiar el request. Multi-instancia: contadores compartidos con
`RATE_LIMIT_REDIS_URL` (o `REDIS_URL`); sin ella, cada réplica cuenta por su
cuenta.

## 10. Ticket PDF

`GET /receipts/:id/invoice` (guard `operator`) renderiza en memoria y
responde bytes `Content-Type: application/pdf` + `Content-Disposition:
inline` (no JSON, no guarda archivos). Inexistente → `404`. Incluye
encabezado del negocio, número/fecha/estado, cliente, equipo, líneas y
secciones de plantilla; lleva la marca "Ticket interno del taller — no
válido como comprobante fiscal" (sin desglose de impuestos). La plantilla se
lee con `GET /invoice-settings` y se reemplaza con `PUT /invoice-settings`
(solo `administrador_principal`).

```js
const res = await fetch(`${API}/receipts/${id}/invoice`, { headers: auth });
if (!res.ok) throw await res.json();
const blob = await res.blob(); // application/pdf → <iframe> / window.open
```

## 11. Webhooks MercadoPago (referencia para el front tienda)

`POST /webhooks/mercadopago` es server-to-server: se autentica con el header
`x-signature` firmado con `MP_WEBHOOK_SECRET` (ausente/inválido → `403`);
sin secreto → `503`. El front no lo llama: solo necesita saber que la única
fuente de verdad del pago es `payment_status` vía `GET /orders/:id`
(`"Pagado"`), nunca el retorno del checkout. Receta completa (crear orden →
preferencia → `initPoint` → polling 3–5 s hasta ~2 min): `docs/USO.md` §6.

## 12. Uploads

`POST /uploads/product-image` (solo admin): body binario crudo; **el
`Content-Type` decide la extensión** (`png/jpeg/gif/webp/avif`; SVG
excluido a propósito). Tipo desconocido o header ausente → `415` antes de
leer un byte; sobre `MAX_UPLOAD_BYTES` (default 5 MB) → `413` sin escribir
nada. Guarda `<uuid>.<ext>` y devuelve `{ url: /api/v1/uploads/<uuid>.<ext> }`.
`GET /uploads/:filename` valida formato estricto: inválido o ausente →
`404`, nunca un error de filesystem. Además el JSON global está capado a
256 kb (`413` antes de llegar a handlers) y el servidor corta a 30 s.

```js
await fetch(`${API}/uploads/product-image`, {
  method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": file.type },
  body: file, // Blob binario, no JSON ni FormData
});
```

## 13. CORS (`CORS_ORIGINS`)

Allowlist por env para el storefront (`src/interface/http/edge/cors.ts`):
`CORS_ORIGINS=https://tienda.example.com` (coma-separado, se lee por
request, sin restart). Origen permitido → `Access-Control-Allow-Origin:
<origen exacto>` + `Vary: Origin`; origen ajeno → sin headers (el browser
bloquea); sin `Origin` (curl/server-to-server) → intacto. Preflight
(`OPTIONS`) permitido → `204` con métodos `GET,POST,PUT,OPTIONS`, headers
`Content-Type, Authorization` y `Max-Age: 86400`. Reglas fijas: `*` se
ignora (fail-closed) y nunca se envía `Allow-Credentials` (auth es Bearer,
no cookies). Sin la variable, passthrough total (útil en dev mismo-origen o
con proxy `/api → backend`).
