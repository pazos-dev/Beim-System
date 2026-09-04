# Unidades de trabajo y evidencia

Este documento es la autoridad de la lista ejecutable para restaurar, construir y migrar Beim-System-Tech. Cada unidad tiene una frontera revisable, un propietario, una dependencia, evidencia de aceptación y un límite de rollback. Una tarea pendiente no puede tratarse como capacidad implementada.

Consulta [`AGENTS.md`](AGENTS.md) para el procedimiento, [`constitution.md`](constitution.md) para las reglas obligatorias, [`spec.md`](spec.md) para el comportamiento, y [`plan.md`](plan.md) para la secuencia y las compuertas. La base documental se completa con esos cuatro documentos y este archivo.

## Convenciones de ejecución

- `[x]` significa que la evidencia indicada está disponible en el checkout actual; `[ ]` significa pendiente.
- `Línea base observada (Observed baseline)` describe hechos actuales. `Comportamiento de referencia (Reference behavior)` describe legado útil para compatibilidad. `Objetivo futuro (Future target)` requiere la aceptación indicada.
- Cada unidad debe ejecutarse en una sesión o commit revisable, registrar el comando exacto y su resultado, y no incluir limpieza no relacionada.
- `N/A — documental` es un límite de runtime explícito, no una prueba de ejecución.
- Ninguna unidad autoriza borrar o reconstruir Engram, `.codegraph/` o `.atl/`; su mantenimiento es un cambio separado y explícitamente aprobado.

## Evidencia inicial y alcance documental

| ID | Estado | Dependencias | Propietario / frontera | Archivos | Aceptación | Evidencia | Rollback |
|---|---|---|---|---|---|---|---|
| DOC-01 | [x] | — | Documentación / cinco documentos raíz | `AGENTS.md`, `constitution.md`, `spec.md` | Las autoridades, etiquetas y límites de alcance están definidos; `pagina-web/` y `sistema-gestion/` quedan como referencia y `apps/gestion` como transicional. | Lectura cruzada de los tres documentos existentes y de `openspec/changes/system-foundation/`; enlaces raíz verificables. | Revertir solo los cambios documentales de la fundación. |
| DOC-02 | [x] | DOC-01 | Arquitectura y delivery / plan y tareas | `plan.md`, `tasks.md`, `AGENTS.md`, `constitution.md` | Plan y tareas enlazan los cinco documentos, registran fallos actuales, ordenan etapas y no declaran objetivos ausentes como implementados. | `git diff --check -- plan.md tasks.md AGENTS.md constitution.md`; revisión de enlaces, etiquetas y alcance. | Revertir únicamente estos cuatro archivos; no tocar código ni almacenes operativos. |

## Fase 1 — Restauración del workspace y calidad

Estas unidades preceden a identidad y funcionalidad. El estado actual es **Línea base observada (Observed baseline)**: `pnpm-workspace.yaml` incluye solo `apps/*`, faltan paquetes importados por `apps/gestion`, no existe `pnpm generate` en el root y están registrados fallos de typecheck, tests y build.

| ID | Estado | Dependencias | Propietario / frontera | Archivos | Aceptación | Evidencia | Rollback |
|---|---|---|---|---|---|---|---|
| WS-01 | [ ] | DOC-02 | Arquitectura de workspace / raíz | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml` | Inventario aprobado de apps, paquetes, scripts, dependencias y outputs; ninguna ruta del README se toma como existente sin evidencia. | Tabla de workspace y `pnpm list --depth -1` en checkout limpio; resultado guardado. | Revertir solo el inventario o su cambio de configuración. |
| WS-02 | [ ] | WS-01 | Workspace / límites de paquetes | `pnpm-workspace.yaml`, `packages/*/package.json`, `apps/*/package.json`, `pnpm-lock.yaml` | Los workspaces futuros necesarios existen con manifiestos coherentes o quedan explícitamente fuera; `pnpm install --frozen-lockfile` resuelve `@beim/data` y `@beim/contracts`. | Instalación limpia y `pnpm -r list`; cero importaciones internas no resolubles. | Revertir los manifiestos, globs y lockfile de esta unidad. |
| WS-03 | [ ] | WS-02 | Build graph / raíz y apps | `package.json`, `turbo.json`, `packages/*/package.json`, `apps/gestion/package.json` | `generate` existe donde corresponde, sus entradas/salidas están declaradas y el orden de Turbo es reproducible sin conexión a una base real. | `pnpm generate` y `pnpm turbo run build --dry`; salida y versiones registradas. | Revertir scripts y configuración de graph; no eliminar archivos generados de terceros. |
| QL-01 | [ ] | WS-03 | Calidad / workspace completo | `package.json`, `pnpm-lock.yaml`, `.github/workflows/ci.yml` | Checkout limpio instala y ejecuta la secuencia declarada sin depender de artefactos locales. | `pnpm install --frozen-lockfile`; comando, versión de Node/pnpm y resultado. | Revertir cambios de precondiciones de instalación. |
| QL-02 | [ ] | QL-01 | Calidad / apps y paquetes | Archivos de código y tests de los workspaces afectados | `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan; se conservan pruebas enfocadas existentes y no se confunde `pnpm lint` aprobado con salud total. | Salida completa de los cuatro comandos en checkout limpio; suites, fallos y conteos. | Revertir el work unit que corrigió cada compuerta, manteniendo la frontera independiente. |
| QL-03 | [ ] | QL-02 | CI / `.github` | `.github/workflows/ci.yml`, `package.json`, `pnpm-lock.yaml` | El job observado ejecuta comandos que existen y pasan; la instalación de artefactos no oculta generación ni compilación. Esto no incluye despliegue. | Ejecución CI en push/PR de prueba o evidencia equivalente reproducible. | Revertir solo la alineación de calidad del workflow. |

## Fase 2 — Identidad, API, backend y base de datos

Estas unidades son **Objetivo futuro (Future target)**. No se puede migrar una operación protegida mientras falte una de sus compuertas.

| ID | Estado | Dependencias | Propietario / frontera | Archivos | Aceptación | Evidencia | Rollback |
|---|---|---|---|---|---|---|---|
| ID-01 | [ ] | QL-03 | Seguridad / API-backend | `spec.md`, `constitution.md`, documentación del proveedor y configuración de entorno | Modelo de identidad elegido: sesión/credencial, expiración, revocación, recuperación, rotación, roles y límites de secreto; ningún valor sensible se confirma. | Decisión aprobada y pruebas de principal válido, ausente, inválido y vencido. | Mantener el flujo objetivo deshabilitado y conservar solo el adaptador de referencia. |
| ID-02 | [ ] | ID-01 | Identidad / middleware de API | `apps/*`, `packages/*`, servidor API futuro | El principal se deriva en servidor; `actorId`, rol, permiso o propietario enviados por el cliente no establecen identidad. | Pruebas negativas con actor falsificado y solicitud sin credencial; cero mutación protegida. | Desactivar middleware/rutas nuevas y volver al límite anterior sin cambiar ownership. |
| ID-03 | [ ] | ID-02 | Autorización / API y web de gestión | Código de autorización futuro, `apps/gestion`, tests de seguridad | Cada acción y recurso aplica mínimo privilegio; permiso insuficiente deniega sin filtrar datos y deja auditoría. | Matriz de roles/acciones y pruebas por recurso ajeno, rol insuficiente y sesión expirada. | Retirar la política nueva de las rutas aún no migradas. |
| API-01 | [ ] | ID-02 | Contratos / API | `packages/contracts`, rutas API futuras, tests de contrato | Contratos versionados definen entrada validada, éxito, validación, denegación, conflicto, dependencia y error técnico; incluyen idempotencia. | Tests de contrato y repetición de solicitudes; respuestas deterministas. | Mantener adaptador heredado aislado y retirar solo el contrato incompleto. |
| BE-01 | [ ] | API-01 | Backend / dominio y aplicación | `packages/domain`, `packages/data` o límites aprobados equivalentes, servicios futuros | Comandos y consultas aplican reglas antes de persistir, delimitan transacciones y distinguen errores de dominio, seguridad y almacenamiento. | Unitarias de reglas e integración de una operación completa API-backend-base. | Revertir el servicio sin modificar el propietario anterior. |
| DB-01 | [ ] | BE-01 | Datos / persistencia | `pagina-web/db/schema.sql`, `pagina-web/db/seed.sql`, migraciones futuras, `packages/data` | Inventario de tablas, relaciones, secuencias, auditoría, seeds y estado local; propietario único por entidad y política de conflicto aprobada. | Mapa de ownership, conteos y diferencias entre fuentes; sin copiar credenciales ni datos sensibles. | Conservar las fuentes de referencia intactas y eliminar solo el inventario generado. |
| DB-02 | [ ] | DB-01 | Migraciones / base canónica | Directorio de migraciones futuro, `packages/data`, scripts de backup/restore | Migraciones versionadas se ejecutan en base vacía y representativa, pueden repetirse y tienen rollback o compensación explícita. | Replay, invariantes, backup restaurable y rollback con resultado auditable. | Restaurar respaldo y deshabilitar la migración no aprobada. |
| DB-03 | [ ] | DB-02 | Consistencia y auditoría / backend-base | Backend futuro, esquema/migraciones, tests de integración | Mutaciones relacionadas son transaccionales o usan protocolo documentado; auditoría registra actor confiable, acción, entidad, instante y resultado, con política de fallo. | Pruebas de commit, rollback, duplicado, concurrencia, denegación y auditoría fallida. | Volver al propietario anterior dentro de la ventana definida; bloquear cutover. |

## Fase 3 — Web pública y web de gestión

Las aplicaciones actuales siguen siendo referencia/transición. Estas unidades no autorizan copiar `localStorage`, autenticación mock, actores enviados por la UI ni fallback offline como garantías.

| ID | Estado | Dependencias | Propietario / frontera | Archivos | Aceptación | Evidencia | Rollback |
|---|---|---|---|---|---|---|---|
| WEB-01 | [ ] | API-01, BE-01, DB-03 | Web pública / `apps/web` | `apps/web/**`, contratos de catálogo y adaptadores públicos futuros | Catálogo y detalle usan lectura versionada; precios, visibilidad e inventario proceden del propietario canónico y no filtran datos protegidos. | Integración de catálogo y E2E de visitante; errores de dependencia explícitos. | Deshabilitar la ruta moderna y conservar `pagina-web/` como referencia. |
| WEB-02 | [ ] | WEB-01, ID-03 | Web pública / pedidos y recibos | `apps/web/**`, API/backend de pedidos y recibos futuros | Pedido y recibo validan cliente, artículos, total, estado, numeración y datos sensibles; pago informado por cliente no prueba cobro. | E2E de pedido/recibo, repetición, denegación, conflicto y auditoría. | Revertir la capacidad no aprobada sin cambiar registros canónicos. |
| MGT-01 | [ ] | ID-03, API-01 | Web de gestión / `apps/gestion` | `apps/gestion/**` | La sesión y el rol vienen del servidor; se corrigen rutas sin presentar la UI como autorización; acciones usan contratos disponibles. | Pruebas de sesión expirada, permisos por acción y routing; typecheck/build pasan. | Desactivar páginas modernas no aprobadas. |
| MGT-02 | [ ] | MGT-01, BE-01, DB-03 | Gestión operativa / clientes, catálogo y stock | `apps/gestion/**`, backend y contratos afectados | Clientes, productos, servicios, stock, ventas y compras escriben solo mediante API/backend autorizado y auditable. | Integración por mutación, prueba de recurso ajeno, conflicto y rollback. | Volver por capacidad al flujo de referencia, sin doble escritura. |
| MGT-03 | [ ] | MGT-02, WEB-02 | Gestión operativa / caja, reparación y reportes | `apps/gestion/**`, APIs de recibos/caja/reportes futuras | Caja, reparaciones, QA, pagos, anulaciones y reportes distinguen datos confirmados de caché y aplican precondiciones de estado. | E2E de operación, denegación, dependencia caída y auditoría. | Congelar la capacidad y mantener la anterior durante la ventana de reversión. |

## Fase 4 — Migración, cutover y ampliación de QA/CI/CD

La coexistencia es **Comportamiento de referencia (Reference behavior)** hasta que se pruebe un único propietario. Estas unidades son el último tramo y no permiten retiro prematuro.

| ID | Estado | Dependencias | Propietario / frontera | Archivos | Aceptación | Evidencia | Rollback |
|---|---|---|---|---|---|---|---|
| MIG-01 | [ ] | DB-01, MGT-03 | Migración / todas las fuentes | `pagina-web/db/**`, `sistema-gestion/**`, scripts de inventario futuros | Inventario de datos, identidad, numeración, estados, localStorage y backups; conflictos clasificados y propietario objetivo aprobado. | Conteos, hashes o identificadores minimizados, mapping y acta de ownership. | Eliminar solo artefactos temporales del inventario; conservar fuentes. |
| MIG-02 | [ ] | MIG-01, DB-02 | Migración / base aislada | Migraciones, scripts de replay/backup/restore futuros | Dry run repetible en base vacía y representativa; reconciliación no pierde relaciones ni invariantes y el backup restaura. | Salida de replay, diferencias, conteos, invariantes y restore/rollback. | Restaurar backup y descartar la base de ensayo. |
| MIG-03 | [ ] | MIG-02, WEB-02, MGT-03 | Coexistencia / API y routing | API, feature flags, observabilidad y adaptadores futuros | Shadow/canary define lectura, escritura, sincronización, observabilidad y owner único; no hay doble escritura accidental. | Comparación de resultados, errores, latencia, auditoría y plan de reversión ensayado. | Apagar canary y enrutar al owner anterior. |
| MIG-04 | [ ] | MIG-03, QA-01, QA-02, QA-03 | Cutover / operación | Configuración de despliegue, routing, migración y runbooks futuros | Cutover gradual cambia el propietario explícitamente, mantiene backup y registra quién aprobó qué; smoke tests pasan. | Checklist firmado, smoke de salud/catálogo/sesión/pedido/recibo/gestión y auditoría. | Ejecutar rollback probado dentro de la ventana anunciada. |
| QA-01 | [ ] | MGT-03 | Seguridad / todas las fronteras | Suites de seguridad futuras | Existen pruebas negativas de principal, actor falsificado, recurso ajeno, repetición, carga maliciosa, secretos y auditoría. | Resultado de suite sin fixtures reales ni secretos. | Retirar solo la suite o regla aislada; no relajar el control en producción. |
| QA-02 | [ ] | MGT-03 | Integración y E2E / web-API-backend-base | Harnesses de integración/E2E futuros | Flujos E2E cubren catálogo, pedido, recibo/reparación y una operación de gestión, además de expiración, denegación y dependencia caída. | Ejecución aislada con datos sintéticos y artefactos de fallo. | Deshabilitar el recorrido no aceptado; no declarar paridad. |
| QA-03 | [ ] | QL-03, QA-01, QA-02 | CI/CD y operaciones / `.github` | `.github/workflows/`, scripts de migración, smoke y observabilidad futuros | Hay workflows separados y reproducibles para calidad, despliegue, promoción, migración y smoke; un fallo bloquea promoción. | Runs exitosos en checkout limpio, logs sin secretos y smoke post-promoción. | Revertir el workflow o promoción; restaurar el entorno anterior. |
| RET-01 | [ ] | MIG-04, QA-03 | Obsolescencia / legacy | `pagina-web/`, `sistema-gestion/`, adaptadores y runbooks | Solo tras cutover verificado, reconciliación, respaldo, ventana de reversión cerrada y aprobación explícita; la evidencia heredada se conserva según política. | Acta de retiro, comprobación de rutas no usadas y respaldo de reversión. | Reabrir el flujo heredado durante la política de recuperación; no borrar almacenes operativos. |

## Bloqueos actuales y criterio de cierre

Los siguientes bloqueos son **Línea base observada (Observed baseline)** y siguen pendientes: falta el script raíz `generate`; `pnpm typecheck` falla por `.next/types`; `pnpm test` registra 15 éxitos y dos suites fallidas por `@beim/data`; `pnpm build` falla por `@beim/data`; no hay integración API/base, E2E, suite de seguridad, harness de migración/rollback, workflow de despliegue/promoción/migración ni smoke test dedicado.

Una unidad solo se marca `[x]` cuando su aceptación y evidencia están completas, su rollback está definido y no contradice [`constitution.md`](constitution.md) ni [`spec.md`](spec.md). El cierre del plan requiere todas las compuertas de [`plan.md`](plan.md), no únicamente el paso de `pnpm lint` o una prueba unitaria.

## Relación de documentos

- Procedimiento: [`AGENTS.md`](AGENTS.md)
- Principios: [`constitution.md`](constitution.md)
- Comportamiento e invariantes: [`spec.md`](spec.md)
- Arquitectura y secuencia: [`plan.md`](plan.md)
- Evidencia y unidades: este [`tasks.md`](tasks.md)
