# Módulo identity-login

**Estado:** **Objetivo futuro (Future target)**. Este módulo define la sesión mock de desarrollo prevista; no existe login ni sesión implementados en el checkout.

## Propósito

Sesión mock de desarrollo: login/logout vía route handler, cinco roles y permisos declarativos por acción/recurso, con actor derivado siempre en el servidor. Se implementa en el slice `gestion-mock-identity` (GR-ID).

## Límites

- **No productivo:** banner visible permanente “modo desarrollo, no productivo”; no sustituye autenticación real ni autoriza despliegue.
- Sin proveedor externo de identidad y sin secretos: usuarios y credenciales hasheadas en `data/users.json` de desarrollo.
- Sin identidad del cliente: `actorId`, rol o permiso enviados en el body se ignoran siempre.
- No expone hashes de credenciales ni datos sensibles en respuestas, auditoría ni E2E.
- No define contratos de error, auditoría ni store (módulo `shared-contracts/`) ni componentes visuales del shell (módulo `shell-ui/`).

## Convenciones

- Route handlers previstos: `POST /api/gestion/auth/login`, `POST /api/gestion/auth/logout`, `GET /api/gestion/session`.
- Cookie de sesión `httpOnly` + `sameSite`, emitida y validada por el servidor; sin identidad en `localStorage` o `sessionStorage`.
- Zod 4 para credenciales y payloads de sesión.
- Permisos declarativos en `data/role-permissions.json`, evaluados por acción y recurso en cada handler.

## Skills del módulo

| Skill | Cuándo cargarla | Qué aporta aquí |
|---|---|---|
| `nextjs-15` | Al crear los route handlers y el middleware de `/app/*`. | Convención de handlers, cookies y primera barrera de routing. |
| `react-19` | Al construir el formulario de login. | Formulario accesible y simple, sin estado global innecesario. |
| `zod-4` | Al validar credenciales y payloads de sesión. | Esquema único con errores estables y minimizados. |
| `error-handling-patterns` | Al modelar denegaciones y fallo cerrado. | Errores explícitos sin filtrar existencia ni datos. |
| `systematic-debugging` | Ante sesiones que no expiran o replay inesperado. | Aislar causa raíz antes de tocar cookie o handler. |
| `playwright` | Al escribir el E2E de login y denegaciones. | Recorridos reales con fixtures sintéticos y Page Objects. |

## Documentos globales (enlace, nunca copia)

Las reglas globales no se repiten aquí; se leen en:

- [`../AGENTS.md`](../AGENTS.md) — procedimiento, TDD estricto y límites de colaboración.
- [`../constitution.md`](../constitution.md) — actor derivado en servidor e identidad mock no productiva.
- [`../stacks.md`](../stacks.md) — versiones y convenciones de la pila prevista.
- [`../spec.md`](../spec.md) — casos de uso por actor y errores observables.
- [`../plan.md`](../plan.md) — secuencia de slices, arquitectura de capas y compuertas.
- [`../tasks.md`](../tasks.md) — checklist local y evidencia por unidad.

Autoridad raíz: [`../../../../AGENTS.md`](../../../../AGENTS.md), [`../../../../constitution.md`](../../../../constitution.md), [`../../../../spec.md`](../../../../spec.md), [`../../../../plan.md`](../../../../plan.md) y [`../../../../tasks.md`](../../../../tasks.md).

Capacidad de requisitos: [`gestion-mock-identity`](../../../../openspec/changes/gestion-rebuild/specs/gestion-mock-identity/spec.md).

## Comandos locales de prueba

```bash
pnpm --dir apps/gestion test
pnpm --dir apps/gestion typecheck
pnpm --dir apps/gestion lint
```

**Objetivo futuro (Future target):** los comandos requieren el scaffold del paquete; mientras no exista, la evidencia documental se limita a `git diff --check`.
