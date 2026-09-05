# Especificación del módulo shell-ui

**Estado:** **Objetivo futuro (Future target)**. Los requisitos de este documento detallan la capability [`gestion-app-shell`](../../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md); nada está implementado.

**Comportamiento de referencia (Reference behavior):** los patrones provienen del legado con evidencia en `exploration.md` — shell y navegación (`sistema-gestion/index.html:L19-L43`), dashboard (`index.html:L74-L103`; `app.js:L4294-L4416`), tablas de órdenes (`index.html:L105-L129`; `app.js:L4496-L4705`), modales y foco (`exploration.md` L145–153).

## Mapa de referencia heredada

| Referencia legacy (`exploration.md`) | Requisito |
|---|---|
| Sidebar contraíble, menú jerárquico, búsqueda y períodos (L145–150; `index.html:L19-L43`) | RUI-01 |
| Dashboard de excepciones: métricas, tarjetas, recientes y stock bajo (`index.html:L74-L103`; `app.js:L4294-L4416`) | RUI-02 |
| Tablas con encabezado fijo, límite de filas, acciones y doble clic (L149; `app.js:L4496-L4705`) | RUI-03 |
| Modales `aria-modal`, `alertdialog`, foco restaurado y Escape (L150) | RUI-04 |
| Toasts y confirmaciones explícitas (L152–153) | RUI-05 |
| Diálogo de reintento que conserva el borrador (L152) | RUI-06 |
| Atajos Enter/Ctrl+Enter y navegación por teclado (L153) | RUI-07 |
| Tablas y formularios en viewport reducido | RUI-08 |
| Acciones por fila delegadas al servidor | RUI-09 |

## Requisitos

### RUI-01 — Layout y navegación

El shell DEBE ofrecer sidebar jerárquico colapsable con orden de menú persistente, y topbar con búsqueda global y filtros de período. El estado del sidebar y las preferencias son UI (Zustand etiquetado), no hechos de negocio. **Objetivo futuro (Future target).**

#### Escenario: colapsar y restaurar

- Dado un operador con sesión, cuando colapsa el sidebar y recarga la vista, entonces el estado colapsado y el orden del menú se restauran como preferencia de UI sin escribir ningún owner.
- Dado un navegador sin sesión válida, cuando solicita una vista protegida, entonces recibe denegación controlada sin datos ni ejecución de mutaciones.

### RUI-02 — Dashboard operativo

El dashboard DEBE mostrar cuatro métricas diarias, ocho tarjetas de foco accionables (cada una abre una vista o aplica un filtro), seis órdenes recientes y la lista de stock bajo. Los datos provienen de consultas autorizadas con período validado; nunca se inventan. **Objetivo futuro (Future target).**

#### Escenario: tarjeta de foco

- Dado un operador autorizado, cuando activa una tarjeta de foco, entonces se abre la vista o se aplica el filtro correspondiente con datos de la consulta permitida.

#### Escenario: período inválido

- Dado un período malformado o fuera de rango, cuando se aplica al dashboard o a una tabla, entonces se muestra el error de validación y no se ejecuta ninguna consulta con valores inventados.

### RUI-03 — Tabla base

Las tablas DEBEN tener encabezado fijo, límite visual de filas (el legado usa diez en órdenes), acciones por fila y apertura de detalle por doble clic, con equivalente de teclado (Enter). **Objetivo futuro (Future target).**

#### Escenario: abrir detalle

- Dado una fila enfocada, cuando el operador hace doble clic o presiona Enter, entonces se abre el detalle sin iniciar ninguna mutación.

#### Escenario: límite de filas

- Dado un listado con más filas que el límite visual, cuando se renderiza la tabla, entonces se muestran solo las filas del límite con un medio explícito para ver el resto, sin ocultar silenciosamente datos ni inventar totales.

### RUI-04 — Modal accesible

Los diálogos DEBEN usar `aria-modal`, `alertdialog` para acciones destructivas, foco inicial dentro del diálogo, atrapamiento usable, restauración del foco al disparador y cierre con Escape. **Objetivo futuro (Future target).**

#### Escenario: modal destructivo

- Dado una acción destructiva, cuando se abre el diálogo, entonces exige confirmación explícita; si se presiona Escape, el foco retorna al disparador y no se muta nada.

### RUI-05 — Toasts

Los toasts DEBEN reflejar el resultado real del servidor: éxito tras confirmación y error ante denegación o fallo. Nunca anuncian éxito durable sin confirmación del servidor. **Objetivo futuro (Future target).**

#### Escenario: toast de error

- Dado un comando denegado por el servidor, cuando llega la respuesta, entonces se muestra un toast de error con el código estable y no aparece ningún toast de éxito.

### RUI-06 — Estados de carga, error y reintento

Toda consulta DEBE mostrar carga visible, error con reintento y ausencia de datos real; el reintento conserva el borrador. No se inventan datos y un fallo del store no se presenta como colección vacía aceptada. **Objetivo futuro (Future target).**

#### Escenario: dependencia caída

- Dado un listado en carga, cuando falla su consulta, entonces se muestra error y reintento sin toast de éxito ni datos inventados.

### RUI-07 — Accesibilidad

La interfaz DEBE ser navegable por teclado, con foco visible, etiquetas asociadas a controles y contraste suficiente. Los atajos Enter/Ctrl+Enter del legado se conservan como referencia cuando apliquen. **Objetivo futuro (Future target).**

#### Escenario: recorrido por teclado

- Dado un formulario del shell, cuando el operador navega solo con Tab, entonces todos los controles son alcanzables, el foco es visible y cada control tiene nombre accesible.

### RUI-08 — Responsive mínimo

El shell DEBE ser usable en viewport pequeño: sidebar colapsable, tablas con desplazamiento y formularios apilados. **Objetivo futuro (Future target).**

#### Escenario: viewport angosto

- Dado un viewport móvil, cuando se abre el dashboard y una tabla, entonces la navegación colapsa y las tablas permiten desplazamiento horizontal sin perder accesibilidad.

### RUI-09 — Acciones sin autoridad de negocio

El shell PUEDE representar acciones por fila, pero NO DEBE autorizar ni persistir mutaciones desde el cliente: el comando viaja al handler, que autoriza, audita y decide. **Objetivo futuro (Future target).**

#### Escenario: acción visible sin permiso

- Dado un usuario que ve una tabla sin permiso de eliminar, cuando intenta la acción, entonces el servidor responde `FORBIDDEN`, se muestra el error y ningún owner JSON cambia.

## Iconografía y tokens

Iconografía y color del shell usan una identidad de taller sobria: azul petróleo como marca operativa y ámbar solo como acento funcional. Sin librerías de animación ni component kits.

- Solo Lucide (`lucide-react`): un icono por módulo, tamaño 20 px en sidebar (24 px solo en superficies amplias), grosor por defecto (stroke 2). No se ajustan trazos, rellenos ni tamaños arbitrarios.
- Mapa módulo → icono: Dashboard `LayoutDashboard`, Órdenes `ClipboardList`, Clientes `Users`, Stock `Warehouse`, Ventas `Banknote`, Compras `Receipt`, Servicios `Wrench`, Configuración `Settings`.
- No agregar iconos cuando el texto ya comunica la acción, en contenido denso (tablas, formularios) ni como único portador de significado sin nombre accesible. El sidebar colapsado muestra solo el icono con `aria-label` y tooltip visual CSS; no usa inicial ni `title`.
- Color solo mediante tokens (`brand`, `brand-strong`, `accent`, `accent-strong`, `ink`, `surface`, `line`); nunca hex hardcodeado en clases o estilos. `brand` es navegación y foco; `accent` (ámbar) queda reservado a estados y destacados puntuales.
- Dark-mode: ambos temas redefinen los mismos tokens en `app/globals.css`; no se crean variantes de color por componente.
- Motion: solo transiciones CSS existentes en respuesta a una acción (colapso, hover, foco). Sin animaciones de entrada, loops ni efectos decorativos.

## Prioridad de implementación

1. GR-SHELL.1 protege las rutas antes de que exista cualquier dato visible.
2. Layout, sidebar y topbar forman el esqueleto mínimo navegable.
3. Tabla base, modal base y toasts son los patrones reutilizables que los módulos de negocio consumen después.
4. Accesibilidad y responsive se verifican en cada ítem, no como fase final.

Un componente del shell no puede adelantarse a un requisito de otro módulo: si necesita datos de negocio, espera al slice que los posee.

## Fuera de alcance

- Mutaciones concretas de negocio (órdenes, ventas, caja, respaldos): cada módulo define sus requisitos.
- Login, roles y permisos: módulo `identity-login/`.

## Enlaces

- Autoridad local: [`../spec.md`](../spec.md), [`../plan.md`](../plan.md) y [`../tasks.md`](../tasks.md).
- Capacidad: [`gestion-app-shell`](../../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md).
