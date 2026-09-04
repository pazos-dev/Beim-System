## Exploration: gestion-rebuild

### Current State

**Comportamiento de referencia (Reference behavior):** `sistema-gestion/` es una aplicación heredada de JavaScript que concentra la superficie de gestión en `index.html` y `app.js` (6.306 líneas). Integra clientes, órdenes, catálogo, stock de taller, compras, ventas, servicios, caja, reportes, usuarios, permisos, respaldos y recibos. La interfaz hidrata datos desde `http://127.0.0.1:3000/api/gestion`, conserva una copia amplia en `localStorage` y cambia a operaciones locales cuando el API no responde (`sistema-gestion/app.js:L1135-L1244`, `L1930-L1961`).

**Línea base observada (Observed baseline):** no existe un `report-engine.js` separado en el checkout. El motor está embebido en `app.js`, principalmente en `buildReportData`, `buildAccountingSnapshot` y sus renderizadores (`sistema-gestion/app.js:L1691-L1905`). La prueba enfocada carga todo `app.js` en un `vm` y comprueba ventas con devolución, gastos, utilidad, productos y efectivo esperado (`sistema-gestion/report-engine.test.js:L1-L28`).

**Objetivo futuro (Future target):** la reconstrucción aprobada usará Next.js 15, React 19 y TypeScript, con archivos JSON como fuente de datos de desarrollo y una sesión mock respaldada por usuarios JSON, rotulada explícitamente como no productiva. Los archivos JSON deben ser propiedad del servidor de desarrollo; `localStorage` solo puede ser caché, borrador o entrada de migración. La sesión mock debe seguir derivando el actor en el límite del servidor y no aceptar `actorId`, rol o permiso enviado por la interfaz como identidad, conforme a `constitution.md` y `spec.md`.

### Affected Areas

- `sistema-gestion/index.html:L19-L72` — shell, navegación, búsqueda, controles de período y acciones globales.
- `sistema-gestion/index.html:L74-L129` — dashboard y listado/filtros de órdenes.
- `sistema-gestion/index.html:L131-L226` — creación de orden, clientes y stock de taller.
- `sistema-gestion/index.html:L228-L373` — ventas, compras y catálogo de servicios.
- `sistema-gestion/index.html:L375-L467` — categorías administrativas, caja, reportes y configuración.
- `sistema-gestion/index.html:L470-L641` — paneles de detalle, diálogos destructivos, usuarios y login.
- `sistema-gestion/boleta/index.html:L27-L247` — formulario de ingreso técnico, vista previa, campos sensibles e impresión.
- `sistema-gestion/app.js:L1-L715` — constantes, estado inicial, menú, bootstrap e inicialización.
- `sistema-gestion/app.js:L1135-L1355` — normalización, persistencia local, estado financiero y respaldos.
- `sistema-gestion/app.js:L1357-L1640` — caja, acceso, roles, permisos y usuarios.
- `sistema-gestion/app.js:L1642-L1905` — reportes, contabilidad, exportación e impresión.
- `sistema-gestion/app.js:L1916-L2242` — cliente API, sincronización, navegación y períodos administrativos.
- `sistema-gestion/app.js:L2244-L2695` — menú administrativo, gastos, categorías y detalle histórico.
- `sistema-gestion/app.js:L2711-L3004` — integración entre la aplicación y el iframe de boleta.
- `sistema-gestion/app.js:L3006-L3447` — formularios y comandos de clientes, catálogo, ventas, compras y servicios.
- `sistema-gestion/app.js:L3459-L4705` — seguimiento técnico, estados, pagos y órdenes.
- `sistema-gestion/app.js:L4715-L5400` — clientes, stock, ventas, devoluciones, anulaciones y compras.
- `sistema-gestion/app.js:L5402-L6306` — diálogos UX, servicios, carrito, dashboard y utilidades.
- `sistema-gestion/boleta/script.js:L1-L1778` — catálogo local de boleta, payload, API opcional, fallback, búsqueda y mensajería con el padre.
- `pagina-web/server.js:L110-L937` — endpoints heredados `/api/gestion/*` consumidos por la gestión.
- `pagina-web/server.js:L1139-L1345` — endpoints heredados `/api/beim/receipts/*` y workflow de recibos.
- `pagina-web/server.js:L2303-L2972` y `L2988-L3355` — mapeos de respuesta, entidades y workflow de reparaciones.
- `pagina-web/server.js:L4040-L4049` — auditoría heredada que registra el error y continúa si falla la escritura.

### Inventory of Legacy Screens and Modules

#### Superficie visual

| Superficie | Capacidades observadas | Evidencia |
|---|---|---|
| Shell y navegación | Sidebar persistente y contraíble; sesión visible; navegación a Dashboard, Órdenes, Clientes, Stock taller, Ventas, Compras, Servicios y Configuración; acceso a la web. La configuración puede crear una jerarquía adicional de categorías administrativas. | `index.html:L19-L43`, `L375-L387`; `app.js:L197-L663`, `L717-L762` |
| Dashboard | Cuatro métricas diarias, ocho tarjetas de foco accionables, seis órdenes recientes y lista de stock bajo. Las tarjetas abren una vista o aplican un filtro. | `index.html:L74-L103`; `app.js:L4294-L4416` |
| Órdenes | Contadores por etapa, tabla limitada a diez filas, cambio rápido de estado y pago, doble clic para detalle y PDF para finalizadas. | `index.html:L105-L129`; `app.js:L4496-L4705` |
| Detalle de orden | Modal con contexto del cliente/equipo, próxima acción, edad de etapa, flujo visual, notas técnicas, ítems de presupuesto, aprobación y panel de recibo/historial. | `index.html:L490-L543`; `app.js:L3459-L3702`, `L3745-L4057` |
| Nueva orden | El módulo se muestra en un iframe `boleta/index.html`; la barra superior del padre permite guardar, imprimir o cancelar el borrador. | `index.html:L45-L72`, `L131-L137`; `app.js:L2711-L2832` |
| Clientes | Alta con nombre, documento, teléfono y correo; tabla con apertura de historial y borrado; modal con órdenes asociadas. | `index.html:L139-L166`, `L470-L481`; `app.js:L4715-L4827` |
| Stock taller | Transferencia web→taller, alta de producto, filtros por subcategoría, stock mínimo, precios, proveedores y modal de movimientos. | `index.html:L168-L226`; `app.js:L4867-L5222` |
| Ventas | Carrito multiproducto, venta de servicios ligados a repuestos, pagos efectivo/tarjeta/transferencia/mixto, descuento de stock, impresión, devolución y anulación. | `index.html:L228-L269`; `app.js:L3190-L3244`, `L5224-L5339` |
| Compras | Alta o selección de producto, datos del proveedor, cantidades, costo unitario, precio de venta, comprobante, envío, método/estado de pago y fecha; anulación posterior. | `index.html:L271-L321`; `app.js:L3246-L3365`, `L5341-L5400` |
| Servicios | Catálogo por categoría, marca y modelo, costo automático desde stock o costo manual, precio de venta, disponibilidad por origen, activar/desactivar, editar y eliminar. | `index.html:L323-L373`; `app.js:L3367-L3447`, `L5632-L6013` |
| Servicios administrativos | Árbol configurable, subcategorías, filtros día/mes/año/día/mes específico, gastos fijos, comida, cadete, otros, utilidades e historial. | `index.html:L375-L387`, `L402-L412`; `app.js:L2119-L2695` |
| Caja diaria | Selección de fecha, apertura, efectivo esperado, ingresos en efectivo, gastos, arqueo, diferencia y cierre. | `index.html:L389-L397`; `app.js:L1357-L1445` |
| Informes | Filtros, capital, tesorería, inventario, cuentas por cobrar/pagar, movimientos manuales, métricas, gráfico diario, destacados, tablas, CSV, impresión/PDF y detalle por categoría. | `index.html:L399-L420`; `app.js:L1642-L1905`, `L2438-L2525` |
| Configuración | Menú lateral y subcategorías, respaldo automático/descarga/restauración, alta de empleados, vínculo con cuentas web y permisos por rol. | `index.html:L422-L467`; `app.js:L403-L663`, `L1280-L1355`, `L1594-L1640` |
| Boleta de ingreso | Formulario de cliente/equipo/servicio, diagnóstico, entrega, garantía, precio/costo, inspección visual, código/contraseña/patrón, vista previa, términos, búsqueda y dos copias impresas. | `sistema-gestion/boleta/index.html:L27-L247`, `L251-L318`; `boleta/script.js:L962-L1153`, `L1552-L1778` |

#### Módulos, estado, API y fallback

| Módulo | Estado que administra | API heredado y respuesta consumida | Fallback local observado |
|---|---|---|---|
| Bootstrap compartido | `state` con clientes, órdenes, categorías, productos, ventas, gastos, servicios y categorías de servicios; `cashSessions`; estado financiero. | `GET /api/gestion/bootstrap` devuelve `clients`, `orders`, `productCategories`, `webProductCategories`, `products`, `services`, `serviceCategories`, `sales`, `expenses: []` y `financialState` (`server.js:L110-L154`). | `loadState()` parte de `localStorage` o `emptyState()`; si falla el bootstrap queda `apiOnline=false` (`app.js:L1135-L1217`, `L1930-L1961`). |
| Clientes | Identidad operativa y datos de contacto. | `POST /clients` → `{ ok, client }`; `DELETE /clients/:id` → `{ ok }` (`app.js:L3006-L3031`, `L4736-L4746`; `server.js:L362-L366`, `L730-L734`). | Agrega al arreglo local y borra también órdenes/ventas relacionadas; no hay reconciliación de propiedad (`app.js:L3027-L3031`, `L4738-L4746`). |
| Categorías y menú | Categorías de stock; árbol de menú; colores, orden y padres; categorías administrativas y de reportes. | `POST/PATCH/DELETE /categories`; el bootstrap mapea categorías. La creación de subcategorías de stock también usa `POST /categories` (`app.js:L562-L663`, `L5054-L5087`, `L5171-L5222`; `server.js:L865-L885`). | Menú, orden, árbol y categorías se guardan en `localStorage`; las categorías se mutan localmente si el API está caído (`app.js:L213-L340`, `L4955-L4977`, `L5067-L5069`). |
| Productos y stock | Identidad de producto, alcance `workshop/web`, categoría, marca, modelo, color, costo, precio, stock, mínimo y proveedor. | `POST /products` → `{ ok, product }`; `DELETE /products/:id`; `POST /purchases` → `{ ok, product }`; `GET /stock-movements?productId=` → `{ ok, movements }` (`app.js:L3092-L3159`, `L4867-L4928`; `server.js:L649-L721`, `L925-L937`). | Alta/borrado y movimientos básicos en memoria/localStorage; compras recalculan costo con promedio ponderado. El fallback de movimientos devuelve lista vacía (`app.js:L3255-L3340`, `L4911-L4927`). |
| Transferencia web→taller | Producto origen, categoría destino, cantidad y precio de venta en taller. | `POST /stock-transfers/web-to-workshop` → `{ ok, transferId, sourceProduct, workshopProduct }`; el servidor usa transacción, dos movimientos y auditoría (`app.js:L3162-L3184`; `server.js:L887-L922`). | No existe fallback funcional: el error se informa y no se simula localmente. |
| Servicios | `id`, categoría, nombre, costo/precio, producto relacionado, marca/modelo y `active`; selección de producto por stock/tipo. | `POST /services`, `PUT/DELETE /services/:id`; `POST/DELETE /service-categories` → entidad o `{ ok }` (`app.js:L3367-L3413`, `L5924-L5972`; `server.js:L369-L401`). | Mutación directa de `state.services` y `serviceCategories`, con `commit()` (`app.js:L3405-L3412`, `L5947-L5953`). |
| Ventas | Carrito, ítems, pagos, total/costo, cliente, numeración, vínculo a orden/recibo, devoluciones y anulación. | `POST /sales-batch` → `{ ok, products, receipt, order }`, con respuesta duplicada determinista; `POST /sales/:id/return` → `{ ok, return, order }`; `POST /sales/:id/annul` → `{ ok, duplicate, order }` (`app.js:L3213-L3240`, `L5275-L5338`; `server.js:L405-L645`). | Descuenta o devuelve stock en `state`, crea orden de venta local, gasto de costo y reversiones; queda sin persistencia durable y puede divergir (`app.js:L3226-L3234`, `L5277-L5292`, `L5324-L5336`). |
| Órdenes y reparaciones | Estados técnicos, notas, presupuesto, ítems, aprobaciones, stock consumido, pagos y fechas de finalización. | `POST /receipts` → `{ ok, receipt, order }`; `GET /receipts/next-number`; `PATCH /receipts/:id/status` y `PATCH /receipts/:id/payment-status` → `{ ok, receipt, order }` (`app.js:L2711-L2832`, `L3550-L3594`, `L4563-L4649`; `server.js:L724-L854`). | El padre sincroniza payload con `state.orders`; cambios de estado, stock y pagos se aplican localmente cuando no hay API (`app.js:L2926-L2996`, `L3588-L3593`, `L4591-L4649`). |
| Caja | Sesiones por fecha y montos de apertura/esperado/contado/diferencia. | `GET /cash-sessions` → `{ ok, sessions }`; `POST /cash-sessions/open` y `POST /cash-sessions/:id/close` → `{ ok, session }` (`app.js:L1396-L1445`; `server.js:L214-L218`, `L336-L358`). | La sesión fallback vive en `cashSessions` y no se guarda en `state` ni en `localStorage`; un refresco puede perderla (`app.js:L1410-L1426`). |
| Reportes y contabilidad | Rangos, filas diarias, ingresos, gastos, utilidad, ventas, productos netos, desglose de gastos, cuentas, capital, movimientos manuales y cuentas por pagar. | Persiste el agregado completo por `PUT /financial-state` → `{ ok, financialState }`; no existe endpoint de reportes independiente (`app.js:L1237-L1263`, `L1773-L1884`; `server.js:L158-L173`). | Calcula desde el estado local, incluyendo datos no confirmados; los movimientos y saldos se escriben en `localStorage` y se envían como snapshot (`app.js:L1642-L1670`, `L1856-L1873`). |
| Usuarios y permisos | Sesión de usuario de gestión, roles, permisos por vista, usuarios activos, último acceso y vínculo web. | `GET /management-setup-status`; `POST /management-login`/`management-setup`; `GET/POST/PATCH /management-users`; `GET/PUT /management-role-permissions`; `GET /management-web-users`; `POST /management-web-launch` (`app.js:L1466-L1640`; `server.js:L220-L333`). | La identidad mostrada se recupera de `sessionStorage`; visibilidad y autorización de interfaz dependen de `currentManagementUser` y mapas de permisos locales (`app.js:L1447-L1567`). |
| Respaldos | Snapshot de `state`, menú, contabilidad y preferencias; fecha del último backup; restauración y descarga JSON. | `POST /backups` → `{ ok, filename, savedAt }`; `GET /backups` → `{ ok, backups }`. El servidor conserva hasta 30 archivos en `sistema-gestion/respaldos` (`app.js:L1266-L1355`; `server.js:L176-L201`). | Descarga y restauración se ejecutan en el navegador; antes de restaurar intenta crear un backup remoto y luego vuelve a persistir el estado local (`app.js:L1303-L1332`). |
| Boleta embebida | Opciones de marca/modelo/servicio/inspección, términos, índice de recibos y payload completo. | En modo independiente con `userId`, usa `GET/POST /api/beim/receipts`, `/next-number` y `/:id/status`; el padre usa `POST /api/gestion/receipts` al guardar online (`boleta/script.js:L780-L845`, `L1310-L1433`; `app.js:L2740-L2755`). | Sin `userId`, guarda recibos y opciones en `localStorage`; el padre usa `postMessage` o acceso directo al iframe para extraer el payload (`boleta/script.js:L1255-L1283`, `L1754-L1778`; `app.js:L2834-L2915`). |

### Entity Model Observed

| Entidad | Campos clave observados | Evidencia |
|---|---|---|
| Cliente | `id`, `name`, `document`, `phone`, `email`. | `app.js:L34-L39`, `L1148-L1159`, `server.js:L2511-L2539` |
| Categoría de producto | `id`, `name`, `parentId`, `order`/`sortOrder`; colecciones separadas para gestión y web. | `app.js:L76-L80`, `L1172-L1198`; `server.js:L2869-L2921` |
| Producto | `id`, `categoryId`, `name`, `brand`, `model`, `color`, `costPrice`, `salePrice`/`price`, `stock`, `minStock`, `supplierName`, `inventoryScope`, `productType`, `warrantyDays`. | `app.js:L81-L85`, `L1176-L1191`; `server.js:L2923-L2972`, `L3551-L3573` |
| Servicio | `id`, `category`, `name`, `costPrice`, `salePrice`, `productKey`, `productName`, `brand`, `model`, `active`. | `app.js:L1201-L1211`, `L3377-L3387`; `server.js:L2572-L2623` |
| Orden de reparación | `id`, `receiptId`, `orderType`, `saleId`, `number`, datos del cliente/equipo, `problem`, `diagnosis`, `services`, `serviceItems`, `status`/`repairStatus`, `budget`, `cost`, `paid`, `paymentStatus`, `paymentMovements`, `technicianNotes`, `finishedAt`, `date`, `terms`. | `app.js:L1214-L1241`, `L2956-L2984`; `server.js:L2647-L2686` |
| Ítem técnico | `description`, `price`, `cost`, `approvalStatus`, `source`, `productId`, `itemType`, `consumesStock`, `quantity`, `stockDeducted`, `stockDeductedAt`. | `app.js:L3830-L3884`, `L3900-L3917`; `server.js:L2688-L2718` |
| Venta | `id`, `number`, `clientId`, `paymentMethod`, `payments`, `items`, `quantity`, `total`, `costTotal`, producto principal, vínculos de orden/recibo, `createdAt`, `date`, `returns`, `returnedAmount`, `annulledAt`, `annulReason`. | `app.js:L3213-L3234`, `L5224-L5339`; `server.js:L122-L140`, `L443-L452` |
| Compra/gasto | `id`, `productId`, `productName`, `concept`, `quantity`, `unitCost`, categoría, marca/modelo/color, `salePrice`, `supplier`, `invoiceNumber`, `amount`, `paymentMethod`, `account`, `paymentStatus`, `createdAt`, `date`, actor creador. | `app.js:L3285-L3361`; `app.js:L5614-L5625` |
| Movimiento de stock | `id`, `productId`, `productName`, `movementType`, `quantity`, `balanceAfter`, `referenceType`, `referenceId`, `detail`, `createdAt`; tipos observados: compra, venta, devolución, anulación, transferencia y orden técnica. | `app.js:L4918-L4924`; `server.js:L4108-L4115` |
| Sesión de caja | `id`, `businessDate`, `openingAmount`, `expectedAmount`, `countedAmount`, `difference`, `status`, `notes`, `openedAt`, `closedAt`. | `app.js:L1410-L1444`; `server.js:L4117-L4119` |
| Estado contable | `openingBalances` por `cash`, `bank`, `card`, `wallet`; `treasuryMovements`; `payables` con saldo, vencimiento y estado. | `app.js:L102-L112`, `L1663-L1670`, `L1856-L1884` |
| Usuario de gestión | `id`, `username`, `name`, `role`, `webUserId`, `active`, `lastLoginAt`, `createdAt`. | `app.js:L155-L160`, `L1605-L1639`; `server.js:L4121-L4143` |
| Permiso | Mapa rol→vistas; roles observados: `vendedor`, `tecnico`, `caja`, `administrador`, `administrador_principal`; permiso global `*` solo para principal. | `app.js:L149-L160`, `L1447-L1464`; `server.js:L4134-L4143` |
| Recibo/boleta | `id`, `number`, estado, cliente, equipo, `services`, `serviceItems`, problema, inspección, entrega, garantía, precio, datos de desbloqueo, términos, `payload`, auditoría temporal y campos de workflow. | `boleta/script.js:L1129-L1153`; `server.js:L2397-L2437` |
| Workflow de recibo | Partes, pagos, checklists y compras; campos de diagnóstico, técnico asignado, presupuesto, QA, garantía e invoice. | `server.js:L2411-L2421`, `L2988-L3024`, `L3296-L3355` |

### Use-Case Catalog by Actor

La siguiente lista describe capacidades visibles o permitidas por el código heredado. **Comportamiento de referencia (Reference behavior):** la visibilidad del cliente no constituye autorización; el servidor heredado recibe a menudo un `actorId` desde la consulta o el cuerpo (`server.js:L2024-L2029`, `L4146-L4157`).

- **Vendedor:** iniciar sesión de gestión; ver dashboard y órdenes; crear órdenes/boletas; consultar y crear clientes; consultar stock; registrar ventas multiproducto; elegir pagos; imprimir; abrir la web vinculada. No puede crear productos, compras ni servicios desde la UI según `applyManagementRoleVisibility` (`app.js:L1454-L1464`).
- **Técnico:** ver dashboard, órdenes, clientes y stock; crear una orden; abrir el detalle técnico; completar diagnóstico y notas; agregar servicios o repuestos; definir aprobación y estado; consumir o devolver stock asociado; consultar e imprimir el comprobante. La UI permite el catálogo de servicios para este rol (`app.js:L1454-L1464`, `L3459-L3594`).
- **Caja:** ver dashboard, órdenes y clientes; consultar/registrar ventas; abrir y cerrar caja; registrar arqueo; consultar categorías administrativas y reportes operativos habilitados; abrir la web. La apertura/cierre se presenta como operación privilegiada (`app.js:L1406-L1428`).
- **Administrador:** acceso a todas las vistas operativas, reportes y menú administrativo; crear productos, registrar compras, crear/editar servicios, administrar categorías, registrar gastos, caja y respaldos; crear usuarios no administradores; vincular cuentas web cuando el servidor lo permite.
- **Administrador principal:** todas las capacidades del administrador; creación/modificación de administradores; edición del mapa de permisos; único rol con `*`; primer alta mediante configuración inicial (`app.js:L1544-L1545`, `L1584-L1603`; `server.js:L236-L245`, `L301-L309`).
- **Persona no autenticada:** el panel se bloquea visualmente y se abre el diálogo de login; esto es un control de UX. La existencia de datos en `sessionStorage` o el cierre del panel no demuestra autenticación ni autorización.

### Cross-Module Workflows

1. **Orden técnica → presupuesto → stock → pago → caja/reportes.** La boleta recoge cliente, equipo, servicios, problema, inspección, entrega, garantía, precio/costo y acceso del equipo (`boleta/index.html:L27-L164`). El padre extrae el payload y crea una orden. El seguimiento agrega ítems con estado de aprobación; al aprobar o pagar, la ruta de estado reconcilia y descuenta productos en una transacción (`app.js:L3459-L3594`; `server.js:L781-L817`, `L2720-L2831`). El pago actualiza `paymentStatus`, registra el delta en `gestion_payment_movements` y puede forzar el descuento (`server.js:L821-L854`). La caja y los informes calculan ingresos según movimientos y fechas (`app.js:L1369-L1394`, `L1797-L1811`).
2. **Compra → stock → gasto/cuenta por pagar.** El formulario identifica o crea un producto, incrementa stock y calcula costo promedio. Registra la compra como gasto; agrega envío como gasto administrativo y, si queda pendiente, crea una cuenta por pagar (`app.js:L3246-L3365`). Online, `/purchases` actualiza el producto y registra movimiento/auditoría; el snapshot financiero posterior transporta el gasto completo (`server.js:L649-L699`, `app.js:L1237-L1243`).
3. **Venta → descuento → recibo de venta → costo → caja.** El carrito valida cantidad y que los pagos mixtos sumen el total. `sales-batch` descuenta cada producto, inserta movimientos y crea un recibo con `orderType: sale`; la UI agrega la venta y el costo (`app.js:L3190-L3244`; `server.js:L405-L458`). La devolución aumenta stock, ajusta importe y costo; la anulación restaura stock y marca el gasto como anulado (`app.js:L5275-L5338`; `server.js:L545-L645`).
4. **Transferencia web → stock de taller.** La operación exige producto web, categoría, cantidad y precio de taller. El servidor bloquea la fuente, crea o incrementa el destino, descuenta la web, registra dos movimientos y audita la transferencia (`app.js:L3162-L3184`; `server.js:L887-L922`). No debe inventarse una variante local para el rebuild sin una política de consistencia.
5. **Caja → arqueo.** Para una fecha, el efectivo esperado es apertura + ventas en efectivo + pagos de servicios − gastos de efectivo. El cierre compara el monto contado y guarda la diferencia (`app.js:L1357-L1444`). En el fallback, la sesión no sobrevive al refresco.
6. **Reporte → detalle administrativo.** `buildReportData` excluye compras de inventario del gasto operativo, calcula ventas netas después de devoluciones, suma cobros de órdenes por movimiento y agrupa productos por descripción. `buildAccountingSnapshot` separa liquidez, inventario, cuentas por cobrar/pagar y utilidad (`app.js:L1691-L1812`, `L1856-L1873`). Los menús administrativos reutilizan estas cifras y además permiten gastos categorizados y fijos (`app.js:L2260-L2435`, `L2541-L2620`).
7. **Recepción → reparación completa.** Además del flujo que consume `sistema-gestion`, el servidor conserva endpoints de referencia para partes, compras, aprobación de presupuesto, QA y pagos (`server.js:L1249-L1345`, `L2988-L3355`). La aprobación puede llevar la reparación a `En reparación`, QA aprobado a `Listo para entregar` y pago completo a `Entregado`; esos estados deben reconciliarse con el flujo simplificado del panel.
8. **Respaldo → restauración.** Al iniciar y cada seis horas se intenta crear un respaldo remoto. La descarga serializa un snapshot local; la restauración valida forma, intenta respaldar el estado actual, reemplaza estado/menú/contabilidad/preferencias y vuelve a renderizar (`app.js:L1280-L1355`). La restauración heredada no demuestra una restauración transaccional ni una política de rollback del propietario durable.

### State Ownership Map

| Fuente | Propiedad en la referencia | Tratamiento obligatorio para el rebuild JSON |
|---|---|---|
| API/servidor heredado | `beim_receipts`, productos, categorías, servicios, clientes de gestión, sesiones de caja, movimientos y usuarios de gestión. `bootstrap` compone varias fuentes y devuelve ventas desde `payload`. | **Objetivo futuro (Future target):** una capa de servidor/route handler autenticada debe ser el único límite de escritura y lectura protegida. Los archivos JSON del servidor son el almacenamiento canónico de desarrollo, con escrituras atómicas, validación, versión y auditoría mínima definida. |
| Estado financiero remoto | `gestion_financial_state` contiene gastos, menú, contabilidad y preferencias como un snapshot (`server.js:L2479-L2503`). | **Objetivo futuro:** separar entidades durables y snapshots de configuración aunque el almacenamiento siga siendo JSON; declarar un propietario por entidad y una estrategia de actualización/reintento antes de implementar. |
| `localStorage` principal | `sistema-gestion-data-v1`, capital inicial, contabilidad, menú, orden de categorías, nombres de gastos fijos, marcas/modelos, proveedores, árbol de categorías, estado de sidebar, metadatos de guardado y último backup (`app.js:L1-L16`, `L102-L140`). | Solo caché, borrador o entrada de migración. Nunca identidad, autorización ni hecho canónico. Debe poder invalidarse y mostrar si los datos son confirmados o locales. |
| `sessionStorage` | `sistema-gestion-current-user-v1` contiene el usuario que la interfaz muestra (`app.js:L1466-L1508`). | No es sesión confiable. El servidor del rebuild debe emitir/validar la sesión mock; la UI puede conservar únicamente una vista derivada no autoritativa. Etiquetar el flujo como no productivo. |
| Iframe de boleta | Mantiene opciones, términos, índice de hasta 300 recibos y, en modo sin actor, puede guardar el recibo localmente (`boleta/script.js:L1-L15`, `L1052-L1069`, `L1255-L1283`). | El formulario es entrada no confiable y borrador. El JSON de recibos del servidor debe ser canónico; el índice local se conserva solo como migración o recuperación explícita. |
| `pagina-web/boleta` | Implementación paralela de la boleta pública con la misma familia de claves y API, pero sin costos/ítems técnicos completos (`pagina-web/boleta/script.js:L1-L14`, `L812-L850`). | No duplicar el modelo. Reutilizar un contrato de recibo validado y distinguir flujo público de flujo de gestión. |
| Fallback offline/local | Deja `apiOnline=false`, muta arreglos en el navegador, genera IDs locales, crea órdenes de venta locales y puede guardar una orden de reparación en `localStorage` (`app.js:L1930-L1961`, `L2926-L2996`). | No copiar como arquitectura segura. En JSON dev, una dependencia caída debe devolver error explícito para mutaciones protegidas, o un borrador claramente no confirmado; nunca declarar éxito durable. |
| Carpeta `sistema-gestion/respaldos` | El servidor heredado escribe archivos automáticos y retiene hasta 30 (`server.js:L176-L201`). | Tratar como evidencia de migración/backup de referencia. El rebuild necesita formato versionado, restauración comprobable y límite de rollback, no solo descarga del navegador. |

Hay dos fuentes heredadas de deriva especialmente relevantes: el bootstrap retorna `expenses: []` y recupera los gastos desde `financialState`, mientras el cliente conserva una copia local; además, el cliente conserva ventas/gastos locales cuando la respuesta remota viene vacía (`server.js:L142-L154`; `app.js:L1933-L1953`). La reconstrucción debe modelar una sola propiedad JSON por entidad y no usar “respuesta vacía” como permiso para preferir silenciosamente el caché.

### Quality, Testing and UX Observations

**Línea base observada (Observed baseline), comprobación reciente:**

- `node --check sistema-gestion/app.js` — pasó.
- `node --check sistema-gestion/boleta/script.js` — pasó.
- `node --check pagina-web/server.js` — pasó.
- `node sistema-gestion/report-engine.test.js` — pasó y produjo `income: 80`, `expenses: 30`, `profit: 50`, `cashExpected: 60`, con producto neto de una unidad e importe 80.
- La prueba solo cubre funciones de cálculo con fixtures en un `vm`; no prueba UI, API, JSON, permisos, transacciones, concurrencia, auditoría, migración, rollback ni E2E (`report-engine.test.js:L15-L28`).
- No se observa `report-engine.js` separado, harness dedicado API/backend/datos, suite E2E o suite de seguridad. Los bloqueos generales de workspace registrados en `AGENTS.md`, `plan.md` y `tasks.md` siguen siendo externos a esta exploración.

**Patrones UX que conviene conservar como referencia:**

- Sidebar contraíble y menú jerárquico con orden persistente; búsqueda global y filtros de período.
- Dashboard orientado a excepciones: órdenes demoradas, pagos pendientes, stock bajo y gastos del día.
- Tablas con encabezado fijo, límite visual de filas, acciones por fila y apertura por doble clic.
- Modal de detalle con `aria-modal`, `alertdialog`, confirmación de acciones destructivas, restauración de foco y cierre con Escape.
- Flujo de boleta de dos columnas con vista previa en vivo, datalists, selección múltiple de servicios, autocompletado de precio, edición de términos y dibujo de patrón.
- Confirmaciones explícitas para anulaciones, devolución de stock, entrega con saldo pendiente y borrado; diálogo de reintento que conserva el borrador si falla el guardado.
- Atajos Enter/Ctrl+Enter, toasts, estados de carga, exportación CSV y dos copias impresas A4.

**Problemas observados que no deben trasladarse automáticamente:**

- Monolito de 6.306 líneas, dos implementaciones de boleta y mapeos duplicados entre recibo, orden y venta.
- Estado duplicado en `state`, snapshots financieros, claves locales, `sessionStorage` e índices del iframe; sincronización por intervalo de cuatro segundos y reconciliaciones heurísticas.
- El fallback local no tiene el mismo contrato ni persistencia que el servidor; la caja local es efímera y las operaciones pueden crear hechos que nunca se suben.
- El cliente envía `actorId` en consultas/cuerpos y la autorización de varias rutas depende de ese valor; el helper `requireGestionRoleIfConfigured` incluso omite el control si no existen usuarios (`server.js:L4146-L4157`). Esto es una brecha de identidad, no un patrón para copiar.
- El mapa dinámico de permisos controla principalmente la visibilidad y navegación del cliente; los handlers aplican comprobaciones estáticas e incompletas, por lo que una vista oculta no equivale a una autorización por acción/recurso (`app.js:L1447-L1452`; `server.js:L294-L309`, `L4146-L4157`).
- Varias rutas heredadas no muestran una compuerta de sesión consistente: bootstrap, backups, lecturas de stock/caja y algunos CRUD se ejecutan sin comprobar un principal en el handler (`server.js:L110-L218`, `L362-L401`, `L737-L937`).
- En la rama online de alta de una compra para un producto nuevo se crea el producto mediante `/products` y luego el cliente agrega el gasto al estado local, sin usar `/purchases` para ese registro; la posterior sincronización financiera es la que podría transportarlo como snapshot (`app.js:L3267-L3340`; `server.js:L649-L699`).
- Los campos de desbloqueo se muestran, guardan en payload/estado local y pueden aparecer en comprobantes impresos (`boleta/index.html:L147-L160`, `L220-L229`; `app.js:L4076-L4256`). Requieren minimización, acceso reforzado o una decisión explícita antes del rebuild.
- El servidor heredado puede ocultar un fallo de auditoría después de registrarlo en consola (`server.js:L4040-L4049`), por lo que una respuesta exitosa no prueba auditoría durable.
- Hay normalizaciones de estados con acentos y sin acentos en distintas fronteras; sin un vocabulario único, los filtros, reportes y transiciones pueden contar el mismo estado de forma diferente (`app.js:L665-L679`, `server.js:L2840-L2859`).

### Approaches

1. **Traslado directo de la aplicación heredada** — Reproducir `index.html`/`app.js` dentro de una página Next.js y reemplazar gradualmente `fetch` por handlers JSON.
   - Pros: paridad visual rápida; reutiliza nombres, flujos y cálculos ya conocidos.
   - Cons: conserva el monolito, la doble propiedad, los fallbacks inseguros y la ambigüedad de recibo/orden/venta; dificulta cumplir identidad, validación, auditoría y pruebas.
   - Effort: High.

2. **Reconstrucción por módulos y cortes verticales** — Separar shell, sesión mock, contratos, almacenamiento JSON de servidor, dominio de órdenes/stock/ventas, contabilidad/reportes y adaptador de recibos; entregar cada recorrido con pruebas y ownership explícitos.
   - Pros: limita el blast radius; permite preservar UX sin copiar estado local; cada mutación puede tener validación, autorización derivada, auditoría y prueba; facilita cadenas de PR por debajo de 400 líneas.
   - Cons: requiere decidir primero contratos, estados y propietarios; la paridad con reportes y casos heredados se alcanza por etapas.
   - Effort: High, pero controlable por slices.

### Recommendation

Adoptar el segundo enfoque. La propuesta debe conservar la gramática UX comprobada —dashboard operativo, menú jerárquico, tablas, modales y boleta con vista previa—, pero reconstruir el modelo como módulos TypeScript con una sola capa de comandos/consultas y almacenamiento JSON del servidor. La sesión mock respaldada por JSON debe rotularse **no productiva**, emitir una identidad de servidor para la sesión y limitarse a desarrollo; no debe aceptar actores enviados por la UI.

Descomposición recomendada para `gestion-rebuild`, alineada con el presupuesto de revisión y con las dependencias de `tasks.md`:

1. **Fundación de la superficie:** shell Next.js, rutas, layout, estado de navegación y componentes de tabla/modal; sin mutaciones de negocio.
2. **Sesión mock y contratos:** `users.json`, login/logout, sesión derivada en servidor, roles/permisos declarativos y respuestas de error; incluir etiqueta visible no productiva y pruebas negativas.
3. **Almacenamiento JSON y lectura:** repositorios atómicos/versionados, bootstrap tipado y entidades de clientes, categorías, productos y servicios; separar caché de datos confirmados.
4. **Órdenes y recibos:** formulario/preview, payload validado, estados de reparación, ítems de presupuesto, privacidad de desbloqueo, impresión y relación cliente–orden–recibo.
5. **Stock, compras y ventas:** movimientos, costo promedio, carrito, pagos, devoluciones/anulaciones e idempotencia; no permitir doble descuento.
6. **Caja y reportes:** sesiones persistentes, cálculo de efectivo, reportes diarios/netos, contabilidad y exportaciones; trasladar la prueba de cálculo y agregar casos de borde.
7. **Administración y respaldos:** menú configurable, usuarios, permisos, respaldos JSON versionados y restauración/rollback probado.
8. **Paridad y migración:** inventario de `localStorage`, payloads y estados heredados; mapping explícito, fixtures sintéticos, reconciliación y política de retiro. No migrar automáticamente datos sensibles ni convertir caches en canónicos.

Cada slice debe declarar su owner JSON, entradas, actor, acción, validación, salida de éxito/error, auditoría, prueba y rollback. La secuencia de implementación sigue siendo **Objetivo futuro (Future target)** hasta que las compuertas de `plan.md` y `tasks.md` aporten evidencia ejecutable.

### Risks

- **Identidad y autorización:** una sesión mock implementada solo en React, un rol oculto o un `actorId` del navegador repetirían la brecha heredada y bloquearían la aceptación constitucional.
- **Deriva de propiedad:** copiar simultáneamente estado JSON, `localStorage` y respaldos heredados puede producir doble escritura, ventas/stock duplicados o reportes inconsistentes.
- **Datos sensibles:** códigos, contraseñas y patrones de desbloqueo aparecen en el flujo heredado; su almacenamiento, respuesta, impresión, retención y migración requieren decisión previa.
- **Consistencia financiera:** compras, costos, devoluciones, anulaciones, pagos parciales y caja cruzan varias entidades; sin transacción o protocolo determinista los totales pueden no coincidir.
- **Paridad de estados:** variantes con/sin acento, estados de recibo y estados de orden no son todavía un vocabulario único.
- **Alcance:** intentar portar todas las capacidades en una sola unidad excedería el presupuesto de 400 líneas y repetiría el acoplamiento del monolito.
- **Calidad disponible:** la prueba heredada es enfocada y sintáctica; no demuestra seguridad, integración, E2E, migración, backup/restore ni rollback.

### Ready for Proposal

Sí. La exploración aporta evidencia suficiente para iniciar `sdd-propose`. La propuesta debe fijar el alcance del primer slice, declarar fuera de alcance la base de datos y la autenticación productiva, definir el almacenamiento JSON del servidor y la sesión mock no productiva, nombrar ownership por entidad, preservar la UX seleccionada, y registrar como requisitos bloqueantes la validación, autorización derivada, auditoría, idempotencia, privacidad y rollback.
