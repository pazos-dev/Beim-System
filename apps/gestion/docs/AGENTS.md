# Guía operativa de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Esta guía define cómo se trabajará en la aplicación reconstruida; no demuestra que exista todavía un runtime moderno ni que alguna capacidad esté implementada.

## Propósito y autoridad

Esta carpeta contiene la documentación local de la futura aplicación de gestión. Sus documentos se complementan, pero no sustituyen, la autoridad de la documentación raíz:

| Documento | Autoridad local | Uso |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | Procedimiento | Trabajo, validación y límites de colaboración. |
| [`constitution.md`](constitution.md) | Principios | Reglas no negociables de seguridad, propiedad y calidad. |
| [`spec.md`](spec.md) | Comportamiento | Casos de uso, requisitos e invariantes comprobables. |
| [`plan.md`](plan.md) | Secuencia | Slices, dependencias, compuertas y reversión. |
| [`stacks.md`](stacks.md) | Tecnología | Versiones, responsabilidades y convenciones de la futura pila. |
| [`tasks.md`](tasks.md) | Ejecución | Checklist local y evidencia por unidad de trabajo. |

La autoridad raíz conserva el alcance del sistema completo:

- [`AGENTS.md`](../../../AGENTS.md) rige el procedimiento del repositorio.
- [`constitution.md`](../../../constitution.md) rige los principios normativos.
- [`spec.md`](../../../spec.md) rige el comportamiento transversal.
- [`plan.md`](../../../plan.md) rige la secuencia de migración.
- [`tasks.md`](../../../tasks.md) rige las unidades de evidencia del workspace.

Cuando exista una contradicción, debe aplicarse la autoridad definida por los documentos raíz y registrarse la discrepancia. Esta guía no autoriza a relajar seguridad, propiedad, pruebas ni compuertas de migración.

## Estados de evidencia

Toda afirmación sobre esta aplicación debe usar una etiqueta exacta:

- **Línea base observada (Observed baseline):** hecho comprobado en el checkout actual, con ruta o comando cuando sea posible.
- **Comportamiento de referencia (Reference behavior):** conducta de `sistema-gestion/` o `pagina-web/` útil para compatibilidad, pero no garantía de seguridad ni propiedad.
- **Objetivo futuro (Future target):** diseño o comportamiento aún no demostrado; requiere la compuerta indicada antes de llamarse implementado.

**Línea base observada (Observed baseline):** antes de los slices de implementación, el checkout no demuestra una aplicación moderna ejecutable en `apps/gestion`; la gestión heredada permanece en `sistema-gestion/`. Los seis documentos de esta carpeta son evidencia documental de GR-0.1, no evidencia de runtime.

## Cómo iniciar un cambio

1. Ejecutar `git status --short` y confirmar que el alcance no incluye cambios preexistentes.
2. Leer [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
3. Leer [`constitution.md`](constitution.md), [`spec.md`](spec.md), [`plan.md`](plan.md), [`stacks.md`](stacks.md) y [`tasks.md`](tasks.md).
4. Consultar la propuesta, las nueve especificaciones de capacidad y el diseño en `openspec/changes/gestion-rebuild/`.
5. Confirmar la unidad asignada, sus dependencias, sus archivos permitidos, su prueba enfocada y su límite de rollback.
6. Verificar que la compuerta de calidad del workspace no esté siendo confundida con una capacidad de la aplicación.
7. Implementar solo la unidad asignada y actualizar su evidencia inmediatamente.

No se debe restaurar, reformatar ni corregir código heredado durante un slice acotado. Una fase documental no modifica código de aplicación, manifiestos, CI, SQL, semillas, bases de datos, `.codegraph/`, Engram ni `.atl/`.

## Comandos de la aplicación

Los siguientes comandos son la interfaz prevista para el paquete de la aplicación y son **Objetivo futuro (Future target)** mientras no exista el scaffold y sus scripts. Deben ejecutarse con el alcance de `apps/gestion`, nunca como sustituto silencioso de una validación del workspace:

```bash
pnpm --dir apps/gestion dev
pnpm --dir apps/gestion build
pnpm --dir apps/gestion lint
pnpm --dir apps/gestion typecheck
pnpm --dir apps/gestion test
```

Para una prueba enfocada futura, usar el runner configurado sin ejecutar toda la suite:

```bash
pnpm --dir apps/gestion test -- --run <ruta-de-prueba>
```

En GR-0.1 el comando de evidencia es únicamente `git diff --check -- apps/gestion/docs openspec/changes/gestion-rebuild/tasks.md`. No se ejecutan formateadores, servidores ni comandos de runtime para convertir una documentación en evidencia de implementación.

## TDD y calidad estrictos

La configuración SDD declara `strict_tdd: true` y Vitest como runner. Para cada unidad de código, el ciclo obligatorio es:

1. **RED:** escribir primero una prueba que exprese el caso o la denegación y que falle por la ausencia del comportamiento.
2. **GREEN:** implementar el mínimo para que la prueba pase y ejecutar la prueba enfocada.
3. **TRIANGULAR:** añadir al menos un caso positivo y uno de borde o seguridad cuando el requisito tenga más de un flujo.
4. **REFACTOR:** mejorar nombres, límites y duplicación sin cambiar el comportamiento; volver a ejecutar las pruebas.

Cada slice debe incluir pruebas unitarias, integración, componente, E2E o negativas según su riesgo. Las pruebas de autorización, propiedad, auditoría, idempotencia, privacidad, consistencia y rollback no son opcionales cuando el diseño las asigna. Un fallo preexistente debe registrarse, no ocultarse reparando otra unidad.

## Convenciones de carpetas y límites

La estructura prevista sigue [`design.md`](../../../openspec/changes/gestion-rebuild/design.md):

```text
apps/gestion/
├── app/login/page.tsx
├── app/app/{layout,page,dashboard,ordenes,clientes,stock,ventas,compras,servicios,caja,reportes,configuracion}/page.tsx
├── app/api/gestion/**/route.ts
├── middleware.ts
├── src/server/handlers/
├── src/server/data/{repositories,json-store.ts,schemas.ts}
├── src/lib/domain/{orders,inventory,cash,reports}/
├── src/components/{ui,features}/
├── src/lib/api-client/
├── data/*.json
├── fixtures/*.json
├── e2e/
└── tests/fixtures/
```

- `app/` presenta rutas y componentes; nunca es propietario de hechos.
- `app/api/gestion/**/route.ts` es una frontera HTTP delgada.
- `src/server/handlers/` deriva actor, autoriza, valida, audita y delega.
- `src/lib/domain/` contiene reglas puras sin DOM, reloj, azar ni `localStorage`.
- `src/server/data/` contiene repositorios y esquemas; cada entidad tiene un único owner.
- `data/*.json` es almacenamiento server-side de desarrollo. No es una carpeta para el navegador.
- `fixtures/*.json` contiene únicamente datos sintéticos y aislados.
- `e2e/` usa Playwright con datos de prueba y no con secretos o producción.

## Prácticas prohibidas

- Usar `localStorage` o `sessionStorage` como verdad, identidad o autorización.
- Aceptar `actorId`, rol, permiso o propietario enviado por el cliente como identidad confiable.
- Autorizar una mutación desde un botón, ruta visible, estado React o permiso del navegador.
- Escribir directamente desde componentes, acciones de presentación o `api-client`.
- Crear un segundo owner JSON para una entidad o preferir una respuesta vacía sobre el owner vigente.
- Persistir estados acentuados como tokens canónicos; la UI puede traducirlos a etiquetas visibles.
- Imprimir, auditar, fixturear o migrar códigos, contraseñas o patrones de desbloqueo por defecto.
- Copiar credenciales, secretos, datos reales o valores heredados utilizables.
- Modificar `sistema-gestion/`, `pagina-web/`, SQL, seeds o CI dentro de esta reconstrucción.
- Declarar login mock, build parcial, intención de CI o documentación como autenticación, producción o cutover.

## Skills y colaboración

| Área | Skills mínimas | Aplicación local |
|---|---|---|
| Arquitectura/API | `api-design-principles`, `error-handling-patterns` | Contratos, handlers delgados y errores cerrados. |
| Frontend/UX | `nextjs-15`, `react-19`, `tailwind-4`, `frontend-design` | App Router, accesibilidad y composición. |
| Datos/validación | `zod-4`, `zustand-5`, `production-postgres` | Límites Zod, UI efímera y portabilidad del repositorio. |
| Testing/QA | `playwright`, Vitest + Testing Library, `systematic-debugging` | Unitarias, RTL, E2E y fallos negativos. |
| CI/entrega | `github-actions`, `work-unit-commits`, `chained-pr` | Evidencia reproducible y PRs encadenadas. |
| SDD/documentación | `sdd-apply`, `sdd-verify`, `cognitive-doc-design` | Alcance, trazabilidad y revisión cognoscible. |
| TypeScript | `typescript` | Estricto, tipos de dominio y contratos explícitos. |

Antes de usar una skill se debe leer su `SKILL.md` exacto desde el registro del proyecto o desde la ruta inyectada por el orquestador. La skill no sustituye a los cinco documentos raíz.

## Alcance de revisión y reversión

Cada unidad debe ser autónoma, revisable y fácil de revertir. El presupuesto de revisión es de 400 líneas por PR; si un slice cohesivo lo supera, se divide por unidad de trabajo aprobada, nunca mediante minificación ni eliminación de pruebas o documentación. El rollback debe nombrar exactamente los archivos y la ruta o flag que se desactiva. La cadena prevista es `feature-branch-chain`; ningún PR de esta reconstrucción se dirige directamente a `main` sin la política aprobada.

## Enlaces locales y raíz

Esta guía se lee junto con [`constitution.md`](constitution.md), [`plan.md`](plan.md), [`stacks.md`](stacks.md), [`spec.md`](spec.md) y [`tasks.md`](tasks.md). La documentación de la aplicación permanece subordinada a [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
