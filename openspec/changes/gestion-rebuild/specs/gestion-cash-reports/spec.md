# Especificación: gestion-cash-reports

## Propósito

Definir caja persistente, cálculo determinista y reportes operativos compatibles con la referencia.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** la caja fallback puede perderse al refrescar y los reportes se calculan desde estado local.
- **Comportamiento de referencia (Reference behavior):** `buildReportData` calcula ventas netas, gastos operativos y utilidad; `buildAccountingSnapshot` separa liquidez, inventario, cuentas y capital.
- **Objetivo futuro (Future target):** caja y reportes DEBEN leer owners JSON confirmados y no aceptar snapshots del navegador como canónicos.

## Requisitos

### Requisito: Sesión de caja por fecha

La caja DEBE guardar apertura, esperado, contado, diferencia, estado y cierre por fecha de negocio. El efectivo esperado DEBE ser determinista: apertura + ventas en efectivo + cobros de órdenes/servicios en efectivo − gastos en efectivo. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: caja o administrador; entrada validada: fecha, importes, estado y nota; owner JSON de escritura: `sesiones-caja.json`; éxito/error: sesión abierta/cerrada o conflicto estable; fallo cerrado: fecha duplicada, importe inválido o dependencia caída no abre ni cierra. Prueba: Vitest de cálculo e integración de apertura/cierre.

#### Escenario: Arqueo determinista

- Dado una apertura, ventas, cobros y gastos confirmados, cuando se calcula el esperado, entonces el valor es reproducible y la diferencia es contado menos esperado.

#### Escenario: Dos aperturas o rol insuficiente

- Dado una sesión abierta o un vendedor sin permiso, cuando se solicita apertura, entonces se devuelve conflicto/denegación y `sesiones-caja.json` no cambia.

### Requisito: Semántica de reportes y contabilidad

Los reportes DEBEN excluir ventas anuladas y compras de inventario del gasto operativo, restar devoluciones de ventas, sumar movimientos de pago, agrupar gastos por categoría y calcular utilidad, inventario, cuentas por cobrar/pagar, liquidez, capital y tesorería según datos confirmados. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: caja, administrador o principal con permiso de lectura; entrada validada: rango y filtros normalizados; owner JSON de escritura: ninguno, lectura exclusiva de `ventas.json`, `ordenes.json`, `gastos.json`, `productos.json` y contabilidad; éxito/error: snapshot determinista o error estable; fallo cerrado: owner ausente o dato inválido no genera totales silenciosos. Prueba: Vitest de paridad con `buildReportData`/`buildAccountingSnapshot` e integración.

#### Escenario: Venta devuelta y gasto

- Dado una venta parcialmente devuelta y un gasto operativo confirmado, cuando se calcula el período, entonces ventas netas, gasto y utilidad reflejan esos movimientos una sola vez.

#### Escenario: Datos no confirmados

- Dado un caché local sin confirmación, cuando se solicita un reporte, entonces no altera el snapshot canónico ni se presenta como cifra confirmada.

### Requisito: Exportación e impresión

El sistema DEBE PODER exportar CSV e imprimir el mismo resultado visible del reporte, con escape de valores y período explícito. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: operador con permiso de reportes; entrada validada: rango, columnas y formato; owner JSON de escritura: ninguno; éxito/error: archivo/impresión derivado o error estable; fallo cerrado: filtro inválido o datos faltantes no exportan cifras inventadas. Prueba: unitarias de serialización y E2E de descarga/impresión.

#### Escenario: CSV consistente

- Dado un reporte confirmado, cuando se exporta, entonces el CSV conserva columnas, filtros y totales mostrados sin ejecutar una segunda fórmula.
