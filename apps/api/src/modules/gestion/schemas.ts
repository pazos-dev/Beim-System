/**
 * Gestion module request schemas (PR 3) — zod 4, strict objects.
 *
 * strict() rejects unknown keys: client-supplied pricing (unitPrice on a
 * sales-batch line) and legacy full-replace payloads are rejected at the
 * boundary instead of being silently accepted (spec: server-side validation).
 */
import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha esperado: YYYY-MM-DD");
const uuidParam = z.uuid("Identificador inválido");

export const paramIdSchema = z.strictObject({ id: uuidParam }).strict();

const batchItem = z
  .strictObject({
    productId: z.string().trim().min(1, "productId requerido"),
    quantity: z.number().int().positive("quantity debe ser un entero positivo")
  })
  .strict();

const batchPayment = z
  .strictObject({
    method: z.string().trim().min(1, "method requerido"),
    amount: z.number().nonnegative("amount no puede ser negativo")
  })
  .strict();

export const salesBatchSchema = z
  .strictObject({
    clientName: z.string().trim().min(1, "clientName requerido"),
    clientId: z.string().trim().min(1, "clientId requerido"),
    clientPhone: z.string().trim().optional(),
    deviceBrand: z.string().trim().optional(),
    deviceModel: z.string().trim().optional(),
    deviceColor: z.string().trim().optional(),
    imeiSerial: z.string().trim().optional(),
    reportedIssue: z.string().trim().optional(),
    services: z.array(z.string().trim().min(1)).optional(),
    items: z.array(batchItem).min(1, "items requiere al menos un producto"),
    payments: z.array(batchPayment).optional()
  })
  .strict();

export const receiptCreateSchema = z
  .strictObject({
    clientName: z.string().trim().min(1, "clientName requerido"),
    clientId: z.string().trim().optional(),
    clientPhone: z.string().trim().optional(),
    deviceBrand: z.string().trim().optional(),
    deviceModel: z.string().trim().optional(),
    deviceColor: z.string().trim().optional(),
    imeiSerial: z.string().trim().optional(),
    reportedIssue: z.string().trim().optional(),
    services: z.array(z.string().trim().min(1)).optional(),
    price: z.string().optional(),
    repairStatus: z.string().trim().optional(),
    quoteStatus: z.string().trim().optional(),
    quoteTotal: z.number().nonnegative().optional(),
    paymentStatus: z.string().trim().optional(),
    payload: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const receiptsListQuerySchema = z
  .strictObject({
    client: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export const financialStateSchema = z
  .strictObject({
    capitalInitial: z.number().optional(),
    expenses: z.array(z.unknown()).optional(),
    menuItems: z.array(z.unknown()).optional(),
    accountingState: z.record(z.string(), z.unknown()).optional(),
    preferences: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const cashSessionOpenSchema = z
  .strictObject({
    businessDate: dateString,
    openingAmount: z.number().nonnegative("openingAmount no puede ser negativo"),
    notes: z.string().optional()
  })
  .strict();

export const cashSessionCloseSchema = z
  .strictObject({
    countedAmount: z.number().nonnegative("countedAmount no puede ser negativo")
  })
  .strict();

export const cashSessionMovementSchema = z
  .strictObject({
    type: z.enum(["ingreso", "egreso", "ajuste"]),
    amount: z.number().positive("amount debe ser positivo"),
    notes: z.string().optional()
  })
  .strict();

export const stockMovementSchema = z
  .strictObject({
    productId: z.string().trim().min(1, "productId requerido"),
    movementType: z.enum(["entrada", "salida"]),
    quantity: z.number().int().positive("quantity debe ser un entero positivo"),
    detail: z.string().optional()
  })
  .strict();

export const stockMovementsQuerySchema = z
  .strictObject({
    productId: z.string().trim().optional(),
    from: dateString.optional(),
    to: dateString.optional()
  })
  .strict();

export const clientCreateSchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido"),
    email: z.string().trim().email("email inválido").optional(),
    phone: z.string().trim().optional()
  })
  .strict();

export const categoryCreateSchema = z
  .strictObject({
    id: z.string().trim().min(1, "id requerido"),
    name: z.string().trim().min(1, "name requerido"),
    code: z.string().trim().min(1, "code requerido")
  })
  .strict();

export const serviceCreateSchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido"),
    data: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export const purchaseCreateSchema = z
  .strictObject({
    supplierName: z.string().trim().min(1, "supplierName requerido"),
    data: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

/**
 * Closed webshop role list (issue #85) — mirrors the users_role_check
 * constraint in schema.sql. Console roles (vendedor/tecnico/…) belong to
 * `gestion_users`, a separate future issue, and are rejected here.
 */
const userRoleEnum = z.enum(["cliente", "admin", "superadmin"]);

export const usersListQuerySchema = z
  .strictObject({
    role: userRoleEnum.optional(),
    // Query params arrive as strings: "false" must map to false, so a plain
    // boolean cast is forbidden here (Boolean("false") === true).
    approved: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export const userRoleBodySchema = z
  .strictObject({
    role: userRoleEnum
  })
  .strict();