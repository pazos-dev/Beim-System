import { z } from "zod";

import { STATE_TOKEN_VALUES } from "../../lib/state-tokens";

export const ERROR_CODE_VALUES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND_OR_FORBIDDEN",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "STORAGE_ERROR",
  "AUDIT_FAILURE"
] as const;

export const errorCodeSchema = z.enum(ERROR_CODE_VALUES);
export type SchemaErrorCode = z.infer<typeof errorCodeSchema>;

export const stateTokenSchema = z.enum(STATE_TOKEN_VALUES);
export type StateTokenSchemaValue = z.infer<typeof stateTokenSchema>;

export const instantSchema = z.string().refine(
  (value) => value.endsWith("Z") && !Number.isNaN(Date.parse(value)),
  { error: "The instant must be a UTC ISO-8601 timestamp." }
);

export const auditResultSchema = z.union([z.literal("ok"), errorCodeSchema]);

export const auditEventSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().min(1).nullable(),
  accion: z.string().min(1),
  entidad: z.string().min(1),
  entidadId: z.string().min(1).nullable(),
  instante: instantSchema,
  resultado: auditResultSchema,
  detalles: z.record(z.string(), z.unknown())
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;

export const auditDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  events: z.array(auditEventSchema)
});

export type AuditDocument = z.infer<typeof auditDocumentSchema>;

export const idempotencyKeySchema = z.string().trim().min(1).max(200);

export const idempotencyRecordSchema = z.object({
  key: idempotencyKeySchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/i),
  result: z.unknown(),
  createdAt: instantSchema
});

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const idempotencyDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  records: z.array(idempotencyRecordSchema)
});

export type IdempotencyDocument = z.infer<typeof idempotencyDocumentSchema>;

export const successEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown()
});

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export const gestionEnvelopeSchema = z.union([successEnvelopeSchema, errorEnvelopeSchema]);

export interface GestionErrorDetails {
  [key: string]: unknown;
}

export interface GestionError {
  code: SchemaErrorCode;
  message: string;
  details?: GestionErrorDetails;
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  error: GestionError;
}

export type GestionEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

// DECISIÓN ÚNICA: las entidades viven en schemas.ts junto al envelope y la auditoría para conservar un solo módulo de validación en lugar de crear entities.ts.
const baseEntitySchema = z.object({
  id: z.string().min(1).max(100),
  ownerId: z.string().min(1).max(100),
  version: z.number().int().nonnegative()
});

const PAYMENT_STATUS_VALUES = ["pendiente", "parcial", "pagado"] as const;
const SALE_STATUS_VALUES = ["confirmada", "anulada", "devuelta"] as const;
const PAYMENT_METHOD_VALUES = ["efectivo", "tarjeta", "transferencia", "mixto"] as const;
const STOCK_MOTIVE_VALUES = ["compra", "venta", "devolucion", "anulacion", "transferencia", "consumo"] as const;
const CASH_STATUS_VALUES = ["abierta", "cerrada"] as const;

export const clienteSchema = baseEntitySchema.extend({
  displayName: z.string().min(1).max(120),
  phone: z.string().min(1).max(40).optional(),
  email: z.email().optional()
});

export const categoriaSchema = baseEntitySchema.extend({
  displayName: z.string().min(1).max(120),
  active: z.boolean()
});

export const productoSchema = baseEntitySchema.extend({
  displayName: z.string().min(1).max(120),
  categoriaId: z.string().min(1).max(100).optional(),
  price: z.number().min(0),
  cost: z.number().min(0),
  stock: z.number().int(),
  minimum: z.number().int().min(0).default(0),
  active: z.boolean()
});

export const servicioSchema = baseEntitySchema.extend({
  displayName: z.string().min(1).max(120),
  price: z.number().min(0),
  active: z.boolean()
});

export const ordenSchema = baseEntitySchema.extend({
  clienteId: z.string().min(1).max(100),
  numero: z.string().min(1).max(40),
  estado: stateTokenSchema,
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES),
  total: z.number().min(0)
});

const ventaItemSchema = z.object({
  productoId: z.string().min(1).max(100),
  cantidad: z.number().int().positive(),
  precio: z.number().min(0)
});

const ventaPagoSchema = z.object({
  metodo: z.enum(PAYMENT_METHOD_VALUES),
  monto: z.number().min(0)
});

export const ventaDescuentoSchema = z.object({
  motivo: z.string().min(1).max(120),
  monto: z.number().min(0)
});

export const ventaSchema = baseEntitySchema.extend({
  numero: z.string().min(1).max(40),
  items: z.array(ventaItemSchema).min(1),
  pagos: z.array(ventaPagoSchema).min(1),
  total: z.number().min(0),
  estado: z.enum(SALE_STATUS_VALUES),
  ordenId: z.string().min(1).max(100).optional(),
  descuento: ventaDescuentoSchema.optional()
});

export const compraSchema = baseEntitySchema.extend({
  productoId: z.string().min(1).max(100),
  proveedor: z.string().min(1).max(120),
  cantidad: z.number().int().positive(),
  costoUnitario: z.number().min(0),
  deposito: z.string().trim().min(1).max(40).optional(),
  comprobante: z.string().min(1).max(60).optional(),
  fecha: instantSchema,
  total: z.number().min(0)
});

export const movimientoStockSchema = baseEntitySchema.extend({
  productoId: z.string().min(1).max(100),
  deposito: z.string().trim().min(1).max(40).optional(),
  cantidad: z.number().int(),
  motivo: z.enum(STOCK_MOTIVE_VALUES),
  referencia: z.string().min(1).max(100).optional(),
  balanceAfter: z.number().int()
});

export const sesionCajaSchema = baseEntitySchema.extend({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." }),
  apertura: z.number().min(0),
  esperado: z.number().min(0),
  contado: z.number().min(0),
  diferencia: z.number(),
  estado: z.enum(CASH_STATUS_VALUES),
  cierre: instantSchema.optional()
});

export const gastoSchema = baseEntitySchema.extend({
  descripcion: z.string().min(1).max(200),
  importe: z.number().min(0),
  fecha: instantSchema,
  categoria: z.string().min(1).max(120).optional(),
  medio: z.enum(PAYMENT_METHOD_VALUES)
});

export type Cliente = z.infer<typeof clienteSchema>;
export type Categoria = z.infer<typeof categoriaSchema>;
export type Producto = z.infer<typeof productoSchema>;
export type Servicio = z.infer<typeof servicioSchema>;
export type Orden = z.infer<typeof ordenSchema>;
export type Venta = z.infer<typeof ventaSchema>;
export type Compra = z.infer<typeof compraSchema>;
export type MovimientoStock = z.infer<typeof movimientoStockSchema>;
export type SesionCaja = z.infer<typeof sesionCajaSchema>;
export type Gasto = z.infer<typeof gastoSchema>;

const documentVersionSchema = z.number().int().nonnegative();

export const clientesDocumentSchema = z.object({ version: documentVersionSchema, clientes: z.array(clienteSchema) });
export const categoriasDocumentSchema = z.object({ version: documentVersionSchema, categorias: z.array(categoriaSchema) });
export const productosDocumentSchema = z.object({ version: documentVersionSchema, productos: z.array(productoSchema) });
export const serviciosDocumentSchema = z.object({ version: documentVersionSchema, servicios: z.array(servicioSchema) });
export const ordenesDocumentSchema = z.object({ version: documentVersionSchema, ordenes: z.array(ordenSchema) });
export const ventasDocumentSchema = z.object({ version: documentVersionSchema, ventas: z.array(ventaSchema) });
export const comprasDocumentSchema = z.object({ version: documentVersionSchema, compras: z.array(compraSchema) });
export const movimientosStockDocumentSchema = z.object({ version: documentVersionSchema, movimientosStock: z.array(movimientoStockSchema) });
export const sesionesCajaDocumentSchema = z.object({ version: documentVersionSchema, sesionesCaja: z.array(sesionCajaSchema) });
export const gastosDocumentSchema = z.object({ version: documentVersionSchema, gastos: z.array(gastoSchema) });

export const BOOTSTRAP_COLLECTION_KEYS = ["clientes", "categorias", "productos", "servicios", "ordenes", "ventas",
  "compras", "movimientosStock", "sesionesCaja", "gastos", "users", "audit"] as const;

export type BootstrapCollectionKey = (typeof BOOTSTRAP_COLLECTION_KEYS)[number];
