# Plan de arquitectura y migración

Este documento es la autoridad de la arquitectura futura y de la secuencia de migración de Beim-System-Tech. Define etapas, dependencias, compuertas, propiedad, reversión, cambio de dirección y retiro. No declara implementado ningún componente que la evidencia actual no demuestre.

## Ruta rápida

1. Restaurar el workspace y hacer ejecutables las compuertas de calidad.
2. Decidir y demostrar un modelo de identidad confiable antes de migrar operaciones protegidas.
3. Separar contratos de API, servicios de backend y propiedad de la base de datos.
4. Migrar primero las capacidades de web pública y después la superficie de gestión.
5. Inventariar, respaldar, reconciliar, ensayar y probar rollback antes de cualquier cutover.
6. Ampliar QA y CI/CD; retirar lo heredado solo después de una ventana de reversión aprobada.

La especificación de comportamiento está en [`spec.md`](spec.md), los principios obligatorios en [`constitution.md`](constitution.md), el procedimiento en [`AGENTS.md`](AGENTS.md) y las unidades ejecutables en [`tasks.md`](tasks.md). Una contradicción se resuelve respetando esas fronteras de autoridad; este plan no puede relajar [`constitution.md`](constitution.md) ni adelantar una aceptación de [`spec.md`](spec.md).

## Estado de transición comprobado

### Línea base observada (Observed baseline)

- La raíz es un workspace privado de Turborepo/pnpm. `pnpm-workspace.yaml` incluye únicamente `apps/*` y el único workspace físico observado es `apps/gestion`.
- `apps/gestion` fue eliminado del árbol; el prototipo transicional (autenticación mock, CRUD parcial, importaciones no resolubles de `@beim/data` y `@beim/contracts`) queda como **Comportamiento de referencia (Reference behavior)** en el historial de Git, y la superficie moderna consolidada es **Objetivo futuro (Future target)**.
- `pagina-web/` contiene la tienda pública, la interfaz de recibos y el servidor HTTP Node.js heredados. `sistema-gestion/` contiene la aplicación de gestión y la interfaz de recibos heredadas.
- Los workspaces y paquetes modernos descritos por el README pero ausentes del árbol —incluidos `apps/web`, las aplicaciones de escritorio y móvil y `packages/{tsconfig,contracts,domain,data,ui}`— son objetivos futuros, no entregables disponibles.
- `pagina-web/db/schema.sql` y `pagina-web/db/seed.sql` son evidencia heredada. El esquema mezcla creación, `ALTER TABLE`, backfills, índices y reparación de secuencias; no se observa un historial moderno de migraciones versionadas con rollback probado.
- `.github/workflows/ci.yml` es el único flujo de CI observado. No se observa workflow de despliegue, release, promoción de entornos, migración ni smoke test.

### Compuertas de calidad actuales

La siguiente tabla registra la evidencia disponible; no es una declaración de salud del sistema:

| Comprobación | Resultado de línea base observada (Observed baseline) | Consecuencia para el plan |
|---|---|---|
| `pnpm generate` | Falla porque no existe un script `generate` en el `package.json` raíz. | Bloquea instalación reproducible y toda compuerta que dependa de generación. |
| `pnpm lint` | Pasa en la línea base registrada. | No compensa las compuertas fallidas. Debe repetirse en un checkout limpio. |
| `pnpm typecheck` | Falla por archivos generados `.next/types` ausentes. | Bloquea la promoción de la calidad del workspace. |
| `pnpm test` | Registra 15 pruebas exitosas y dos suites fallidas porque no se puede resolver `@beim/data`. | Bloquea la aceptación de la suite completa. |
| `pnpm build` | Falla por el paquete ausente `@beim/data`. | Bloquea cualquier despliegue o migración de funcionalidad. |
| Prueba del motor de reportes heredado | Pasa en la línea base registrada. | Es evidencia enfocada de referencia, no de salud del sistema completo. |
| `node --check` sobre JavaScript heredado | Pasa para los archivos heredados registrados. | Es comprobación sintáctica, no prueba de seguridad, integración o E2E. |

La evidencia de estos resultados está alineada con [`AGENTS.md`](AGENTS.md) y [`spec.md`](spec.md). Hasta que las compuertas se repitan y pasen en un checkout limpio, no se puede afirmar que CI esté verde, que exista una compilación reproducible o que haya capacidad de despliegue.

## Arquitectura futura y propiedad

### Objetivo futuro (Future target): flujo de límites

```text
web pública / web de gestión
        ↓ entrada no confiable
API versionada: autenticación → autorización → validación
        ↓ comandos y consultas tipados
backend: dominio → transacción/idempotencia → auditoría
        ↓ única escritura autorizada
base de datos canónica: registros durables, relaciones y auditoría
```

La compatibilidad heredada se mantiene detrás de un adaptador observable mientras exista una razón aprobada para coexistir. Ninguna interfaz, `localStorage`, semilla, handler heredado o actor enviado por el cliente puede convertirse silenciosamente en propietario canónico.

| Frontera | Estado y dirección | Propietario futuro y compuerta principal |
|---|---|---|
| Web pública | `pagina-web/` es **Comportamiento de referencia (Reference behavior)**. `apps/web` es **Objetivo futuro (Future target)**. | La web pública posee presentación y entradas de visitante; la API/backend posee autenticación, validación y comandos. Compuerta: contratos de catálogo, pedido y recibo, integración y E2E. |
| Web de gestión | `sistema-gestion/` es **Comportamiento de referencia (Reference behavior)**. El prototipo `apps/gestion` fue eliminado; una superficie moderna consolidada es **Objetivo futuro (Future target)**. | El servidor deriva el principal y el rol; la interfaz solo presenta comandos y caché/borradores identificados. Compuerta: autorización negativa, integración y E2E por operación. |
| API | `pagina-web/server.js` es **Comportamiento de referencia (Reference behavior)** con rutas mezcladas. | El API versionado autentica, autoriza, valida y normaliza errores; no acepta `actorId`, rol o permiso del cuerpo como identidad. Compuerta: contratos, repetición segura y pruebas negativas. |
| Backend | La lógica en `pagina-web/server.js` y `pagina-web/db.js` es **Línea base observada (Observed baseline)** heredada; una capa de aplicación/dominio separada es **Objetivo futuro (Future target)**. | El backend decide reglas, transacciones, idempotencia y auditoría. Compuerta: pruebas de dominio, integración transaccional, concurrencia y seguridad. |
| Base de datos | `pagina-web/db/schema.sql` y PostgreSQL son **Comportamiento de referencia (Reference behavior)**; la base canónica con migraciones versionadas es **Objetivo futuro (Future target)**. | La base canónica posee registros durables y auditoría; API/backend es el único límite autorizado de escritura. Compuerta: propiedad aprobada, migración repetible, respaldo restaurable, reconciliación y rollback. |

### Decisiones de identidad y datos

Estas son reglas de dirección futura, no capacidades existentes:

- **Identidad:** el proveedor y mecanismo concreto quedan abiertos. Antes de una migración protegida se debe seleccionar un modelo de sesión o credencial, documentar expiración, revocación, recuperación, rotación y asociación con roles. La API/backend deriva el principal; no lo recibe como autoridad desde la UI.
- **Autorización:** el backend evalúa acción, recurso, alcance y estado del principal con mínimo privilegio. La visibilidad de rutas y los permisos del cliente no son controles.
- **Datos:** una base de datos canónica designada posee entidades, relaciones, estados, numeración y auditoría. El backend posee las decisiones de dominio y la API es su límite de entrada; no hay doble escritura independiente.
- **Migración:** `localStorage`, seeds, tablas heredadas, respuestas cacheadas y documentos de respaldo son entradas de inventario o reconciliación. Ninguno es canónico por precedencia temporal o visibilidad.
- **Auditoría:** las mutaciones, denegaciones, fallos de validación relevantes, conflictos y rollback se registran en un límite confiable. La política de fallo cuando la auditoría obligatoria no puede persistirse debe aprobarse y probarse.

La selección del proveedor de identidad, la asignación final de propietarios por entidad y la política de datos sensibles de reparación son decisiones bloqueantes que deben registrarse en el documento propietario antes del cutover.

## Etapas de migración

Una etapa no habilita la siguiente por existir documentación o código parcial. Cada compuerta requiere evidencia reproducible y una decisión explícita de avance.

### Etapa 0 — Fundación documental y control de alcance

**Estado:** **Línea base observada (Observed baseline)** para `AGENTS.md`, `constitution.md` y `spec.md`; este plan y [`tasks.md`](tasks.md) completan la base documental solicitada.

**Propósito:** mantener separadas procedimiento, principios, comportamiento, arquitectura/secuencia y evidencia ejecutable. Conservar `pagina-web/`, `sistema-gestion/`, Engram y `.codegraph/` como evidencia o almacenes operativos; no son objetivos de limpieza.

**Compuerta:** los cinco documentos existen, se enlazan mutuamente, usan las tres etiquetas y no presentan objetivos ausentes como implementados. La validación de esta entrega es documental: `git diff --check -- plan.md tasks.md AGENTS.md constitution.md`.

**Rollback:** revertir únicamente los cambios documentales de esta etapa.

### Etapa 1 — Restauración del workspace y calidad

**Dependencias:** Etapa 0.

**Propósito:** reconciliar `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml`, los paquetes ausentes y el pipeline de generación sin inventar dependencias. Restituir primero los límites de workspace y la reproducibilidad.

**Compuertas:** instalación limpia con lockfile, `pnpm generate`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan en checkout limpio; el resultado se guarda con versiones y salida relevante. Un fallo bloquea toda migración de funcionalidad.

**Rollback:** revertir el cambio de workspace, scripts, lockfile y paquetes de esta etapa; no tocar código heredado ni datos.

### Etapa 2 — Identidad, seguridad y contratos de API

**Dependencias:** Etapa 1.

**Propósito:** elegir el modelo de identidad futuro, derivar principales en servidor, definir roles/permisos, proteger secretos y publicar contratos versionados de entrada, éxito, validación, denegación, conflicto y dependencia.

**Compuertas:** pruebas de principal ausente, inválido, vencido, actor falsificado, recurso ajeno y permiso insuficiente; ningún caso protegido muta. Contratos y auditoría de denegaciones están integrados con el backend.

**Rollback:** desactivar la ruta objetivo mediante feature flag o routing de compatibilidad; conservar el adaptador heredado solo como referencia explícita y sin declarar conformidad.

### Etapa 3 — Backend y base de datos canónica

**Dependencias:** Etapa 2.

**Propósito:** extraer servicios de aplicación/dominio, definir transacciones e idempotencia y convertir el esquema acumulativo en migraciones versionadas con ownership por entidad. Preparar respaldo, restauración, reconciliación y auditoría durable.

**Compuertas:** pruebas unitarias de reglas; integración API-backend-base; replay en base vacía y con datos representativos; conteos e invariantes; respaldo restaurable; rollback probado; concurrencia y auditoría. No se acepta doble propietario ni doble escritura silenciosa.

**Rollback:** restaurar respaldo o ejecutar reversión/compensación versionada; registrar resultado y bloquear la siguiente etapa si no se puede demostrar la recuperación.

### Etapa 4 — Web pública y web de gestión

**Dependencias:** Etapas 1–3.

**Propósito:** implementar `apps/web` como superficie pública futura y completar la web de gestión moderna sin copiar la identidad mock, el fallback local ni la autorización de las aplicaciones heredadas. Migrar por capacidad: catálogo; pedidos/pagos; recibos/reparaciones; clientes; stock; ventas/compras; caja; reportes; administración.

**Compuertas:** cada capacidad tiene contrato, propietario, integración, denegaciones, errores deterministas y auditoría. E2E cubre catálogo, pedido, recibo/reparación, gestión y expiración de sesión. El estado local queda identificado como caché, borrador o entrada de migración.

**Rollback:** enrutar la capacidad no aprobada al flujo heredado de referencia o deshabilitarla; no cambiar el propietario de datos sin respaldo, reconciliación y ventana de reversión.

### Etapa 5 — Migración, cutover y ampliación operativa

**Dependencias:** Etapa 4 y todas las compuertas de datos y calidad.

**Propósito:** inventariar fuentes, clasificar conflictos, transformar en entorno aislado, ensayar replay, verificar backup/restore, observar coexistencia, ejecutar cutover gradual y ampliar QA/CI/CD antes de retirar referencias.

**Secuencia obligatoria:** inventario y ownership → respaldo → reconciliación aprobada → dry run repetible → shadow/canary con observabilidad → cutover con propietario único → ventana de rollback → retiro condicionado.

**Compuertas:** ninguna migración si falla generación, compilación, prueba, seguridad, replay, conteo, reconciliación, respaldo, restauración, smoke test o auditoría. CI/CD solo es una compuerta cuando sus comandos pasan en checkout limpio; despliegue, promoción, migración y smoke tests requieren workflows y evidencia propios.

**Rollback y retiro:** durante la ventana anunciada, volver al propietario anterior con el procedimiento probado y registrar el resultado. Retirar `pagina-web/`, `sistema-gestion/` o adaptadores únicamente después de cutover verificado, datos reconciliados, respaldo conservado y aprobación de obsolescencia. Engram, `.codegraph/`, `.atl/`, bases de datos y semillas no se eliminan como parte de este plan; su mantenimiento requiere un cambio separado y autorización explícita.

## Compuertas transversales

| Área | Evidencia mínima antes de promover |
|---|---|
| Identidad y seguridad | Principal derivado en servidor, autorización por acción/recurso, mínimo privilegio, secretos fuera del repositorio y pruebas negativas. |
| Propiedad | Propietario único para identidad, cada entidad durable y cada escritura; política de reconciliación y conflicto aprobada. |
| Consistencia | Transacción o protocolo explícito, idempotencia, concurrencia, errores deterministas y auditoría de éxito/fallo. |
| Migración | Inventario, mapping, respaldo restaurable, dry run repetible, conteos, invariantes, replay, rollback y ventana de reversión. |
| Calidad | Unitarias apropiadas, integración entre límites, E2E, seguridad negativa, smoke y salida exacta registrada. |
| CI/CD | `pnpm install --frozen-lockfile`, `pnpm generate`, lint, typecheck, test y build funcionando; workflows separados para despliegue, migración, promoción y smoke. |

## Riesgos y límites deliberados

- La selección de proveedor de identidad, la estrategia de coexistencia y la política para datos de desbloqueo permanecen abiertas; hasta resolverlas no hay autenticación, migración ni cutover de producción.
- El comportamiento de `localStorage`, el modo local, los actores proporcionados por el cliente y los valores heredados se conserva únicamente como referencia o entrada de migración. No se debe replicar como arquitectura segura.
- No se planifica borrar documentación histórica, código heredado, Engram, `.codegraph/`, `.atl/`, SQL, seeds o bases de datos dentro de esta fase documental.
- La intención declarada de `.github/workflows/ci.yml` no demuestra despliegue, protección de ramas, promoción, migración ni smoke test.

## Relación de documentos

- Procedimiento: [`AGENTS.md`](AGENTS.md)
- Principios normativos: [`constitution.md`](constitution.md)
- Comportamiento e invariantes: [`spec.md`](spec.md)
- Arquitectura futura y secuencia: este [`plan.md`](plan.md)
- Unidades ejecutables y evidencia: [`tasks.md`](tasks.md)
