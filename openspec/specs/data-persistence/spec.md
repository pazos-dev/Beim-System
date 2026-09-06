# Especificación: data-persistence

## Propósito

Acceso a persistencia exclusivamente a través de puertos de repositorio con adaptadores de Postgres (`pg` crudo) desde el día uno (REVISIÓN 2026-09-05: la opción de archivos JSON primero quedó descartada). Contrato de esquema vendido (19 tablas de `schema.sql` + `seed.sql`) con migraciones idempotentes por archivo, transacciones con `FOR UPDATE` y compatibilidad JSONB.

## Requisitos

### Requisito: Puertos de repositorio y adaptadores

El sistema DEBE acceder a la persistencia solo a través de puertos de repositorio (`UnitOfWork`, `StockPort`, `ReceiptsPort`, `FinancialStatePort`, `OrdersPort`) y DEBE implementar los adaptadores de Postgres detrás de los mismos puertos sin cambios de contrato en los endpoints. La premisa original de "adaptadores de archivo por defecto" quedó superseded por la REVISIÓN 2026-09-05: Postgres es el único backend desde el inicio, sin dualidad archivo/Postgres ni migración posterior de datos (base de datos nueva). Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: los servicios vía puertos; entrada validada: contrato de puertos (zod en el límite HTTP); owner de escritura: Postgres (esquema vendido); éxito/error: operaciones atómicas por puerto + adaptador pg; fallo cerrado: el contrato request/response de los endpoints no depende del backend interno. Prueba: `contract.test.ts` (12 casos: 3 concurrencia, 2 anulación-restauración, 2 singleton, 2 recibo+jsonb, 2 orders/catalog, 1 idempotencia) — verify-report 2026-09-06.

#### Escenario: Intercambio de adaptador (premisa superseded)

- Dado el API de gestión ejecutándose originalmente con adaptadores de archivo, cuando el backend de almacenamiento cambia a Postgres, entonces todos los endpoints de gestión y webshop mantienen los contratos de request/response.
- Nota: la premisa GIVEN de adaptadores de archivo fue superseded por la REVISIÓN 2026-09-05 (Postgres desde el día uno); el THEN de preservación de contrato se cumple y verifica vía puertos + adaptadores pg + suite de contrato. Desviación registrada como W1 en verify-report.

### Requisito: Transacción y seguridad de stock

El sistema DEBE serializar las mutaciones de stock por producto (`SELECT ... FOR UPDATE` o guardia equivalente), DEBE exigir `stock >= qty` y DEBE revertir (rollback) las escrituras parciales. DEBE preservar la compatibilidad JSONB: los payloads de `beim_receipts.payload` se almacenan y restauran sin alterar claves desconocidas (`.passthrough()`). Estado: **Línea base observada (Observed baseline)**. Contrato: entrada validada: cantidades y monedas en servidor; owner de escritura: Postgres (`products`, `beim_receipts`, `order_items`, `orders`); éxito/error: una sola transacción BEGIN/COMMIT/ROLLBACK; fallo cerrado: conflicto → 409 con stock actual reportado y nada persistido. Prueba: `contract.test.ts` suites A–D, `gestion-services.test.ts`, `catalog-orders.test.ts` — verify-report 2026-09-06.

#### Escenario: Decremento concurrente seguro

- Dado un producto con stock 1 y dos ventas concurrentes de cantidad 1, cuando ambas ejecutan, entonces exactamente una tiene éxito y la otra falla con 409.

#### Escenario: Compatibilidad JSONB

- Dado un backup legacy de `beim_receipts.payload`, cuando se restaura a través del repositorio, entonces las lecturas del recibo tienen éxito y se preservan las claves desconocidas del payload.

### Requisito: Migración idempotente del esquema (decisión documentada)

El sistema DEBE aplicar el esquema vendido de referencia (19 tablas de `schema.sql`) + `seed.sql` y DEBE ser re-ejecutable sin efectos (todo `IF NOT EXISTS` / `ON CONFLICT`). Las migraciones propias DEBEN vivir en archivos `migrations/*.sql` aplicados por orden de nombre y solo crear tablas o columnas nuevas sin editar el esquema vendido (0001: `published` en `products`/`promo_slides`, tablas `webshop_sessions` y `checkout_sessions`). Total: 21 tablas = 19 vendidas + 2 de migración. Estado: **Línea base observada (Observed baseline)**. Contrato: owner de escritura: base de datos de destino (`DATABASE_URL` o PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD); éxito/error: `db:migrate` exit 0; re-ejecución = no-op; fallo cerrado: `MIGRATE_DROP_FIRST=1` solo en desarrollo, nunca en producción. Prueba: re-aplicación verificada dos veces contra `beim_api` (21 tablas, seed no duplicado) — verify-report 2026-09-06.