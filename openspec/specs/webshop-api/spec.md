# Especificación: webshop-api

## Propósito

Recursos storefront bajo `/api/v1/...`: catálogo, órdenes, checkout, promo-slides y uploads. Visibilidad explícita por flag `published` (decisión documentada PR 4 — migración 0001), independiente del stock y del badge; el stock se comparte con gestión vía `products`/`beim_receipts`.

## Requisitos

### Requisito: Catálogo, órdenes y checkout

El sistema DEBE exponer lecturas paginadas del catálogo (page >= 1, 1 <= limit <= 100, con metadatos) y DEBE crear órdenes transaccionalmente (orden + ítems en una sola transacción). La visibilidad DEBE ser por flag explícito `published = true` (migración 0001): los productos no publicados quedan ocultos (404), los productos agotados pero publicados siguen visibles; stock insuficiente, producto desconocido o no publicado y monedas mixtas abortan con rollback (409/404/422). El checkout DEBE emitir una sesión de pago (`checkout_sessions`, status `pending`) y NO DEBE marcar el pago sin confirmación de webhook; DEBE existir una sola sesión pendiente por orden (una segunda emisión → 409; orden pagada → 409). Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: cliente autenticado (token de webshop) para órdenes y checkout, cualquier visitante para catálogo; entrada validada: schemas zod (paginación, monedas, cantidades); owner de escritura: Postgres (`products`, `orders`, `order_items`, `checkout_sessions`); éxito/error: orden impaga + URL de sesión pendiente; fallo cerrado: 409/404/422 con rollback total. Prueba: `webshop-api.test.ts` (12), `catalog-orders.test.ts` (13), `auth.test.ts` (15) — verify-report 2026-09-06.

#### Escenario: Catálogo paginado

- Dados 50 productos publicados, cuando se hace GET `/api/v1/products?page=2&limit=20`, entonces se devuelven 20 ítems y metadatos de paginación.

#### Escenario: Ordenar y luego pagar

- Dado un carrito con productos en stock, cuando se hace POST `/api/v1/orders` y luego POST `/api/v1/checkout-sessions`, entonces la orden se crea como impaga, se devuelve la URL de la sesión de checkout y el pago permanece impago hasta el webhook.

#### Escenario: Visibilidad por flag publicado (decisión documentada)

- Dado un producto con `published = false`, cuando se hace GET `/api/v1/products/:id`, entonces el status es 404; y un producto agotado pero publicado permanece visible en el catálogo como agotado.

#### Escenario: Una sola sesión pendiente por orden (decisión documentada)

- Dada una orden impaga con una sesión de checkout pendiente, cuando se hace POST `/api/v1/checkout-sessions` nuevamente, entonces el status es 409 y no se emite una segunda sesión.

### Requisito: Promo-slides y uploads

El sistema DEBE servir solo promo-slides publicadas en orden definido (`sort_order`, luego `created_at`) y DEBE validar los uploads en el servidor (tipo de media → 415, tamaño → 413), almacenando el archivo con nombre estable `uuid.ext` (raw-binary) y URL estable. Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: editor autenticado para uploads; entrada validada: tipo y tamaño en servidor (415/413); owner de escritura: Postgres (`promo_slides`) + almacenamiento de uploads; éxito/error: slides publicadas ordenadas y URL estable devuelta; fallo cerrado: 415/413 y ningún archivo almacenado. Prueba: `webshop-api.test.ts`, `catalog-orders.test.ts` — verify-report 2026-09-06.

#### Escenario: Slides ordenadas

- Dadas tres slides con dos publicadas, cuando se hace GET `/api/v1/promo-slides`, entonces solo se devuelven las publicadas en el orden definido.

#### Escenario: Upload inválido rechazado

- Dado un editor autenticado, cuando se hace POST `/api/v1/uploads/product-image` con un archivo ejecutable, entonces el status es 415 y no se almacena ningún archivo.