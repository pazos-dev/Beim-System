# Módulo shared-contracts

**Estado:** **Objetivo futuro (Future target)**. Este módulo define los contratos transversales previstos; ningún archivo de `src/` existe todavía en el checkout.

## Propósito

Contratos que todos los handlers de `/api/gestion` usan: envelope de errores, idempotencia, auditoría mínima, tokens de estado canónicos y el `JsonStore` compartido por los repositorios. Se implementa en el slice `gestion-shared-contracts` (GR-SHARED).

## Límites

- No contiene lógica de negocio de ninguna entidad: ni estados de orden, ni costos, ni reglas de caja.
- No conoce entidades concretas ni owners de negocio; aporta solo el mecanismo común.
- No expone rutas HTTP propias: otros módulos consumen sus funciones desde sus handlers.
- No depende de React, del DOM ni de `localStorage`.
- Es el owner transversal de `audit.json` y del registro idempotente server-side; no compite con los owners de negocio definidos por `data-json/`.

## Convenciones

- TypeScript estricto: tipos explícitos en los límites, `strict: true`, sin `any`.
- Zod 4 para validar claves idempotentes, eventos de auditoría y tokens de estado (`z.enum`).
- Sin dependencias de React ni del DOM: importable desde handlers, dominio y pruebas.
- Errores como valores: `Result` tipado; ninguna excepción cruza el límite del envelope.
- Los archivos del módulo viven en `src/server/` (ruta exacta decidida en apply) junto a sus pruebas.

## Skills del módulo

| Skill | Cuándo cargarla | Qué aporta aquí |
|---|---|---|
| `error-handling-patterns` | Al definir o modificar el envelope y el `Result`. | Modelo de errores cerrado; fallo explícito sin excepciones cruzando el límite. |
| `typescript` | Al tipar contratos, catálogos y genéricos del envelope. | Tipos estrictos y discriminados reutilizables entre módulos. |
| `zod-4` | Al validar claves, hashes, eventos y estados. | Esquemas únicos para entrada y documentos; `z.enum` para tokens canónicos. |
| `systematic-debugging` | Ante fallos de concurrencia, `rename` o replay inesperados. | Aislar la causa raíz antes de tocar la implementación del store. |
| `work-unit-commits` | Al planificar la unidad GR-SHARED.1. | Commits revisables por unidad, con pruebas y evidencia juntas. |

## Documentos globales (enlace, nunca copia)

Las reglas globales no se repiten aquí; se leen en:

- [`../AGENTS.md`](../AGENTS.md) — procedimiento, TDD estricto y límites de colaboración.
- [`../constitution.md`](../constitution.md) — principios no negociables (fallo cerrado, auditoría, idempotencia).
- [`../stacks.md`](../stacks.md) — versiones y convenciones de la pila prevista.
- [`../spec.md`](../spec.md) — casos de uso y errores observables esperados.
- [`../plan.md`](../plan.md) — secuencia de slices, arquitectura de capas y compuertas.
- [`../tasks.md`](../tasks.md) — checklist local y evidencia por unidad.

Autoridad raíz: [`../../../../AGENTS.md`](../../../../AGENTS.md), [`../../../../constitution.md`](../../../../constitution.md), [`../../../../spec.md`](../../../../spec.md), [`../../../../plan.md`](../../../../plan.md) y [`../../../../tasks.md`](../../../../tasks.md).

Capacidad de requisitos: [`gestion-shared-contracts`](../../../../openspec/changes/gestion-rebuild/specs/gestion-shared-contracts/spec.md).

## Comandos locales de prueba

```bash
pnpm --dir apps/gestion test -- --run src/server
pnpm --dir apps/gestion typecheck
pnpm --dir apps/gestion lint
```

**Objetivo futuro (Future target):** los comandos requieren el scaffold del paquete con sus scripts; mientras no exista, la evidencia documental se limita a `git diff --check`.
