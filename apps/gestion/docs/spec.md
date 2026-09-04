# Especificación funcional de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Esta especificación describe lo que debe demostrar la aplicación reconstruida. **Línea base observada (Observed baseline):** el runtime moderno de `apps/gestion` no está demostrado en el checkout. **Comportamiento de referencia (Reference behavior):** `sistema-gestion/` conserva la gramática visual y los recorridos heredados, pero no sus fallbacks, identidad enviada por el cliente ni propiedad duplicada.

## Autoridad y trazabilidad

La conducta transversal se subordina a [`../../../spec.md`](../../../spec.md); los principios a [`constitution.md`](constitution.md) y [`../../../constitution.md`](../../../constitution.md); la secuencia a [`plan.md`](plan.md) y [`../../../plan.md`](../../../plan.md); la evidencia a [`tasks.md`](tasks.md) y [`../../../tasks.md`](../../../tasks.md). Los requisitos de este documento se contrastan con las nueve especificaciones delta enlazadas en la tabla de trazabilidad.

## Actores y casos de uso

Las tablas expresan recorridos previstos, no permisos implementados. En todos los casos, la precondición incluye entorno de desarrollo habilitado, entrada validable y sesión server-side cuando el caso es protegido. Una denegación debe ser cerrada y auditable.

### Vendedor

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-VEN-01 | Consultar operación | Sesión válida y permiso de lectura. | Abre dashboard, busca, filtra período y consulta órdenes/clientes/stock. | Sin sesión, ruta no permitida o dependencia caída: denegar o mostrar error y reintento sin datos inventados. | Solo ve datos autorizados; no se crea ningún hecho. |
| UC-VEN-02 | Crear orden y cliente | Permiso de alta; cliente y equipo válidos. | Completa boleta, valida preview y confirma; el servidor asigna número y relación. | Cliente duplicado, número ocupado, payload inválido o rol insuficiente: conflicto/validación sin escritura parcial. | Orden y cliente quedan en sus owners, auditados e idempotentes. |
| UC-VEN-03 | Registrar venta e imprimir | Carrito, stock y pagos completos; permiso de venta/impresión. | Selecciona artículos, confirma pagos exactos, recibe venta numerada y solicita dos copias. | Stock insuficiente, pago incompleto, reintento o impresión no autorizada: no descuenta ni revela secreto. | Venta y movimientos confirmados; impresión excluye desbloqueo por defecto. |

### Técnico

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-TEC-01 | Diagnosticar reparación | Sesión de técnico y orden accesible. | Abre detalle, agrega diagnóstico, notas, servicios e ítems de presupuesto. | Orden ajena, transición inválida o esquema incorrecto: denegar/conflicto sin cambiar notas ni estado. | Orden conserva cambios válidos y estado canónico sin acentos. |
| UC-TEC-02 | Aprobar y consumir repuesto | Ítem aprobable y stock suficiente; permiso de la acción. | Confirma ítem, transición y consumo; handler registra movimiento y balance. | Stock insuficiente, auditoría caída o repetición: rollback/error o resultado original, nunca doble descuento. | Orden, stock y movimiento quedan consistentes o intactos. |
| UC-TEC-03 | Consultar e imprimir boleta | Permiso de lectura/impresión y orden válida. | Revisa preview, datos de equipo y términos; imprime la vista sanitizada. | Política de desbloqueo ausente o actor insuficiente: omite datos restringidos o deniega. | Dos copias sin código, contraseña ni patrón por defecto. |

### Caja

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-CAJ-01 | Abrir y cerrar caja | Rol caja/admin, fecha sin sesión abierta y monto válido. | Abre sesión, consulta esperado, cuenta efectivo y confirma cierre. | Segunda apertura, fecha inválida, dependencia caída o rol insuficiente: conflicto/denegación sin cambio. | `sesiones-caja.json` conserva apertura, contado, diferencia y cierre auditados. |
| UC-CAJ-02 | Cobrar venta u orden | Operación validada y permiso de cobro. | Confirma método, importe y clave; actualiza pago y caja en la unidad definida. | Importe distinto, transición terminal, repetición o auditoría fallida: error/resultado original sin doble cobro. | Pago y movimiento contable quedan determinados. |
| UC-CAJ-03 | Consultar reporte operativo | Sesión y permiso de reportes. | Elige rango, consulta datos confirmados, exporta el mismo resultado visible. | Owner ausente, caché no confirmada o filtro inválido: error y sin cifras inventadas. | Reporte/CSV reproducible, sin escritura de hechos. |

### Administrador

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-ADM-01 | Administrar catálogo y menú | Rol administrador/principal y payload válido. | Crea/edita/activa productos, servicios, categorías o nodos sin ciclos. | Padre inexistente, ciclo, referencia inválida o rol menor: `FORBIDDEN`/validación sin mutación. | Owner correspondiente queda versionado y auditado. |
| UC-ADM-02 | Registrar compra y transferencia | Stock origen, costo y destino válidos. | Registra compra o transferencia, calcula costo promedio y crea movimientos. | Stock insuficiente, conflicto de versión o fallo parcial: rollback y owner intacto. | Productos y movimientos se reconcilian con `balanceAfter`. |
| UC-ADM-03 | Respaldar y restaurar | Permiso de backup/restore y alcance confirmado. | Crea snapshot versionado; para restaurar valida esquema, genera punto de retorno y aplica. | Backup corrupto, incompleto, dependencia caída o actor insuficiente: rechazo y estado previo legible. | Resultado auditado y rollback demostrable. |

### Administrador principal

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-PRI-01 | Gestionar administradores y permisos | Sesión de `administrador_principal` y matriz válida. | Crea/desactiva administradores y edita permisos declarativos por acción/recurso. | Administrador común, rol enviado por cliente o permiso expansivo: denegar sin mutación. | `users.json`/`role-permissions.json` quedan auditados y limitados. |
| UC-PRI-02 | Aprobar política de desbloqueo | Decisión documentada, minimización y retención definidas. | Mantiene exclusión por defecto o habilita owner restringido con permiso reforzado. | Política incompleta o impresión no permitida: bloquea excepción y no persiste secreto. | La política es trazable y las órdenes imprimen sin secreto por defecto. |
| UC-PRI-03 | Ejecutar dry-run de paridad | Entorno aislado, inventario y fixtures sintéticos. | Mapea fuentes, normaliza estados y produce diferencias revisables. | Ambigüedad, secreto, API caída o intento de cutover: bloquea sin tocar owners ni legado. | Mapping/estado de migración queda auditable, sin cutover. |

### Visitante no autenticado

| ID | Nombre | Precondición | Flujo principal | Alternos / excepciones | Postcondición |
|---|---|---|---|---|---|
| UC-VIS-01 | Intentar abrir el panel | Sin cookie de sesión válida. | Solicita `/app/*` o una consulta protegida. | Middleware/handler deniega; no devuelve datos, no crea sesión y no muta JSON. | No existe acceso de gestión ni auditoría con identidad falsa. |
| UC-VIS-02 | Intentar mutar por HTTP | Sin sesión o con body que inventa actor/rol. | Envía comando a una ruta de gestión. | `AUTHENTICATION_REQUIRED`/`FORBIDDEN`; `actorId` del body se ignora y la operación falla cerradamente. | Owners y auditoría de negocio permanecen sin mutación indebida. |
| UC-VIS-03 | Recibir respuesta segura | Request inválido o recurso no autorizado. | Observa el envelope de error. | El sistema minimiza existencia, campos sensibles y detalles internos. | Recibe error estable sin filtración ni afirmación de éxito. |

## Requisitos funcionales

Prioridades: **Alta** bloquea el slice; **Media** debe entrar antes de cerrar la capacidad; **Baja** puede quedar detrás de la compuerta explícita. Todos son **Objetivo futuro (Future target)** hasta probarse.

| ID | Módulo | Requisito observable | Prioridad |
|---|---|---|---|
| RF-01 | Dashboard | Mostrar métricas, excepciones, órdenes recientes y stock bajo usando consultas autorizadas y período validado. | Alta |
| RF-02 | Dashboard | Mostrar carga, error, reintento, foco y teclado sin inventar datos ni autorizar comandos. | Alta |
| RF-03 | Órdenes | Crear una orden numerada con cliente, equipo, diagnóstico, servicios, entrega, garantía y precio validados. | Alta |
| RF-04 | Órdenes | Mantener grafo de estados, notas, presupuesto, pagos y transiciones autorizadas sin cambios parciales. | Alta |
| RF-05 | Órdenes | Coordinar stock/pago con idempotencia y producir preview/impresión de dos copias sin desbloqueo por defecto. | Alta |
| RF-06 | Clientes | Crear, consultar y relacionar clientes con órdenes según permiso, esquema y owner único. | Alta |
| RF-07 | Stock | Administrar productos/categorías y transferencias con autorización, balances posteriores y rollback. | Alta |
| RF-08 | Stock | Registrar movimientos para compra, venta, devolución, anulación y consumo; calcular costo promedio ponderado. | Alta |
| RF-09 | Compras | Validar proveedor, cantidad, costo, comprobante, pago y fecha; persistir compra sin duplicar gasto o stock. | Alta |
| RF-10 | Ventas | Confirmar carrito, stock y pagos efectivo/tarjeta/transferencia/mixto con total exacto antes del descuento. | Alta |
| RF-11 | Ventas | Ejecutar devoluciones y anulaciones con motivo, permiso y clave idempotente, revirtiendo solo lo pendiente. | Alta |
| RF-12 | Servicios | Crear, editar, activar/desactivar y relacionar servicios con catálogo y stock según permisos declarativos. | Media |
| RF-13 | Caja | Abrir/cerrar una sesión por fecha, calcular esperado determinista y registrar contado/diferencia. | Alta |
| RF-14 | Reportes | Calcular netos, devoluciones, gastos, utilidad, inventario, cuentas, liquidez y capital desde owners confirmados. | Alta |
| RF-15 | Reportes | Exportar CSV e imprimir el resultado visible con rango y columnas explícitos, sin una segunda fórmula. | Media |
| RF-16 | Usuarios/permisos | Activar/desactivar usuarios y evaluar permisos por acción/recurso desde sesión server-side. | Alta |
| RF-17 | Usuarios/permisos | Permitir que solo `administrador_principal` cree o modifique administradores y permisos globales. | Alta |
| RF-18 | Respaldos | Crear backups manuales/automáticos versionados, acotados y sin secretos innecesarios. | Alta |
| RF-19 | Respaldos | Restaurar con validación, punto de retorno, rollback ante fallo parcial y auditoría del resultado. | Alta |
| RF-20 | Boleta/impresión | Producir preview y dos copias accesibles con foco, Escape, términos y datos de equipo validados. | Alta |
| RF-21 | Boleta/impresión | Excluir código, contraseña y patrón por defecto; exigir política y permiso reforzado para toda excepción. | Alta |

### Lectura de los requisitos

Cada RF combina una acción visible con una obligación de frontera. “Mostrar” no significa autorizar; “guardar” no significa confirmar; “error” no significa que se pueda devolver una colección vacía. En el flujo futuro, la entrada llega como dato no confiable, el servidor deriva el actor, autoriza la acción, valida referencias y delega al owner. El resultado se confirma solo después de persistencia y auditoría obligatoria.

Los requisitos de órdenes y boleta dependen de la decisión **GR-ORDERS.0** sobre datos de desbloqueo. Los requisitos de ventas, compras y caja dependen de ownership JSON, idempotencia y consistencia multiarchivo. Los requisitos de usuarios, permisos y respaldos dependen de la sesión server-side; ninguno puede resolverse solo con visibilidad de UI.

## Invariantes funcionales transversales

- Una mutación protegida sin principal válido, permiso, payload o owner **NO DEBE** cambiar datos.
- Una misma clave idempotente con el mismo payload devuelve el resultado original; con payload diferente devuelve conflicto.
- Un owner ausente o inválido no se convierte en una lista vacía ni habilita un fallback de navegador.
- Los tokens de estado persistidos son sin acentos y pertenecen a un catálogo finito; la etiqueta visible puede conservar acentos.
- Las operaciones relacionadas confirman todos sus efectos obligatorios o devuelven rollback/compensación auditable.
- `audit.json` registra la acción relevante con actor confiable o ausencia y minimiza secretos y PII.
- Preview, CSV e impresión derivan de datos validados; no pueden ampliar permisos ni reintroducir campos restringidos.
- Una sesión mock siempre conserva la etiqueta no productiva y nunca se describe como autenticación de producción.

## Resultados y errores observables

| Situación | Resultado esperado |
|---|---|
| Entrada malformada o estado desconocido | `VALIDATION_ERROR`, sin mutación del owner de negocio. |
| Sesión ausente, inválida o vencida | `AUTHENTICATION_REQUIRED`, sin datos protegidos ni mutación. |
| Rol o acción insuficiente | `FORBIDDEN`, evento de seguridad minimizado y owner intacto. |
| Recurso inexistente o ajeno | `NOT_FOUND_OR_FORBIDDEN`, sin revelar existencia ni detalles sensibles. |
| Clave repetida o versión obsoleta | Resultado original o `CONFLICT`, sin segundo efecto. |
| Dependencia, store o auditoría no disponible | Error explícito; no se anuncia éxito durable. |

## Preservación UX con límites seguros

**Comportamiento de referencia (Reference behavior):** la interfaz heredada ofrece sidebar contraíble, dashboard orientado a excepciones, tablas, búsqueda, modales y boleta con preview. **Objetivo futuro (Future target):** se conserva esa gramática mediante componentes separados, foco visible, teclado, toasts y dos copias de impresión, pero ninguna interacción cliente autoriza o escribe un hecho. La paridad visual no exime las pruebas negativas ni la decisión de privacidad.

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Seguridad | La sesión es server-side; cada acción y recurso se autoriza en handler; el fallo es cerrado y auditable. |
| RNF-02 | Seguridad | El cliente nunca establece actor, rol, permiso, owner ni éxito durable; payloads y archivos se validan en el límite. |
| RNF-03 | Seguridad | Secretos y PII innecesaria quedan fuera de fixtures, errores, auditoría, respuestas e impresión. |
| RNF-04 | Propiedad | Cada entidad tiene un único owner JSON; caché, borrador y backup están etiquetados y no son canónicos. |
| RNF-05 | Consistencia | Escrituras relacionadas son atómicas o usan protocolo documentado; idempotencia, versión y conflicto son deterministas. |
| RNF-06 | Rendimiento | El store JSON debe ser suficiente para escala de desarrollo, con lecturas acotadas y sin prometer capacidad productiva. |
| RNF-07 | Usabilidad | Dashboard, tablas, búsqueda, filtros y formularios funcionan en viewport pequeño y muestran carga/error/reintento. |
| RNF-08 | Accesibilidad | Controles tienen nombre accesible, foco visible, navegación por teclado, `aria-modal`, Escape y restauración de foco. |
| RNF-09 | Mantenibilidad | Los límites siguen el árbol de diseño; dominio puro; handlers delgados; archivos acotados y sin duplicación de owners. |
| RNF-10 | Testabilidad | Cada slice tiene TDD, pruebas positivas/negativas y evidencia de rollback; E2E cubre recorridos críticos cuando exista runtime. |

## Trazabilidad con OpenSpec

| Requisitos | Capacidad y archivo de especificación |
|---|---|
| RF-01–RF-02, RNF-07–RNF-08 | [`gestion-app-shell`](../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md) |
| RF-16–RF-17, RNF-01–RNF-03 | [`gestion-mock-identity`](../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md) |
| RF-06, RNF-04–RNF-06 | [`gestion-json-data`](../../../openspec/changes/gestion-rebuild/specs/gestion-json-data/spec.md) |
| RF-03–RF-05, RF-20–RF-21 | [`gestion-orders-workflow`](../../../openspec/changes/gestion-rebuild/specs/gestion-orders-workflow/spec.md) |
| RF-07–RF-12, RNF-05 | [`gestion-stock-commerce`](../../../openspec/changes/gestion-rebuild/specs/gestion-stock-commerce/spec.md) |
| RF-13–RF-15 | [`gestion-cash-reports`](../../../openspec/changes/gestion-rebuild/specs/gestion-cash-reports/spec.md) |
| RF-16–RF-19 | [`gestion-admin-backups`](../../../openspec/changes/gestion-rebuild/specs/gestion-admin-backups/spec.md) |
| RNF-02–RNF-06, RNF-10 | [`gestion-parity-migration`](../../../openspec/changes/gestion-rebuild/specs/gestion-parity-migration/spec.md) |
| RNF-01–RNF-05 | [`gestion-shared-contracts`](../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md) |

## Criterio de aceptación y límites

Un requisito solo puede llamarse implementado cuando existe evidencia de la capa apropiada, actor y autorización derivados, owner único, errores, auditoría, consistencia, privacidad y rollback. Esta documentación no afirma que exista API moderna, base de datos, autenticación productiva, CI verde, despliegue, E2E ni cutover.

La especificación se mantiene junto con [`AGENTS.md`](AGENTS.md), [`constitution.md`](constitution.md), [`plan.md`](plan.md), [`stacks.md`](stacks.md), [`tasks.md`](tasks.md) y los cinco documentos raíz [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
