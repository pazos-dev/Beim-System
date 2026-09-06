# Especificación: auth-identity

## Propósito

Modelo dual de identidad (`users` para webshop, `gestion_users` para la consola de gestión) con tokens puente (`gestion_web_access_tokens`, `webshop_sessions`). Toda la autorización por roles se resuelve en el servidor; el cliente nunca es autoridad de identidad ni de permisos.

## Requisitos

### Requisito: Modelo dual y token puente

El sistema DEBE mantener separadas las identidades web y de gestión, DEBE almacenar únicamente hashes SHA-256 de tokens con expiración (`expires_at`) y DEBE rechazar tokens expirados o desconocidos con 401 uniforme, sin emitir sesión. Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: cualquier solicitante que presente un token puente válido; entrada validada: hash + expiración en servidor (puente de gestión en `gestion_web_access_tokens`, sesiones de webshop en `webshop_sessions`, una sesión activa por usuario); owner de escritura: Postgres (`gestion_web_access_tokens`, `webshop_sessions`, `users`, `gestion_users`); éxito/error: sesión con alcance emitida o error 401; fallo cerrado: token expirado o desconocido → 401 y ninguna sesión emitida. Prueba: `auth.test.ts` (webshop, 15 casos), `middleware/auth.test.ts` (5 casos) — verify-report 2026-09-06 (evidencia `0ae010ec`).

#### Escenario: Login con token puente

- Dado un token puente válido y no expirado para un usuario de gestión, cuando se hace POST `/api/v1/auth/gestion-access` con el token, entonces se emite una sesión con alcance para ese usuario.

#### Escenario: Token expirado rechazado

- Dado un token puente expirado, cuando se hace POST `/api/v1/auth/gestion-access`, entonces el status es 401 y no se emite ninguna sesión.

### Requisito: Autorización por roles en servidor

El sistema DEBE autorizar cada escritura de gestión y webshop contra roles de servidor y DEBE responder 403 sin filtrar la existencia del recurso más allá de la política (`NOT_FOUND_OR_FORBIDDEN`). Estado: **Línea base observada (Observed baseline)**. Contrato: actor autorizado: roles de servidor vía `requireRole`; entrada validada: sesión resuelta en servidor (identidad inyectable, opción `resolveIdentity`); owner de escritura: recurso de destino (Postgres); éxito/error: 403 sin crear nada ni filtrar existencia; fallo cerrado: permisos insuficientes → 403 y ningún efecto observable de creación. Prueba: `gestion-api.test.ts`, `middleware/auth.test.ts` — verify-report 2026-09-06.

#### Escenario: Escritura prohibida

- Dado una sesión con rol de solo lectura, cuando se hace POST `/api/v1/receipts`, entonces el status es 403 y no se crea nada.