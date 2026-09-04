# Módulo shell-ui

**Estado:** **Objetivo futuro (Future target)**. Este módulo define el esqueleto visual previsto; ninguna página o componente existe todavía en el checkout.

## Propósito

Esqueleto visual y patrones de UI reutilizables: layout, navegación, dashboard, tablas, modales y toasts. Conserva la gramática UX heredada (exploration.md, L145–153) sin trasladar sus fallbacks ni su autoridad. Se implementa en el slice `gestion-app-shell` (GR-SHELL).

## Límites

- Sin lógica de negocio: no calcula costos, estados ni totales canónicos.
- Sin escribir owners: ningún componente persiste en `data/*.json` ni compite con repositorios.
- Sin autorizar: un botón visible no es un permiso; el servidor decide y audita.
- No define sesión, roles ni permisos (módulo `identity-login/`).

## Convenciones

- App Router: rutas bajo `app/app/*` con `layout.tsx`; Server Components por defecto.
- `"use client"` mínimo: solo interacción, estado efímero y accesibilidad lo justifican.
- Tailwind 4 con variables de tema; `cn()` para composición; sin `var()` ni hex en `className`.
- Composición sobre boolean-props: componentes compuestos (`Table`, `Dialog`) en lugar de banderas acumuladas.
- Estado de servidor con TanStack Query; estado efímero de UI (sidebar, modal, toasts, borrador) con Zustand; `localStorage` nunca es verdad.

## Skills del módulo

| Skill | Cuándo cargarla | Qué aporta aquí |
|---|---|---|
| `nextjs-15` | Al crear rutas, layouts, middleware o metadata. | Convenciones App Router, Server Components y route handlers. |
| `react-19` | Al escribir componentes y formularios. | Componentes modernos sin `forwardRef`; composición y ref como prop. |
| `tailwind-4` | Al estilizar layout, tablas y modales. | Tema por variables, `cn()` y foco visible consistente. |
| `frontend-design` | Al decidir la dirección visual del shell. | Jerarquía, tipografía y layout intencionales, no genéricos. |
| `vercel-composition-patterns` | Al diseñar componentes reutilizables. | Compound components y APIs sin explosión de props booleanas. |
| `vercel-react-best-practices` | Al optimizar renders y bundle. | Patrones de performance para Server/Client Components. |
| `web-design-guidelines` | Al auditar accesibilidad y UX del shell. | Checklist de foco, teclado, contraste y estados visibles. |
| `playwright` | Al escribir E2E de navegación y denegaciones. | Page Objects y selectores por rol y etiqueta. |

## Documentos globales (enlace, nunca copia)

Las reglas globales no se repiten aquí; se leen en:

- [`../AGENTS.md`](../AGENTS.md) — procedimiento, TDD estricto y límites de colaboración.
- [`../constitution.md`](../constitution.md) — principios no negociables.
- [`../stacks.md`](../stacks.md) — versiones y convenciones de la pila prevista.
- [`../spec.md`](../spec.md) — casos de uso y preservación UX con límites seguros.
- [`../plan.md`](../plan.md) — secuencia de slices, arquitectura de capas y compuertas.
- [`../tasks.md`](../tasks.md) — checklist local y evidencia por unidad.

Autoridad raíz: [`../../../../AGENTS.md`](../../../../AGENTS.md), [`../../../../constitution.md`](../../../../constitution.md), [`../../../../spec.md`](../../../../spec.md), [`../../../../plan.md`](../../../../plan.md) y [`../../../../tasks.md`](../../../../tasks.md).

Capacidad de requisitos: [`gestion-app-shell`](../../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md).

## Comandos locales de prueba

```bash
pnpm --dir apps/gestion test
pnpm --dir apps/gestion typecheck
pnpm --dir apps/gestion lint
```

**Objetivo futuro (Future target):** los comandos requieren el scaffold del paquete; mientras no exista, la evidencia documental se limita a `git diff --check`.
