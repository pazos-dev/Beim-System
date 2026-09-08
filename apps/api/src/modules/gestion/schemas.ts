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

/**
 * Repair-status transition body (issue #161). Closed enum of the 5 states —
 * mirrors REPAIR_STATUSES in services/receipts.ts (single source for the
 * transition logic lives there; this is the HTTP boundary copy). Anything
 * outside the enum is a 422 at the boundary, before the service runs.
 */
export const repairStatusBodySchema = z
  .strictObject({
    status: z.enum(["Ingresado", "En reparación", "Listo", "Entregado", "Cancelado"])
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

/** Audit-trail read (issue #97): exact action match, actor uuid, date range, paginated like receipts. */
export const auditLogsQuerySchema = z
  .strictObject({
    actor: uuidParam.optional(),
    action: z.string().trim().min(1).optional(),
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

/**
 * Closed console role list (issue #155) — the operator roles of
 * `gestion_users` (default 'vendedor' in schema.sql). Webshop roles
 * (cliente/admin/superadmin) belong to `users` and are rejected here, just
 * like console roles are rejected by the webshop users routes.
 */
const gestionUserRoleEnum = z.enum(["vendedor", "tecnico", "caja", "administrador", "administrador_principal"]);

/**
 * Console password policy (issue #155): byte-identical to the webshop
 * registerSchema policy — min 12 with upper/lower/digit/symbol.
 */
const gestionPasswordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres")
  .max(200)
  .refine(
    (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value),
    "La contraseña debe incluir mayúscula, minúscula, número y símbolo"
  );

export const gestionUsersListQuerySchema = z
  .strictObject({
    role: gestionUserRoleEnum.optional(),
    // Query params arrive as strings: "false" must map to false, so a plain
    // boolean cast is forbidden here (Boolean("false") === true).
    active: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

export const gestionUserCreateSchema = z
  .strictObject({
    username: z.string().trim().min(1, "username requerido").max(120),
    name: z.string().trim().min(1, "name requerido").max(120),
    password: gestionPasswordSchema,
    role: gestionUserRoleEnum
  })
  .strict();

export const gestionUserRoleBodySchema = z
  .strictObject({
    role: gestionUserRoleEnum
  })
  .strict();

export const gestionUserPasswordBodySchema = z
  .strictObject({
    password: gestionPasswordSchema
  })
  .strict();

/**
 * Catalog active filter (issue #87) — query params arrive as strings, so a
 * boolean cast is forbidden here (Boolean("false") === true). "all" disables
 * the filter; absent defaults to active-only at the service layer.
 */
export const catalogActiveQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional()
  })
  .strict();

/**
 * Clients list query (issue #98): catalog active filter + ILIKE search over
 * name/email + offset paging (page default 1, limit default 20, max 100 —
 * same contract as the users/receipts lists).
 */
export const clientsListQuerySchema = z
  .strictObject({
    active: z
      .enum(["true", "false", "all"])
      .transform((value) => (value === "all" ? "all" : value === "true"))
      .optional(),
    search: z.string().trim().min(1).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

/**
 * Reports range query (issue #164) — optional YYYY-MM-DD bounds for the
 * ranged reports (sales-summary, cash-summary, top-products). Defaults
 * (last 30d) and the from<=to / 366d guards live in services/reports.ts;
 * the boundary only enforces the strict date shape here.
 */
export const reportsRangeQuerySchema = z
  .strictObject({
    from: dateString.optional(),
    to: dateString.optional()
  })
  .strict();

/** Top-products query: same range plus a clamped limit (default 20, max 100). */
export const reportsTopQuerySchema = z
  .strictObject({
    from: dateString.optional(),
    to: dateString.optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
  })
  .strict();

/** String-id params (categories use text ids, not uuids). */
export const paramStringIdSchema = z
  .strictObject({ id: z.string().trim().min(1, "Identificador inválido") })
  .strict();

export const clientUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    email: z.string().trim().email("email inválido").optional(),
    phone: z.string().trim().optional(),
    active: z.boolean().optional()
  })
  .strict();

export const categoryUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    code: z.string().trim().min(1, "code requerido").optional(),
    active: z.boolean().optional()
  })
  .strict();

export const serviceUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1, "name requerido").optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional()
  })
  .strict();

export const purchaseUpdateSchema = z
  .strictObject({
    supplierName: z.string().trim().min(1, "supplierName requerido").optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    active: z.boolean().optional()
  })
  .strict();