# Especificación: gestion-stock-commerce

## Propósito

Definir catálogo autorizado, transferencia, movimientos, compras, ventas, pagos mixtos, devoluciones y anulaciones.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** `sistema-gestion/` implementa carrito multiproducto, compras, transferencias web→taller, movimientos, devoluciones y anulaciones.
- **Comportamiento de referencia (Reference behavior):** las compras recalculan costo promedio y las ventas descuentan stock y crean vínculos de recibo.
- **Objetivo futuro (Future target):** cada efecto comercial DEBE tener un owner JSON, autorización server-side y resultado idempotente.

## Requisitos

### Requisito: Catálogo CRUD autorizado

Productos, categorías y servicios DEBEN poder crearse, editarse, activarse/desactivarse y eliminarse solo según permisos declarativos. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador o principal para mutar; vendedor, técnico y caja solo para lecturas permitidas; entrada validada: identidad, referencias, precios, cantidades y esquema Zod; owner JSON de escritura: `productos.json`, `categorias.json` o `servicios.json`; éxito/error: entidad tipada o denegación/validación; fallo cerrado: no escribir ante rol insuficiente o referencia inexistente. Prueba: unitarias de permisos e integración CRUD.

#### Escenario: CRUD autorizado

- Dado un administrador y un producto válido, cuando lo actualiza, entonces el owner de productos confirma una versión nueva y devuelve la entidad tipada.

#### Escenario: Rol insuficiente

- Dado un vendedor autenticado, cuando intenta crear un producto, entonces recibe `FORBIDDEN` y `productos.json` no cambia.

### Requisito: Movimientos, transferencia y costo ponderado

Toda compra, venta, devolución, anulación, transferencia o consumo técnico DEBE registrar movimiento con `balanceAfter`; las compras DEBEN calcular costo promedio ponderado con cantidades y costos válidos. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador para transferencia/compra y técnico autorizado para consumo; entrada validada: producto, origen/destino, cantidad, costo y referencia; owner JSON de escritura: `productos.json` y `movimientos-stock.json`; éxito/error: balances y costo confirmados o rollback/conflicto; fallo cerrado: stock insuficiente o doble origen no produce movimiento parcial. Prueba: unitarias de cálculo e integración de consistencia.

#### Escenario: Transferencia válida

- Dado stock web suficiente, cuando un administrador transfiere una cantidad válida al taller, entonces se registran los dos balances posteriores y ambos quedan reconciliados.

#### Escenario: Stock insuficiente o rol insuficiente

- Dado un origen con saldo menor o un actor sin permiso, cuando se solicita la transferencia, entonces se devuelve error/denegación y ningún producto ni movimiento cambia.

### Requisito: Venta multiproducto y pagos mixtos

Una venta DEBE validar carrito, precios, stock, total y pagos efectivo/tarjeta/transferencia/mixto; el total de pagos DEBE coincidir exactamente antes de descontar stock. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor, caja o administrador; entrada validada: ítems, cantidades, moneda, métodos y montos; owner JSON de escritura: `ventas.json`, `productos.json`, `movimientos-stock.json` y `ordenes.json` para el vínculo; éxito/error: venta numerada o error estable; fallo cerrado: discrepancia, stock insuficiente o dependencia caída no descuenta ni registra venta. Prueba: Vitest de totales e integración/E2E de carrito.

#### Escenario: Pago mixto válido

- Dado un carrito con stock suficiente, cuando dos medios suman el total, entonces se crea una venta y cada producto se descuenta una sola vez.

#### Escenario: Pago incompleto o rol insuficiente

- Dado un carrito válido y pagos incompletos, o un actor sin permiso, cuando se confirma la venta, entonces se rechaza/deniega y el stock permanece igual.

### Requisito: Devolución y anulación idempotentes

Devoluciones y anulaciones DEBEN exigir motivo, permiso y clave idempotente; el primer efecto DEBE revertir solo cantidades pendientes y los reintentos DEBEN devolver el mismo resultado. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: caja o administrador; entrada validada: venta, cantidades, motivo y clave; owner JSON de escritura: `ventas.json`, `productos.json` y `movimientos-stock.json`; éxito/error: retorno/anulación auditado o conflicto; fallo cerrado: venta inexistente, cantidad repetida o rol insuficiente no restaura ni descuenta dos veces. Prueba: integración de reintentos y E2E negativo.

#### Escenario: Repetición segura o rol insuficiente

- Dado un retorno confirmado o un actor sin permiso, cuando se repite la solicitud, entonces se devuelve el retorno original o denegación y no aparece un segundo movimiento.
