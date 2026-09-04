# Guía operativa del repositorio

Este archivo es la guía de procedimiento para las personas colaboradoras y los agentes que trabajan en Beim-System-Tech. Explica cómo navegar por el repositorio, evaluar la evidencia, realizar cambios acotados y validar afirmaciones. No define el comportamiento del negocio ni la arquitectura.

## Leer la base en este orden

Los cinco documentos raíz están presentes y tienen autoridades independientes. Su existencia documental no demuestra que el sistema objetivo esté implementado.

| Documento | Autoridad | Usarlo para |
|---|---|---|
| [`AGENTS.md`](AGENTS.md) | Procedimiento | Trabajo en el repositorio, validación, colaboración y reglas del flujo de trabajo. |
| [`constitution.md`](constitution.md) | Principios normativos | Principios no negociables de seguridad, propiedad, consistencia y calidad. |
| [`spec.md`](spec.md) | Comportamiento e invariantes | Comportamiento comprobable de todo el sistema y contratos de límites. |
| [`plan.md`](plan.md) | Secuencia de migración | Etapas de la arquitectura futura, compuertas, reversión y obsolescencia. |
| [`tasks.md`](tasks.md) | Lista de evidencia ejecutable | Unidades de trabajo acotadas, dependencias, aceptación y pruebas. |

Cuando los documentos discrepen, usa la columna de autoridad anterior. NO DEBES resolver silenciosamente una contradicción tratando un detalle de implementación, una afirmación del README, una entrada de memoria o un índice generado como autoridad.

## Navegación del repositorio

Comienza cada cambio comprobando el árbol de trabajo y el alcance solicitado:

```bash
git status --short
```

El repositorio actual es una línea base de transición:

- La raíz es un workspace privado de Turborepo/pnpm. `pnpm-workspace.yaml` incluye únicamente `apps/*`.
- `apps/gestion` fue eliminado del árbol; su reconstrucción dedicada se planifica por separado y permanece como **Objetivo futuro (Future target)** hasta que el código nuevo exista y pase sus compuertas.
- `pagina-web/` contiene la tienda pública heredada en funcionamiento, la interfaz de recibos y la API HTTP de Node.js.
- `sistema-gestion/` contiene la aplicación de gestión heredada en funcionamiento y la interfaz de recibos.
- El README raíz describe aplicaciones y paquetes adicionales ausentes del árbol actual. `apps/gestion` importa los paquetes ausentes `@beim/data` y `@beim/contracts`.
- `.github/workflows/ci.yml` es el único flujo de CI observado actualmente.

Usa el documento raíz propietario de cada afirmación: `spec.md` para el comportamiento, `plan.md` para la secuencia del objetivo y `tasks.md` para la evidencia de entrega. Usa el código fuente, SQL, configuración, pruebas, archivos de CI y salida generada como evidencia que debe comprobarse, no como permiso para inventar una arquitectura objetivo.

## Las etiquetas de estado son obligatorias

Etiqueta las afirmaciones sobre código, comportamiento o arquitectura con uno de estos términos exactos:

- **Línea base observada (Observed baseline)** — verificada en el checkout actual. Incluye la ruta, el comando u otra evidencia cuando sea práctico.
- **Comportamiento de referencia (Reference behavior)** — comportamiento proporcionado actualmente por código heredado o transicional y útil para el análisis de compatibilidad o migración. No constituye automáticamente una garantía de seguridad, propiedad o calidad.
- **Objetivo futuro (Future target)** — comportamiento o arquitectura prevista que aún no está demostrada en este checkout. Indica su compuerta de aceptación antes de llamarla implementada.

NO DEBES convertir un comando fallido, una ruta ausente, una descripción del README, un mock o un plan en una afirmación de implementación. Si la evidencia es incompleta, debes indicarlo.

## Tratamiento del código heredado y transicional

Trata `pagina-web/` y `sistema-gestion/` como **Comportamiento de referencia (Reference behavior)** y evidencia heredada. CONSÉRVALOS salvo que un cambio aprobado por separado delimite explícitamente una modificación. NO DEBES copiar su comportamiento de estado local, identidad proporcionada por quien llama, credenciales o autorización a un objetivo sin una decisión explícita de seguridad y migración.

El prototipo `apps/gestion` fue eliminado del árbol; su comportamiento (autenticación mock del lado del cliente, CRUD parcial, enlaces de rutas inconsistentes) queda como **Comportamiento de referencia (Reference behavior)** preservado en el historial de Git. NO DEBES describir `apps/web`, las aplicaciones de escritorio/móviles ni los paquetes compartidos ausentes como implementados.

`localStorage` del navegador y el contenido de bases de datos/semillas heredadas pueden ser evidencia de migración. No son canónicos de forma implícita. Reconcilia los estados en conflicto y nombra un propietario antes del cambio de dirección; conserva evidencia de reversión y respaldo.

Evita la limpieza amplia mientras realizas trabajo enfocado. NO DEBES restaurar, eliminar, reformatear ni “corregir” cambios preexistentes no relacionados del árbol de trabajo. Una fase documental NO DEBE modificar código de aplicación, manifiestos de paquetes, CI, SQL, semillas, bases de datos ni carpetas heredadas.

## Prácticas de idioma y documentación

Los artefactos técnicos —comentarios de código escritos de nuevo, especificaciones, planes, registros de tareas, pruebas y documentación para colaboradores— DEBEN estar escritos en español técnico claro y neutro cuando esta tarea lo solicite. El contenido existente de la interfaz y del código en español DEBE permanecer sin cambios salvo que una tarea delimite explícitamente una traducción o un cambio de texto visible para la persona usuaria.

Mantén los documentos fáciles de revisar: comienza por la decisión o acción, usa secciones y tablas breves, distingue la evidencia de la intención e indica qué queda deliberadamente fuera de alcance. Enlaza entre sí los cinco documentos raíz usando sus nombres de archivo exactos, incluidos los enlaces a documentos previstos para fases posteriores.

## Validación y límites conocidos

Para esta fase documental, ejecuta validación de solo comprobación; NO DEBES ejecutar un formateador que modifique archivos:

```bash
```

Los siguientes resultados de **Línea base observada (Observed baseline)** se registran para que no se confundan con afirmaciones de entrega:

| Comprobación | Evidencia actual |
|---|---|
| `pnpm lint` | Pasa en la línea base registrada. |
| `pnpm typecheck` | Falla porque faltan los archivos generados `.next/types`. |
| `pnpm test` | Pasan 15 pruebas; dos suites fallan porque no se puede resolver `@beim/data`. |
| `pnpm build` | Falla porque no se puede resolver `@beim/data`. |
| Prueba del motor de informes heredado | Pasa en la línea base registrada. |
| `node --check` sobre JavaScript heredado | Pasa para los archivos heredados registrados. |

NO DEBES afirmar que la suite completa, la compilación, CI, el despliegue o la preparación para producción están en estado correcto hasta que evidencia reciente lo demuestre. `pnpm format` escribe archivos y no es un comando apropiado de solo comprobación para una fase exclusivamente documental.

## QA y pruebas

La cobertura de calidad disponible es desigual. `apps/gestion` tiene cobertura con Vitest, JSDOM y Testing Library. El código de gestión heredado tiene una prueba enfocada del motor de informes, y el JavaScript heredado puede comprobarse sintácticamente con `node --check`. Actualmente no se observa un arnés dedicado de integración para servidor/API/base de datos ni una suite de extremo a extremo, y los manifiestos actuales no configuran un proveedor ni un script de cobertura.

Para cada cambio, elige la capa de pruebas disponible más alta que corresponda al riesgo. Añade evidencia negativa de autorización, propiedad, consistencia, migración y reversión antes de tratar un objetivo futuro como completo. Para la documentación, valida enlaces, etiquetas, límites de autoridad y alcance en lugar de inventar pruebas de ejecución.

## Límites de CI/CD

El flujo observado `.github/workflows/ci.yml` pretende ejecutar la instalación, `pnpm generate`, lint/typecheck, pruebas y compilación en pushes y pull requests dirigidos a `main`. El `package.json` raíz actual no tiene un script `generate`, y los fallos registrados de typecheck, pruebas y compilación anteriores siguen sin resolverse. No se observa ningún flujo de despliegue, release, promoción entre entornos, migración ni smoke test.

La intención de CI no es capacidad de despliegue. NO DEBES modificar CI ni afirmar protección de ramas, capacidad de despliegue, ejecución de migraciones o capacidad de promoción basándote en esta guía. Ese trabajo requiere su propio cambio aprobado y evidencia ejecutable.

## Reglas de seguridad para colaboradores

- NO DEBES confirmar secretos, credenciales, tokens, claves privadas ni datos de producción copiados. Usa marcadores documentados e inyección de entorno donde el repositorio lo admita.
- Trata la identidad proporcionada por el cliente, la visibilidad de rutas y el estado local como entradas no confiables. Las operaciones protegidas requieren autenticación y autorización del lado del servidor.
- Usa el mínimo privilegio, valida las entradas en el límite y conserva un rastro de auditoría para las mutaciones persistentes.
- NO DEBES exponer valores heredados predeterminados ni credenciales temporales en documentación nueva. Describe su existencia únicamente como evidencia de una brecha cuando sea necesario, sin reproducir valores secretos.
- Informa una brecha de seguridad como brecha. NO DEBES presentar una sesión mock, un actor proporcionado por quien llama o un control de interfaz como garantía de autorización.

Las reglas normativas y las clasificaciones explícitas de incumplimiento son propiedad de [`constitution.md`](constitution.md); el comportamiento pertenece a [`spec.md`](spec.md).

## Flujo de trabajo SDD

Usa la secuencia SDD para el trabajo acotado del sistema:

1. Explora la evidencia actual y las alternativas.
2. Propón la intención, el alcance, los riesgos y los objetivos excluidos.
3. Especifica el comportamiento observable y los invariantes.
4. Diseña los límites, la propiedad, la evidencia y el despliegue gradual.
5. Divide el trabajo en tareas estables y verificables de forma independiente.
6. Aplica únicamente la unidad de trabajo asignada y registra evidencia enfocada.
7. Verifica los requisitos, las pruebas, el alcance y las contradicciones.
8. Archiva únicamente después de la verificación y la aprobación requerida.

Para un cambio encadenado, mantén cada fase autónoma, por debajo del presupuesto de revisión cuando sea práctico y fácil de revertir. NO DEBES implementar tareas pendientes de una fase posterior. El conjunto de artefactos SDD está descrito por [`plan.md`](plan.md) y la lista ejecutable por [`tasks.md`](tasks.md).

## Skills principales y colaboración

Aplica las skills relevantes mínimas antes de trabajar. El registro del proyecto (`.atl/skill-registry.md`) indexa las skills del proyecto y de usuario; consulta la ruta exacta de cada `SKILL.md` allí. Sigue el archivo de la skill cargada como fuente de verdad; NO DEBES tratar un resumen de registro generado como instrucciones.

Skills principales por área:

| Área | Skills |
|---|---|
| Arquitectura y API | `api-design-principles`, `error-handling-patterns`, `brainstorming` |
| Frontend y UX | `frontend-design`, `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns`, `nextjs-15`, `react-19`, `tailwind-4` |
| Datos y validación | `postgresql-optimization`, `production-postgres`, `zod-4`, `zustand-5` |
| Testing y QA | `playwright`, `systematic-debugging`, Vitest + Testing Library (configurados en el repo) |
| CI/CD y entrega | `github-actions`, `work-unit-commits`, `chained-pr` |
| SDD | `sdd-explore`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive`, `cognitive-doc-design` |
| TypeScript | `typescript` |

Mantén una unidad de trabajo revisable: un propósito, pruebas o documentación pertinentes, evidencia exacta, un límite claro de reversión y un Conventional Commit si se solicita confirmar cambios. NO DEBES confirmar cambios preexistentes no relacionados ni añadir atribución de IA a los mensajes de commit.

## Engram y CodeGraph son almacenes separados

Engram es memoria del flujo de trabajo; `.codegraph/` es un índice de inteligencia del código. Ninguno es documentación de la aplicación, propietario del runtime ni objetivo de limpieza. NO DEBES restablecer, eliminar, editar manualmente ni reconstruir ninguno de los dos como parte del trabajo documental o de aplicación. CodeGraph puede consultarse para preguntas estructurales y DEBERÍA sincronizarse mediante su watcher después de las ediciones; no demuestra que el comportamiento funcione.

La orquestación SDD puede persistir el progreso requerido del cambio en Engram como un artefacto separado del flujo de trabajo. Esa persistencia NO autoriza cambios en los datos de la aplicación ni en el índice `.codegraph/`. Mantén cualquier mantenimiento de este tipo explícito y separado de las diferencias documentales del repositorio.
