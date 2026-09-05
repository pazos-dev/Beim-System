# Especificación: ordenes-state-filter

## Propósito

Barra de 8 filtros de estado con contadores dinámicos, mapeados desde 12 estados internos. Selección única (radio), defecto: "En diagnóstico".

## Requisitos

### Requisito: Mapeo 12 estados → 8 filtros UI

El sistema DEBE agrupar los 12 `ORDER_STATUS` en 8 filtros según la tabla. "Abiertas" es agrupación virtual de 8 estados. Estado: **Objetivo futuro (Future target)**. Contrato: actor vendedor/técnico/admin/principal; entrada: estado orden; owner: `ordenes.json` lectura; éxito: filtro aplicado; fallo: estado desconocido excluido.

| Filtro UI | Estados internos (ORDER_STATUS) |
|-----------|----------------------------------|
| **Todas** | (sin filtro) |
| **Abiertas** | EN_DIAGNOSTICO, PRESUPUESTADO, ESPERANDO_APROBACION, APROBADO, ESPERANDO_REPUESTO, EN_REPARACION, CONTROL_CALIDAD, LISTO_PARA_RETIRAR |
| **En diagnóstico** | EN_DIAGNOSTICO |
| **Presupuesto** | PRESUPUESTADO, ESPERANDO_APROBACION |
| **Aprobado** | APROBADO |
| **Espera repuesto** | ESPERANDO_REPUESTO |
| **En proceso** | EN_REPARACION, CONTROL_CALIDAD |
| **Finalizadas** | FINALIZADO, ENTREGADO |
| **Canceladas** | CANCELADO |

#### Escenario: Filtro "Abiertas" incluye 8 estados
- Dado órdenes en los 8 estados del grupo, cuando se selecciona "Abiertas", entonces lista muestra 8 y contador = 8.

#### Escenario: Filtro "En proceso" agrupa 2 estados
- Dado órdenes EN_REPARACION y CONTROL_CALIDAD, cuando se selecciona "En proceso", entonces ambas aparecen, contador = 2.

#### Escenario: Filtro "Finalizadas" agrupa 2 estados
- Dado órdenes FINALIZADO y ENTREGADO, cuando se selecciona "Finalizadas", entonces ambas aparecen, contador = 2.

#### Escenario: CANCELADO solo en "Canceladas" y "Todas"
- Dado orden CANCELADO, cuando filtro ≠ "Todas"/"Canceladas", entonces no aparece.

### Requisito: Contadores dinámicos por filtro

Cada botón muestra badge con cantidad. Se actualizan tras mutaciones sin recarga. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado; entrada: filtro activo; owner: `ordenes.json` lectura; éxito: contadores sincronizados; fallo: muestra "—" y reintenta.

#### Escenario: Contadores iniciales
- Dado 3 EN_DIAGNOSTICO, 2 PRESUPUESTADO, 1 FINALIZADO, al cargar: En diagnóstico=3, Presupuesto=2, Finalizadas=1, Abiertas=6, Todas=6.

#### Escenario: Actualización tras cambio de estado
- Dado orden EN_DIAGNOSTICO (contador=1), cuando avanza a PRESUPUESTADO, entonces "En diagnóstico"→0, "Presupuesto"→1 sin recarga.

#### Escenario: "Abiertas" = suma de grupos intermedios
- Dado órdenes en estados no terminales, al recalcular: "Abiertas" = suma En diagnóstico + Presupuesto + Aprobado + Espera repuesto + En proceso (+ LISTO_PARA_RETIRAR).

### Requisito: Selección única y filtro por defecto

Radio group: un filtro activo. Defecto: "En diagnóstico". URL refleja filtro (`?estado=en_diagnostico`). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado; entrada: query param; owner: ninguno; éxito: filtro+URL; fallo: inválido → redirige a defecto.

#### Escenario: Carga inicial selecciona "En diagnóstico"
- Dado /ordenes sin query, al cargar: botón "En diagnóstico" activo (aria-pressed=true), lista filtra EN_DIAGNOSTICO.

#### Escenario: Cambio actualiza URL y lista
- Dado "En diagnóstico" activo, al clicar "Presupuesto": URL→/ordenes?estado=presupuesto, botón activo, lista filtra PRESUPUESTADO+ESPERANDO_APROBACION.

#### Escenario: Estado inválido en URL redirige a defecto
- Dado /ordenes?estado=inexistente, al cargar: redirige a /ordenes?estado=en_diagnostico, muestra "En diagnóstico" activo.

### Requisito: Etiquetas (STATE_TOKEN_LABELS)

Botones usan `STATE_TOKEN_LABELS` para simples; etiquetas propias para agrupados (ej: "En proceso", no "En reparación / Control calidad"). Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado; entrada: clave filtro; owner: ninguno; éxito: label correcto; fallo: clave técnica.

#### Escenario: Labels simples
- Dado filtro "En diagnóstico", al renderizar: muestra "En diagnóstico" (desde STATE_TOKEN_LABELS[EN_DIAGNOSTICO]).

#### Escenario: Labels compuestos
- Dado filtro "Presupuesto", al renderizar: muestra "Presupuesto" (etiqueta propia, no compuesta).