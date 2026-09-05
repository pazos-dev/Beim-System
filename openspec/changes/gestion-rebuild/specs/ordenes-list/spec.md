# Especificación: ordenes-list

## Propósito

Vista principal de gestión de órdenes: tabla completa con 8 columnas, barra de 8 filtros de estado con contadores dinámicos, y datos enriquecidos mediante join con clientes y campos de equipo/tiempo.

## Requisitos

### Requisito: Tabla de órdenes con datos enriquecidos

El sistema DEBE renderizar una tabla con 8 columnas: **Número de orden**, **Nombre del cliente**, **Equipo**, **Etapa**, **Tiempo**, **Total**, **Pago**, **Boletahidden**. Los datos DEBEN provenir de un único endpoint GET /api/gestion/ordenes que devuelva el join con clientes y los campos extendidos. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: parámetros de filtro y paginación; owner JSON de escritura: `ordenes.json` y `clientes.json` solo lectura en lista; éxito/error: lista paginada con contadores o error estable; fallo cerrado: error de BD o join no muta. Prueba: Vitest de contrato API + integración tabla.

#### Escenario: Lista inicial con filtro por defecto (En diagnóstico)

- Dado que el usuario accede a /ordenes, cuando la página carga, entonces se llama GET /api/gestion/ordenes?estado=en_diagnostico y se renderiza la tabla con filas que muestran número, clienteNombre, equipo (marca modelo color), etapa, tiempo estimado, total, paymentStatus y columna Boletahidden oculta.

#### Escenario: Paginación y ordenamiento

- Dado una lista con >25 órdenes, cuando el usuario navega a la página 2 o ordena por Total descendente, entonces la tabla actualiza sin recarga completa y mantiene el filtro activo.

#### Escenario: Fila sin datos de equipo ni tiempo

- Dado una orden legacy sin deviceBrand/deviceModel/deviceColor/estimatedTime, cuando se renderiza la fila, entonces las celdas Equipo y Tiempo muestran "—" en lugar de vacío.

### Requisito: Join cliente en respuesta de lista

El endpoint GET /api/gestion/ordenes DEBE incluir `clienteNombre` (displayName de Cliente) en cada orden. El join DEBE resolverse en servidor, no en cliente. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: filtro de estado; owner JSON de escritura: `clientes.json` solo lectura; éxito/error: array con clienteNombre o error; fallo cerrado: cliente inexistente → clienteNombre = "Cliente eliminado".

#### Escenario: Cliente existe

- Dado una orden con clienteId válido, cuando se lista, entonces clienteNombre coincide con Cliente.displayName.

#### Escenario: Cliente eliminado o ausente

- Dado una orden con clienteId que no existe en clientes.json, cuando se lista, entonces clienteNombre = "Cliente eliminado".

### Requisito: Columnas derivadas Equipo y Tiempo

La columna **Equipo** DEBE concatenar `deviceBrand deviceModel deviceColor` (omitir partes ausentes). La columna **Tiempo** DEBE formatear `estimatedTime` + `estimatedTimeUnit` (ej: "45 min", "2 h", "1 día"). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: campos extendidos de orden; owner JSON de escritura: `ordenes.json` solo lectura; éxito/error: strings formateados o "—"; fallo cerrado: campos nulos no rompen render.

#### Escenario: Equipo completo

- Dado deviceBrand="Samsung", deviceModel="Galaxy S23", deviceColor="Negro", cuando se renderiza, entonces Equipo = "Samsung Galaxy S23 Negro".

#### Escenario: Equipo parcial

- Dado solo deviceBrand="iPhone", deviceModel="15", cuando se renderiza, entonces Equipo = "iPhone 15".

#### Escenario: Tiempo en minutos, horas, días

- Dado estimatedTime=90, estimatedTimeUnit="min", cuando se renderiza, entonces Tiempo = "90 min".
- Dado estimatedTime=2, estimatedTimeUnit="h", cuando se renderiza, entonces Tiempo = "2 h".
- Dado estimatedTime=1, estimatedTimeUnit="d", cuando se renderiza, entonces Tiempo = "1 día".

### Requisito: Columna Boletahidden oculta por defecto

La columna **Boletahidden** DEBE renderizarse con `display: none` por defecto y SOLO hacerse visible mediante permiso explícito (rol principal o feature flag). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: principal para visibilidad; entrada validada: permiso; owner JSON de escritura: ninguno; éxito/error: columna oculta/visible; fallo cerrado: permiso insuficiente → permanece oculta.

#### Escenario: Usuario sin permiso principal

- Dado un vendedor accede a la lista, cuando se renderiza la tabla, entonces la columna Boletahidden no es visible ni accesible en DOM.

#### Escenario: Usuario principal

- Dado el principal accede a la lista, cuando se renderiza la tabla, entonces la columna Boletahidden es visible y muestra el número de boleta o enlace.