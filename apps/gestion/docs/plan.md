# Plan de slices de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Este plan ordena la reconstrucción prevista; ninguna etapa se considera implementada por la existencia de este documento. La autoridad de secuencia del sistema completo es [`../../../plan.md`](../../../plan.md).

## Ruta rápida

1. Completar la documentación local y fijar los límites de trabajo.
2. Superar las compuertas de calidad del workspace antes de migrar funcionalidad.
3. Construir contratos compartidos, shell e identidad server-side.
4. Introducir el store JSON con ownership único y atomicidad.
5. Implementar órdenes, comercio, caja, reportes y administración por cortes verticales.
6. Cerrar con paridad aislada y migración sin cutover.

La secuencia técnica sigue el diseño de [`../../../openspec/changes/gestion-rebuild/design.md`](../../../openspec/changes/gestion-rebuild/design.md): `shared-contracts → app-shell → mock-identity → json-data → orders-workflow → stock-commerce → cash-reports → admin-backups → parity-migration`.

## Precondición transversal: workspace

**Línea base observada (Observed baseline):** la documentación raíz registra que faltan `generate`, paquetes importados y compuertas limpias de typecheck, test y build. Según [`../../../plan.md`](../../../plan.md), la instalación reproducible, `pnpm generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` deben pasar en un checkout limpio antes de promover funcionalidad. Un slice de gestión no puede reinterpretar esos fallos como éxito local.

La aplicación local no puede declarar una compuerta de workspace satisfecha por tener una prueba aislada. La evidencia debe incluir versión de Node/pnpm, checkout limpio, salida exacta y ausencia de secretos. Si la compuerta falla, el slice puede conservar documentación o pruebas RED, pero no habilitar una mutación protegida ni un cambio de propietario.

## Roles documentales durante la secuencia

Cada documento conserva un límite para evitar decisiones implícitas:

| Documento | Pregunta que responde | No puede hacer |
|---|---|---|
| `AGENTS.md` | ¿Cómo se trabaja y se valida? | No define reglas de negocio nuevas. |
| `constitution.md` | ¿Qué reglas no se pueden relajar? | No sustituye pruebas de runtime. |
| `spec.md` | ¿Qué debe observar la persona usuaria y el servidor? | No ordena la migración. |
| `plan.md` | ¿Qué slice puede seguir y con qué gate? | No declara un slice implementado. |
| `stacks.md` | ¿Qué tecnología y límites se prevén? | No prueba que un paquete esté instalado. |
| `tasks.md` | ¿Qué unidad se ejecuta y qué evidencia falta? | No autoriza tareas fuera del alcance. |

Una revisión debe empezar por la fila del slice, seguir sus dependencias, consultar la capability correspondiente y terminar en el checklist de tareas. Las contradicciones se elevan al documento de mayor autoridad; nunca se resuelven cambiando una palabra en un documento subordinado.

## Secuencia GR-0 a GR-7

Cada fila es una frontera de entrega. El gate exige pruebas apropiadas, una prueba negativa de seguridad o propiedad cuando el slice cruza una frontera protegida, y rollback explícito.

| Slice | Contenido y dependencia | Gate de aceptación | Rollback |
|---|---|---|---|
| **GR-0** | Documentación local; depende de la base raíz. Incluye GR-0.1. | Enlaces, etiquetas de estado, roles de documentos y `git diff --check`; N/A de runtime. | Eliminar solo `apps/gestion/docs/` y revertir el checkbox de GR-0.1. |
| **GR-1** | `gestion-shared-contracts` y `gestion-app-shell`; depende de GR-0 y de calidad del workspace. | Unitarias de envelopes/idempotencia/auditoría; RTL de shell; RED de sesión ausente, permiso insuficiente y dependencia caída. | Desactivar rutas/presentación nuevas; conservar solo documentación y legado. |
| **GR-2** | `gestion-mock-identity` y `gestion-json-data`; depende de GR-1. | Unitarias e integración HTTP de login, actor falsificado, Zod, owner, versión, conflicto y `AUDIT_FAILURE`; ninguna mutación sin sesión. | Desactivar login/rutas modernas y eliminar el store JSON del slice; no tocar legado. |
| **GR-3** | `gestion-orders-workflow`; depende de GR-2 y de la decisión de desbloqueo GR-ORDERS.0. | Dominio e integración de grafo, numeración, pagos, stock, reintento, privacidad e impresión; E2E negativo sin permiso y sin secreto. | Desactivar rutas de órdenes/impresión y restaurar snapshot JSON; no copiar fallback. |
| **GR-4** | `gestion-stock-commerce`; depende de GR-3. | Unitarias e integración de costo ponderado, transferencia, pago exacto, rollback, devolución y anulación idempotente; E2E de rol insuficiente. | Revertir handlers/repositorios de comercio y restaurar owners JSON del slice. |
| **GR-5** | `gestion-cash-reports`; depende de GR-4. | Unitarias de esperado, netos y contabilidad; integración de caja; E2E/negativa de fecha duplicada, caché no confirmada y exportación. | Desactivar caja/reportes nuevos y restaurar `sesiones-caja.json` y snapshot de prueba. |
| **GR-6** | `gestion-admin-backups`; depende de GR-5 e identidad. | Unitarias de árbol/permisos; integración de backup, corrupción y restore; negativa de rol y rollback ante fallo parcial. | Desactivar rutas administrativas y restaurar el snapshot previo con auditoría. |
| **GR-7** | `gestion-parity-migration`; depende de GR-6 y GR-ORDERS.0. | Inventario, mapping explícito, fixtures sintéticos, replay, detección de secretos, estados canónicos y bloqueo de cutover; E2E de dependencia caída. | Eliminar mappings/fixtures temporales, conservar fuentes y no modificar legado ni owners canónicos. |

## Bloqueos y dependencias detalladas

- La decisión de datos de desbloqueo **GR-ORDERS.0** bloquea el código de `GR-ORDERS.1` y `GR-ORDERS.2`; también limita cualquier mapping de paridad relacionado.
- La identidad y la autorización de GR-1/GR-2 bloquean toda mutación posterior. La UI no puede adelantar un handler seguro.
- La disponibilidad de `data/*.json`, schemas, versión e idempotencia bloquea órdenes, comercio, caja y administración.
- El fallo de una compuerta de workspace según el plan raíz bloquea la promoción de slices funcionales, aunque una prueba aislada pase.
- Un resultado de prueba negativo, auditoría fallida, backup no restaurable, conflicto no determinista o secreto detectado bloquea la etapa correspondiente.

## Evidencia mínima por compuerta

Antes de pasar de una frontera a la siguiente, la evidencia debe responder a estas preguntas:

1. **Identidad:** ¿el actor se deriva en servidor y qué ocurre sin cookie, con cookie inválida o con actor falsificado?
2. **Propiedad:** ¿qué archivo es el único owner y qué prueba demuestra que un caché o fixture no puede escribirlo?
3. **Entrada:** ¿el payload, la versión, la clave idempotente y las referencias se validan antes de la mutación?
4. **Consistencia:** ¿qué ocurre ante concurrencia, dependencia caída, `rename` fallido o auditoría no disponible?
5. **Privacidad:** ¿qué campos se excluyen de la respuesta, la auditoría, los fixtures y la impresión?
6. **Reversión:** ¿qué snapshot, flag, ruta o archivo se restaura y cómo se comprueba que el estado previo sigue legible?

Las respuestas deben quedar en pruebas o recibos de la unidad. Una descripción en este plan solo es intención futura.

## Subunidades y owners previstos

| Subunidad | Owner primario | Límite de cambio |
|---|---|---|
| GR-SHARED | `handleGestionRequest` y auditoría | Contratos de error, hash, replay y tokens. |
| GR-SHELL | middleware, bootstrap y presentación | Routing, consulta, foco y estados visibles. |
| GR-ID | `AuthHandler` y repositorios de usuarios | Sesión, actor, roles y permisos. |
| GR-JSON | `EntityRepository` y `JsonStore` | Schemas, versión, atomicidad y owners. |
| GR-ORDERS | `OrderHandler` y dominio de órdenes | Orden, pagos, stock y privacidad. |
| GR-STOCK | `CommerceHandler` y dominio de inventario | Catálogo, compras, transferencias y ventas. |
| GR-CASH | `CashHandler` y `ReportQueryHandler` | Caja, reportes, contabilidad y CSV. |
| GR-ADMIN | `AdminHandler` y backup repository | Menú, usuarios, permisos y restore. |
| GR-PARITY | `MigrationHandler` | Inventario, fixtures, mapping y estado sin cutover. |

Un owner de aplicación no puede extender su límite para “resolver” la ausencia de otro slice. Si una operación cruza varias entidades, debe declarar la coordinación, el protocolo de consistencia y la auditoría en su propia unidad.

## Entrega y revisión

La entrega usa una cadena `feature-branch-chain`: PR inicial contra la rama de seguimiento y cada PR posterior contra el PR inmediato anterior; el PR agregado llega a `main` solo por el flujo aprobado. Cada PR debe ser una unidad autónoma de hasta 400 líneas, con pruebas y documentación pertinentes, comando exacto, resultado y rollback. Si una unidad cohesiva supera el presupuesto, se divide por límite funcional; no se elimina evidencia para alcanzar el número.

**GR-0.1** es exclusivamente documental. Su gate no ejecuta runtime, no crea paquete, no agrega configuración y no modifica carpetas heredadas. La cuenta real de líneas y cualquier `size:exception` se registran en la evidencia de apply, no se ocultan.

La cadena se detiene después de cada PR para revisión independiente. Un PR posterior solo puede asumir contratos y archivos que existan en su base; no puede leer una intención futura como si fuera una dependencia satisfecha. Las pruebas de un slice permanecen junto a la conducta que verifican y los documentos se actualizan cuando cambia el owner, el error, la política de privacidad o el rollback.

El cierre de un slice no equivale al cierre de la aplicación. La etiqueta sigue siendo **Objetivo futuro (Future target)** hasta que las compuertas del plan raíz y de la unidad local aporten evidencia reciente. Una comprobación documental exitosa solo prueba formato, enlaces o alcance documental.

## Fuera de alcance de este plan local

- Base de datos PostgreSQL y migraciones productivas.
- Autenticación productiva, proveedor de identidad y secretos de producción.
- Despliegue, release, promoción, smoke productivo y ejecución de migraciones.
- Cambios en la web pública, `pagina-web/` o `sistema-gestion/`.
- Cutover, retiro del legado y conversión de `localStorage` en fuente canónica.
- Restauración de aplicaciones o paquetes ausentes no aprobados por el plan raíz.

## Enlaces de continuidad

Este plan se interpreta con [`AGENTS.md`](AGENTS.md), [`constitution.md`](constitution.md), [`stacks.md`](stacks.md), [`spec.md`](spec.md) y [`tasks.md`](tasks.md), y con [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
