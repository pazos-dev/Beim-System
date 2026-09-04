# Tareas del módulo shared-contracts

**Estado:** **Objetivo futuro (Future target)**. Esta lista planifica la unidad GR-SHARED.1; ninguna tarea de código está iniciada. El checklist local de la fase vive en [`../tasks.md`](../tasks.md).

## GR-SHARED.1 — contratos transversales con TDD estricto

Dependencias: GR-0 (documentación) y la compuerta de calidad del workspace según [`../plan.md`](../plan.md).

### Ciclo RED — pruebas primero

Escribir y ejecutar estas pruebas antes de implementar; todas deben fallar por ausencia del comportamiento:

- [ ] RED-01 `VALIDATION_ERROR`: body malformado responde 400 y no muta ningún owner.
- [ ] RED-02 `AUTHENTICATION_REQUIRED`: sin cookie responde 401 sin datos.
- [ ] RED-03 `FORBIDDEN`: actor autenticado sin permiso responde 403 y registra evento de seguridad.
- [ ] RED-04 `NOT_FOUND_OR_FORBIDDEN`: recurso ajeno responde 404 sin revelar existencia.
- [ ] RED-05 `CONFLICT`: writer con versión obsoleta responde 409 y el archivo queda íntegro.
- [ ] RED-06 `DEPENDENCY_UNAVAILABLE`: dependencia caída responde 503 sin éxito parcial.
- [ ] RED-07 `STORAGE_ERROR`: serialización o `rename` fallido responde 500 sin mezcla de contenido.
- [ ] RED-08 `AUDIT_FAILURE`: auditoría no disponible bloquea la mutación y responde 500.
- [ ] RED-09 Replay exacto: misma clave + mismo hash devuelve el resultado original sin segundo efecto.
- [ ] RED-10 Replay conflictivo: misma clave + payload distinto responde `CONFLICT` sin mutar.
- [ ] RED-11 Auditoría fallida: la operación no se anuncia como exitosa en ninguna respuesta.
- [ ] RED-12 Normalización de estados: `En reparación` → `en_reparacion`; estado desconocido bloquea con 400.
- [ ] RED-13 Atomicidad: `tmp + rename` produce versión monotónica; `rename` fallido deja el archivo vigente legible.

### Ciclo GREEN — implementación mínima

- [ ] Implementar el mínimo: envelope de respuesta, registro idempotente server-side, escritura de eventos en `data/audit.json`, catálogo y normalización de tokens, y `JsonStore` con `tmp + rename`.
- [ ] Ejecutar la prueba enfocada hasta verde antes de pasar a la siguiente.

### TRIANGULAR y REFACTOR

- [ ] Agregar un caso positivo (comando que muta, audita y responde `ok`) y un caso de borde (payload vacío con clave repetida).
- [ ] REFACTOR nombres y duplicación sin cambiar comportamiento; suite enfocada en verde.

### Evidencia

```bash
pnpm --dir apps/gestion test -- --run src/server
```

Registrar comando, salida exacta y estado de la compuerta en la evidencia de la unidad. **Objetivo futuro (Future target):** el comando requiere el scaffold del paquete.

### Definición de done

- Los ocho códigos responden con HTTP y envelope estables; el replay exacto y el conflictivo son deterministas; `AUDIT_FAILURE` bloquea; el catálogo normaliza equivalentes y bloquea desconocidos; el store es atómico y versionado.
- Existe al menos una prueba negativa por frontera y la evidencia queda registrada con su salida.

### Rollback

Eliminar únicamente los archivos del slice: contratos, pruebas y datos de prueba creados por la unidad. No tocar legado, owners de otros módulos, CI ni configuración del workspace.

## Enlaces

- [`../tasks.md`](../tasks.md) — checklist local GR-SHARED.1 y gate común.
- [`spec.md`](spec.md) — requisitos detallados de este módulo.
- [`../../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md`](../../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md) — autoridad de requisitos.
