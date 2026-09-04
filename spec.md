# Especificación de comportamiento del sistema

Este documento es la autoridad del comportamiento observable y de los invariantes de Beim-System-Tech. Describe la línea base comprobada, el comportamiento heredado útil como referencia y los contratos que deberán demostrarse antes de considerar implementado un objetivo futuro. No convierte un plan, un mock, una ruta de interfaz, un estado local, una semilla ni una intención de CI en una capacidad existente.

## Autoridad y relación con la base documental

Cada documento raíz tiene un límite de autoridad distinto:

| Documento | Autoridad |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Procedimiento del repositorio, colaboración y validación. |
| [`constitution.md`](constitution.md) | Principios normativos de seguridad, propiedad, consistencia, migración y calidad. |
| [`spec.md`](spec.md) | Comportamiento observable, contratos de límites e invariantes de este sistema. |
| [`plan.md`](plan.md) | Secuencia futura, compuertas, reversión y obsolescencia. |
| [`tasks.md`](tasks.md) | Unidades ejecutables, dependencias, aceptación y evidencia de entrega. |

Si existe una contradicción, este documento gobierna el comportamiento, pero no puede relajar un principio de [`constitution.md`](constitution.md), adelantar una etapa de [`plan.md`](plan.md) ni declarar completa una tarea de [`tasks.md`](tasks.md).

## Alcance y lenguaje de estado

El alcance comprende cinco fronteras: web pública, web de gestión, API, backend y base de datos. También comprende los flujos que las atraviesan: catálogo, pedidos, recibos y reparaciones, gestión operativa, auditoría y migración.

Las afirmaciones usan obligatoriamente estas etiquetas:

- **Línea base observada (Observed baseline):** hecho verificado en el checkout actual, con su ruta o evidencia.
- **Comportamiento de referencia (Reference behavior):** comportamiento heredado o transicional que sirve para compatibilidad y migración. No es automáticamente seguro, canónico ni conforme.
- **Objetivo futuro (Future target):** contrato previsto que todavía requiere las compuertas y pruebas indicadas antes de llamarse implementado.

Los componentes modernos ausentes —incluidos `apps/web`, las aplicaciones de escritorio y móvil y los paquetes compartidos ausentes— son objetivos futuros, no componentes disponibles. Esta especificación no autoriza cambios en código, SQL, semillas, bases de datos, CI, despliegue, Engram, `.codegraph/` ni `.atl/`.

## Actores, entradas y propiedad transversal

### Actores identificados

| Actor | Estado y responsabilidad observable |
|---|---|
| Visitante | Consulta el catálogo público sin que la interfaz pública demuestre por sí sola una identidad. |
| Cliente web | Puede autenticarse o registrar una cuenta mediante las rutas heredadas de autenticación; sus datos son entradas no confiables hasta validarse en el servidor. |
| Operador de gestión | Actor asociado a las operaciones de ventas, clientes, servicios, stock, caja, recibos y reportes. En la base heredada aparecen roles como vendedor, técnico, administrador y administrador principal. |
| Técnico | Actor de referencia para asignación, diagnóstico, reparación, control de calidad y entrega; su autorización efectiva debe comprobarse en el servidor. |
| Administrador | Actor de referencia para usuarios, permisos, catálogo, configuración y operaciones privilegiadas; el nombre del rol enviado por el cliente no establece su autoridad. |
| Servicio/backend | Actor confiable previsto para validar comandos, aplicar invariantes, abrir transacciones y emitir auditoría. No existe como capa moderna demostrada. |
| Base de datos | Propietaria futura de los registros durables y de la auditoría una vez aprobada la migración. No es un actor humano ni sustituye la autorización del backend. |

### Contrato común de una operación

Toda capacidad que atraviese más de una frontera deberá poder responder, antes de su aceptación, a estas preguntas:

1. ¿Qué entrada llega al límite y cómo se valida?
2. ¿Qué actor se deriva de una sesión o credencial confiable?
3. ¿Qué acción y recurso puede autorizar ese actor?
4. ¿Qué límite es el propietario canónico de la escritura?
5. ¿Qué salida observable se entrega en éxito, rechazo, validación fallida, conflicto y error técnico?
6. ¿Qué registro auditable queda y qué datos sensibles se minimizan?
7. ¿Qué evidencia reproducible prueba propiedad, consistencia, seguridad y reversión?

**Objetivo futuro (Future target):** para las operaciones protegidas, la secuencia obligatoria será `entrada → autenticación del servidor → autorización por acción y recurso → validación → operación de dominio → transacción persistente → auditoría → respuesta`. Una interfaz no podrá saltarse un paso ni convertirse en propietaria independiente del mismo hecho.

## Frontera 1: web pública

### Línea base observada (Observed baseline)

- `pagina-web/` existe como tienda pública heredada, interfaz de recibos y cliente del servidor HTTP.
- `pagina-web/server.js` expone, entre otras, las rutas públicas de salud, bootstrap de catálogo, autenticación web, usuarios, pedidos, recibos públicos y checkout/pagos heredados. La existencia de una ruta no demuestra que sea una API moderna ni que tenga autorización suficiente.
- La interfaz de recibos recopila nombre y documento del cliente, teléfono, equipo, servicios, problema informado, elementos visuales, tiempo de entrega, garantía, precio y datos de desbloqueo antes de enviarlos a la ruta heredada de recibos.
- `apps/web/` no está presente en el árbol actual. El README no sustituye esta evidencia.

### Comportamiento de referencia (Reference behavior)

La tienda permite consultar productos y categorías, iniciar autenticación o registro, crear pedidos y consultar estados según las rutas heredadas. La interfaz de recibos permite preparar una orden de trabajo y obtener numeración desde el servidor heredado. Este comportamiento sirve para compatibilidad y migración, pero no establece que la identidad del cliente, el precio, la disponibilidad, el pago o el número de recibo sean seguros frente a entradas manipuladas.

El navegador puede enviar datos de cliente y de pedido, pero el servidor heredado debe tratar todos esos datos como entradas no confiables. Las credenciales heredadas, valores predeterminados y respuestas exitosas del cliente no se reproducen ni se consideran garantías.

### Objetivo futuro (Future target)

La futura web pública deberá:

- entregar catálogo y detalle de producto mediante un contrato versionado de lectura;
- aceptar solo comandos de pedido y recibo validados en el límite, sin confiar en identificadores o roles aportados por el navegador;
- derivar la identidad del cliente en el servidor cuando una operación la requiera;
- devolver estados y errores deterministas, sin exponer secretos ni datos de otros clientes;
- tratar el API/backend como intermediario y a la base canónica como propietaria de los resultados durables.

**Criterio de aceptación:** no podrá llamarse implementada hasta demostrar rutas, contratos, integración con persistencia, denegaciones de autenticación/autorización y recorridos E2E de catálogo, pedido y recibo.

## Frontera 2: web de gestión

### Línea base observada (Observed baseline)

- `sistema-gestion/` es una aplicación heredada en JavaScript que integra pedidos, clientes, stock de taller, compras, ventas, servicios, caja, reportes, permisos, respaldos y recibos.
- `sistema-gestion/app.js` hidrata datos desde `/api/gestion`, conserva una parte sustancial del estado en `localStorage` y activa un modo local o sin conexión cuando no puede comunicarse con el servidor.
- La aplicación heredada contiene la interfaz de recibos en `sistema-gestion/boleta/` y también mantiene estado local para su numeración y datos.
- El prototipo `apps/gestion` fue eliminado del árbol; su comportamiento observado (autenticación mock del lado del cliente que aceptaba cualquier nombre de usuario no vacío, CRUD parcial de clientes, enlaces `/gestion` inconsistentes frente a rutas reales `/` y `/clients`, e importaciones no resolubles de `@beim/data` y `@beim/contracts`) queda como **Comportamiento de referencia (Reference behavior)** preservado en el historial de Git.
- La superficie de gestión consolidada no existe actualmente en el árbol; es **Objetivo futuro (Future target)** y se planifica en un cambio dedicado.

### Comportamiento de referencia (Reference behavior)

La gestión heredada permite consultar y mutar clientes, servicios, categorías, productos, ventas, compras, stock, sesiones de caja, recibos, permisos y reportes mediante una combinación de API y estado del navegador. Puede crear respaldos de estado y restaurarlos, pero `localStorage`, el fallback local y el actor enviado por la interfaz son evidencia de referencia o entrada de migración, no propiedad canónica ni autorización.

El prototipo eliminado `apps/gestion` sirve como referencia de una interfaz CRUD de clientes y de acciones del servidor incompletas (evidencia en el historial de Git). Una acción marcada `use server` o una página protegida visualmente no demuestra autenticación, autorización, persistencia disponible ni auditoría de producción.

### Objetivo futuro (Future target)

La web de gestión deberá ser una única superficie de operación autenticada y autorizada por el servidor. Cada formulario o comando deberá declarar recurso, acción, actor permitido, validación, salida y fallo. El estado del navegador solo podrá ser caché, borrador o entrada de migración identificada; nunca podrá competir silenciosamente con el propietario durable.

Las operaciones privilegiadas —permisos, usuarios, precios, stock, caja, anulaciones, pagos, restauraciones y cambios de configuración— deberán fallar cerradamente sin principal válido o permiso suficiente. El rol se derivará de la sesión del servidor y se comprobará por recurso y acción.

**Criterio de aceptación:** se requieren pruebas de autorización negativa, integración de cada mutación protegida, E2E de los recorridos operativos y evidencia de que una desconexión, reintento o conflicto no crea una segunda fuente canónica.

## Frontera 3: API

### Línea base observada (Observed baseline)

- `pagina-web/server.js` es un servidor HTTP Node.js con rutas mezcladas para catálogo, autenticación, pedidos, recibos, gestión, catálogo administrativo, cargas y pagos.
- El servidor incluye `/api/health`, `/api/catalog/bootstrap`, `/api/orders`, `/api/beim/receipts`, `/api/gestion/*` y otras rutas heredadas. También contiene handlers que reciben `actorId` u otros datos de actor desde la consulta o el cuerpo.
- `sistema-gestion/app.js` llama a `http://127.0.0.1:3000/api/gestion`; procesa respuestas no exitosas como errores y pasa a modo local cuando falla la comunicación.
- Las acciones de `apps/gestion` llaman directamente a un paquete de datos ausente y no constituyen un contrato HTTP moderno demostrado.

### Comportamiento de referencia (Reference behavior)

La API heredada acepta solicitudes HTTP, valida algunos campos, llama a consultas o transacciones y devuelve JSON de éxito o error. Expone operaciones para bootstrap, clientes, servicios, categorías, ventas, compras, sesiones de caja, recibos, estados, productos, usuarios y pedidos. La amplitud de estas rutas es compatibilidad histórica; no demuestra una separación de contratos, una política de versiones ni seguridad completa.

Los actores enviados por el cliente y las comprobaciones de interfaz son entradas no confiables. Una respuesta HTTP exitosa no demuestra que el actor estuviera autenticado, que el recurso le perteneciera o que todos los efectos relacionados se confirmaran atómicamente.

### Objetivo futuro (Future target)

El API deberá definir contratos versionados y explícitos para cada frontera. Todo endpoint protegido deberá:

1. autenticar en el servidor y rechazar principales ausentes, inválidos o vencidos;
2. autorizar la acción sobre el recurso solicitado con mínimo privilegio;
3. validar forma, tipos, rangos, relaciones e idempotencia antes de delegar;
4. delegar a un backend que sea propietario de la decisión de dominio;
5. devolver un esquema estable para éxito, validación, denegación, conflicto y fallo técnico;
6. producir auditoría confiable para mutaciones, denegaciones y fallos relevantes.

El API no podrá aceptar un `actorId`, rol, propietario o permiso del cuerpo de la solicitud como prueba de identidad. La compatibilidad heredada deberá aislarse, observarse y tener una política explícita de retiro.

**Criterio de aceptación:** contratos probados, pruebas negativas de identidad/autorización, repetición segura de solicitudes, respuestas deterministas y pruebas de integración con el backend y la base de datos.

## Frontera 4: backend

### Línea base observada (Observed baseline)

- La lógica actual vive principalmente en handlers de `pagina-web/server.js` y helpers de `pagina-web/db.js`; no se observa una capa moderna separada de dominio y aplicación.
- `db.js` ofrece modo local o PostgreSQL según variables de entorno, consultas agrupadas y `withTransaction`.
- El servidor contiene lógica heredada para pedidos, stock, pagos, recibos, compras, ventas, caja, usuarios de gestión y registros de auditoría.
- `apps/gestion` intenta usar paquetes de datos ausentes; por tanto, no demuestra un backend moderno ejecutable.

### Comportamiento de referencia (Reference behavior)

Los handlers convierten solicitudes en consultas, actualizaciones y respuestas. Algunas mutaciones relacionadas usan transacciones y existe `writeAuditLog`, que inserta en `audit_logs`; ese helper captura y registra el error si la auditoría falla, por lo que la evidencia actual no garantiza que toda mutación tenga una auditoría durable. El backend heredado puede aplicar validaciones y reglas útiles para compatibilidad, pero no debe asumirse que cubre todos los límites, actores o conflictos.

### Objetivo futuro (Future target)

El backend deberá organizar comandos, consultas y reglas de dominio sin permitir que ninguna UI escriba directamente hechos canónicos. Deberá validar antes de persistir, aplicar transacciones a cambios relacionados, definir idempotencia y concurrencia, y distinguir errores de validación, autenticación, autorización, conflicto, dependencia y almacenamiento.

El backend autenticado será propietario de las decisiones de identidad y autorización. Emitirá la auditoría en un límite confiable y solo informará éxito cuando el resultado durable y los efectos obligatorios hayan alcanzado el estado acordado. Si la auditoría obligatoria no puede persistirse, la política de fallo deberá estar definida y probada antes del despliegue.

**Criterio de aceptación:** pruebas unitarias de reglas, integración de transacciones y errores, pruebas de seguridad, pruebas de concurrencia/reintento y evidencia de trazabilidad desde la solicitud hasta la escritura y la auditoría.

## Frontera 5: base de datos

### Línea base observada (Observed baseline)

- `pagina-web/db/schema.sql` es un script PostgreSQL que contiene usuarios, catálogo, pedidos, recibos, piezas, pagos, checklists, auditoría, gastos, sesiones de caja, estado financiero, movimientos de pago, usuarios de gestión, permisos y tokens de acceso web.
- El script mezcla creación de tablas, `ALTER TABLE`, backfills, índices y reparación de secuencias en una reproducción acumulativa; no se observa un historial moderno de migraciones versionadas con rollback probado.
- `pagina-web/db/seed.sql` inserta usuarios, catálogo, configuración y contenido inicial. Las semillas y los valores predeterminados son evidencia de transición, no autoridad de identidad ni datos de producción.
- `pagina-web/db.js` puede usar almacenamiento local o PostgreSQL. El navegador también conserva estado operativo en `localStorage`.

### Comportamiento de referencia (Reference behavior)

PostgreSQL es el almacenamiento duradero de referencia para la API heredada cuando se ejecuta en ese modo. Las relaciones, restricciones, secuencias y tablas de `schema.sql` documentan hechos que deben preservarse o reconciliarse. El estado local del navegador, las semillas y cualquier modo local son fuentes de evidencia o migración; no se convierten en canónicos por existir primero o por ser visibles para una persona operadora.

La línea base no prueba que exista una única propiedad entre el estado de `sistema-gestion`, la API heredada, PostgreSQL y el prototipo moderno. Si esos estados discrepan, la discrepancia debe registrarse y resolverse mediante una decisión explícita antes de copiar o eliminar datos.

### Objetivo futuro (Future target)

La base canónica designada deberá ser propietaria de registros durables, relaciones, numeración, estados y auditoría. La API/backend autenticada será el único límite autorizado para decidir y escribir esos hechos. Las migraciones deberán ser versionadas, repetibles, observables, respaldables y reversibles dentro de una ventana declarada.

Las escrituras relacionadas deberán ser transaccionales o contar con un mecanismo de consistencia documentado. Las claves, estados, pagos, stock, recibos, caja y auditoría deberán tener invariantes verificables; no se aceptará una mezcla silenciosa de estado local, legado y objetivo.

**Criterio de aceptación:** propiedad aprobada, esquema y migraciones reproducibles en un entorno aislado, reconciliación documentada, respaldo restaurable, rollback probado, pruebas de consistencia y smoke tests de lectura y mutación controlada.

## Invariantes de identidad, autorización y datos

Los siguientes invariantes rigen todas las fronteras, aunque la línea base heredada no los cumpla:

1. **Identidad confiable:** el servidor deriva el actor de una sesión, credencial o mecanismo equivalente validado. `localStorage`, un nombre de usuario no vacío, una ruta visible, un `actorId` enviado por el cliente o un rol proporcionado por quien llama no establecen identidad.
2. **Autorización por acción:** una identidad válida no autoriza automáticamente todos los recursos. La autorización debe comprobar operación, recurso, alcance y rol.
3. **Validación de límites:** los datos de cliente, importes, estados, identificadores, archivos, relaciones y transiciones se validan antes de autorizar efectos y antes de persistir.
4. **Propiedad única:** cada hecho durable tiene un propietario declarado. Ninguna interfaz, semilla, handler de compatibilidad o proceso paralelo escribe el mismo hecho sin una política explícita de sincronización.
5. **Consistencia:** una operación relacionada confirma todos sus efectos obligatorios o devuelve un fallo explícito. Los reintentos y solicitudes duplicadas tienen un resultado determinista o idempotente.
6. **Auditoría:** una mutación, una denegación de seguridad, un fallo de validación relevante y una reversión conservan actor confiable, acción, entidad, instante, resultado y detalles minimizados.
7. **Minimización:** secretos, credenciales, tokens, datos personales innecesarios y datos de producción no aparecen en documentación, fixtures, respuestas o auditorías sin justificación.
8. **Fallo cerrado:** si falta identidad, permiso, propiedad, validación, dependencia o evidencia de consistencia, una operación protegida no muta datos.

**Objetivo futuro (Future target):** la selección del proveedor y mecanismo de identidad queda abierta. Esa pregunta no bloquea estos invariantes, pero sí bloquea declarar producción, migración o cutover.

## Flujos funcionales transversales

### Catálogo

- **Línea base observada (Observed baseline):** existe un bootstrap público de catálogo y hay rutas heredadas de administración de categorías, productos, imágenes, servicios y categorías de servicios. La gestión también mantiene estructuras de stock y catálogo en el navegador.
- **Comportamiento de referencia (Reference behavior):** una persona visitante consulta catálogo; una persona operadora crea, actualiza o elimina elementos y puede relacionar productos con servicios o stock. Las respuestas y el estado local pueden quedar desincronizados.
- **Objetivo futuro (Future target):** el API valida visibilidad, identificadores, precios, inventario y cambios de catálogo; el backend aplica reglas y la base canónica confirma el resultado. La aceptación requiere lecturas públicas, mutaciones autorizadas, conflicto de concurrencia y auditoría.

### Pedidos, ventas y pagos

- **Línea base observada (Observed baseline):** `server.js` expone lectura y creación de pedidos, cambios de estado, estado de pago y una ruta de checkout de Stripe; la gestión expone ventas, ventas por lote, devoluciones, anulaciones y compras. La evidencia disponible no demuestra una integración de pagos moderna ni un despliegue productivo.
- **Comportamiento de referencia (Reference behavior):** un cliente crea un pedido; el sistema heredado registra artículos, estado, pago y efectos de stock según la ruta utilizada. La gestión puede registrar ventas, compras, retornos o anulaciones y reflejarlos en su estado operativo.
- **Objetivo futuro (Future target):** el backend deberá validar total, moneda, artículos, existencia, transición de estado, pago y stock en una transacción o protocolo explícito. Las devoluciones y anulaciones serán acciones autorizadas, idempotentes y auditables; un pago informado por el cliente no será prueba de cobro.

### Recibos y reparaciones

- **Línea base observada (Observed baseline):** existen rutas públicas y de gestión para numeración, creación, estado, workflow, piezas, compras, aprobación, QA, pagos y eliminación de recibos. El esquema contiene `beim_receipts`, piezas, pagos y checklists; ambas interfaces de recibos tienen comportamiento local o heredado.
- **Comportamiento de referencia (Reference behavior):** la orden de trabajo recoge cliente, equipo, problema, diagnóstico, servicios, tiempo estimado, garantía, precio y datos de desbloqueo; la gestión puede asignar trabajo, registrar piezas/compras, aprobar presupuestos, controlar calidad y registrar pagos. Este flujo es referencia y sus controles heredados no son una garantía de privacidad ni autorización.
- **Objetivo futuro (Future target):** cada transición de reparación deberá declarar estado anterior, estado nuevo, actor autorizado, precondiciones y efectos durables. La numeración, cliente, dispositivo, diagnóstico, presupuesto, partes, QA, pago y garantía tendrán un propietario y una auditoría; los datos de desbloqueo deberán recibir protección reforzada o una decisión explícita de minimización.

### Gestión operativa

- **Línea base observada (Observed baseline):** `sistema-gestion/` ofrece clientes, servicios, stock de taller, compras, ventas, caja, reportes, permisos, usuarios, respaldos y menús; `apps/gestion` solo demuestra una parte del CRUD de clientes y un mock de sesión.
- **Comportamiento de referencia (Reference behavior):** la persona operadora consulta bootstrap, edita estado, sincroniza datos, calcula reportes, abre o cierra caja y puede ejecutar operaciones sobre clientes, inventario, servicios y ventas. Parte de ese comportamiento puede continuar localmente cuando falla el API.
- **Objetivo futuro (Future target):** cada comando de gestión será autenticado, autorizado, validado, persistido por el backend y auditado. Los reportes distinguirán datos confirmados de caché; caja, stock, compras y ventas no podrán depender de una escritura exclusiva en el navegador.

### Auditoría

- **Línea base observada (Observed baseline):** el esquema contiene `audit_logs` y `server.js` tiene `writeAuditLog`; el helper registra un error y continúa cuando la inserción de auditoría falla. No se observa un arnés dedicado que pruebe cobertura completa de auditoría.
- **Comportamiento de referencia (Reference behavior):** algunas rutas escriben eventos de acción con actor, rol, entidad y detalles. Esto es evidencia de una capacidad heredada parcial, no una garantía de que todas las mutaciones, denegaciones o reversión estén registradas.
- **Objetivo futuro (Future target):** toda mutación protegida deberá producir un evento confiable en el límite del servidor, con política definida de fallo, retención, consulta, minimización y restauración. La auditoría deberá permitir reconstruir quién solicitó qué, cuándo, sobre qué entidad y con qué resultado sin confiar en el navegador.

### Migración, coexistencia y retiro

- **Línea base observada (Observed baseline):** coexisten la API y las interfaces heredadas, `localStorage`, PostgreSQL/SQL heredado y el prototipo `apps/gestion`; faltan paquetes modernos y no se observa un flujo de migración, despliegue, smoke test o rollback ejecutable.
- **Comportamiento de referencia (Reference behavior):** la gestión intenta hidratar desde el API y conserva o recupera estado local. El esquema y las semillas pueden servir para inventariar datos, pero sus duplicados, backfills y valores predeterminados requieren reconciliación.
- **Objetivo futuro (Future target):** antes de cada cambio de dirección se deberá inventariar, respaldar, nombrar propietario, reconciliar, migrar en un entorno aislado, repetir la operación y probar restauración/rollback. La coexistencia tendrá responsables, sincronización, observabilidad y fecha o condición de retiro. Una compuerta fallida bloquea cutover y obsolescencia.

## Fallos y resultados observables

En cualquier objetivo futuro, los resultados deberán distinguirse como mínimo así:

| Condición | Resultado obligatorio |
|---|---|
| Entrada inválida | Error de validación estable, sin mutación protegida. |
| Principal ausente, inválido o vencido | Denegación, sin mutación, con evento de seguridad cuando alcance el límite protegido. |
| Permiso insuficiente | Denegación por acción/recurso, sin filtrar datos protegidos. |
| Recurso inexistente o no perteneciente | Resultado no ambiguo que no revele indebidamente su existencia y que no muta datos. |
| Conflicto, duplicado o reintento | Resultado determinista o idempotente, sin doble cobro, doble numeración, doble stock ni doble auditoría no intencional. |
| Dependencia o base no disponible | Error explícito; no se informa éxito durable ni se usa estado local como sustituto canónico sin política aprobada. |
| Fallo parcial | Rollback transaccional o estado de compensación documentado y auditable. |
| Auditoría obligatoria fallida | Política de rechazo o estado excepcional explícito; nunca una garantía silenciosa de éxito. |

En la línea base, los fallos de comunicación de `sistema-gestion` activan comportamiento local y `server.js` puede ocultar un fallo de auditoría tras registrar el error. Ambos hechos se conservan como referencia y brecha a corregir, no como comportamiento objetivo.

## Requisitos de verificación y calidad

### Línea base disponible

- **Pruebas unitarias:** `apps/gestion` usa Vitest, JSDOM y Testing Library; existe una prueba enfocada del motor de reportes heredado. Estas pruebas cubren unidades o interfaces concretas, no el sistema completo.
- **Comprobación sintáctica:** los archivos JavaScript heredados registrados pasan `node --check`.
- **Integración:** no se observa un arnés dedicado para servidor, API y base de datos.
- **E2E:** no se observa una suite de extremo a extremo.
- **Seguridad:** no se observa una suite dedicada de autenticación negativa, autorización por recurso, secretos o auditoría.
- **Migración y rollback:** no se observa un arnés que pruebe replay, idempotencia, reconciliación, respaldo restaurable o reversión.
- **Smoke y despliegue:** no se observa workflow de despliegue, promoción, migración ni smoke test.
- **CI:** `.github/workflows/ci.yml` pretende ejecutar instalación, `pnpm generate`, lint/typecheck, pruebas y build. En el checkout actual `pnpm generate` no es un script raíz; `pnpm lint` aparece registrado como aprobado; `pnpm typecheck` falla por `.next/types` ausentes; `pnpm test` registra 15 pruebas exitosas y dos suites fallidas por `@beim/data` no resoluble; `pnpm build` falla por el mismo paquete ausente. Esto no es CI verde ni capacidad de despliegue.

### Requisitos verificables del objetivo futuro

1. **Unitarias:** las reglas de cálculo, validación, estados, permisos, idempotencia y mapeo deberán probar éxito y fallos; no podrán sustituir las pruebas entre límites.
2. **Integración:** cada operación que cruce API, backend y base deberá probar autenticación, autorización, validación, transacción, rollback, propiedad y auditoría con datos aislados.
3. **E2E:** deberá recorrer, como mínimo, catálogo público, pedido, recibo/reparación y una operación de gestión; también deberá comprobar sesión expirada, denegación y error de dependencia.
4. **Seguridad:** deberán existir pruebas negativas para principal ausente, principal inválido, rol insuficiente, actor falsificado, acceso a recurso ajeno, repetición y carga maliciosa. Secretos y datos reales no se usarán como fixtures.
5. **Migraciones:** cada migración deberá ejecutarse en base vacía y con datos representativos, poder repetirse de forma segura, verificar conteos e invariantes, registrar diferencias y conservar respaldo antes del cambio.
6. **Rollback:** deberá demostrarse restauración del respaldo o reversión equivalente, con pérdida aceptable declarada, auditoría del resultado y bloqueo del cutover si falla.
7. **Smoke tests:** después de una promoción futura deberán comprobar salud, lectura de catálogo, autenticación controlada, creación o lectura controlada de pedido/recibo y una lectura de gestión sin datos de producción innecesarios.
8. **CI/CD:** la intención de `.github/workflows/ci.yml` solo podrá considerarse una compuerta cuando sus comandos existan y pasen en un checkout limpio. Despliegue, promoción, ejecución de migraciones y smoke tests requieren workflows y evidencia separados.

### Verificación de este documento

Para esta entrega documental se ejecuta únicamente:

```bash
git diff --check -- spec.md
```

La comprobación valida errores de whitespace del archivo; no prueba runtime, APIs, base de datos, seguridad, migraciones, despliegue ni CI.

## Límites de aceptación

Este documento no afirma que exista una API moderna, un backend moderno, una base de datos moderna, autenticación de producción, despliegue, rollback automatizado ni CI verde. `pagina-web/` y `sistema-gestion/` permanecen como comportamiento de referencia; `apps/gestion` permanece transicional; los componentes modernos ausentes permanecen objetivos futuros.

Un objetivo solo podrá marcarse implementado cuando su comportamiento observable, propietario canónico, identidad, autorización, persistencia, consistencia, auditoría, fallos y evidencia de la capa apropiada estén demostrados y sean compatibles con [`constitution.md`](constitution.md), [`plan.md`](plan.md) y [`tasks.md`](tasks.md). La documentación no sustituye esa evidencia.
