# Especificación: gestion-shared-contracts

## Propósito

Fijar convenciones pequeñas y comunes de errores, idempotencia, auditoría y estados para los ocho slices.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** las fronteras heredadas mezclan errores, reintentos, estados acentuados y auditoría parcial.
- **Comportamiento de referencia (Reference behavior):** ventas, retornos, anulaciones, pagos y transferencias cruzan varias entidades y requieren resultados repetibles.
- **Objetivo futuro (Future target):** todos los handlers de gestión DEBEN compartir contratos estables sin relajar autorización ni ownership.

## Requisitos

### Requisito: Modelo de error estable

Los handlers DEBEN distinguir `VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `NOT_FOUND_OR_FORBIDDEN`, `CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `STORAGE_ERROR` y `AUDIT_FAILURE`, con respuesta estable y sin filtrar datos. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: servidor según sesión; entrada validada: código, recurso, acción y detalles minimizados; owner JSON de escritura: ninguno para la respuesta, `audit.json` si corresponde; éxito/error: envelope determinista; fallo cerrado: error desconocido no informa éxito ni muta. Prueba: unitarias de mapping e integración HTTP.

#### Escenario: Validación inválida

- Dado un body malformado, cuando llega al límite, entonces devuelve `VALIDATION_ERROR` y no escribe el owner de negocio.

### Requisito: Idempotencia de mutaciones

Las mutaciones repetibles DEBEN aceptar una clave idempotente validada y devolver el resultado original ante repetición exacta; una misma clave con payload distinto DEBE producir conflicto. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: principal derivado y permiso de acción; entrada validada: clave, payload y entidad; owner JSON de escritura: owner del hecho y registro idempotente server-side; éxito/error: un efecto o `CONFLICT`; fallo cerrado: reintento incierto no crea segundo cobro, número, stock o auditoría no intencional. Prueba: unitarias e integración concurrente.

#### Escenario: Repetición exacta o rol insuficiente

- Dado un comando confirmado o un actor sin permiso, cuando se repite con la misma clave, entonces retorna la respuesta original o denegación sin nueva mutación.

### Requisito: Auditoría mínima y estados sin acentos

Toda mutación, denegación relevante, validación de seguridad y rollback DEBE registrar actor confiable, acción, entidad, instante, resultado y detalles minimizados; los estados persistidos DEBEN usar tokens canónicos sin acentos, aunque la UI PUEDE mostrar etiquetas acentuadas. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: límite server-side; entrada validada: evento y token de estado contra catálogo; owner JSON de escritura: `audit.json` y owner de la entidad; éxito/error: evento y estado válidos o `AUDIT_FAILURE`/validación; fallo cerrado: auditoría obligatoria no disponible bloquea la mutación. Prueba: unitarias de normalización e integración de rollback/auditoría.

#### Escenario: Estado acentuado o auditoría fallida

- Dado un estado equivalente con acento o auditoría no disponible, cuando se valida una mutación, entonces se normaliza y persiste, o se bloquea sin mutar.
