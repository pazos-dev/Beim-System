# Constitución: base del sistema

Este documento es la autoridad normativa para la seguridad, la propiedad, la consistencia, la migración, la evidencia y la calidad. Define reglas que las implementaciones DEBEN satisfacer; no reemplaza los contratos de comportamiento de [`spec.md`](spec.md), la secuencia de [`plan.md`](plan.md) ni la lista ejecutable de evidencia de [`tasks.md`](tasks.md).

## Autoridad y enlaces de los documentos

La base raíz se divide intencionalmente por autoridad:

- [`AGENTS.md`](AGENTS.md) rige el procedimiento del repositorio y el flujo de trabajo de las personas colaboradoras.
- [`constitution.md`](constitution.md) rige los principios no negociables.
- [`spec.md`](spec.md) regirá el comportamiento observable y los invariantes.
- [`plan.md`](plan.md) regirá la secuencia de migración, las compuertas, la reversión y la obsolescencia.
- [`tasks.md`](tasks.md) regirá las unidades de trabajo acotadas y su evidencia.

Los cinco documentos están presentes como base documental. Su existencia NO DEBE tratarse como prueba de que un objetivo futuro está implementado.

## Lenguaje de estado y cumplimiento

- **Línea base observada (Observed baseline)** significa un hecho verificado en el checkout actual.
- **Comportamiento de referencia (Reference behavior)** significa un comportamiento conservado como evidencia de compatibilidad o migración. No es automáticamente seguro, autoritativo ni conforme.
- **Objetivo futuro (Future target)** significa una regla o arquitectura prevista que requiere la evidencia de aceptación indicada por [`spec.md`](spec.md), [`plan.md`](plan.md) o [`tasks.md`](tasks.md) antes de poder llamarse implementada.

Una afirmación de implementación DEBE identificar su estado, evidencia y documento propietario. Un plan, mock, control de interfaz, valor proporcionado por quien llama, afirmación del README o índice generado no demuestra cumplimiento.

## Principios no negociables

### 1. Autenticación y autorización exigidas por el servidor

1. Toda operación protegida DEBE realizar autenticación exigida por el servidor antes de leer o mutar datos protegidos.
2. El servidor DEBE derivar el actor de una sesión validada, una credencial o un mecanismo equivalente de identidad confiable. El estado del cliente, la visibilidad de rutas y los actores o identificadores de actor proporcionados por quien llama NO DEBEN establecer la identidad.
3. La autorización DEBE evaluarse para el recurso y la acción solicitados. Una identidad válida por sí sola NO DEBE implicar acceso a todas las operaciones de gestión o datos.
4. Un principal ausente, inválido, vencido o insuficiente DEBE recibir una denegación sin una mutación protegida. La denegación DEBE producir un resultado de seguridad auditable cuando la operación alcance el límite protegido.
5. DEBE seleccionarse y documentarse un modelo de identidad futuro antes de la migración o el cambio de dirección. Hasta que esa compuerta se supere, ningún flujo prototípico o heredado puede describirse como autenticación de producción.

### 2. Mínimo privilegio y validación en los límites

1. Los servicios, operadores, trabajos automatizados y usuarios de base de datos DEBEN recibir únicamente los permisos necesarios para sus responsabilidades declaradas.
2. Las entradas DEBEN validarse en el límite antes de las decisiones de autorización, las operaciones de dominio, la persistencia o los efectos externos.
3. Las comprobaciones de autorización DEBEN permanecer del lado del servidor y DEBEN aplicarse de forma consistente en los límites público, de gestión, API, backend y base de datos.
4. Las operaciones privilegiadas DEBEN fallar de forma cerrada cuando falte evidencia de identidad, permiso, validación o propiedad.

### 3. Secretos y datos sensibles protegidos

1. Los secretos, credenciales, tokens, claves privadas y datos de producción copiados NO DEBEN confirmarse en el repositorio ni exponerse en documentación nueva.
2. Los secretos de runtime DEBEN inyectarse mediante un entorno aprobado o un límite de gestión de secretos; los marcadores usados para evidencia local o de CI DEBEN identificarse claramente como no productivos.
3. Los registros, las auditorías, los errores, los fixtures y los ejemplos DEBEN evitar material secreto y datos personales u operativos innecesarios.
4. Los valores heredados predeterminados o las credenciales temporales PUEDEN documentarse únicamente como evidencia no secreta de una brecha, sin reproducir valores utilizables.

### 4. Mutaciones auditables

1. Toda mutación persistente DEBE registrar quién o qué la inició, qué operación se solicitó, cuándo ocurrió y si tuvo éxito o falló, sujeto a las reglas de minimización de datos.
2. Las denegaciones de seguridad, los fallos de autorización, los fallos de validación y los resultados de reversión DEBEN distinguirse de los eventos de negocio exitosos.
3. La evidencia de auditoría DEBE producirse en un límite confiable del lado del servidor y NO DEBE depender únicamente de un actor proporcionado por el cliente o de un registro del navegador.
4. El almacenamiento y la retención de auditoría DEBEN definirse antes de declarar completo operativamente un objetivo futuro.

### 5. Identidad canónica y propiedad de los datos

1. Cada identidad, entidad persistente y flujo de trabajo DEBE tener un propietario autoritativo declarado antes de migrarse o cambiar de dirección.
2. El propietario DEBE definir las entradas aceptadas, el actor autorizado, el límite de escritura persistente, el modelo de lectura, el comportamiento de reconciliación y el resultado de fallo en [`spec.md`](spec.md).
3. El estado duplicado de la interfaz, el `localStorage` del navegador, los handlers de compatibilidad, las semillas y las bases de datos heredadas PUEDEN ser entradas de migración o vistas de referencia, pero NO DEBEN convertirse accidentalmente en canónicos.
4. **Objetivo futuro (Future target):** los servicios autenticados de API/backend son propietarios de las decisiones de identidad y las escrituras autorizadas, mientras que la base de datos canónica designada es propietaria de los registros persistentes y la evidencia de auditoría una vez superadas las compuertas de [`plan.md`](plan.md). Esto es una intención, no una garantía de producción observada.
5. Un límite NO DEBE escribir el mismo hecho canónico de forma independiente de su propietario declarado sin una política explícita de sincronización y conflictos.

### 6. Consistencia e integridad transaccional

1. Los cambios persistentes relacionados DEBEN usar una transacción o un mecanismo de consistencia documentado explícitamente y apropiado para el límite de almacenamiento.
2. Un fallo parcial NO DEBE informar éxito silenciosamente ni dejar una mezcla no documentada de propiedad antigua y nueva.
3. Las actualizaciones concurrentes, los reintentos, las solicitudes duplicadas y los conflictos de reconciliación DEBEN tener resultados deterministas o estados de fallo seguro explícitos.
4. Las afirmaciones de consistencia DEBEN respaldarse con evidencia de integración o equivalente; las pruebas unitarias por sí solas no son suficientes para garantías entre límites.

### 7. Migración, reversión y obsolescencia

1. La migración DEBE comenzar con inventario, propiedad, respaldo, reconciliación y un límite de reversión.
2. Las rutas heredada y objetivo PUEDEN coexistir únicamente cuando las responsabilidades de identidad, propiedad de datos, sincronización, observabilidad y reversión sean explícitas.
3. Una compuerta fallida de generación, compilación, pruebas, repetición de migración, respaldo, reconciliación, seguridad o smoke test DEBE bloquear la migración de funcionalidades y el cambio de dirección.
4. El cambio de dirección DEBE nombrar un propietario canónico, demostrar la reversión y conservar un registro auditable de la transición.
5. La obsolescencia DEBE seguir a un cambio de dirección verificado y a una ventana de reversión anunciada; eliminar evidencia heredada no sustituye demostrar el comportamiento objetivo.

### 8. Afirmaciones de ingeniería basadas en evidencia

1. Las afirmaciones sobre código, comportamiento, arquitectura, calidad u operaciones DEBEN etiquetarse como **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** u **Objetivo futuro (Future target)** y vincularse a evidencia reproducible.
2. Un comando fallido DEBE registrarse como fallo, no convertirse en una capacidad implícita. La intención de CI NO DEBE describirse como un pipeline correcto ni como capacidad de despliegue.
3. Los paquetes, workspaces, capas de pruebas, flujos de despliegue, herramientas de migración o autenticación de producción ausentes DEBEN permanecer explícitamente ausentes hasta verificarse.
4. El documento propietario DEBE actualizarse cuando cambie un comportamiento, principio, decisión de migración o resultado de evidencia. Las contradicciones entre [`AGENTS.md`](AGENTS.md), [`constitution.md`](constitution.md), [`spec.md`](spec.md), [`plan.md`](plan.md) y [`tasks.md`](tasks.md) DEBEN resolverse antes de la aprobación.

### 9. Pruebas y calidad

1. Todo objetivo futuro DEBE tener evidencia de aceptación en la capa de pruebas disponible más alta y apropiada para su riesgo.
2. Los cambios sensibles a la seguridad DEBEN incluir evidencia negativa de autenticación y autorización; los cambios de propiedad y migración DEBEN incluir evidencia de consistencia y reversión.
3. Los cambios exclusivamente documentales DEBEN validar enlaces, etiquetas, límites de autoridad y alcance sin inventar cobertura de runtime.
4. La cobertura desigual o ausente DEBE declararse claramente. Un subconjunto aprobado NO DEBE presentarse como prueba de que el sistema completo está saludable.

## Clasificaciones explícitas de incumplimiento

Las siguientes clasificaciones conservan evidencia útil sin concederle autoridad:

| Comportamiento o artefacto existente | Estado | Tratamiento constitucional |
|---|---|---|
| Autenticación mock del lado del cliente del eliminado prototipo `apps/gestion`, que aceptaba cualquier nombre de usuario no vacío | **Comportamiento de referencia (Reference behavior)**, evidencia en el historial de Git | No es autenticación ni autorización; incumple la identidad exigida por el servidor. |
| Handlers heredados que aceptan identificadores de actor proporcionados por quien llama | **Línea base observada (Observed baseline)** y **Comportamiento de referencia (Reference behavior)** | No es identidad confiable; incumple salvo que se reemplace por autorización derivada por el servidor. |
| Valores heredados predeterminados o credenciales temporales en código fuente, semillas o documentación | **Comportamiento de referencia (Reference behavior)** | No es garantía de gestión de secretos ni de preparación para producción; los valores NO DEBEN reproducirse. |
| `localStorage` del navegador y estado de fallback sin conexión/local | **Línea base observada (Observed baseline)** y **Comportamiento de referencia (Reference behavior)** | Solo evidencia de migración; no es propiedad persistente canónica. |
| Visibilidad de rutas de la interfaz, permisos del cliente o respuesta mock exitosa | **Comportamiento de referencia (Reference behavior)** | No demuestra autorización de operaciones protegidas. |

Estas clasificaciones son normativas intencionalmente: la compatibilidad con el comportamiento heredado no exime de los requisitos de seguridad, propiedad, auditoría, consistencia, migración o evidencia.

## Prueba de revisión para mutaciones protegidas

Antes de aceptar una mutación protegida como **Objetivo futuro (Future target)**, una persona revisora DEBE poder responder afirmativamente a todo lo siguiente:

- ¿El actor se deriva y valida en el servidor?
- ¿La acción solicitada se autoriza con mínimo privilegio?
- ¿Las entradas del límite se validan antes de la mutación?
- ¿Existe un único propietario canónico declarado para el resultado persistente?
- ¿La mutación, denegación o fallo es auditable sin confiar en la identidad del cliente?
- ¿La evidencia de consistencia y reversión está registrada en [`spec.md`](spec.md), [`plan.md`](plan.md) o [`tasks.md`](tasks.md)?

Un “no” es una brecha de cumplimiento, no una razón para debilitar la regla ni volver a etiquetar la implementación como completa.
