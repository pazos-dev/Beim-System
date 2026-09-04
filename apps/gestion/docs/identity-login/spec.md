# Especificación del módulo identity-login

**Estado:** **Objetivo futuro (Future target)**. Los requisitos detallan la capability [`gestion-mock-identity`](../../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md); nada está implementado.

## 1. Usuarios

### Requisito ID-U1: schema de `data/users.json`

El archivo de usuarios de desarrollo DEBE seguir este schema previsto. **Objetivo futuro (Future target).**

```json
[
  {
    "id": "u_1",
    "username": "vendedor1",
    "credencial": "hash-scrypt:...",
    "name": "Persona vendedora",
    "role": "vendedor",
    "active": true
  }
]
```

- `credencial` almacena solo el hash; jamás una contraseña en claro ni un valor heredado real.
- `role` pertenece al catálogo de cinco roles; `active: false` impide crear sesión.
- El owner es el repositorio server-side; la UI solo recibe una vista derivada.

#### Escenario: usuario inactivo

- Dado un usuario con credencial válida y `active: false`, cuando intenta login, entonces recibe denegación sin cookie y `users.json` no cambia.

## 2. Roles y permisos

### Requisito ID-R1: cinco roles y mapa declarativo

Los roles admitidos son `vendedor`, `tecnico`, `caja`, `administrador` y `administrador_principal`. Los permisos se declaran en `data/role-permissions.json` por acción y recurso, y se evalúan en cada handler. **Objetivo futuro (Future target).**

**Comportamiento de referencia (Reference behavior):** la matriz siguiente resume las capacidades visibles del legado según `exploration.md` (`app.js:L1447-L1464`, L1454–L1464; `server.js:L4134-L4143`). La visibilidad del cliente no era autorización; en el rebuild, esta matriz es la regla server-side.

| Acción / recurso | vendedor | tecnico | caja | administrador | principal |
|---|---|---|---|---|---|
| Lecturas operativas (dashboard, órdenes, clientes, stock) | sí | sí | sí | sí | sí |
| Crear órdenes y boletas | sí | sí | no | sí | sí |
| Crear clientes | sí | no | no | sí | sí |
| Crear productos, compras o servicios | no | no | no | sí | sí |
| Diagnóstico, notas e ítems de presupuesto | no | sí | no | sí | sí |
| Consumir o devolver stock técnico | no | sí | no | sí | sí |
| Registrar ventas | sí | no | sí | sí | sí |
| Abrir/cerrar caja y arqueo | no | no | sí | sí | sí |
| Reportes operativos | no | no | sí | sí | sí |
| Respaldos y restauración | no | no | no | sí | sí |
| Crear usuarios no administradores | no | no | no | sí | sí |
| Crear/modificar administradores; editar mapa de permisos | no | no | no | no | sí (`*`) |

#### Escenario: rol insuficiente

- Dado un vendedor autenticado, cuando solicita crear un producto, entonces el handler responde `FORBIDDEN` y `productos.json` no cambia.

## 3. Sesión

### Requisito ID-S1: login/logout vía route handler

Login y logout DEBEN procesarse en route handlers server-side. Un login válido emite una cookie de sesión `httpOnly` + `sameSite`; el logout la expira. El handler valida credencial y estado activo antes de emitir sesión. **Objetivo futuro (Future target).**

#### Escenario: login válido

- Dado un usuario activo de un rol permitido, cuando envía credenciales válidas, entonces recibe la cookie `httpOnly` + `sameSite`, el banner no productivo en la interfaz y un actor derivado en el servidor.

#### Escenario: logout

- Dado un operador con sesión activa, cuando ejecuta logout, entonces la cookie queda expirada y un nuevo request a `/session` responde `AUTHENTICATION_REQUIRED`.

#### Escenario: consulta de sesión

- Dado un operador con sesión válida, cuando consulta `GET /api/gestion/session`, entonces recibe una vista derivada (id, nombre, rol y bandera de modo mock) y nunca el hash de la credencial ni datos de otros usuarios.

#### Escenario: login inválido

- Dado credenciales inexistentes o malformadas, cuando intenta login, entonces recibe denegación estable sin cookie, sin revelar si el usuario existe y sin cambios en `users.json`.

### Requisito ID-S2: actor derivado en cada request

El actor y su rol DEBEN derivarse de la sesión validada en cada request protegido. `actorId`, rol o permiso enviados por el cliente DEBEN ignorarse. **Objetivo futuro (Future target).**

#### Escenario: actor falsificado

- Dado un vendedor autenticado, cuando envía `actorId` y rol de administrador en el cuerpo, entonces el servidor usa la sesión real, responde `FORBIDDEN` para la acción privilegiada y no muta datos.

#### Escenario: sin sesión

- Dado un request sin cookie o con cookie vencida, cuando solicita `/session` o una mutación protegida, entonces recibe `AUTHENTICATION_REQUIRED` sin datos ni sesión creada.

## 4. Banner no productivo

### Requisito ID-B1: etiqueta visible permanente

La interfaz DEBE mostrar “modo desarrollo, no productivo” mientras exista la sesión mock. El banner no puede ocultarse por configuración de usuario. **Objetivo futuro (Future target).**

#### Escenario: banner visible

- Dado un operador con sesión mock, cuando navega por `/app/*`, entonces el banner permanece visible en el layout.

## 5. Denegaciones auditables

### Requisito ID-D1: denegaciones registradas en `data/audit.json`

Las denegaciones de autenticación y autorización DEBEN registrar actor confiable o ausencia, acción, recurso, instante y resultado minimizado, sin credenciales ni PII innecesaria. **Objetivo futuro (Future target).**

#### Escenario: denegación registrada

- Dado un rol insuficiente, cuando llega al handler protegido, entonces se devuelve `FORBIDDEN` y queda un evento en `audit.json` sin credenciales ni datos personales innecesarios.

## Resumen de casos negativos

| Caso | Resultado esperado |
|---|---|
| Credencial inválida o usuario inexistente | Denegación estable sin cookie; sin revelar existencia; `users.json` sin cambios. |
| Usuario inactivo | Denegación sin cookie ni sesión. |
| `actorId`/rol falsificado en el body | Se ignoran; el actor real decide; `FORBIDDEN` en acciones privilegiadas. |
| Request sin cookie o con cookie vencida | `AUTHENTICATION_REQUIRED` sin datos ni sesión. |
| Rol insuficiente | `FORBIDDEN` auditable; ningún owner cambia. |

## Convenciones de datos de prueba

Los usuarios de `data/users.json` y sus credenciales son fixtures sintéticos del entorno de desarrollo. Nunca se copian usuarios, contraseñas ni valores heredados utilizables desde `sistema-gestion/` o `pagina-web/`.

## Fuera de alcance

- Envelope de errores, idempotencia y `JsonStore`: módulo `shared-contracts/`.
- Layout, banner del shell y navegación visual: módulo `shell-ui/`.
- Administración de usuarios y del mapa de permisos: módulo `admin-backups/`.

## Enlaces

- Autoridad local: [`../spec.md`](../spec.md), [`../plan.md`](../plan.md) y [`../tasks.md`](../tasks.md).
- Capacidad: [`gestion-mock-identity`](../../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md).
