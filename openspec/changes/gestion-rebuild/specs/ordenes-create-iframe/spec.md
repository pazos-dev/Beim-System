# Especificación: ordenes-create-iframe

## Propósito

Flujo de creación de orden mediante navegación a vista dedicada con iframe que carga el formulario legacy `boleta/index.html` con parámetros de versión y número de orden siguiente.

## Requisitos

### Requisito: Botón "Crear orden" en toolbar

La vista principal de órdenes DEBE mostrar un botón "Crear orden" en la barra de herramientas superior. Al hacer clic, DEBE navegar a la ruta `/ordenes/nueva` (no modal). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: ninguna; owner JSON de escritura: ninguno en navegación; éxito/error: navegación a /ordenes/nueva; fallo cerrado: error de router no muta.

#### Escenario: Navegación exitosa

- Dado que el usuario está en /ordenes, cuando hace clic en "Crear orden", entonces el router navega a /ordenes/nueva y se renderiza la vista de iframe.

#### Escenario: Usuario sin permiso de creación

- Dado un usuario con rol solo lectura (si existiera), cuando accede a /ordenes, entonces el botón "Crear orden" no se renderiza o está deshabilitado.

### Requisito: Vista /ordenes/nueva con iframe boleta

La ruta `/ordenes/nueva` DEBE renderizar una página completa que incruste un iframe con `src="boleta/index.html?v=<version>&nextNumber=<siguiente>"`. El iframe DEBE ocupar el ancho completo y altura suficiente para el formulario. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: nextNumber calculado en servidor; owner JSON de escritura: ninguno en carga; éxito/error: iframe cargado o error de red; fallo cerrado: boleta legacy no disponible → mensaje de error en contenedor.

#### Escenario: Carga exitosa de iframe

- Dado que el usuario navega a /ordenes/nueva, cuando la página carga, entonces el iframe muestra el formulario de boleta con campos de equipo, diagnóstico, garantía, precio y desbloqueo precargados con nextNumber.

#### Escenario: Parámetro nextNumber calculado correctamente

- Dado que la última orden en ordenes.json tiene numero=999, cuando se carga /ordenes/nueva, entonces el iframe recibe nextNumber=1000 en query string.

#### Escenario: Fallback si boleta no accesible

- Dado que boleta/index.html retorna 404 o error de red, cuando el iframe intenta cargar, entonces se muestra un mensaje "Formulario de creación no disponible" dentro del contenedor del iframe.

### Requisito: Comunicación iframe → padre (postMessage)

El iframe legacy DEBE poder notificar al padre cuando se completa la creación (guardado exitoso) mediante `postMessage` con `{ type: 'ORDEN_CREADA', payload: { numero, clienteId, ... } }`. La vista padre DEBE escuchar este mensaje, cerrar el iframe y navegar de vuelta a /ordenes con el filtro "Todas" activo. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: vendedor/técnico/admin/principal; entrada validada: mensaje postMessage con origen verificado; owner JSON de escritura: `ordenes.json` (escritura ocurre en legacy); éxito/error: navegación a lista con nueva orden visible; fallo cerrado: mensaje inválido o origen no verificado → ignorar.

#### Escenario: Creación exitosa notificada por iframe

- Dado el usuario completa el formulario en el iframe y guarda, cuando el iframe envía postMessage ORDEN_CREADA, entonces la vista padre navega a /ordenes?estado=todas y la nueva orden aparece en la tabla.

#### Escenario: Mensaje de origen no verificado

- Dado un mensaje postMessage desde origen distinto a boleta/index.html, cuando se recibe, entonces se ignora y no hay navegación.

### Requisito: Parámetro de versión en iframe

El parámetro `v=` en la URL del iframe DEBE corresponder a la versión del cache-busting de la boleta legacy (ej: hash del contenido o timestamp de build). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: sistema (build); entrada validada: versión calculada en build; owner JSON de escritura: ninguno; éxito/error: iframe carga versión correcta; fallo cerrado: versión inválida → iframe puede cargar versión stale.

#### Escenario: Versión actualizada tras deploy

- Dado un nuevo deploy que modifica boleta/index.html, cuando el usuario abre /ordenes/nueva, entonces el parámetro v= refleja la nueva versión y el iframe no sirve contenido cached.