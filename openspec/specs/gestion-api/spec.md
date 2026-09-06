# Especificación: gestion-api

## Propósito

Recursos de gestión server-authoritative bajo `/api/v1/...` (nombres plurales): receipts/boleta, sales-batch, financial-state, stock, cash-sessions, clients, services, purchases, categories. Envelope `{ ok, data | error }`, validación y autorización íntegras en servidor. Router montado en `/api/v1` con gating por roles e identidad inyectable (opción `resolveIdentity`).

## Requisitos

### Requisito: Envelope y validación en servidor

El sistema DEBE validar cada request de gestión en el servidor (zod: body/query/params → 422 con `details` por campo), DEBE responder con `{ ok, data | error }` y el status HTTP correcto (201 creación, 409 conflicto, 422 validación, 401/403 autenticación/autorización, 500/503 error técnico) y NO DEBE confiar en la coerción del cliente ni en los claims de rol del cliente. Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: sesión de gestión resuelta por roles; entrada validada: schemas zod estrictos; owner de escritura: Postgres (tablas de gestión); éxito/error: `ok:true` con `data` o `ok:false` con `error`; fallo cerrado: 422 sin cambio de estado. Prueba: `gestion-api.test.ts` (20 casos), `validate.test.ts` (8), `errors.test.ts` (16) — verify-report 2026-09-06.

#### Escenario: Alta de recibo válida

- Dado un usuario de gestión autenticado con rol que permita ventas, cuando se hace POST `/api/v1/receipts` con cuerpo completo y válido, entonces el status es 201, `ok:true` y el recibo creado en `data`.

#### Escenario: Cuerpo inválido rechazado

- Dado cualquier llamador autenticado, cuando se hace POST `/api/v1/sales-batch` con precio negativo o documento de cliente faltante, entonces el status es 422, `ok:false` con `error` por campo y sin cambio de estado.

### Requisito: Atomicidad de recibos y sales-batch

El sistema DEBE ejecutar sales-batch y anulación dentro de una sola transacción: bloquear productos `FOR UPDATE`, exigir `stock >= qty`, decrementar, insertar recibo + payload y revertir (rollback) ante cualquier fallo. La anulación DEBE restaurar el stock, marcar el recibo `Cancelado`, precio `0` y pago `Sin abonar`. Mapeo de almacenamiento documentado: servicios → documentos jsonb en `app_settings` (clave `gestion.services.<uuid>`); compras → `audit_logs`; movimientos de caja → `audit_logs` (action `cash.movement`); movimientos de stock → `audit_logs` (action `stock.movement`). Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: rol con permiso de ventas; entrada validada: ítems con producto/cantidad/precio; owner de escritura: Postgres (`products`, `beim_receipts`, `beim_receipt_payments`, `app_settings`, `audit_logs`); éxito/error: recibo creado y stocks decrementados en un commit; fallo cerrado: 409 con stock actual reportado y nada persistido. Prueba: `gestion-services.test.ts` (24), `gestion-api.test.ts`, `contract.test.ts` (suites A/B) — verify-report 2026-09-06.

#### Escenario: El lote decrementa atómicamente

- Dados productos con stock suficiente, cuando se hace POST `/api/v1/sales-batch` con dos ítems que consumen stock, entonces se crea el recibo, todos los stocks se decrementan y se confirma una sola transacción.

#### Escenario: Stock insuficiente aborta

- Dado un producto con stock 1 y cantidad solicitada 2, cuando se hace POST `/api/v1/sales-batch`, entonces el status es 409, nada se persiste y el error reporta el stock actual.

#### Escenario: La anulación restaura stock

- Dado un recibo `Entregado` que consumió stock, cuando se hace POST `/api/v1/receipts/{id}/annul`, entonces el status cambia a `Cancelado` y se restauran las cantidades consumidas.

### Requisito: Singleton financiero y sesiones de caja

El sistema DEBE tratar `gestion_financial_state` como singleton (`singleton_id=1`, upsert con merge) y DEBE acotar gastos y movimientos a la sesión de caja abierta. DEBE rechazar con 409 las escrituras a una sesión cerrada. Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: rol de gestión con permiso financiero; entrada validada: estado financiero y movimientos (schemas zod); owner de escritura: Postgres (`gestion_financial_state`, `gestion_cash_sessions`, `gestion_payment_movements`, `audit_logs`); éxito/error: una fila `singleton_id=1` y movimiento registrado; fallo cerrado: sesión cerrada → 409 y movimiento no registrado. Prueba: `contract.test.ts` (suite C), `gestion-api.test.ts`, `gestion-services.test.ts` — verify-report 2026-09-06.

#### Escenario: Upsert singleton

- Dado que no existe fila de estado financiero, cuando se hace PUT `/api/v1/financial-state` con capital y preferencias, entonces existe una fila con `singleton_id=1` y la respuesta la refleja.

#### Escenario: Sesión cerrada bloquea movimiento

- Dada la sesión de caja `S1` cerrada, cuando se hace POST `/api/v1/cash-sessions/S1/movements`, entonces el status es 409 y el movimiento no se registra.