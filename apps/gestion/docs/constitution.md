# Constitución local de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Estas reglas son normativas para la futura aplicación de gestión. Heredan la constitución raíz y no demuestran que el runtime, sus datos o sus controles ya existan.

## Herencia y autoridad

Esta constitución **DEBE** leerse junto con [`../../../constitution.md`](../../../constitution.md), que es la autoridad normativa del sistema completo. Este documento especializa sus principios para `apps/gestion`, pero no puede debilitarlos, anticipar una compuerta ni convertir una referencia heredada en garantía.

La autoridad funcional está distribuida así:

- Procedimiento: [`AGENTS.md`](AGENTS.md) y [`../../../AGENTS.md`](../../../AGENTS.md).
- Comportamiento: [`spec.md`](spec.md) y [`../../../spec.md`](../../../spec.md).
- Secuencia: [`plan.md`](plan.md) y [`../../../plan.md`](../../../plan.md).
- Evidencia: [`tasks.md`](tasks.md) y [`../../../tasks.md`](../../../tasks.md).
- Tecnología prevista: [`stacks.md`](stacks.md).

Las etiquetas obligatorias son **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** y **Objetivo futuro (Future target)**. La documentación, un mock, una ruta visible o un plan no prueban implementación.

## Principios no negociables

### 1. Actor derivado por el servidor

1. Todo request protegido **DEBE** autenticar antes de leer o mutar.
2. El handler **DEBE** derivar el actor desde una sesión server-side validada.
3. `actorId`, rol, permiso o propietario enviado por el cliente **NO DEBE** establecer identidad.
4. La interfaz puede mostrar una identidad derivada, pero nunca es su propietaria.
5. Una ausencia, caducidad o invalidez de sesión **DEBE** fallar cerradamente.

### 2. Un owner JSON por entidad

1. Cada entidad persistente **DEBE** nombrar exactamente un owner server-side.
2. En desarrollo, los owners viven en `data/*.json` y se modifican mediante repositorios.
3. Componentes, cachés, fixtures, backups y `localStorage` **NO DEBEN** competir como owners.
4. Las escrituras relacionadas **DEBEN** usar atomicidad, versión, idempotencia o un protocolo documentado.
5. PostgreSQL solo podrá reemplazar el store detrás de la misma interfaz de repositorio, después de sus compuertas.

### 3. Fallo cerrado

Si falta identidad, permiso, validación, owner, dependencia, consistencia o auditoría obligatoria, la operación **DEBE** devolver un error estable y **NO DEBE** declarar éxito durable ni mutar parcialmente. Un recurso inexistente o ajeno no debe filtrarse mediante mensajes ambiguos.

### 4. Auditoría mínima

`audit.json` es el owner de desarrollo para el registro mínimo. Toda mutación, denegación relevante, validación de seguridad y rollback **DEBE** registrar actor confiable o ausencia, acción, entidad, instante, resultado y detalles minimizados. La auditoría **NO DEBE** contener credenciales, secretos, desbloqueos ni PII innecesaria.

Si la auditoría obligatoria falla, el handler **DEBE** devolver `AUDIT_FAILURE` o el estado excepcional aprobado; nunca debe ocultar el fallo detrás de una respuesta exitosa.

### 5. Idempotencia y conflictos

Las mutaciones repetibles **DEBEN** aceptar una clave idempotente validada. La misma clave y el mismo hash de payload **DEBEN** devolver el resultado original. La misma clave con payload distinto **DEBE** devolver `CONFLICT`. Un reintento incierto no puede crear doble cobro, doble número, doble movimiento, doble stock ni auditoría accidental.

### 6. Estado canónico sin acentos

Los tokens persistidos **DEBEN** usar el vocabulario canónico sin acentos definido por la especificación de órdenes. La interfaz **PUEDE** mostrar etiquetas acentuadas o traducidas, pero nunca debe persistirlas como estados de dominio. Un estado desconocido o una variante no reconciliada **DEBE** bloquear la mutación.

### 7. Privacidad de datos de desbloqueo

Los códigos, contraseñas y patrones de desbloqueo son datos restringidos. Por defecto **NO DEBEN** guardarse en `ordenes.json`, respuestas, auditoría, fixtures ni impresión. La decisión previa a órdenes debe elegir exclusión definitiva o un owner restringido `datos-desbloqueo.json`, con permiso reforzado, minimización, retención, auditoría y pruebas de no filtración. Sin decisión aprobada, se omiten y se bloquea la excepción.

### 8. Identidad mock no productiva

La sesión mock de desarrollo debe mostrar de forma visible **“modo desarrollo, no productivo”**. No puede presentarse como autenticación productiva, autorizar un despliegue ni almacenar secretos reales. La sustitución por identidad productiva requiere una decisión y compuertas separadas.

### 9. Pruebas como compuerta

Ningún slice de código puede fusionarse sin sus pruebas positivas y negativas apropiadas. Strict TDD exige **RED → GREEN → TRIANGULATE → REFACTOR**. La evidencia debe incluir pruebas de autorización, propiedad, consistencia, rollback, privacidad e idempotencia cuando correspondan. Un test de UI o un mock de cliente no reemplaza la prueba del handler.

### 10. Presupuesto de revisión

La cadena usa PRs de hasta 400 líneas. El presupuesto organiza slices; no autoriza code-golf, borrar comentarios, reducir pruebas ni comprimir documentación. Si un slice cohesivo excede el límite, se divide por una frontera reversible o se reporta `size:exception` con aprobación explícita.

### 11. Legado, secretos y producción

`sistema-gestion/` y `pagina-web/` son **Comportamiento de referencia (Reference behavior)** y deben permanecer intactos. No se copian su identidad proporcionada por cliente, fallback local, credenciales ni autorización de interfaz. No se confirman secretos, datos de producción, seeds sensibles, tokens ni credenciales temporales.

### 12. Reversión demostrable

Cada slice **DEBE** declarar una frontera de rollback que pueda revertirse sin eliminar trabajo no relacionado. Un fallo de pruebas, backup, restore, replay, auditoría o seguridad bloquea la promoción. Esta documentación no autoriza cutover, despliegue ni retiro del legado.

## Checklist normativo por mutación

- [ ] Actor derivado y validado en el servidor.
- [ ] Acción y recurso autorizados con mínimo privilegio.
- [ ] Entrada validada antes del dominio y la persistencia.
- [ ] Owner JSON único y versión/conflicto definidos.
- [ ] Auditoría mínima sin secretos.
- [ ] Reintento idempotente o conflicto determinista.
- [ ] Fallo cerrado y rollback probado.
- [ ] Pruebas positivas y negativas del slice ejecutadas.

## Enlaces de continuidad

La aplicación se gobierna junto con [`AGENTS.md`](AGENTS.md), [`plan.md`](plan.md), [`stacks.md`](stacks.md), [`spec.md`](spec.md) y [`tasks.md`](tasks.md), además de [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
