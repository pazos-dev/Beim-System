# Tareas: Documentación de la fundación del sistema

## Previsión de carga de revisión

Líneas modificadas estimadas: 650–850 en cinco documentos raíz
Estrategia de entrega: auto-chain
Decisión necesaria antes de apply: Sí
PR encadenadas recomendadas: Sí
Estrategia de encadenamiento: feature-branch-chain
Riesgo del presupuesto de 400 líneas: Alto

### Unidades de trabajo sugeridas

| Unidad | Objetivo | PR | Comando de prueba enfocado | Arnés de runtime | Límite de reversión |
|---|---|---|---|---|---|
| 1 | Gobernanza y autoridad | PR 1 | `git diff --check -- AGENTS.md constitution.md` | N/A: solo documentación | Revertir esos dos archivos |
| 2 | Comportamiento, propiedad y seguridad | PR 2 | `git diff --check -- spec.md` | N/A: solo documentación | Revertir `spec.md` |
| 3 | Migración y backlog de evidencia | PR 3 | `git diff --check -- plan.md tasks.md` | N/A: solo documentación | Revertir esos dos archivos |

## Fase 1: Fundación de gobernanza

- [x] SF-1.1 (deps: none; owner: documentation procedure; files: `AGENTS.md`) Crear orientación en español técnico neutro que cubra los cinco enlaces, las tres etiquetas, la preservación heredada, la UI/el código fuente en español, la validación, QA/pruebas, CI/CD, seguridad, SDD, las skills principales y el mantenimiento separado de Engram/`.codegraph/`. Aceptación: no hay ambigüedad de autoridad; evidencia: revisión de enlaces/etiquetas.
- [x] SF-1.2 (deps: SF-1.1; owner: architecture principles; files: `constitution.md`) Definir identidad aplicada por el servidor, mínimo privilegio, protección de secretos, mutaciones auditables, propiedad canónica, consistencia, migración e incumplimiento; etiquetar la autenticación mock, los actores proporcionados por quien llama y los valores predeterminados como referencia. Aceptación: las reglas normativas son comprobables; evidencia: revisión de mutación no autorizada.

## Fase 2: Comportamiento de todo el sistema

- [x] SF-2.1 (deps: SF-1.1–1.2; owner: public/management web; files: `spec.md`) Especificar el comportamiento de la tienda/recibos y del CRUD/informes/reparación de gestión, los actores, las entradas, los resultados durables, los fallos y las compuertas; clasificar `pagina-web/`, `sistema-gestion/` y `apps/gestion` transicional. Aceptación: trazabilidad de capabilities; evidencia: revisión de la matriz de límites.
- [x] SF-2.2 (deps: SF-2.1; owner: API/backend/database; files: `spec.md`) Especificar contratos de API autenticados, validación/transacciones/auditoría del backend, propiedad de PostgreSQL, reconciliación e invariantes de identidad/datos; marcar localStorage y los actores proporcionados por quien llama como entrada de migración/referencia. Aceptación: propietario durable único; evidencia: revisión de consistencia.

## Fase 3: Plan de migración y evidencia

- [x] SF-3.1 (deps: SF-2.2; owner: migration architecture; files: `plan.md`) Secuenciar la restauración del workspace/paquetes, identidad, propiedad, persistencia, CI, pruebas de integración/E2E/seguridad/despliegue/smoke, transición, reversión y obsolescencia; bloquear la migración si fallan `generate`, typecheck, test, build o las compuertas de migración. Aceptación: las etapas heredada/objetivo son explícitas; evidencia: revisión de compuerta fallida.
- [x] SF-3.2 (deps: SF-3.1; owner: delivery/SDD; files: root `tasks.md`) Descomponer el plan en unidades con ID estable, dependencias, propietario/límite, archivos exactos, aceptación y evidencia; registrar las skills principales y los hechos de CI: falta `generate`, lint pasa, fallo de `.next/types`, dos fallos de test/build por `@beim/data`, 15 pruebas pasan, la prueba heredada de informes pasa. Aceptación: unidades realizables en una sesión; evidencia: revisión de trazabilidad de tareas.

## Fase 4: Verificación y protección del alcance

- [x] SF-4.1 (deps: SF-1.1–3.2; owner: documentation QA; files: `AGENTS.md`, `constitution.md`, `spec.md`, `plan.md`, root `tasks.md`) Verificar la autoridad, los cuatro enlaces cruzados, las tres etiquetas, la resolución de contradicciones y las brechas de integración/E2E/seguridad/despliegue/smoke sin afirmaciones en verde. Aceptación: cada requisito se vincula con evidencia; evidencia: checklist de enlaces/etiquetas/cobertura.
- [x] SF-4.2 (deps: SF-4.1; owner: change control; files: `AGENTS.md`, `constitution.md`, `spec.md`, `plan.md`, root `tasks.md`; `openspec/changes/system-foundation/{exploration.md,proposal.md,specs/system-foundation-documentation/spec.md,design.md,tasks.md}`) Inspeccionar `git diff --name-only` y el estado de los almacenes para demostrar que no hay cambios de runtime, esquema, seed, base de datos, almacén operativo, Engram ni `.codegraph/`; preservar los archivos heredados. Aceptación: el alcance es exclusivamente documental; evidencia: diff y auditoría de almacenes.
