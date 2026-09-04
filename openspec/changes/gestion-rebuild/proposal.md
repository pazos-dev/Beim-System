# Propuesta: Reconstrucción de la aplicación de gestión

## Intención

**Objetivo futuro (Future target):** reconstruir `apps/gestion` con Next.js 15, React 19 y TypeScript, usando `sistema-gestion/` como **Comportamiento de referencia (Reference behavior)**; corregir propiedad, identidad y fallbacks.

## Alcance

### Incluido
- Ocho slices: shell; identidad/contratos; JSON; órdenes; comercio; caja/reportes; administración/backups; paridad.
- JSON de servidor canónico; owner único; validación; actor de route handler; autorización por acción; fallo cerrado; auditoría e idempotencia.
- Cada slice incluye UX accesible, login **no productivo**, requisitos/casos en `spec.md`, pruebas y seguridad negativa.
- Gobierno en `apps/gestion/docs/`: `AGENTS.md`, `constitution.md`, `plan.md`, `stacks.md`, `spec.md`, `tasks.md`.

### Fuera de alcance
Base de datos/PostgreSQL, autenticación productiva, despliegue, cambios públicos, modificar legacy, `localStorage` canónico y cutover.

## Capabilities

### Nuevas
- `gestion-app-shell`: shell y accesibilidad.
- `gestion-mock-identity`: `users.json` y sesión server-side.
- `gestion-json-data`: repositorios JSON tipados.
- `gestion-orders-workflow`: órdenes, recibos y desbloqueo.
- `gestion-stock-commerce`: stock, compras, ventas.
- `gestion-cash-reports`: caja, informes.
- `gestion-admin-backups`: usuarios y backup/restore.
- `gestion-parity-migration`: mapeo y fixtures; sin cutover.
- `gestion-shared-contracts`: modelo de error, idempotencia, auditoría mínima y estados canónicos compartidos.

### Modificadas
Ninguna; `openspec/specs/` no contiene capacidades.

## Supuestos

- PostgreSQL reemplazará el repositorio JSON detrás del mismo límite posteriormente.
- Antes de órdenes se decidirá el tratamiento de desbloqueo; no se migran ni imprimen secretos, y toda excepción exige minimización y acceso reforzado.
- Cada slice declara entradas, actor, owner, salida, auditoría, pruebas y rollback.

## Enfoque y alternativas

Se eligen cortes verticales sobre traslado directo: el port directo conserva monolito y brechas; los slices permiten seguridad, pruebas y PRs encadenadas.

## Áreas afectadas

| Área | Impacto |
|---|---|
| `apps/gestion/**` | Aplicación, docs y pruebas nuevas |
| `openspec/changes/gestion-rebuild/**` | Artefactos SDD |
| `sistema-gestion/`, `pagina-web/` | Referencia, sin modificación |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Actor falsificado | Sesión server-side y pruebas negativas |
| Doble owner/finanzas inconsistentes | Repositorio único, atomicidad, idempotencia, auditoría |
| Datos de desbloqueo | Decisión bloqueante; minimizar y no migrar por defecto |
| Paridad/revisión | Fixtures y cadena feature-branch; slice/PR ≤400 líneas |

## Reversión

Cada slice revierte PR de código y documentación, desactiva su ruta/flag y restaura el snapshot JSON con auditoría. Paridad elimina mappings temporales; nunca retira el legado.

## Límite de aceptación

Solo desarrollo: ocho recorridos con contratos, actor servidor, ownership, pruebas y rollback demostrables. No autoriza producción, PostgreSQL, despliegue ni cutover.

## Dependencias y siguientes cambios

Depende de las compuertas de workspace/calidad de `plan.md`. Luego: cambios aprobados para PostgreSQL, identidad productiva, CI/E2E, migración y retiro legado.

## Criterios de éxito

- [ ] Ocho slices y documentos forman una cadena revisable.
- [ ] Ninguna mutación confía en `actorId`, rol o `localStorage` del cliente.
- [ ] Cada entidad tiene owner JSON, auditoría, fallo cerrado y rollback probado.
