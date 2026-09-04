# Pila prevista de `apps/gestion`

**Estado:** **Objetivo futuro (Future target)**. Las versiones y convenciones de esta tabla provienen del diseño aprobado y de las skills de referencia; no demuestran que los paquetes estén instalados ni que el runtime exista en el checkout actual.

## Tabla de tecnologías y convenciones

| Tecnología / versión prevista | Rol | Motivo de elección | Convenciones obligatorias |
|---|---|---|---|
| Next.js 15 | App Router, páginas, route handlers y middleware. | Separa presentación de límites HTTP y permite una reconstrucción incremental. | Server Components por defecto; `app/api/gestion/**/route.ts` delgado; `middleware.ts` solo como primera barrera, nunca como única autorización. |
| React 19 | Componentes de UI y composición. | Conserva una UI moderna sin trasladar el monolito heredado. | Componentes de presentación no escriben hechos; estado de servidor fuera de React local; accesibilidad semántica. |
| TypeScript 5.6, strict | Contratos, dominio y handlers tipados. | Reduce ambigüedad entre entrada, actor, owner y respuesta. | `strict: true`; tipos explícitos en límites; dominio puro sin DOM, reloj, azar o `localStorage`. |
| Tailwind CSS 4 | Estilos de layout, estados y responsive. | Permite composición consistente para shell, tablas y modales. | Clases semánticas; no `var()` ni hex en `className`; `style` solo para valores realmente dinámicos; foco visible. |
| TanStack Query 5 | Estado de servidor, queries, mutaciones e invalidación. | Distingue datos confirmados de carga, error y caché. | Invalidar después de comandos; error de API no es éxito durable; caché siempre etiquetada como no canónica. |
| Zustand 5 | Estado efímero de UI. | Aísla sidebar, modal, toasts y borradores de la autoridad de negocio. | Selectores pequeños; no persistir verdad de dominio; `persist` solo para un borrador explícito y etiquetado. |
| Zod 4 | Validación de request, response y documentos JSON. | Una frontera única para payloads, archivos y referencias. | `safeParse`/errores estables; esquemas antes de autorización efectiva y persistencia; estados mediante `z.enum`. |
| Vitest 3 + Testing Library 16 + JSDOM 25 | Unitarias, integración de handlers y componentes. | Cubre reglas puras, accesibilidad y estados visibles con el runner existente. | Strict TDD: RED, GREEN, TRIANGULATE, REFACTOR; aserciones de comportamiento, no clases CSS. |
| Playwright 1 | E2E de login, órdenes, comercio, caja, impresión y denegaciones. | Comprueba recorridos entre páginas y fronteras reales. | Page Objects; `getByRole`/`getByLabel` antes que selectores frágiles; datos sintéticos y aislamiento por prueba. |
| ESLint 9 | Calidad estática. | Detecta errores de TypeScript/React y límites accidentales. | Ejecutar el script del paquete; no presentar lint como prueba de autorización, integración o build. |
| Prettier 3 | Formato reproducible. | Reduce diferencias de revisión. | No ejecutar en GR-0.1; los formatters escriben archivos y no son validación documental de solo comprobación. |
| GitHub Actions v4 | Acciones fijadas para CI futuro. | Alinea la cadena con el flujo raíz cuando sus compuertas estén restauradas. | CI es posterior según [`../../../plan.md`](../../../plan.md); versiones fijadas, permisos explícitos y nunca secretos en logs. |
| JSON file store | Repositorio server-side de desarrollo. | Permite slices aislados antes de PostgreSQL sin otorgar autoridad al navegador. | Escritura `temp + rename`, versión monotónica, validación, lock/protocolo de concurrencia y rollback explícito. |

## Estado de servidor y estado efímero

El flujo previsto es `UI/api-client → route handler → handler de aplicación → dominio puro → repositorio → auditoría → envelope`. Una página puede consultar y representar datos, pero no autoriza ni persiste hechos. Una respuesta vacía, una desconexión o una caché corrupta debe producir error o borrador no confirmado, nunca promoción silenciosa.

## Layout de datos

```text
apps/gestion/
├── data/
│   ├── clientes.json
│   ├── categorias.json
│   ├── productos.json
│   ├── servicios.json
│   ├── ordenes.json
│   ├── ventas.json
│   ├── compras.json
│   ├── movimientos-stock.json
│   ├── sesiones-caja.json
│   ├── gastos.json
│   ├── users.json
│   ├── role-permissions.json
│   ├── menu.json
│   ├── audit.json
│   └── backups/
├── fixtures/
└── tests/fixtures/
```

`data/*.json` es propiedad exclusiva del servidor de desarrollo y cada archivo tiene un owner de entidad. `fixtures/` contiene seeds sintéticos revisables; `tests/fixtures/` contiene datos aislados de pruebas. Los backups no son un segundo owner. Los datos de desbloqueo quedan excluidos por defecto y solo podrían vivir en `datos-desbloqueo.json` tras la decisión de privacidad.

## Convenciones de integración

- **App Router:** una página puede ser Server Component por defecto; un Client Component se reserva para interacción, estado efímero y accesibilidad.
- **Route handlers:** reciben entrada no confiable, derivan actor, autorizan, validan y delegan; no contienen reglas financieras extensas.
- **Middleware:** bloquea el acceso temprano a `/app/*`, pero cada handler repite autenticación y autorización por acción y recurso.
- **Queries y comandos:** TanStack Query representa lecturas y estados de mutación; después de un comando se invalida la query afectada y se muestra el resultado real.
- **Zustand:** mantiene sidebar, modal, toasts y borradores; no se usa para convertir una respuesta local en hecho durable.
- **Dominio:** funciones de estados, costo, caja y reportes reciben datos explícitos y devuelven resultados deterministas.
- **Errores:** el envelope común distingue validación, autenticación, autorización, recurso ambiguo, conflicto, dependencia, almacenamiento y auditoría.
- **Estados:** se persisten tokens sin acentos; las etiquetas de UI se resuelven en la capa de presentación.
- **Accesibilidad:** cada formulario tiene label, foco visible, teclado y estados de carga/error; los diálogos restauran el foco y cierran con Escape.
- **Impresión:** se deriva del payload validado y sanitizado; no toma secretos del DOM, del caché ni de `localStorage`.

## Convenciones de pruebas

Las reglas puras se prueban con Vitest antes de integrarlas en handlers. Las pruebas de integración usan directorios temporales y simulan `rename`, conflictos, dependencia caída y auditoría fallida. Testing Library comprueba texto, roles, foco, teclado y estados visibles, no clases internas. Playwright recorre únicamente flows con fixtures sintéticos, reutiliza Page Objects y prioriza `getByRole`/`getByLabel`. Toda mutación protegida necesita al menos una prueba negativa de sesión, actor, recurso o rol según su riesgo.

El ciclo estricto es **RED → GREEN → TRIANGULATE → REFACTOR**. Un test verde sin una aserción de salida concreta no cuenta como evidencia. La suite completa, lint, typecheck y build se reservan para la compuerta indicada por el plan y no se sustituyen por una lectura del código.

## Configuración y operación prevista

Las variables sensibles deben inyectarse en el entorno del proceso y nunca escribirse en Markdown, fixtures, snapshots o logs. `data/` puede ignorarse o sembrarse con documentos sintéticos según la decisión del slice; la configuración debe distinguir un store vacío de un store inválido. Los errores de lectura o escritura se muestran como dependencia/almacenamiento no disponible, no como colecciones vacías aceptadas.

La futura CI debe ejecutar instalación reproducible, generación, lint, typecheck, tests y build en el orden del plan raíz. Despliegue, PostgreSQL, migraciones, promoción y smoke productivo son capas posteriores y requieren workflows y evidencias propias. GR-0.1 no modifica configuración ni CI.

## Compatibilidad y límites explícitos

| Límite | Regla de compatibilidad |
|---|---|
| UI → API | JSON tipado, envelope estable y ninguna identidad confiada del body. |
| API → dominio | Handler delgado; reglas puras y errores de dominio distinguibles. |
| Dominio → store | Repository único, versión esperada, idempotencia y rollback definido. |
| Store JSON → PostgreSQL | Misma interfaz; el cambio no habilita doble escritura ni fallback silencioso. |
| Tests → evidencia | Cada resultado debe indicar capa, comando, datos sintéticos y estado de la compuerta. |

Estas reglas evitan que elegir una biblioteca o cambiar el backend modifique por accidente la autoridad de datos o la semántica de seguridad.

## Sustitución futura por PostgreSQL

**Objetivo futuro (Future target):** PostgreSQL reemplazará el store JSON detrás de la misma interfaz `Repository`, después de las compuertas del plan raíz. La sustitución exige ownership aprobado, migraciones versionadas, transacciones, auditoría, backup/restore, replay, rollback y pruebas de integración. No se agrega PostgreSQL en GR-0.1 ni se usa esta tabla para afirmar que hay una conexión operativa.

La interfaz compartida debe conservar operaciones de lectura, escritura condicionada por versión, idempotencia y snapshot/restore para que el cambio de backend no altere los contratos de handlers. La implementación PostgreSQL futura no podrá introducir una segunda escritura paralela ni usar el JSON como fallback silencioso después del cutover.

## Enlaces de continuidad

Consultar [`AGENTS.md`](AGENTS.md), [`constitution.md`](constitution.md), [`plan.md`](plan.md), [`spec.md`](spec.md) y [`tasks.md`](tasks.md), junto con [`../../../AGENTS.md`](../../../AGENTS.md), [`../../../constitution.md`](../../../constitution.md), [`../../../spec.md`](../../../spec.md), [`../../../plan.md`](../../../plan.md) y [`../../../tasks.md`](../../../tasks.md).
