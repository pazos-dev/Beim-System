# Especificación: gestion-app-shell

## Propósito

Definir una superficie Next.js 15 operativa, accesible y sin autoridad propia sobre hechos de negocio.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** `apps/gestion` no tiene una superficie moderna demostrada; la gestión heredada conserva shell, dashboard, tablas y modales.
- **Comportamiento de referencia (Reference behavior):** `sistema-gestion/` ofrece sidebar contraíble, búsqueda, períodos, dashboard orientado a excepciones y acciones tabulares.
- **Objetivo futuro (Future target):** el shell reconstruido DEBE separar navegación y presentación de las mutaciones protegidas.

## Requisitos

### Requisito: Navegación y consultas protegidas

El shell DEBE mostrar sidebar jerárquico contraíble, rutas permitidas, búsqueda global, filtros de período, dashboard y tablas responsive. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: operador con sesión y permiso de lectura; entrada validada: ruta permitida, texto acotado y período válido; owner JSON de escritura: ninguno, porque el shell no escribe hechos; éxito/error: vista y datos tipados o código estable de autenticación, autorización o dependencia; fallo cerrado: no mostrar datos protegidos ni declarar éxito ante entrada o sesión inválida. Prueba: Vitest/Testing Library e integración de consultas.

#### Escenario: Operación autorizada

- Dado un operador autenticado y una ruta permitida, cuando busca y aplica un período válido, entonces el dashboard y la tabla muestran únicamente la consulta autorizada.

#### Escenario: Sesión ausente

- Dado un navegador sin sesión válida, cuando solicita una vista protegida, entonces recibe denegación controlada y no obtiene datos ni ejecuta una mutación.

### Requisito: Accesibilidad y estados visibles

La interfaz DEBE ser usable en viewport pequeño y teclado, con etiquetas asociadas, foco visible, modales `aria-modal`, foco inicial/restaurado, cierre con Escape, confirmación destructiva, toasts y estados de carga/error. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: operador de la sesión actual; entrada validada: eventos de teclado, identificadores de diálogo y mensajes acotados; owner JSON de escritura: ninguno; éxito/error: control enfocable o estado visible y recuperable; fallo cerrado: no ejecutar acción por foco, diálogo o entrada inválidos. Prueba: Testing Library y E2E Playwright de teclado y viewport.

#### Escenario: Modal accesible

- Dado un operador que abre un modal, cuando se monta y presiona Escape, entonces el foco entra al diálogo, queda atrapado de forma usable y retorna al disparador sin mutar datos.

#### Escenario: Dependencia no disponible

- Dado un listado en carga, cuando falla su consulta, entonces se muestra error y reintento sin toast de éxito ni datos inventados.

### Requisito: Acciones sin autoridad de negocio

El shell DEBE PODER representar acciones por fila, pero NO DEBE autorizar ni persistir mutaciones desde el cliente. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: el servidor decide según acción y recurso; entrada validada: comando serializado por el formulario; owner JSON de escritura: repositorio de la entidad, nunca el componente; éxito/error: resultado del handler o denegación auditable; fallo cerrado: un control visible para un rol insuficiente no produce efectos. Prueba: integración de handler y E2E de denegación.

#### Escenario: Acción visible sin permiso

- Dado un usuario que ve una tabla pero carece del permiso de eliminar, cuando intenta la acción, entonces el servidor deniega y el owner JSON permanece sin cambios.
