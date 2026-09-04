# Especificación del módulo shared-contracts

**Estado:** **Objetivo futuro (Future target)**. Este documento detalla los requisitos del módulo; nada de lo descrito está implementado. La autoridad de requisitos es la capability [`gestion-shared-contracts`](../../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md); este archivo solo añade detalle verificable.

## Alcance

Contratos usados por todos los handlers de `/api/gestion`: modelo de errores, idempotencia, auditoría mínima, tokens de estado canónicos y `JsonStore`. Fuera de alcance: la lógica de negocio de cada entidad y sus owners (ver la carpeta `docs/` de cada módulo).

## 1. Modelo de errores

### Requisito SC-E1: envelope estable de ocho códigos

Todo handler DEBE responder con un envelope único y los ocho códigos siguientes. **Objetivo futuro (Future target).**

| Código | HTTP | Cuándo aplica |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Payload malformado, esquema Zod inválido o estado desconocido. |
| `AUTHENTICATION_REQUIRED` | 401 | Sesión ausente, cookie inválida o vencida. |
| `FORBIDDEN` | 403 | Actor autenticado sin permiso para la acción o el recurso. |
| `NOT_FOUND_OR_FORBIDDEN` | 404 | Recurso inexistente o ajeno; no revela cuál de los dos. |
| `CONFLICT` | 409 | Clave idempotente con payload distinto, versión obsoleta o duplicado. |
| `DEPENDENCY_UNAVAILABLE` | 503 | Dependencia necesaria no disponible para decidir o persistir. |
| `STORAGE_ERROR` | 500 | Fallo de lectura, escritura o serialización del store. |
| `AUDIT_FAILURE` | 500 | Auditoría obligatoria no persistible: bloquea la mutación. |

Forma prevista del envelope de error:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload inválido.",
    "details": { "campos": ["clienteId"] }
  }
}
```

Forma prevista del envelope de éxito:

```json
{
  "ok": true,
  "data": { "venta": { "id": "v_1", "number": "0001-000123" } }
}
```

Los `details` están minimizados: sin credenciales, sin desbloqueo, sin PII innecesaria. Un error desconocido nunca informa éxito ni muta.

#### Escenario: validación inválida

- Dado un body malformado, cuando llega al límite HTTP, entonces responde `VALIDATION_ERROR` (400) y ningún owner de negocio cambia.
- Dado un navegador sin sesión, cuando solicita un recurso protegido, entonces responde `AUTHENTICATION_REQUIRED` (401) sin datos ni cookie nueva.
- Dado un `rename` fallido en el store, cuando se persiste, entonces responde `STORAGE_ERROR` (500) y el archivo vigente queda íntegro.

## 2. Idempotencia

### Requisito SC-I1: clave y hash en mutaciones repetibles

Las mutaciones repetibles DEBEN exigir una clave idempotente validada. El servidor calcula el hash del payload normalizado y guarda la correspondencia clave→resultado server-side. **Objetivo futuro (Future target).**

- Repetición exacta (misma clave + mismo hash): devuelve el resultado original sin reejecutar el efecto.
- Misma clave con payload distinto: responde `CONFLICT` (409) y no muta.
- Clave ausente o malformada: `VALIDATION_ERROR`.
- El registro idempotente vive en el servidor; el cliente nunca es su owner.

#### Escenario: replay exacto

- Dado un comando de venta confirmado con clave `k-1`, cuando se reintenta con la misma clave y el mismo payload, entonces se devuelve el resultado original y existe un solo movimiento y un solo evento de auditoría.

#### Escenario: replay conflictivo

- Dado una clave `k-1` ya usada, cuando llega un payload distinto con esa misma clave, entonces responde `CONFLICT` (409) y ningún owner cambia.

## 3. Auditoría mínima

### Requisito SC-A1: evento en `data/audit.json`

Toda mutación, denegación relevante y rollback DEBE registrar un evento con este esquema previsto. **Objetivo futuro (Future target).**

```json
{
  "id": "a_000001",
  "actorId": "u_1",
  "accion": "ventas.create",
  "entidad": "ventas",
  "entidadId": "v_1",
  "instante": "2026-09-04T12:00:00.000Z",
  "resultado": "ok",
  "detalles": { "total": 1500 }
}
```

- `actorId` proviene siempre de la sesión validada; es `null` cuando no hay actor.
- `instante` es ISO-8601 en UTC, provisto por el servidor.
- `resultado` es `ok` o uno de los ocho códigos de error.
- `detalles` están minimizados: sin credenciales, secretos ni desbloqueo.
- Si la auditoría obligatoria no puede persistirse, el handler responde `AUDIT_FAILURE` y la mutación queda bloqueada; nunca se anuncia éxito.

#### Escenario: auditoría fallida bloquea

- Dado un store de auditoría no disponible, cuando un actor autorizado confirma una mutación, entonces responde `AUDIT_FAILURE` (500) y el owner de negocio permanece sin cambios.

## 4. Tokens de estado canónicos

### Requisito SC-S1: catálogo de once estados de reparación

Los estados persistidos DEBEN pertenecer al catálogo sin acentos; la UI PUEDE mostrar etiquetas con acentos. **Objetivo futuro (Future target).**

| Token canónico | Etiqueta de UI referencial |
|---|---|
| `en_diagnostico` | En diagnóstico |
| `presupuestado` | Presupuestado |
| `esperando_aprobacion` | Esperando aprobación |
| `aprobado` | Aprobado |
| `esperando_repuesto` | Esperando repuesto |
| `en_reparacion` | En reparación |
| `control_calidad` | Control de calidad |
| `listo_para_retirar` | Listo para retirar |
| `finalizado` | Finalizado |
| `entregado` | Entregado |
| `cancelado` | Cancelado |

Regla de normalización: minúsculas, sin acentos (NFD + eliminación de diacríticos) y espacios reemplazados por `_`. Una entrada equivalente con acento se normaliza antes de persistir; un estado fuera del catálogo bloquea la mutación con `VALIDATION_ERROR`.

#### Escenario: estado acentuado

- Dado una entrada heredada `En reparación`, cuando se normaliza, entonces se persiste `en_reparacion` y la UI muestra la etiqueta con acento.

#### Escenario: estado desconocido

- Dado un estado `EN-DESPACHO` fuera del catálogo, cuando se valida la mutación, entonces responde `VALIDATION_ERROR` y nada se persiste.

## 5. Contrato del `JsonStore`

### Requisito SC-J1: archivo versionado con escritura atómica

El `JsonStore` es el mecanismo compartido que los repositorios usan sobre `data/*.json`. **Objetivo futuro (Future target).**

- Cada documento guarda una `version` monotónica que solo aumenta.
- Toda escritura escribe un archivo temporal `*.tmp` y ejecuta `rename` sobre el destino: nunca existe un archivo parcialmente observable.
- Un `rename` fallido deja el archivo vigente íntegro y el repositorio responde `STORAGE_ERROR`.
- Escritura concurrente: el writer que parte de versión obsoleta recibe `CONFLICT` (409); el vigente gana. No hay mezcla de contenido.
- Una lectura de archivo ausente o inválido no se convierte en colección vacía aceptada: es error del store.

#### Escenario: escritura atómica

- Dado un documento en versión 4, cuando un repositorio autorizado persiste un cambio válido, entonces queda versión 5 completa y legible tras reinicio, sin `.tmp` residual observable.

#### Escenario: concurrencia

- Dado dos writers con versión 4, cuando ambos persisten, entonces exactamente uno produce versión 5 y el otro recibe `CONFLICT` (409) sin corromper el archivo.

## Fuera de alcance

- Grafo de transiciones de órdenes (módulo `orders/`), permisos por rol (módulo `identity-login/`), owners por entidad (módulo `data-json/`).

## Enlaces

- Autoridad local: [`../spec.md`](../spec.md), [`../plan.md`](../plan.md) y [`../tasks.md`](../tasks.md).
- Capacidad: [`gestion-shared-contracts`](../../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md).
