# Diseño: Documentación de la fundación del sistema

## Enfoque técnico

Crear una única fundación usando las etiquetas **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** y **Objetivo futuro (Future target)**. `spec.md` es propietario del comportamiento; `constitution.md`, de los principios; `plan.md`, de la migración; `tasks.md`, de la evidencia; y `AGENTS.md`, del procedimiento. No hay cambios de runtime.

## Decisiones de arquitectura

| Decisión | Alternativas consideradas | Justificación |
|---|---|---|
| Conjunto raíz integrado con enlaces cruzados explícitos | Documentos específicos de cada aplicación; archivos raíz como índices | Conserva los flujos entre límites y evita requisitos duplicados y contradictorios. |
| Etiquetas de línea base/objetivo centradas en la evidencia | Tratar el README o el código heredado como arquitectura actual | El workspace es inconsistente: `apps/gestion` importa paquetes ausentes, mientras las aplicaciones heredadas siguen siendo referencias funcionales. |
| La propiedad de la base de datos/servidor es una política del estado futuro, no una inferencia del comportamiento heredado | Declarar autoritativo `localStorage` o cada ruta de API | El estado actual de UI, API y SQL puede divergir; la propiedad debe demostrarse antes de la migración o la transición. |

## Límites de los documentos y fuente de verdad

Cada documento declara su autoridad. `AGENTS.md` es procedimental; `constitution.md`, normativo; `spec.md`, de comportamiento/invariantes; `plan.md`, de secuenciación del objetivo; y `tasks.md`, de trabajo verificable. Los dos primeros NO DEBEN duplicar el comportamiento de negocio ni la implementación.

Mapa de enlaces cruzados:

| Documento | Enlaces requeridos |
|---|---|
| `AGENTS.md` | `constitution.md`, `spec.md`, `plan.md`, `tasks.md` |
| `constitution.md` | `AGENTS.md`, `spec.md`, `plan.md`, `tasks.md` |
| `spec.md` | `AGENTS.md`, `constitution.md`, `plan.md`, `tasks.md` |
| `plan.md` | `AGENTS.md`, `constitution.md`, `spec.md`, `tasks.md` |
| `tasks.md` | `AGENTS.md`, `constitution.md`, `spec.md`, `plan.md` |

El código, SQL, README, Engram y CodeGraph son evidencia/tooling, no autoridades. Engram y `.codegraph/` permanecen como almacenes operativos preservados y nunca son objetivos de limpieza.

## Matriz de límites

| Límite | Estado observado/de referencia → objetivo futuro | Propiedad; entradas/salidas | Responsabilidad de identidad/datos; compuerta |
|---|---|---|---|
| Web pública | Tienda e interfaz de recibos de `pagina-web/` → objetivo `apps/web` ausente | Propietario de la web pública; entrada de catálogo/autenticación/pedido del navegador → páginas e intención de pedido | El cliente/autenticación heredados y el modo SQL/local son de referencia; el objetivo es propietario de la sesión del cliente y las lecturas del catálogo. Compuerta: pruebas de rutas, contratos, integración y E2E. |
| Web de gestión | `sistema-gestion/` más `apps/gestion` parcial (autenticación mock, estado local, imports rotos) → una aplicación de gestión segura | Propietario de gestión; comandos/formularios del operador → CRUD, informes, resultados de reparación | El rol/la sesión derivados del servidor son propietarios de la identidad; el estado del navegador es únicamente entrada de migración. Compuerta: pruebas de autorización, integración, E2E y seguridad. |
| API | Handlers HTTP mezclados de `pagina-web/server.js` → límite de contrato versionado | Propietario de API; payload HTTP más actor del servidor → respuesta/error tipados y resultado de auditoría | Los actores proporcionados por quien llama son únicamente de referencia; la API autentica y autoriza, y luego delega. Compuerta: pruebas de contrato, autenticación negativa y compatibilidad. |
| Backend | Handlers heredados más helpers de consultas/transacciones de `db.js` → servicios explícitos de dominio/aplicación | Propietario del backend; comandos validados → resultado durable, error de dominio y evento de auditoría | La capa de servicios aplica invariantes y el alcance de las transacciones; ninguna mutación local de UI es autoritativa. Compuerta: pruebas de integración, transacciones y seguridad. |
| Base de datos | PostgreSQL de `pagina-web/db/schema.sql` más modo local/seed → base de datos canónica con migraciones versionadas | Propietario transicional: `pagina-web/server.js`/`db.js` más PostgreSQL para la identidad del servidor y los datos durables; el estado del navegador es únicamente entrada de migración. Objetivo: la API/backend autenticada es propietaria de las decisiones de identidad y las escrituras; la base de datos canónica es propietaria de los registros durables y la auditoría. Compuerta: decisión de propiedad aprobada en `plan.md`, invariantes coincidentes de `spec.md`, reconciliación, reproducción de migración, reversión/copia de seguridad, consistencia y evidencia de smoke test; hasta entonces, no hay transición ni afirmación canónica. |

## Flujo de datos

`UI → authenticated API/backend → validation/authorization → database transaction → response + audit evidence`. La UI heredada/localStorage es referencia o entrada de migración, nunca canónica de forma silenciosa.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `AGENTS.md` | Crear | Orientación procedimental del repositorio, SDD, QA, seguridad y documentación. |
| `constitution.md` | Crear | Principios normativos y reglas de incumplimiento para el comportamiento heredado. |
| `spec.md` | Crear | Comportamiento e invariantes de los límites de todo el sistema. |
| `plan.md` | Crear | Arquitectura por etapas, restauración, migración, transición, reversión y compuertas de obsolescencia. |
| `tasks.md` | Crear | Unidades de trabajo acotadas con propietario, dependencia, aceptación y evidencia. |

## Estrategia y prácticas de pruebas

Las comprobaciones de documentación validan enlaces, etiquetas, integridad de la matriz y autoridad. QA se limita a Vitest/JSDOM de `apps/gestion`, la prueba heredada del motor de informes y `node --check`; las suites de integración/E2E están ausentes. CI pretende ejecutar install → generate → lint/typecheck → test → build, pero generate está ausente, typecheck falla en `.next/types` y test/build fallan por la ausencia de `@beim/data` (15 pasan; dos suites fallan). Los flujos de despliegue, migración y smoke test están ausentes.

Aplicar las skills del proyecto con revisión SDD, mínimo privilegio, protección de secretos, mayor cobertura de pruebas y evidencia de CI. La UI/el código fuente en español permanece sin cambios; los artefactos Markdown de esta fundación están en español técnico neutro.

## Matriz de amenazas

N/A — este cambio solo crea documentación; no cambia el routing, ningún comando de shell, subprocess, automatización de VCS/PR, clasificación de ejecutables ni límite de integración de procesos.

## Migración / despliegue gradual

No hay migración. Confirmar únicamente los cinco documentos raíz y los artefactos SDD; verificar que no haya cambios de runtime, base de datos, seed, Engram ni `.codegraph/`. La implementación futura seguirá las compuertas de `plan.md`.

## Derivación de fase

Siguiente fase: `sdd-tasks`, que producirá unidades de trabajo dentro del alcance exclusivamente documental.

## Preguntas abiertas

- [ ] Seleccionar un proveedor de identidad futuro; esto no altera la regla de propiedad ni la compuerta anteriores.
