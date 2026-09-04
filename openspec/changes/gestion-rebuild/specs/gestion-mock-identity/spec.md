# Especificación: gestion-mock-identity

## Propósito

Definir una identidad mock exclusivamente de desarrollo, derivada en el servidor y nunca presentada como autenticación productiva.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** la gestión heredada conserva el usuario visible en `sessionStorage` y envía datos de actor desde la interfaz.
- **Comportamiento de referencia (Reference behavior):** existen roles vendedor, técnico, caja, administrador y administrador principal, con permisos por vista.
- **Objetivo futuro (Future target):** `users.json` y route handlers DEBEN imponer sesión, actor y permisos server-side.

## Requisitos

### Requisito: Sesión mock no productiva

El registro DEBE soportar `vendedor`, `tecnico`, `caja`, `administrador` y `administrador_principal`. Login y logout DEBEN validarse mediante route handler y emitir o expirar una cookie de sesión `httpOnly`; la interfaz DEBE mostrar “modo desarrollo, no productivo”. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: usuario activo con credencial válida; entrada validada: usuario, credencial y acción de logout; owner JSON de escritura: `users.json` para usuarios y el handler para la sesión; éxito/error: sesión derivada o error estable; fallo cerrado: entrada desconocida, inactiva o inválida no crea sesión. Prueba: Vitest unitario e integración HTTP.

#### Escenario: Login válido

- Dado un usuario activo de un rol permitido, cuando envía credenciales válidas, entonces recibe cookie `httpOnly`, etiqueta no productiva y actor server-side.

#### Escenario: Usuario inválido

- Dado un usuario inexistente, inactivo o con entrada malformada, cuando intenta login, entonces recibe denegación sin cookie ni cambio en `users.json`.

### Requisito: Actor y permisos declarativos

Cada operación protegida DEBE derivar el actor y su rol de la sesión validada, y DEBE evaluar un mapa declarativo por acción y recurso. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: principal de la cookie; entrada validada: recurso, acción y cuerpo con esquema; owner JSON de escritura: `users.json` y `role-permissions.json` según entidad; éxito/error: comando autorizado o `FORBIDDEN`; fallo cerrado: `actorId`, rol o permiso enviado por el cliente se ignora. Prueba: unitarias de matriz, integración de handlers y E2E negativo.

#### Escenario: Actor falsificado

- Dado un vendedor autenticado, cuando envía `actorId` y rol de administrador en el cuerpo, entonces el servidor usa la sesión real, deniega la acción privilegiada y no muta datos.

#### Escenario: Sin sesión o rol insuficiente

- Dado un request sin cookie o con rol insuficiente, cuando solicita una mutación protegida, entonces recibe denegación auditable y ningún owner JSON cambia.

### Requisito: Denegaciones auditables

Las denegaciones de autenticación y autorización DEBEN registrar actor confiable o ausencia, acción, recurso, instante y resultado minimizado. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: límite de servidor; entrada validada: evento de seguridad; owner JSON de escritura: `audit.json`; éxito/error: evento persistido o error de auditoría; fallo cerrado: si la auditoría es obligatoria y no puede persistirse, no se informa éxito de la operación protegida. Prueba: integración con lectura de auditoría.

#### Escenario: Denegación registrada

- Dado un rol insuficiente, cuando llega al handler protegido, entonces se devuelve `FORBIDDEN` y queda un evento sin credenciales ni datos personales innecesarios.
