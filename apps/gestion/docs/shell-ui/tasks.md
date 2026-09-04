# Tareas del módulo shell-ui

**Estado:** **Objetivo futuro (Future target)**. Esta lista planifica GR-SHELL.1 y GR-SHELL.2; ninguna tarea de código está iniciada. El checklist local de la fase vive en [`../tasks.md`](../tasks.md).

## GR-SHELL.1 — protección de rutas (middleware)

Dependencias: GR-SHARED.1 (envelope de errores) y la compuerta de calidad del workspace.

### Ciclo RED — primero

- [ ] RED-01 `/app/*` sin cookie: denegación controlada sin datos ni sesión creada.
- [ ] RED-02 `/app/*` con cookie inválida: denegación controlada sin datos.
- [ ] RED-03 sesión válida con permiso insuficiente: denegación sin datos ni mutación.

### Ciclo GREEN y cierre

- [ ] Implementar `middleware.ts` como primera barrera y la repetición de autenticación en cada handler (el middleware nunca es la única autorización).
- [ ] TRIANGULAR: caso de cookie vencida; REFACTOR sin cambiar comportamiento.

### Evidencia

```bash
pnpm --dir apps/gestion test
```

### Rollback

Desactivar el middleware y las rutas nuevas; conservar documentación y legado intactos.

## GR-SHELL.2 — layout y componentes base

Cada ítem entra con su prueba TDD (RED → GREEN → TRIANGULAR → REFACTOR):

- [ ] **Layout y `/app`**: `layout.tsx` con banner del módulo de sesión; RED: la ruta protegida renderiza solo con sesión válida.
- [ ] **Sidebar (RUI-01)**: colapsable con orden persistente; RED: colapsar y recargar restaura preferencia de UI sin escribir owners.
- [ ] **Topbar (RUI-01)**: búsqueda global con texto acotado y filtros de período; RED: consulta válida dispara la query autorizada.
- [ ] **Dashboard (RUI-02)**: cuatro métricas, ocho tarjetas de foco, seis órdenes recientes y stock bajo; RED: renderiza datos de consulta y nunca inventa valores.
- [ ] **Tabla base (RUI-03)**: encabezado fijo, límite de filas, acciones por fila, doble clic y Enter; RED: Enter abre detalle sin mutación.
- [ ] **Modal base (RUI-04)**: `aria-modal`, foco inicial y restaurado, Escape, `alertdialog` destructivo; RED: Escape restaura foco al disparador.
- [ ] **Toasts (RUI-05)**: éxito y error según resultado real del servidor; RED: respuesta `FORBIDDEN` produce toast de error y no de éxito.
- [ ] **Carga, error y reintento (RUI-06)**: RED: fallo de consulta muestra error y reintento sin datos inventados.
- [ ] **Accesibilidad y responsive (RUI-07, RUI-08)**: RED: recorrido por teclado completo y viewport angosto usable.

### Evidencia

```bash
pnpm --dir apps/gestion test
```

### Definición de done

- El middleware y los handlers deniegan sin datos ante cookie ausente o inválida; layout, sidebar, dashboard, tabla, modal y toasts pasan sus pruebas RTL; ninguna mutación se autoriza o persiste desde el cliente.

### Rollback

Revertir la UI del slice: desactivar rutas/presentación nuevas y eliminar componentes y pruebas creados. No tocar legado ni owners de otros módulos.

## Enlaces

- [`../tasks.md`](../tasks.md) — checklist local GR-SHELL y gate común.
- [`spec.md`](spec.md) — requisitos detallados de este módulo.
- [`../../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md`](../../../../openspec/changes/gestion-rebuild/specs/gestion-app-shell/spec.md) — autoridad de requisitos.
