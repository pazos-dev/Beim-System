# Propuesta: Documentación de la fundación del sistema

## Intención

Crear una fundación veraz centrada primero en la documentación. Distinguir la línea base observada de la arquitectura futura en la web pública, la web de gestión, la API, el backend y la base de datos. Esto documenta únicamente decisiones; no implementa comportamiento en tiempo de ejecución.

## Alcance

### Dentro del alcance
- Crear el conjunto raíz principal: `AGENTS.md`, `constitution.md`, `spec.md`, `plan.md` y `tasks.md`.
- Cubrir límites y prácticas: identidad, flujos, pruebas, QA, CI/CD, seguridad, documentación y SDD.
- Marcar `pagina-web/` y `sistema-gestion/` como heredados/de referencia; `apps/gestion` como transicional; y los paquetes ausentes y workspaces modernos como objetivos futuros.
- Definir propiedad, etiquetas, compuertas de migración, trabajo acotado y evidencia.

### Fuera del alcance / objetivos excluidos
- No se implementan runtime, esquema, paquetes, CI, autenticación, despliegue ni UI.
- No se restablecen/eliminan Engram/.codegraph, no se usan/modifican artefactos antiguos ni se eliminan almacenes operativos.

## Capabilities

### Nuevas capabilities
- `system-foundation-documentation`: comportamiento autoritativo, principios, plan de migración y backlog de evidencia en los cinco documentos raíz.

### Capabilities modificadas
- Ninguna.

## Suposiciones

- La exploración reciente y la evidencia del repositorio son las únicas entradas; el código heredado es evidencia, no arquitectura.
- Los documentos raíz son primarios; las especificaciones de implementación y los cambios de runtime se realizan por separado.
- El español técnico neutro es el idioma de los artefactos Markdown de esta fundación; la UI/el código fuente existentes en español permanecen sin cambios.

## Enfoque

Usar una única fundación integrada con las etiquetas **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** y **Objetivo futuro (Future target)**. Mantener cada documento raíz dentro de su límite de autoridad; priorizar límites veraces, un modelo de identidad único, la propiedad de la persistencia y una CI ejecutable.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|--------|-------------|
| Documentación raíz | Nueva | Cinco documentos de la fundación. |
| `pagina-web/`, `sistema-gestion/` | Referenciada | Evidencia heredada/de referencia. |
| `apps/gestion/`, paquetes compartidos | Referenciada | Límites transicionales y futuros. |
| Configuración del workspace, CI, skills | Referenciada | Brechas actuales y compuertas objetivo. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|------|------------|------------|
| Se confunden la línea base y el objetivo | Alta | Etiquetas y evidencia obligatorias. |
| La propiedad dual de gestión/persistencia sigue siendo ambigua | Alta | Decidir la fuente de verdad antes del trabajo de funcionalidades. |
| Se sobreestima la preparación de seguridad o CI | Media | Registrar fallos y exigir compuertas de prueba. |

## Plan de reversión

Revertir el commit exclusivamente documental, incluidos los documentos raíz y la propuesta. Dejar sin tocar los archivos de runtime, las bases de datos, Engram y `.codegraph/`.

## Cambios posteriores

- Restaurar los límites del workspace/paquetes y los prerrequisitos de CI.
- Definir la autenticación, la propiedad de la API/backend, la migración de persistencia y la transición desde el sistema heredado.
- Añadir cobertura de integración, E2E, seguridad, despliegue y smoke tests.

## Criterios de éxito / aceptación

- [ ] Existen los cinco documentos raíz, son coherentes internamente e identifican sus límites de autoridad.
- [ ] Cada límite del sistema y práctica principal tiene documentados el comportamiento de línea base, la intención del objetivo, los objetivos excluidos y la evidencia.
- [ ] Ningún documento afirma que estén implementados los paquetes ausentes, los workspaces modernos, una CI en verde o la autenticación de producción.
- [ ] No se modifica ningún comportamiento de runtime ni almacén operativo.
