# Diseño: Reconstrucción de la aplicación de gestión

**Estado:** **Objetivo futuro (Future target)**. Diseño modular de `sistema-gestion/`, sin modificar legado ni runtime. Se alinea con [`constitution.md`](../../../constitution.md), [`spec.md`](../../../spec.md), [`plan.md`](../../../plan.md) y [`tasks.md`](../../../tasks.md); nueve delta specs son contratos.

## Enfoque técnico

`apps/gestion` usará páginas App Router y route handlers HTTP delgados. El handler deriva actor, autoriza, valida con Zod y delega en dominio/repositorios; ningún componente escribe hechos. JSON server-side será canónico en desarrollo. `Repository` permitirá sustituirlo por PostgreSQL tras las compuertas de [`plan.md`](../../../plan.md).

```text
UI / api-client → app/api/gestion/*/route.ts → src/server/handlers
                                      → dominio puro → repositorio JSON
                                      → auditoría / respuesta tipada
```

## ADRs

| ADR | Decisión, alternativa y justificación | Consecuencias |
|---|---|---|
| ADR-1 | **Next.js 15 App Router + React 19 + TypeScript estricto.** Frente al traslado HTML/JS, conserva continuidad, hace del handler la frontera autenticada y desacopla el futuro PostgreSQL. | Reconstrucción incremental; las páginas nunca autorizan. |
| ADR-2 | **JSON de desarrollo propiedad de `src/server/data/`.** Owner por entidad, Zod en cada límite y `tmp + rename`; se rechazan `localStorage` y snapshots del navegador como owner. | Lock/unidad multiarchivo, versiones monotónicas, fixtures y `data/` ignorado o sembrado. |
| ADR-3 | **Sesión mock server-side:** `users.json`, cookie `httpOnly`, `middleware.ts` para `/app` y `role-permissions.json`; banner “modo desarrollo, no productivo”. Se rechazan React y `sessionStorage` como identidad. | Reautorización en handlers y pruebas negativas obligatorias. |
| ADR-4 | **TanStack Query para servidor y Zustand para UI efímera** (sidebar, modal, toasts, borrador). Se rechaza `localStorage` como verdad. | Invalidación tras comandos; caída = caché/borrador explícito, nunca éxito durable. |
| ADR-5 | **Cortes verticales:** `shared-contracts → app-shell → mock-identity → json-data → orders-workflow → stock-commerce → cash-reports → admin-backups → parity-migration`; cada flecha es dependencia. | Cada slice tiene pruebas, ruta desactivable y snapshot restaurable; legado intacto y PR menor de 400 líneas. |
| ADR-6 | **Desbloqueo restringido y mínimo.** Decisión aprobada antes de órdenes; por defecto no va a `ordenes.json` ni a impresión. Una excepción usaría `datos-desbloqueo.json`, permiso reforzado y retención definida. | Bloquea órdenes/migración; secretos quedan fuera de fixtures, auditoría y respuestas. |
| ADR-7 | **`handleGestionRequest` común** para errores, idempotencia y auditoría de `gestion-shared-contracts`. Define `VALIDATION_ERROR`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `NOT_FOUND_OR_FORBIDDEN`, `CONFLICT`, `DEPENDENCY_UNAVAILABLE`, `STORAGE_ERROR` y `AUDIT_FAILURE`; misma clave/hash devuelve resultado, payload distinto da conflicto. | Envelope estable y auditoría obligatoria; `AUDIT_FAILURE` bloquea el éxito. |

## Arquitectura de carpetas

```text
apps/gestion/
├── app/login/page.tsx
├── app/app/{layout,page,dashboard,ordenes,clientes,stock,ventas,compras,servicios,caja,reportes,configuracion}/page.tsx
├── app/api/gestion/**/route.ts
├── middleware.ts
├── src/server/handlers/
├── src/server/data/{repositories,json-store.ts,schemas.ts}
├── src/lib/domain/{orders,inventory,cash,reports}/
├── src/components/{ui,features}/
├── src/lib/api-client/
├── data/*.json                        # runtime dev, gitignored
├── fixtures/*.json                    # seeds sintéticos
├── docs/{AGENTS.md,constitution.md,plan.md,stacks.md,spec.md,tasks.md}
├── e2e/                               # Playwright
└── tests/fixtures/                    # datos aislados
```

Tests junto; E2E.

## Matriz de límites

API base: `/api/gestion`.

| Capability | Owner server-side y ruta | Owner JSON | Actores | Validaciones y errores | Pruebas |
|---|---|---|---|---|---|
| `gestion-app-shell` | `BootstrapHandler` + `BootstrapRepository`; `GET /api/gestion/bootstrap`, `/app/*` | Solo lectura | Sesión + lectura | Ruta, búsqueda, período; auth/forbidden/dependency | RTL + integración |
| `gestion-mock-identity` | `AuthHandler` + `UserRepository/SessionRepository`; `POST /auth/login`, `/logout`, `GET /session` | `users.json`, `role-permissions.json`, `audit.json` | Cinco roles; principal administra roles | Credencial, activo, cookie; validation/auth/audit | Unit + HTTP + E2E negativo |
| `gestion-json-data` | `EntityHandler` + `EntityRepository`; `/clientes`, `/categorias`, `/productos`, `/servicios`, `/ordenes`, `/ventas`, `/compras` | Owner homónimo; stock/gastos/caja | Acción declarativa | Zod, referencias, versión, idempotencia; conflict/storage | Unit + integración temp |
| `gestion-orders-workflow` | `OrderHandler` + `OrderRepository`; `/ordenes`, `/ordenes/[id]/{status,payments,print}` | `ordenes.json`; cliente separado | vendedor/técnico/caja/admin/principal | Equipo, cliente, estado, importe, número, unlock; validation/conflict/forbidden | Unit + integración + E2E |
| `gestion-stock-commerce` | `CommerceHandler` + repositorios producto/venta/compra/movimiento; `/productos`, `/compras`, `/ventas`, `/ventas/[id]/{return,annul}`, `/stock/transfers` | productos, categorías, servicios, ventas, compras, movimientos | Lectura operativa; mutaciones según rol | Stock, pagos exactos, costo, motivo, clave; conflict/storage | Unit + integración + E2E |
| `gestion-cash-reports` | `CashHandler` + `CashSessionRepository`; `ReportQueryHandler` + repositorios de lectura; `/caja/sesiones`, `/reportes`, `/reportes/export` | `sesiones-caja.json`; ventas/órdenes/gastos/productos/contabilidad | caja/admin/principal con permiso | Fecha, importes, rango, columnas; conflict/dependency/storage | Unit + integración + E2E |
| `gestion-admin-backups` | `AdminHandler` + repositorios menú/usuarios/permisos/backup; `/admin/menu`, `/admin/users`, `/admin/permissions`, `/admin/backups/{create,restore}` | `menu.json`, `users.json`, `role-permissions.json`, `backups/` | admin; principal para críticos | Ciclos, padre, alcance, esquema, confirmación; forbidden/conflict/storage/audit | Unit + integración + E2E |
| `gestion-parity-migration` | `MigrationHandler` + `MigrationRepository`; `/admin/migration/{dry-run,fixtures,state}`; sin cutover | `migration-map.json`, `migration-state.json`, fixtures | principal/operador en entorno aislado | Inventario, conflicto, secreto, estados, gates; forbidden/conflict | Unit + replay integración + E2E |
| `gestion-shared-contracts` | `handleGestionRequest` + `AuditRepository/IdempotencyRepository`, todas las rutas | `audit.json` + idempotencia server-side | Actor de sesión | Envelope, hash, estado sin acentos, auditoría | Unit + integración concurrente |

## Dominio y portabilidad de reglas

Se extraerán funciones puras, sin DOM, reloj, `localStorage` ni azar: `reports/build-report-data.ts` y `build-accounting-snapshot.ts` portan `buildReportData`/`buildAccountingSnapshot` (`sistema-gestion/app.js`) con ventas netas, devoluciones, gastos, pagos, inventario, cuentas y capital; `inventory/weighted-average-cost.ts` usa `(stock×costo + cantidad×costoNuevo)/(stock+cantidad)`; `cash/cash-expected.ts` calcula apertura + ventas/cobros en efectivo − gastos en efectivo; `orders/repair-status.ts` define grafo, transiciones y terminales. Tokens: `en_diagnostico`, `presupuestado`, `esperando_aprobacion`, `aprobado`, `esperando_repuesto`, `en_reparacion`, `control_calidad`, `listo_para_retirar`, `finalizado`, `entregado`, `cancelado`. UI traduce. Se porta `sistema-gestion/report-engine.test.js` con devolución, invalidez y terminales.

## Documentación de la aplicación

Apply creará `apps/gestion/docs/`: `AGENTS.md` (procedimiento), `constitution.md` (principios heredados de la raíz), `plan.md` (slices, gates, rollback), `stacks.md` (versiones/razones: Next15 routing, React19 UI, TS5.6 strict contratos, Tailwind4 estilos, Query5 servidor, Zustand5 UI, Zod4 límites, Vitest3+RTL16+JSDOM25 tests, Playwright1 E2E, ESLint9/Prettier3 calidad y Actions v4 CI), `spec.md` (casos y resumen enlazado a nueve delta specs) y `tasks.md` (pasos por slice). Enlazarán [`AGENTS.md`](../../../AGENTS.md), [`constitution.md`](../../../constitution.md), [`spec.md`](../../../spec.md), [`plan.md`](../../../plan.md) y [`tasks.md`](../../../tasks.md). UI/UX, login, seguridad y tests serán secciones principales.

## Pruebas y preservación UX

Vitest cubrirá dominio, permisos, schemas, errores e idempotencia; integración usará directorios temporales y fallos simulados; RTL cubrirá foco, teclado y estados; Playwright recorrerá login, orden, venta, caja, impresión y viewport. La suite negativa cubrirá sesión/actor/rol, recurso ajeno, payload, repetición, stock, auditoría, backup y desbloqueo. Sin umbral de cobertura ejecutable: cada slice exigirá ramas positivas/negativas; CI seguirá tras restaurar gates.

| Referencia UX (`exploration.md`) | Implementación nueva |
|---|---|
| Sidebar, jerarquía y búsqueda (L145–150) | `Sidebar`/`NavTree` + Zustand, `/app/*`. |
| Dashboard y tablas (L43–56) | Queries server, `DataTable`, doble clic + teclado. |
| Modales, Escape y foco (L150) | `Dialog`/`AlertDialog` con foco restaurado. |
| Boleta, preview y patrón (L57, L147–151) | `OrderForm` + `ReceiptPreview`; payload validado. |
| Dos copias, toasts y atajos (L152–153) | Print sanitizado, `ToastViewport`, comandos UI. |

## Threat matrix

| Boundary | Aplicabilidad | Comportamiento seguro/fallo | RED |
|---|---|---|---|
| Documentation-like paths | N/A — no se clasifican documentos ejecutables. | Sin ejecución de Markdown/MDX. | Ninguna |
| Git repository selection | N/A — no se elige repositorio ni `git -C`. | El runtime usa el root configurado de Next. | Ninguna |
| Commit state | N/A — no se modifica índice ni commits. | Sin efecto runtime. | Ninguna |
| Push state | N/A — no se resuelven ramas ni refspecs. | Sin efecto runtime. | Ninguna |
| PR commands | N/A — no se componen comandos de PR. | Sin ejecución externa. | Ninguna |

El routing tendrá RED de middleware/handler: `/app/*` sin cookie, cookie inválida o permiso insuficiente debe denegar sin datos ni mutación.

## Riesgos y siguiente fase

| Riesgo | Mitigación |
|---|---|
| Finanzas multiarchivo | Unidad JSON, lock, versiones, rollback y concurrencia. |
| Mock confundido con producción | Banner, configuración de desarrollo y gates negativas. |
| Secreto en orden/print/fixture | ADR-6, schemas mínimos y prueba de no filtración. |
| Alcance sobre 400 líneas | Feature-branch-chain, slice autónomo y snapshot reversible. |

No hay cutover ni migración productiva; paridad solo hará inventario/dry-run con fixtures sintéticos. Próxima: **sdd-tasks**, conservando secuencia, owners, RED y rollbacks.

## Preguntas abiertas

- [ ] Aprobar la política de datos de desbloqueo antes de `orders-workflow`.
- [ ] Confirmar el grafo final de transiciones con las reglas operativas.
