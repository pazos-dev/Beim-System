# Guía obligatoria del paquete `@beim/api`

Todo código que se produzca en este paquete (features, fixes, refactors,
tests, scripts) SIGUE SIEMPRE estas dos skills instaladas a nivel usuario.
No son opcionales ni decorativas: son el estándar de producción del paquete.

## Skills obligatorias

| Skill | Path | Aplica a |
|---|---|---|
| `solid` | `~/.agents/skills/solid/SKILL.md` (+ `references/`) | Todo código: TDD rojo-verde-refactor, SOLID riguroso, clean code, code smells, checklists pre/durante/post |
| `owasp-security-check` | `~/.agents/skills/owasp-security-check/SKILL.md` (+ `rules/`) | Todo código con auth, datos sensibles, inputs, uploads, sesiones o config: orden CRITICAL → HIGH → MEDIUM, reporte con severidad/archivo/impacto/fix |

Si una skill falta en el entorno, detenete y pedila antes de producir código.

## Reglas innegociables (resumen; el detalle manda en cada skill)

1. **Tests primero**: ningún código de producción sin test que lo exija; la
   suite (`npx tsc --noEmit` + `vitest run` con y sin Postgres) queda verde
   antes, durante y después de cada paso.
2. **Sin cambio de comportamiento salvo que el issue lo pida**: respuestas,
   status, SQL, migraciones y seeds se tocan solo con spec explícita.
3. **YAGNI/KISS/Regla de Tres**: nada de abstracciones prematuras, renames
   masivos ni cruzadas (value objects, etc.) sin bugs que las justifiquen.
4. **Seguridad por defecto**: inputs validados en el borde (zod strict),
   SQL parametrizado, secretos solo por entorno, sin PII en logs ni
   respuestas, 401 uniforme, fail-closed.
5. **Pasos chicos y verificados**: un cambio, una verificación; si un test
   existente falla por tu cambio, el cambio está mal, no el test.

## Dónde vive cada cosa (no duplicar)

- Contratos y alcance: `docs/USO.md` y `openspec/specs/*`.
- Taxonomía de errores: `src/errors/taxonomy.ts` (códigos y mensajes ES).
- Patrones de test: `src/app.test.ts` (DB-free), `src/db/testDb.ts`
  (`describePg` + `setupTestDatabase`), helpers en `*-api.test.ts`.
