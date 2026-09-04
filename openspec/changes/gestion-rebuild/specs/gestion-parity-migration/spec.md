# Especificación: gestion-parity-migration

## Propósito

Definir inventario, mapping, fixtures sintéticos, reconciliación y retiro controlado del fallback sin cutover.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** `localStorage`, `sessionStorage`, payloads de boleta y snapshots heredados duplican estado y contienen claves de migración.
- **Comportamiento de referencia (Reference behavior):** la gestión hidrata desde API y conserva datos locales cuando falla; los estados aparecen con y sin acentos.
- **Objetivo futuro (Future target):** la paridad será una operación aislada y auditable; no migrará producción ni convertirá cachés en canónicos.

## Requisitos

### Requisito: Inventario y mapping explícito

La migración DEBE inventariar claves, payloads, campos, estados y relaciones heredadas, y DEBE mapear cada origen a una entidad JSON o marcarlo como descartado/ambiguo. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador principal o operador de migración; entrada validada: inventario con origen, versión y clasificación; owner JSON de escritura: `migration-map.json`, nunca los datos canónicos; éxito/error: mapping revisable o bloqueo por ambigüedad; fallo cerrado: entrada no inventariada no se importa. Prueba: Vitest de cobertura del mapping e integración dry-run.

#### Escenario: Mapping completo o rol insuficiente

- Dado un inventario sintético o un operador sin permiso, cuando se ejecuta el dry-run, entonces se produce mapping revisable o se deniega sin escribirlo.

#### Escenario: Ambigüedad

- Dado un campo presente en dos fuentes con valores distintos, cuando se reconcilia, entonces se marca conflicto y no se elige una fuente silenciosamente.

### Requisito: Fixtures seguros y estados canónicos

Los fixtures DEBEN ser sintéticos, no contener secretos ni datos reales, y DEBEN reconciliar estados con/sin acentos a un vocabulario canónico sin acentos, preservando la etiqueta visible original solo cuando sea necesaria. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: operador de migración en entorno aislado; entrada validada: fixture, detector de secreto y tabla de normalización; owner JSON de escritura: `fixtures/` y owners de prueba aislados; éxito/error: fixture reproducible o rechazo; fallo cerrado: secreto, PII real o estado desconocido no se escribe. Prueba: unitarias de sanitización y replay de integración.

#### Escenario: Estado equivalente

- Dado un fixture con variantes acentuadas del mismo estado, cuando se normaliza, entonces produce un único valor canónico y conserva trazabilidad de la transformación.

#### Escenario: Secreto detectado

- Dado un payload que contiene credenciales o desbloqueo real, cuando se prepara el fixture, entonces se rechaza y no queda copia en fixtures ni auditoría.

### Requisito: Retiro del fallback y no cutover

La política DEBE declarar cuándo el fallback offline queda solo como borrador/caché, qué evidencia habilita su retiro y qué compuerta bloquea producción; este cambio NO DEBE ejecutar cutover ni migración productiva. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: principal y compuerta de release; entrada validada: entorno, flag, evidencia de replay, respaldo y rollback; owner JSON de escritura: `migration-state.json`; éxito/error: estado de política registrado o bloqueo; fallo cerrado: API caída, evidencia faltante o entorno productivo impide declarar persistencia o retirar legado. Prueba: integración de replay y E2E de dependencia caída/cutover bloqueado.

#### Escenario: API caída

- Dado el fallback clasificado como borrador, cuando falla el servidor, entonces la interfaz conserva el borrador etiquetado y no crea un hecho durable.

#### Escenario: Intento no autorizado de cutover

- Dado un operador sin autorización, un entorno productivo o una compuerta incompleta, cuando se solicita cutover, entonces se bloquea y se conserva el legado sin modificación.
