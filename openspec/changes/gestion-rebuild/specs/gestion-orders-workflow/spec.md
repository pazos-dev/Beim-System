# Especificación: gestion-orders-workflow

## Propósito

Definir orden, reparación, presupuesto, pagos, numeración e impresión segura.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** la boleta heredada recoge equipo, diagnóstico, garantía, precio y desbloqueo; numeración y estados están distribuidos.
- **Comportamiento de referencia (Reference behavior):** la gestión heredada relaciona cliente, orden, venta, ítems, stock, pagos y recibo.
- **Objetivo futuro (Future target):** una orden server-side validada DEBE ser el agregado, sin secretos ni fallback local.

## Requisitos

### Requisito: Alta, numeración y relaciones

El sistema DEBE validar cliente, equipo, servicios, problema, inspección, entrega, garantía y precio; DEBE ofrecer vista previa, número único y relación cliente–orden–venta sin duplicación. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal según acción; entrada validada: boleta y referencias; owner JSON de escritura: `ordenes.json` y `clientes.json` solo para comandos separados; éxito/error: orden numerada/vinculada o error estable; fallo cerrado: campos incompletos, relación inválida o número ocupado no persisten. Prueba: Vitest de contrato e integración.

#### Escenario: Orden válida

- Dado un cliente válido y datos completos del equipo, cuando un vendedor autorizado confirma, entonces se crea una orden numerada y relacionable con ese cliente.

#### Escenario: Número duplicado o rol insuficiente

- Dado un número ya asignado o un actor sin permiso de alta, cuando se intenta guardar, entonces se devuelve conflicto/denegación y no se crea una orden.

### Requisito: Estados, notas y presupuesto

Las reparaciones DEBEN usar un grafo finito de transiciones, guardar notas e ítems aprobables y mantener `paymentStatus` coherente. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: técnico para notas/ítems; caja/administrador para pagos; entrada validada: estados, importes y motivo; owner JSON de escritura: `ordenes.json`; éxito/error: orden actualizada o rechazo; fallo cerrado: transición inválida no cambia parcialmente. Prueba: unitarias de estados e integración.

#### Escenario: Transición válida

- Dado un presupuesto pendiente y un técnico autorizado, cuando aprueba un ítem, entonces la orden avanza solo a su siguiente estado permitido y registra la nota.

#### Escenario: Transición inválida o rol insuficiente

- Dado un estado terminal o un actor sin permiso, cuando se solicita el cambio, entonces se devuelve `CONFLICT`/`FORBIDDEN` y la orden conserva estado, pago y notas.

### Requisito: Stock, pagos e idempotencia de la orden

El consumo/devolución de stock, pagos y movimientos DEBEN confirmarse juntos o fallar explícitamente; un reintento NO DEBE descontar dos veces. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: técnico para stock, caja/administrador para cobros; entrada validada: ítems, cantidades, método, monto y clave; owner JSON de escritura: `ordenes.json`, `movimientos-stock.json` y `sesiones-caja.json`; éxito/error: saldos confirmados o rollback; fallo cerrado: stock insuficiente o dependencia caída no muta. Prueba: integración y E2E de reintento.

#### Escenario: Reintento o rol insuficiente

- Dado un ítem aprobado o un actor sin permiso, cuando el comando se repite con igual clave, entonces retorna el resultado original o denegación y existe un solo movimiento.

### Requisito: Impresión y privacidad de desbloqueo

La vista previa y la impresión DEBEN producir dos copias y excluir código, contraseña o patrón por defecto; el almacenamiento restringido DEBE esperar una decisión documentada. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: operador de lectura/impresión y principal para la política; entrada validada: boleta y política; owner JSON de escritura: `ordenes.json` para datos minimizados y `datos-desbloqueo.json` solo con permiso; éxito/error: copias sin secreto o rechazo; fallo cerrado: política ausente, actor insuficiente o impresión no autorizada no revela ni persiste el secreto. Prueba: integración y E2E de impresión/denegación.

#### Escenario: Impresión segura o no autorizada

- Dado un permiso y una orden sensible, cuando se imprime sin excepción, o un actor insuficiente intenta imprimir, entonces se omite el desbloqueo o se deniega sin revelarlo.
