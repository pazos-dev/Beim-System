# Tareas del módulo identity-login

**Estado:** **Objetivo futuro (Future target)**. Esta lista planifica la unidad GR-ID.1; ninguna tarea de código está iniciada. El checklist local de la fase vive en [`../tasks.md`](../tasks.md).

## GR-ID.1 — sesión mock, roles y permisos

Dependencias: GR-SHARED.1 (envelope y auditoría), GR-SHELL.1 (protección de rutas) y la compuerta de calidad del workspace.

### Ciclo RED — pruebas negativas primero

Escribir y ejecutar antes de implementar; deben fallar por ausencia del comportamiento:

- [ ] RED-01 Login con credencial inválida: denegación estable sin cookie; `users.json` sin cambios.
- [ ] RED-02 Usuario inactivo: denegación sin cookie ni sesión creada.
- [ ] RED-03 Actor falsificado: vendedor envía `actorId` y rol de administrador; el servidor usa la sesión real y responde `FORBIDDEN` sin mutación.
- [ ] RED-04 Sin sesión: request a `/session` o a una mutación protegida responde `AUTHENTICATION_REQUIRED` sin datos.
- [ ] RED-05 Rol insuficiente: `FORBIDDEN` y evento en `data/audit.json` sin credenciales ni PII innecesaria.
- [ ] RED-06 Matriz de permisos: una prueba por rol (los cinco) sobre acciones representativas de la tabla de [`spec.md`](spec.md).
- [ ] RED-07 Banner “modo desarrollo, no productivo” visible en `/app/*` con sesión activa.

### Ciclo GREEN — implementación mínima

- [ ] Implementar route handlers de login/logout, cookie `httpOnly` + `sameSite`, derivación de actor desde la sesión y `GET /session`.
- [ ] Crear `data/users.json` (credenciales hasheadas, sintéticas) y `data/role-permissions.json` declarativo evaluado por acción/recurso.
- [ ] Mostrar el banner permanente en el layout protegido.
- [ ] Ejecutar la prueba enfocada hasta verde antes de continuar.

### TRIANGULAR y REFACTOR

- [ ] Casos de borde: payload con campos extra (ignorados), cookie vencida y doble logout.
- [ ] REFACTOR sin cambiar comportamiento; suite enfocada en verde.

### Evidencia

```bash
pnpm --dir apps/gestion test
```

Registrar comando, salida exacta y estado de la compuerta en la evidencia de la unidad. **Objetivo futuro (Future target):** el comando requiere el scaffold del paquete.

### Definición de done

- Login/logout funcionan server-side; el actor siempre se deriva de la sesión; `actorId`/rol del body se ignoran con prueba que lo demuestra; la matriz declarativa se evalúa por acción/recurso con una prueba por rol; el banner es visible; las denegaciones quedan auditadas; las pruebas negativas pasan.

### Rollback

Desactivar las rutas de autenticación modernas y eliminar los archivos del slice: handlers, pruebas, `users.json`/`role-permissions.json` de prueba y banner. No tocar legado, owners de otros módulos ni configuración del workspace.

## Enlaces

- [`../tasks.md`](../tasks.md) — checklist local GR-ID.1 y gate común.
- [`spec.md`](spec.md) — requisitos detallados de este módulo.
- [`../../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md`](../../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md) — autoridad de requisitos.
