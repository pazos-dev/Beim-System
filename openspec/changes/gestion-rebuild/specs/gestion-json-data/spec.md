# Especificación: gestion-json-data

## Propósito

Establecer almacenamiento JSON server-side tipado, atómico y con ownership único para el entorno de desarrollo.

## Evidencia y alcance

- **Línea base observada (Observed baseline):** la gestión heredada mezcla bootstrap HTTP, estado en `localStorage`, snapshots financieros y fallback local.
- **Comportamiento de referencia (Reference behavior):** el API compone clientes, categorías, productos, servicios, órdenes, ventas y gastos en un bootstrap.
- **Objetivo futuro (Future target):** los repositorios JSON del servidor serán canónicos solo para desarrollo y no competirán con caché del navegador.

## Requisitos

### Requisito: Ownership y bootstrap tipado

Cada entidad DEBE tener un owner JSON único: `clientes.json`, `categorias.json`, `productos.json`, `servicios.json`, `ordenes.json`, `ventas.json`, `compras.json`, `movimientos-stock.json`, `sesiones-caja.json`, `gastos.json`, `users.json` y `audit.json`. El bootstrap agregado DEBE devolver lecturas tipadas. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: route handler con sesión y permiso; entrada validada: esquema Zod antes de leer o escribir; owner JSON de escritura: exactamente el archivo de la entidad; éxito/error: snapshot tipado o error estable; fallo cerrado: archivo ausente, inválido o no autorizado no se convierte en dato vacío aceptado. Prueba: Vitest de esquemas y pruebas de integración del bootstrap.

#### Escenario: Bootstrap válido

- Dado un operador autorizado y archivos JSON válidos, cuando solicita bootstrap, entonces recibe entidades tipadas y la fuente de cada lectura es su owner declarado.

#### Escenario: Registro inválido o sin sesión

- Dado un archivo/payload inválido o una sesión ausente, cuando se lee o persiste, entonces se devuelve denegación/validación y no se publica ni escribe ese registro.

### Requisito: Escritura atómica y versionada

Toda escritura DEBE reemplazar el archivo de forma atómica, conservar una versión monotónica y evitar archivos parcialmente observables; la estrategia `write-temp-rename` DEBERÍA ser la implementación aprobada. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: handler autorizado por entidad; entrada validada: documento completo, versión esperada e idempotencia; owner JSON de escritura: el repositorio exclusivo de esa entidad; éxito/error: nueva versión o conflicto/almacenamiento estable; fallo cerrado: un fallo de serialización, rename o concurrencia no deja mezcla ni declara éxito. Prueba: unitarias de versión y pruebas de integración con fallo simulado.

#### Escenario: Actualización correcta

- Dado un archivo en versión 4, cuando un actor autorizado persiste un documento válido, entonces queda una versión 5 completa y legible tras reinicio.

#### Escenario: Conflicto de versión o rol insuficiente

- Dado un writer con versión obsoleta o sin permiso, cuando intenta guardar, entonces recibe `CONFLICT`/`FORBIDDEN` y el archivo vigente permanece intacto.

### Requisito: Caché y borrador no canónicos

El cliente NO DEBE usar `localStorage` como fuente de verdad; solo DEBE PODER etiquetarlo como caché, borrador o entrada de migración. Estado: **Objetivo futuro (Future target)**. Contrato: actor autorizado: servidor al promover una entrada; entrada validada: etiqueta, versión y esquema; owner JSON de escritura: ninguno para `localStorage`, y el owner de entidad solo tras comando autorizado; éxito/error: estado confirmado o borrador explícito; fallo cerrado: una respuesta vacía, desconexión o caché corrupta no autoriza promoción silenciosa. Prueba: integración de bootstrap y E2E con API no disponible.

#### Escenario: API caída

- Dado un borrador local y un servidor no disponible, cuando la interfaz intenta guardar, entonces muestra error o borrador no confirmado y no declara persistencia durable.
