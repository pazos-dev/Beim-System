## Exploración: system-foundation

### Estado actual

La raíz del repositorio es `/home/zero/Projects/Beim-System-Tech` y se verificó con `git rev-parse --show-toplevel`. El árbol de trabajo actual es una línea base de transición, no un monorepo terminado y coherente:

- El paquete raíz es un workspace privado de Turborepo/pnpm. `pnpm-workspace.yaml` incluye únicamente `apps/*`; el único workspace presente físicamente es `apps/gestion` (`@beim/gestion`). El `README.md` raíz todavía describe `apps/web`, `apps/desktop`, `apps/mobile` y `packages/{tsconfig,contracts,domain,data,ui}`, pero esos directorios están ausentes del árbol actual. `apps/gestion` todavía importa los paquetes ausentes `@beim/data` y `@beim/contracts`.
- `apps/gestion` es un pequeño prototipo de gestión con Next.js 15/React 19, un dashboard y una interfaz CRUD de clientes. Sus server actions llaman a `@beim/data`, la autenticación es explícitamente un mock del lado del cliente que acepta cualquier nombre de usuario no vacío y los enlaces de navegación usan `/gestion`, aunque el grupo de rutas `(admin)` asigna las páginas implementadas a `/` y `/clients` (confirmado por `.next/server/app-paths-manifest.json`).
- `pagina-web/` es la tienda pública heredada funcional, la interfaz de recibos y la API HTTP de Node.js. `server.js` sirve `/beim` y `/beim/boleta`, expone endpoints públicos de catálogo y health, autenticación de clientes, pedidos, flujo de recibos, bootstrap de gestión y mutaciones de gestión, administración de catálogo, cargas de archivos y handlers relacionados con pagos. `db.js` admite el modo local o PostgreSQL mediante variables de entorno y proporciona consultas agrupadas y transacciones.
- `sistema-gestion/` es la aplicación de gestión heredada funcional. Es una interfaz grande de JavaScript vanilla con pedidos, clientes, stock de taller, compras, ventas, servicios, sesiones de caja, informes, permisos de roles, copias de seguridad e integración de recibos. Se hidrata desde `/api/gestion`, pero mantiene un estado considerable en `localStorage` y recurre a un comportamiento local/sin conexión. Su interfaz de recibos está integrada mediante `sistema-gestion/boleta/` y también usa estado local del navegador mientras llama a la API de recibos.
- `pagina-web/db/schema.sql` es el esquema PostgreSQL actual. Incluye usuarios, catálogo, pedidos, flujo de recibos/taller, partes/pagos/listas de comprobación de recibos, registros de auditoría, gastos, sesiones de caja, estado financiero, movimientos de pago, usuarios de gestión, permisos de roles y tokens de acceso web. El archivo mezcla la creación de tablas, migraciones incrementales `ALTER TABLE`, rellenos de datos y reparación de secuencias en un único script SQL orientado a la reproducción; `seed.sql` proporciona usuarios, catálogo, configuración y diapositivas iniciales.
- Existe tooling de calidad, pero está conectado de forma desigual. La raíz define `dev`, `build`, `lint`, `typecheck`, `test` y `format`; `apps/gestion` usa ESLint, TypeScript, Vitest, JSDOM y Testing Library; `sistema-gestion` tiene una prueba enfocada del motor de informes y los archivos JavaScript heredados pasan `node --check`. No existe una suite de pruebas de integración de servidor/API/base de datos ni de extremo a extremo.
- El único flujo de CI es `.github/workflows/ci.yml`. Ejecuta install, `pnpm generate`, lint/typecheck, pruebas y build en pushes y pull requests dirigidos a `main`, con reutilización de artefactos entre trabajos. No existe un flujo de despliegue, release, promoción entre entornos, migración ni smoke test. En el árbol actual, `pnpm generate` no es un script raíz; `pnpm lint` pasa, pero `pnpm typecheck` falla por archivos `.next/types` generados ausentes, `pnpm test` tiene 15 pruebas aprobadas, pero dos suites fallan porque no se puede resolver `@beim/data`, y `pnpm build` falla por el mismo paquete ausente. La prueba heredada del motor de informes pasa.
- El registro de skills del proyecto identifica actualmente `brainstorming`, `frontend-design` y `vercel-react-best-practices` como skills del proyecto. Esta última proporciona orientación sobre rendimiento de React/Next.js y seguridad de server actions; no hay ninguna skill específica del proyecto para QA automatizado, CI/CD, API, base de datos o pruebas de extremo a extremo en el registro.

### Áreas afectadas

- `AGENTS.md` — debe definir la navegación del repositorio, el lenguaje para distinguir línea base y objetivo, el manejo seguro del código heredado/de referencia, los comandos de validación, el flujo SDD y la propiedad de la documentación sin afirmar que existen paquetes ausentes.
- `constitution.md` — debe establecer principios normativos para la propiedad de la fuente de verdad, autenticación/autorización, persistencia, auditabilidad, pruebas, seguridad y migración del comportamiento heredado.
- `spec.md` — debe ser el documento principal del comportamiento de todo el sistema, descompuesto en web pública, web de gestión, API, servicios backend, base de datos, autenticación, flujos de catálogo/pedidos/reparación y aspectos operativos.
- `plan.md` — debe distinguir la línea base de transición observada de la arquitectura prevista y secuenciar el trabajo de migración de documentación/código sin presentar los objetivos como hechos implementados.
- `tasks.md` — debe convertir el plan en unidades de trabajo acotadas y verificables, incluida la restauración de los límites de paquetes y los prerrequisitos de CI antes de una migración amplia de funcionalidades.
- `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml` — definen el grafo actual e inconsistente del workspace y de tareas, y deben documentarse como evidencia, no como arquitectura asumida.
- `apps/gestion/` — objetivo/prototipo actual de Next.js con autenticación mock, funcionalidad parcial de clientes, imports de paquetes rotos e inconsistencias en los prefijos de rutas.
- `pagina-web/server.js`, `pagina-web/db.js`, `pagina-web/db/schema.sql`, `pagina-web/db/seed.sql` — evidencia actual de la API heredada, el límite de persistencia, el esquema, las semillas, la autenticación, los flujos y la auditoría.
- `sistema-gestion/app.js`, `sistema-gestion/index.html`, `sistema-gestion/boleta/` — capacidades actuales de gestión heredadas, fallback de estado local, integración de API y referencia del flujo de recibos.
- `.github/workflows/ci.yml` — intención actual de los quality gates de CI y brecha de implementación; no es evidencia de un pipeline de despliegue funcional.
- `.agents/skills/`, `.atl/skill-registry.md`, `skills-lock.json` — fuentes actuales de skills/prácticas del proyecto y evidencia del registro.

### Enfoques

1. **Fundación integrada en la raíz con secciones por dominio** — Mantener los cinco documentos raíz solicitados como fuente principal, organizando `spec.md` por capacidad del sistema y límite de interfaz, mientras `plan.md` y `tasks.md` describen la migración y la entrega.
   - Ventajas: conserva los flujos entre aplicaciones y las invariantes compartidas de datos/autenticación; coincide directamente con el conjunto de documentación solicitado; minimiza los requisitos duplicados.
   - Desventajas: requiere reglas explícitas de propiedad y un etiquetado cuidadoso de línea base/objetivo; los documentos raíz pueden volverse extensos.
   - Esfuerzo: Medio

2. **Documentación centrada primero en las aplicaciones** — Crear documentos autoritativos separados para la web pública, la web de gestión, la API/backend y la base de datos, con los archivos raíz actuando principalmente como índices.
   - Ventajas: documentos locales más pequeños y propiedad más sencilla por área de implementación.
   - Desventajas: duplica los flujos transversales, debilita los documentos solicitados de todo el sistema y arriesga divergencias entre las dos implementaciones de gestión y la API/esquema.
   - Esfuerzo: Alto

### Recomendación

Usar el enfoque de fundación integrada en la raíz. Tratar el repositorio actual como una transición de dos líneas: `pagina-web/` junto con `sistema-gestion/` constituyen el sistema heredado/de referencia observado, mientras que `apps/gestion` y los paquetes compartidos ausentes son un objetivo de modernización incompleto. En cada documento, etiquetar los hechos como **Línea base observada (Observed baseline)**, **Comportamiento de referencia (Reference behavior)** u **Objetivo futuro (Future target)**.

Hacer que `spec.md` sea autoritativo para el comportamiento observable externamente y las invariantes, con secciones para la tienda pública, las operaciones de gestión, los límites de API/backend, la persistencia/base de datos, la identidad/el acceso y la calidad/las operaciones. Hacer que `plan.md` sea autoritativo para la arquitectura y la secuencia de migración, y que `tasks.md` sea autoritativo para las unidades ejecutables y la evidencia. Mantener `AGENTS.md` como documento procedimental y `constitution.md` como documento normativo; ninguno debe duplicar el comportamiento detallado. La primera propuesta debe priorizar la restauración de un límite veraz de workspace/paquetes, decidir si la API heredada de Node permanece como backend durante la migración, definir un único modelo de autenticación y hacer ejecutables los comandos de CI antes de documentar la paridad de funcionalidades como completa.

### Riesgos

- El README raíz y la configuración actual de paquetes describen formas distintas del repositorio; copiar cualquiera de esas descripciones en los documentos de la fundación sin verificarla institucionalizaría una arquitectura obsoleta.
- Coexisten dos implementaciones de gestión y dos modelos de persistencia, lo que crea una propiedad, sincronización y semántica de migración poco claras.
- `apps/gestion` tiene autenticación mock y server actions que aparentan no estar autenticadas; el objetivo documentado no debe implicar seguridad de producción.
- CI referencia actualmente un script `generate` ausente y no puede compilar/verificar tipos/probar la aplicación moderna actual porque faltan paquetes compartidos; las afirmaciones de CI en verde serían engañosas hasta repararlo.
- La API heredada acepta identificadores de actores en datos de query/body y realiza mutaciones operativas amplias; la autorización, la semántica de sesión, la validación y las garantías de auditoría requieren una especificación explícita, no una inferencia.
- `localStorage` contiene estado operativo y las semillas/documentos heredados incluyen credenciales predeterminadas o temporales y valores predeterminados de la base de datos; la documentación debe evitar exponer secretos y debe definir una política de migración y copias de seguridad.
- El esquema SQL es un script mutable grande, no un historial de migraciones claramente versionado, por lo que las suposiciones de despliegue y reversión todavía no están demostradas.
- El código fuente y los textos de interfaz existentes están escritos mayoritariamente en español; los artefactos Markdown de esta fundación usan español técnico neutro por solicitud explícita del usuario.

### Lista para propuesta

Sí. La exploración es suficiente para `sdd-propose`, siempre que la propuesta conserve la distinción entre lo observado y el objetivo, y trate la restauración del workspace, la propiedad de la autenticación, la propiedad de la persistencia y la CI ejecutable como decisiones de la fundación, no como detalles de implementación asumidos silenciosamente.
