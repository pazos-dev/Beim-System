# Especificación: gestion-admin-backups

## Propósito

Definir administración operativa, usuarios, permisos editables y respaldos/restauraciones verificables.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** la gestión heredada mantiene árbol de menú, gastos fijos, usuarios, permisos y respaldos, pero la restauración no demuestra rollback transaccional.
- **Comportamiento de referencia (Reference behavior):** administradores gestionan catálogo, gastos y usuarios; el principal posee el permiso global y administra administradores.
- **Objetivo futuro (Future target):** las acciones administrativas DEBEN ser server-side, auditables y reversibles en JSON de desarrollo.

## Requisitos

### Requisito: Menú y categorías administrativas

El sistema DEBE permitir árbol de menú, categorías, gastos fijos y su orden solo con autorización. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador o principal; entrada validada: nodos, padres, orden, importes y fechas; owner JSON de escritura: `menu.json` y `gastos.json`; éxito/error: árbol o gasto versionado, o error estable; fallo cerrado: ciclo, padre inexistente o rol insuficiente no muta. Prueba: unitarias de árbol e integración CRUD.

#### Escenario: Árbol válido

- Dado un administrador y un nodo sin ciclo, cuando lo agrega, entonces `menu.json` conserva la jerarquía y devuelve el árbol actualizado.

#### Escenario: Rol insuficiente

- Dado un vendedor autenticado, cuando intenta modificar un gasto fijo, entonces recibe `FORBIDDEN` y `gastos.json` permanece intacto.

### Requisito: Usuarios y mapa de permisos

La administración DEBE activar/desactivar usuarios y editar permisos declarativos; solo `administrador_principal` DEBE PODER crear o modificar administradores. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador para no administradores, principal para administradores; entrada validada: usuario, rol, estado y permisos; owner JSON de escritura: `users.json` y `role-permissions.json`; éxito/error: cambio aplicado o denegación; fallo cerrado: ningún rol enviado por cliente amplía autoridad. Prueba: matriz unitaria e integración/E2E negativa.

#### Escenario: Creación restringida

- Dado un administrador autenticado, cuando intenta crear otro administrador, entonces se deniega y `users.json` no cambia.

#### Escenario: Principal autorizado

- Dado un principal autenticado, cuando crea un administrador con datos válidos, entonces el usuario queda activo y el permiso queda auditado.

### Requisito: Respaldo JSON versionado

El sistema DEBE crear respaldos automáticos y manuales versionados de los owners JSON, sin secretos innecesarios, y DEBE registrar actor, instante, alcance y resultado. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador o principal; entrada validada: tipo, alcance y motivo; owner JSON de escritura: `backups/` bajo control server-side; éxito/error: respaldo verificable o error estable; fallo cerrado: actor insuficiente o snapshot incompleto no se anuncia como respaldo exitoso. Prueba: integración de snapshot y auditoría.

#### Escenario: Respaldo manual o rol insuficiente

- Dado un administrador autorizado y owners válidos, o un actor insuficiente, cuando solicita un respaldo manual, entonces se crea una versión auditable o se deniega sin respaldo exitoso.

### Requisito: Restauración con rollback

La restauración DEBE verificar esquema, integridad y compatibilidad, crear un punto de retorno y demostrar rollback ante fallo parcial. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: administrador o principal con permiso de restauración; entrada validada: respaldo, versión y confirmación; owner JSON de escritura: owners restaurados y `backups/` para el punto de retorno; éxito/error: estado restaurado y auditado o estado previo intacto; fallo cerrado: respaldo corrupto, incompleto o dependencia caída no reemplaza ningún owner. Prueba: integración con corrupción simulada y E2E de recuperación.

#### Escenario: Restauración inválida o rol insuficiente

- Dado un respaldo inválido o un actor sin permiso, cuando se solicita restaurar, entonces se rechaza/deniega y el snapshot vigente permanece legible y sin cambios.
