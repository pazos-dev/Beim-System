# Guía local de tareas de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Esta guía refleja las unidades de [`../../../openspec/changes/gestion-rebuild/tasks.md`](../../../openspec/changes/gestion-rebuild/tasks.md). Solo **GR-0.1** queda marcado por esta entrega documental; ninguna tarea de código se considera iniciada o implementada.

## Cómo usar este checklist

1. Confirmar la dependencia y el edit root de la unidad.
2. Leer la especificación de capacidad y el diseño antes de editar.
3. Ejecutar **RED**: prueba negativa o de comportamiento escrita primero.
4. Ejecutar **GREEN**: implementación mínima y prueba enfocada pasando.
5. **TRIANGULAR** con un caso alterno, repetir y luego **REFACTOR** con pruebas verdes.
6. Registrar comando, resultado, riesgos y rollback; marcar solo la unidad realmente demostrada.

Comandos previstos, siempre acotados a la futura aplicación:

```bash
pnpm --dir apps/gestion test
pnpm --dir apps/gestion lint
pnpm --dir apps/gestion typecheck
pnpm --dir apps/gestion build
pnpm --dir apps/gestion dev
```

En la fase documental solo se permite `git diff --check -- apps/gestion/docs openspec/changes/gestion-rebuild/tasks.md`; no hay runtime ni pruebas de código que ejecutar.

## Fase GR-0 — documentación

- [x] **GR-0.1** Crear los seis documentos locales en español técnico neutro, enlazar cada autoridad y marcar todos los objetivos como futuros. **TDD:** RED/GREEN/REFACTOR = N/A, unidad documental sin código ni archivos de prueba. **Evidencia:** `git diff --check`. **Rollback:** eliminar solo `apps/gestion/docs/` y revertir esta marca.

**Definición de terminado GR-0:** los seis archivos existen, se enlazan entre sí y con los cinco documentos raíz, contienen roles correctos, no declaran runtime implementado y la validación documental pasa.

## Fase GR-1 — contratos compartidos y shell

- [ ] **GR-SHARED.1** Implementar envelopes de ocho errores, hash/idempotencia, tokens sin acentos y auditoría mínima con `AUDIT_FAILURE`. **RED:** unitarias de validación, replay y auditoría fallida. **GREEN/REFACTOR:** handlers y dominio pasan; integración verifica rollback. **Comando:** `pnpm --dir apps/gestion test`. **Rollback:** retirar handlers/shared y `audit.json` del slice.
- [ ] **GR-SHELL.1** Proteger `/app/*` y handlers ante cookie ausente/inválida o permiso insuficiente. **RED:** integración/E2E exige denegación sin datos ni mutación. **GREEN/REFACTOR:** middleware y handler pasan. **Rollback:** desactivar middleware/rutas.
- [ ] **GR-SHELL.2** Crear layout, dashboard, navegación, búsqueda, período, foco, Escape, carga y error. **RED:** RTL de teclado, foco y dependencia caída. **GREEN/REFACTOR:** componentes pasan sin autoridad de negocio. **Rollback:** revertir UI del slice.

**Definición de terminado GR-1:** contratos estables, shell accesible, amenazas aplicables en RED→GREEN y prueba enfocada con resultado guardado.

## Fase GR-2 — identidad y JSON

- [ ] **GR-ID.1** Implementar login/logout mock server-side, cinco roles, banner no productivo, actor derivado y auditoría. **RED:** login inválido, actor falsificado, sesión ausente y rol insuficiente. **GREEN/REFACTOR:** unitarias, HTTP y E2E negativo pasan. **Rollback:** desactivar auth moderna.
- [ ] **GR-JSON.1** Implementar schemas Zod, repositories por owner, bootstrap, versión, `temp + rename`, conflicto y API caída sin persistencia falsa. **RED:** archivo/payload inválido, versión obsoleta, fallo de rename y caché no confirmada. **GREEN/REFACTOR:** integración con directorio temporal pasa. **Rollback:** eliminar repositorios/data de prueba.

**Definición de terminado GR-2:** actor no proviene del cliente, cada owner es único, no existe fallback canónico y las pruebas de almacenamiento y seguridad pasan.

## Fase GR-3 — órdenes y privacidad

- [ ] **GR-ORDERS.0** Aprobar la política de desbloqueo antes de código. **TDD:** N/A; revisión documental y decisión de owner, exclusión de impresión, permiso y retención. **Bloquea:** GR-ORDERS.1 y GR-ORDERS.2. **Rollback:** revertir la decisión sin tocar runtime.
- [ ] **GR-ORDERS.1** Implementar alta, número único, grafo, presupuesto, stock/pago atómico e idempotencia. **RED:** duplicado, transición inválida, stock insuficiente, auditoría caída y reintento. **GREEN/REFACTOR:** unitarias/integración/E2E pasan. **Rollback:** rutas y owners del slice.
- [ ] **GR-ORDERS.2** Implementar preview, dos copias, sanitización y denegación. **RED:** prueba de no filtración y permiso insuficiente. **GREEN/REFACTOR:** RTL/E2E de impresión pasa. **Rollback:** UI/flag de impresión.

**Definición de terminado GR-3:** la política de desbloqueo está aprobada, órdenes no guardan secretos por defecto, efectos relacionados son consistentes y el rollback es demostrable.

## Fase GR-4 — stock y comercio

- [ ] **GR-STOCK.1** Implementar catálogo, movimientos, transferencia, compras, costo promedio y rollback. **RED:** rol insuficiente, stock insuficiente, origen doble y fallo parcial. **GREEN/REFACTOR:** unitarias e integración pasan.
- [ ] **GR-STOCK.2** Implementar ventas, pagos exactos, descuento único, devolución y anulación idempotentes. **RED:** pago incompleto, reintento y cantidades repetidas. **GREEN/REFACTOR:** integración/E2E pasa. **Rollback:** handlers, owners y datos sintéticos de comercio.

**Definición de terminado GR-4:** ningún pago incorrecto o reintento duplica stock, la transferencia reconcilia ambos balances y las denegaciones son auditables.

## Fase GR-5 — caja y reportes

- [ ] **GR-CASH.1** Implementar sesiones de caja, esperado determinista, netos, contabilidad y CSV. **RED:** fecha duplicada, caché no confirmada, devolución, gasto y filtro inválido. **GREEN/REFACTOR:** unitarias, integración y E2E pasan. **Rollback:** desactivar rutas y restaurar snapshot de prueba.

**Definición de terminado GR-5:** caja persiste por fecha, los reportes no aceptan snapshots locales como verdad y CSV/impresión repiten el resultado visible.

## Fase GR-6 — administración y respaldos

- [ ] **GR-ADMIN.1** Implementar árbol sin ciclos, roles, permisos, backup versionado y restore con punto de retorno. **RED:** rol insuficiente, backup corrupto y fallo parcial. **GREEN/REFACTOR:** unitarias, integración de corrupción y E2E de recuperación pasan. **Rollback:** restaurar snapshot anterior y desactivar rutas.

**Definición de terminado GR-6:** usuarios y permisos respetan principal, backups son verificables y restore/rollback conserva estado previo ante error.

## Fase GR-7 — paridad y migración

- [ ] **GR-PARITY.1** Implementar inventario, mapping, fixtures sintéticos, normalización y estado sin cutover. **RED:** ambigüedad, secreto, estado desconocido, API caída y cutover no autorizado. **GREEN/REFACTOR:** unitarias, replay de integración y E2E pasan. **Rollback:** eliminar mappings temporales; conservar legacy.

**Definición de terminado GR-7:** el dry-run es repetible y auditable, los conflictos bloquean, no se migran secretos ni producción y ninguna compuerta permite cutover prematuro.

## Gate común antes de marcar una unidad

- [ ] Dependencias y edit roots coinciden con la tarea aprobada.
- [ ] RED fue escrito antes del cambio y se conserva su evidencia.
- [ ] GREEN y TRIANGULATE ejecutaron el runner enfocado; REFACTOR quedó verde.
- [ ] Existe una prueba negativa de seguridad/propiedad cuando aplica.
- [ ] El resultado de runtime, o `N/A` documental explícito, está registrado.
- [ ] El rollback nombra archivos, ruta, flag o snapshot exactos.
- [ ] No se modificaron legacy, CI, PostgreSQL, despliegue, cutover, Engram ni `.codegraph/`.

## Enlaces de continuidad

La guía se mantiene con [`AGENTS.md`](AGENTS.md), [`constitution.md`](constitution.md), [`plan.md`](plan.md), [`stacks.md`](stacks.md) y [`spec.md`](spec.md), y con [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
