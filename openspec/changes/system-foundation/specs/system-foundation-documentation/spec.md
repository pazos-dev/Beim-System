# Especificación de documentación de la fundación del sistema

## Propósito

Documentar una fundación veraz. Entregar cinco documentos raíz; este cambio NO DEBE modificar el runtime ni los almacenes operativos.

## Requisitos

### Requisito: Conjunto raíz completo y autoritativo

El repositorio DEBE contener `AGENTS.md`, `constitution.md`, `spec.md`, `plan.md` y `tasks.md`. Cada uno DEBE declarar su límite de autoridad, enlazar los documentos y etiquetar los hechos como **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** u **Objetivo futuro (Future target)**.

#### Escenario: Revisión de la fundación

- DADO que se revisan los cinco documentos
- CUANDO una afirmación describe código, comportamiento o arquitectura
- ENTONCES su etiqueta de estado, evidencia y documento propietario son inequívocos

#### Escenario: Afirmación de objetivo no respaldada

- DADO que un paquete, workspace, flujo de autenticación o compuerta de CI está ausente o falla
- CUANDO se comprueba la fundación
- ENTONCES no se describe como implementado

### Requisito: Límites e invariantes de todo el sistema

`spec.md` DEBE definir comportamiento e invariantes comprobables para la web pública, la web de gestión, la API, el backend y la base de datos. DEBE cubrir identidad/acceso, catálogo/pedidos, reparación, propiedad y consistencia.

#### Escenario: Trazabilidad de capabilities

- DADO que una capability atraviesa los límites de UI, API, servicio y base de datos
- CUANDO se revisa su especificación
- ENTONCES se declaran las entradas, el actor autorizado, el propietario, el resultado durable y el resultado de fallo

#### Escenario: Desacuerdo entre límites

- DADO que el estado de gestión heredado y el estado de la base de datos difieren
- CUANDO se evalúa la propiedad
- ENTONCES `spec.md` identifica al propietario autoritativo y trata el otro estado como referencia o entrada de migración

### Requisito: Principios normativos e identidad segura

`constitution.md` DEBE exigir autenticación/autorización aplicada por el servidor, mínimo privilegio, mutaciones auditables, secretos protegidos y un único modelo de identidad futuro. La autenticación mock, los actores proporcionados por quien llama y los valores predeterminados heredados DEBEN etiquetarse como comportamiento de referencia, no como garantías de seguridad.

#### Escenario: Mutación no autorizada

- DADO que quien llama carece del principal o permiso
- CUANDO solicita una mutación de gestión o de datos
- ENTONCES el objetivo rechaza la mutación y registra un resultado de seguridad auditable

#### Escenario: Evidencia heredada

- DADO que el código existente acepta una sesión mock o un actor proporcionado por quien llama
- CUANDO se aplica la constitución
- ENTONCES el comportamiento se registra como observado/de referencia y sigue sin cumplir el objetivo futuro

### Requisito: Arquitectura por etapas y migración heredada

`plan.md` DEBE clasificar `pagina-web/` y `sistema-gestion/` como heredados/de referencia, `apps/gestion` como transicional y los paquetes/workspaces compartidos ausentes como futuros. DEBE secuenciar la restauración, identidad, propiedad, persistencia, CI, migración, transición, reversión y obsolescencia detrás de compuertas de evidencia.

#### Escenario: Compuerta fallida

- DADO que falla una compuerta como la generación ejecutable, build o prueba de migración
- CUANDO se evalúa el plan de migración
- ENTONCES la migración de funcionalidades y la transición permanecen bloqueadas

#### Escenario: Coexistencia

- DADO que coexisten las rutas heredadas y objetivo
- CUANDO se migran datos o identidad
- ENTONCES el plan nombra la reconciliación, la reversión y el propietario único antes de la transición

### Requisito: Trabajo acotado y evidencia

`tasks.md` DEBE descomponer `plan.md` en unidades que se puedan completar de forma independiente, con dependencias, criterios de aceptación, propietario/límite y evidencia. La evidencia DEBE distinguir los fallos observados de la aceptación futura, incluidas las brechas de integración, E2E, seguridad, despliegue y smoke test.

#### Escenario: Tarea verificable

- DADO que se selecciona una tarea
- CUANDO se evalúa su finalización
- ENTONCES una persona revisora puede identificar su alcance, prerrequisito, comando o evidencia de artefacto y resultado de aprobado/fallido

### Requisito: Calidad, operaciones y práctica documental

`AGENTS.md` DEBE documentar la navegación, el manejo heredado, los artefactos técnicos en español técnico neutro frente a la UI/el código fuente en español, la validación, SDD, QA/pruebas, CI/CD, seguridad y autoridad documental. DEBE registrar las limitaciones de CI en lugar de afirmar una entrega en verde o capacidad de despliegue.

#### Escenario: Actualización documental

- DADO que cambia el comportamiento, la arquitectura o la intención de migración
- CUANDO se actualiza la documentación
- ENTONCES se modifica el documento raíz propietario y se resuelven las contradicciones entre documentos

### Requisito: Almacenes de conocimiento operativo separados

La fundación DEBE separar el mantenimiento de Engram y CodeGraph de la documentación de la aplicación y la propiedad del runtime. Este cambio NO DEBE restablecer, eliminar ni modificar Engram, `.codegraph/`, bases de datos, seeds ni almacenes operativos.

#### Escenario: Entrega exclusivamente documental

- DADO que se aplica el cambio
- CUANDO se inspecciona su diff de archivos y almacenes
- ENTONCES solo se modifican los artefactos de la fundación y los artefactos SDD de este cambio; el comportamiento de la aplicación y los almacenes operativos permanecen intactos
