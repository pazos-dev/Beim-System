/**
 * Central OpenAPI registry (issue #93) — the single curated source of the
 * machine-readable contract served at GET /openapi.json.
 *
 * Every entry mirrors a real route (method + full path with the /api/v1
 * prefix already included). Request bodies/query/params reuse the SAME zod
 * schemas the routers validate with, so the documented shape cannot drift
 * from the enforced one. Success responses use the { ok, data } envelope
 * and errors use the taxonomy codes/messages (errors/taxonomy.ts).
 *
 * The anti-drift suite (openapi.test.ts) fails when a real Express route is
 * missing here (or vice versa): adding a route requires documenting it.
 */
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
  type ResponseConfig,
  type RouteConfig,
  type ZodContentObject,
  type ZodMediaTypeObject
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { ERROR_CODES, MESSAGE_BY_CODE, type ErrorCode } from "../errors/taxonomy.js";
import * as gestionSchemas from "../modules/gestion/schemas.js";
import * as webshopSchemas from "../modules/webshop/schemas.js";

extendZodWithOpenApi(z);

type RequestConfig = NonNullable<RouteConfig["request"]>;
/** Path/query schemas must be objects (the registry renders them as parameters). */
type ParamsSchema = NonNullable<RequestConfig["params"]>;
type HeadersSchema = Exclude<NonNullable<RequestConfig["headers"]>, unknown[]>;
/** Raw (non-zod) JSON Schema passthrough for hand-written envelopes. */
type RawSchema = NonNullable<ZodMediaTypeObject["schema"]>;

export type OpenApiMethod = "get" | "post" | "put";

export type RouteAuth = "public" | "bearer" | "signature";

export interface DocumentedRoute {
  method: OpenApiMethod;
  /** Full path with the /api/v1 prefix included; path params in {id} style. */
  path: string;
  /** Spanish summary shown in the Swagger UI. */
  summary: string;
  description?: string;
  tags: string[];
  auth: RouteAuth;
  paramsSchema?: ParamsSchema;
  querySchema?: ParamsSchema;
  headersSchema?: HeadersSchema;
  bodySchema?: z.ZodType;
  bodyExample?: unknown;
  /** Raw (non-JSON) request bodies, e.g. binary uploads. */
  rawBodyContent?: ZodContentObject;
  rawSuccessContent?: ZodContentObject;
  successStatus: 200 | 201;
  successDescription: string;
  successExample: unknown;
  errorCodes: ErrorCode[];
}

/**
 * Docs-only path params for routes without runtime param validation.
 * Categories use text ids (e.g. mano-de-obra) and uploads serve "<uuid>.<ext>"
 * filenames — both arrive as plain strings on the wire.
 */
const stringIdParamsSchema = z.strictObject({ id: z.string().min(1) });
const filenameParamsSchema = z.strictObject({ filename: z.string().min(1) });
const webhookHeadersSchema = z.strictObject({ "x-signature": z.string().min(1) });

const ORDER_ID_EXAMPLE = "11111111-1111-4111-8111-111111111111";

const binarySchema: RawSchema = { type: "string", format: "binary" };

const GESTION_BASELINE: ErrorCode[] = ["NOT_FOUND_OR_FORBIDDEN", "FORBIDDEN"];

function successEnvelope(example: unknown): RawSchema {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean", example: true },
      data: { description: "Response payload (see example)." }
    },
    required: ["ok", "data"],
    example
  };
}

function errorEnvelope(code: ErrorCode): RawSchema {
  return {
    type: "object",
    properties: {
      ok: { type: "boolean", example: false },
      error: {
        type: "object",
        properties: {
          code: { type: "string", example: code },
          message: { type: "string", example: MESSAGE_BY_CODE[code] }
        },
        required: ["code", "message"]
      }
    },
    required: ["ok", "error"],
    example: { ok: false, error: { code, message: MESSAGE_BY_CODE[code] } }
  };
}

export const OPENAPI_ROUTES: DocumentedRoute[] = [
  /* --------------------------------- system --------------------------------- */
  {
    method: "get",
    path: "/health",
    summary: "Salud del servicio (liveness)",
    description: "Sin autenticación. No toca la base de datos.",
    tags: ["system"],
    auth: "public",
    successStatus: 200,
    successDescription: "El servicio está vivo.",
    successExample: { ok: true, data: { status: "ok" } },
    errorCodes: []
  },
  {
    method: "get",
    path: "/ready",
    summary: "Preparación con chequeo de base de datos (readiness)",
    description: "Sin autenticación. Corre SELECT 1 contra Postgres (timeout 2s).",
    tags: ["system"],
    auth: "public",
    successStatus: 200,
    successDescription: "La base de datos responde.",
    successExample: { ok: true, data: { db: "up" } },
    errorCodes: ["DEPENDENCY_UNAVAILABLE"]
  },

  /* --------------------------------- gestion -------------------------------- */
  {
    method: "post",
    path: "/api/v1/sales-batch",
    summary: "Crear venta de mostrador (atómica)",
    description: "Rol operador. Precios server-side; los pagos deben sumar el total exacto.",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.salesBatchSchema,
    bodyExample: {
      clientName: "Martín Rodríguez",
      clientId: "095123456",
      clientPhone: "099 123 456",
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      reportedIssue: "Pantalla rota",
      services: ["Cambio de pantalla"],
      items: [{ productId: "pantalla-iphone-13", quantity: 1 }],
      payments: [{ method: "efectivo", amount: 4500 }]
    },
    successStatus: 201,
    successDescription: "Venta registrada.",
    successExample: {
      ok: true,
      data: {
        receipt: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", receiptNumber: 1001 },
        items: [{ productId: "pantalla-iphone-13", quantity: 1, unitPrice: 4500 }],
        total: 4500
      }
    },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR", "INSUFFICIENT_STOCK", "CONFLICT"]
  },
  {
    method: "get",
    path: "/api/v1/receipts/next-number",
    summary: "Previsualizar próximo número de recibo",
    description: "Rol operador. Preview de secuencia (desde 1000), no reserva.",
    tags: ["gestion"],
    auth: "bearer",
    successStatus: 200,
    successDescription: "Próximo número disponible.",
    successExample: { ok: true, data: { receiptNumber: 1000 } },
    errorCodes: [...GESTION_BASELINE]
  },
  {
    method: "get",
    path: "/api/v1/receipts",
    summary: "Listar recibos",
    description: "Rol operador. Filtros client, paymentMethod, from/to (YYYY-MM-DD), page/limit.",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.receiptsListQuerySchema,
    successStatus: 200,
    successDescription: "Página de recibos (orden receipt_number DESC).",
    successExample: { ok: true, data: { items: [], total: 0, page: 1, limit: 20 } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/receipts",
    summary: "Crear recibo de reparación",
    description: "Rol operador. Ticket de reparación con datos del cliente y el equipo.",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.receiptCreateSchema,
    bodyExample: {
      clientName: "Martín Rodríguez",
      clientPhone: "099 123 456",
      deviceBrand: "Apple",
      deviceModel: "iPhone 13",
      reportedIssue: "No enciende",
      price: "3200"
    },
    successStatus: 201,
    successDescription: "Recibo creado.",
    successExample: {
      ok: true,
      data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", clientName: "Martín Rodríguez" }
    },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/receipts/{id}",
    summary: "Obtener recibo por id",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Recibo encontrado.",
    successExample: {
      ok: true,
      data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", clientName: "Martín Rodríguez" }
    },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/receipts/{id}/annul",
    summary: "Anular recibo",
    description: "Rol operador. Restaura stock y revierte movimientos con importes negativos.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Recibo anulado.",
    successExample: { ok: true, data: { receipt: {}, restoredItems: [], reversedMovements: [] } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR", "CONFLICT"]
  },
  {
    method: "get",
    path: "/api/v1/financial-state",
    summary: "Obtener estado financiero",
    description: "Rol operador. Singleton.",
    tags: ["gestion"],
    auth: "bearer",
    successStatus: 200,
    successDescription: "Estado financiero actual.",
    successExample: { ok: true, data: { capitalInitial: 500000 } },
    errorCodes: [...GESTION_BASELINE]
  },
  {
    method: "put",
    path: "/api/v1/financial-state",
    summary: "Actualizar estado financiero (merge)",
    description: "Rol operador. Los campos enviados pisan, el resto se preserva.",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.financialStateSchema,
    bodyExample: { capitalInitial: 500000 },
    successStatus: 200,
    successDescription: "Estado financiero actualizado.",
    successExample: { ok: true, data: { capitalInitial: 500000 } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/cash-sessions/current",
    summary: "Obtener sesión de caja abierta",
    description: "Rol operador. Sin abierta → 404.",
    tags: ["gestion"],
    auth: "bearer",
    successStatus: 200,
    successDescription: "Sesión abierta actual.",
    successExample: {
      ok: true,
      data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", businessDate: "2026-09-07" }
    },
    errorCodes: [...GESTION_BASELINE]
  },
  {
    method: "get",
    path: "/api/v1/cash-sessions",
    summary: "Listar sesiones de caja",
    description: "Rol operador. Orden business_date DESC.",
    tags: ["gestion"],
    auth: "bearer",
    successStatus: 200,
    successDescription: "Listado de sesiones.",
    successExample: { ok: true, data: [] },
    errorCodes: [...GESTION_BASELINE]
  },
  {
    method: "post",
    path: "/api/v1/cash-sessions",
    summary: "Abrir sesión de caja",
    description: "Rol operador. Solo una abierta por vez y fecha única (si no → 409).",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.cashSessionOpenSchema,
    bodyExample: { businessDate: "2026-09-07", openingAmount: 15000, notes: "Apertura turno mañana" },
    successStatus: 201,
    successDescription: "Sesión abierta.",
    successExample: {
      ok: true,
      data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", businessDate: "2026-09-07" }
    },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR", "CONFLICT"]
  },
  {
    method: "post",
    path: "/api/v1/cash-sessions/{id}/close",
    summary: "Cerrar sesión de caja",
    description: "Rol operador. Persiste counted_amount y calcula la diferencia; doble cierre → 409.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.cashSessionCloseSchema,
    bodyExample: { countedAmount: 18450 },
    successStatus: 200,
    successDescription: "Sesión cerrada.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR", "CONFLICT"]
  },
  {
    method: "post",
    path: "/api/v1/cash-sessions/{id}/movements",
    summary: "Registrar movimiento de caja",
    description: "Rol operador. Solo en sesión abierta (cerrada → 409).",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.cashSessionMovementSchema,
    bodyExample: { type: "egreso", amount: 1200, notes: "Compra de insumos" },
    successStatus: 201,
    successDescription: "Movimiento registrado.",
    successExample: { ok: true, data: { type: "egreso", amount: 1200 } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR", "CONFLICT"]
  },
  {
    method: "get",
    path: "/api/v1/stock-movements",
    summary: "Listar movimientos de stock",
    description: "Rol operador. Filtros productId, from/to (YYYY-MM-DD).",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.stockMovementsQuerySchema,
    successStatus: 200,
    successDescription: "Listado de movimientos.",
    successExample: { ok: true, data: [] },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/stock-movements",
    summary: "Registrar movimiento de stock",
    description: "Rol operador. Journal explícito (las ventas no journalizan solas).",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.stockMovementSchema,
    bodyExample: {
      productId: "cargador-rapido",
      movementType: "entrada",
      quantity: 20,
      detail: "Compra a proveedor"
    },
    successStatus: 201,
    successDescription: "Movimiento registrado.",
    successExample: {
      ok: true,
      data: { productId: "cargador-rapido", movementType: "entrada", quantity: 20 }
    },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/clients",
    summary: "Listar clientes",
    description: "Rol operador. Array directo sin paginar; filtro active (true/false/all).",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.catalogActiveQuerySchema,
    successStatus: 200,
    successDescription: "Listado de clientes.",
    successExample: { ok: true, data: [{ id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", name: "Martín Rodríguez" }] },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/clients/{id}",
    summary: "Obtener cliente por id",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Cliente encontrado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", name: "Martín Rodríguez" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/clients",
    summary: "Crear cliente",
    description: "Rol operador. Crea pendiente (is_approved=false, oculto del listado default).",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.clientCreateSchema,
    bodyExample: { name: "Martín Rodríguez", email: "martin@example.com", phone: "099 123 456" },
    successStatus: 201,
    successDescription: "Cliente creado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", name: "Martín Rodríguez" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "put",
    path: "/api/v1/clients/{id}",
    summary: "Actualizar cliente",
    description: "Rol operador. Merge parcial; active:false desaprueba y revoca sesiones.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.clientUpdateSchema,
    bodyExample: { phone: "099 654 321" },
    successStatus: 200,
    successDescription: "Cliente actualizado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", phone: "099 654 321" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/categories",
    summary: "Listar categorías",
    description: "Rol operador. Filtro active (true/false/all).",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.catalogActiveQuerySchema,
    successStatus: 200,
    successDescription: "Listado de categorías.",
    successExample: { ok: true, data: [{ id: "mano-de-obra", name: "Mano de obra" }] },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/categories/{id}",
    summary: "Obtener categoría por id",
    description: "Rol operador. Id string (ej. mano-de-obra).",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: stringIdParamsSchema,
    successStatus: 200,
    successDescription: "Categoría encontrada.",
    successExample: { ok: true, data: { id: "mano-de-obra", name: "Mano de obra" } },
    errorCodes: [...GESTION_BASELINE]
  },
  {
    method: "post",
    path: "/api/v1/categories",
    summary: "Crear categoría",
    description: "Rol admin.",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.categoryCreateSchema,
    bodyExample: { id: "repuestos", name: "Repuestos", code: "REP" },
    successStatus: 201,
    successDescription: "Categoría creada.",
    successExample: { ok: true, data: { id: "repuestos", name: "Repuestos" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "put",
    path: "/api/v1/categories/{id}",
    summary: "Actualizar categoría",
    description: "Rol admin. Merge parcial; inexistente → 404.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramStringIdSchema,
    bodySchema: gestionSchemas.categoryUpdateSchema,
    bodyExample: { name: "Repuestos originales" },
    successStatus: 200,
    successDescription: "Categoría actualizada.",
    successExample: { ok: true, data: { id: "repuestos", name: "Repuestos originales" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/services",
    summary: "Listar servicios",
    description: "Rol operador. Filtro active (true/false/all).",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.catalogActiveQuerySchema,
    successStatus: 200,
    successDescription: "Listado de servicios.",
    successExample: { ok: true, data: [{ name: "Cambio de pantalla iPhone 13" }] },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/services/{id}",
    summary: "Obtener servicio por id",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Servicio encontrado.",
    successExample: { ok: true, data: { name: "Cambio de pantalla iPhone 13" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/services",
    summary: "Crear servicio",
    description: "Rol admin. data es un record libre (precio, duración, etc.).",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.serviceCreateSchema,
    bodyExample: { name: "Cambio de pantalla iPhone 13", data: { precio: 4500, duracionMin: 60 } },
    successStatus: 201,
    successDescription: "Servicio creado.",
    successExample: { ok: true, data: { name: "Cambio de pantalla iPhone 13" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "put",
    path: "/api/v1/services/{id}",
    summary: "Actualizar servicio",
    description: "Rol admin. Merge parcial; inexistente → 404.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.serviceUpdateSchema,
    bodyExample: { data: { precio: 4900 } },
    successStatus: 200,
    successDescription: "Servicio actualizado.",
    successExample: { ok: true, data: { name: "Cambio de pantalla iPhone 13" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/purchases",
    summary: "Listar compras",
    description: "Rol operador. Filtro active (true/false/all).",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.catalogActiveQuerySchema,
    successStatus: 200,
    successDescription: "Listado de compras.",
    successExample: { ok: true, data: [{ supplierName: "Distribuidora Sur" }] },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/purchases/{id}",
    summary: "Obtener compra por id",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Compra encontrada.",
    successExample: { ok: true, data: { supplierName: "Distribuidora Sur" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/purchases",
    summary: "Crear compra",
    description: "Rol admin.",
    tags: ["gestion"],
    auth: "bearer",
    bodySchema: gestionSchemas.purchaseCreateSchema,
    bodyExample: { supplierName: "Distribuidora Sur", data: { total: 82000 } },
    successStatus: 201,
    successDescription: "Compra creada.",
    successExample: { ok: true, data: { supplierName: "Distribuidora Sur" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "put",
    path: "/api/v1/purchases/{id}",
    summary: "Actualizar compra",
    description: "Rol admin. Merge parcial; inexistente → 404.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.purchaseUpdateSchema,
    bodyExample: { supplierName: "Distribuidora Norte" },
    successStatus: 200,
    successDescription: "Compra actualizada.",
    successExample: { ok: true, data: { supplierName: "Distribuidora Norte" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/users",
    summary: "Listar usuarios webshop",
    description: "Rol admin. Filtros role, approved, page/limit. Nunca expone password_hash.",
    tags: ["gestion"],
    auth: "bearer",
    querySchema: gestionSchemas.usersListQuerySchema,
    successStatus: 200,
    successDescription: "Página de usuarios (orden created_at DESC).",
    successExample: { ok: true, data: { items: [], total: 0, page: 1, limit: 20 } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/users/{id}/approve",
    summary: "Aprobar usuario",
    description: "Rol admin. Idempotente; desbloquea el login.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Usuario aprobado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", isApproved: true } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "put",
    path: "/api/v1/users/{id}/role",
    summary: "Cambiar rol de usuario",
    description: "Rol admin. Lista cerrada cliente/admin/superadmin; efecto inmediato en sesiones vigentes.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    bodySchema: gestionSchemas.userRoleBodySchema,
    bodyExample: { role: "admin" },
    successStatus: 200,
    successDescription: "Rol actualizado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", role: "admin" } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },
  {
    method: "post",
    path: "/api/v1/users/{id}/disable",
    summary: "Deshabilitar usuario",
    description: "Rol admin. Desaprueba y revoca sesiones webshop; idempotente.",
    tags: ["gestion"],
    auth: "bearer",
    paramsSchema: gestionSchemas.paramIdSchema,
    successStatus: 200,
    successDescription: "Usuario deshabilitado.",
    successExample: { ok: true, data: { id: "a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5", isApproved: false } },
    errorCodes: [...GESTION_BASELINE, "VALIDATION_ERROR"]
  },

  /* --------------------------------- webshop -------------------------------- */
  {
    method: "post",
    path: "/api/v1/auth/login",
    summary: "Iniciar sesión",
    description: "Público. Fallos uniformes 401 sin filtrar existencia. Una sola sesión activa por usuario.",
    tags: ["webshop"],
    auth: "public",
    bodySchema: webshopSchemas.loginSchema,
    bodyExample: { identifier: "martin@example.com", password: "S3guro!2026x" },
    successStatus: 200,
    successDescription: "Sesión creada.",
    successExample: {
      ok: true,
      data: { token: "<opaque>", expiresAt: "2026-10-07T00:00:00.000Z", user: { email: "martin@example.com" } }
    },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/auth/register",
    summary: "Registrar cuenta",
    description: "Público. Crea users con role cliente e is_approved=false; anti-enumeración (email tomado → 201 con user null).",
    tags: ["webshop"],
    auth: "public",
    bodySchema: webshopSchemas.registerSchema,
    bodyExample: { name: "Martín Rodríguez", email: "martin@example.com", password: "S3guro!2026x" },
    successStatus: 201,
    successDescription: "Cuenta creada (pendiente de aprobación).",
    successExample: { ok: true, data: { user: { email: "martin@example.com" } } },
    errorCodes: ["VALIDATION_ERROR", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/auth/gestion-access",
    summary: "Canjear acceso de gestión (puente)",
    description: "Público. Canjea un token de gestion_web_access_tokens por sesión web (single-use).",
    tags: ["webshop"],
    auth: "public",
    bodySchema: webshopSchemas.gestionAccessSchema,
    bodyExample: { token: "bridge-token-ejemplo" },
    successStatus: 200,
    successDescription: "Sesión emitida.",
    successExample: { ok: true, data: { token: "<opaque>" } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/auth/logout",
    summary: "Cerrar sesión",
    description: "Requiere Bearer válido. Idempotente: siempre 200 con token válido.",
    tags: ["webshop"],
    auth: "bearer",
    successStatus: 200,
    successDescription: "Sesión revocada.",
    successExample: { ok: true, data: { loggedOut: true } },
    errorCodes: ["AUTHENTICATION_REQUIRED"]
  },
  {
    method: "get",
    path: "/api/v1/products",
    summary: "Listar productos publicados",
    description: "Público. Solo published=true; filtros category (exacto) y search (ILIKE nombre/marca/modelo).",
    tags: ["webshop"],
    auth: "public",
    querySchema: webshopSchemas.productListQuerySchema,
    successStatus: 200,
    successDescription: "Página de productos (orden created_at ASC).",
    successExample: { ok: true, data: { page: 1, limit: 20, total: 0, totalPages: 0, items: [] } },
    errorCodes: ["VALIDATION_ERROR"]
  },
  {
    method: "get",
    path: "/api/v1/products/{id}",
    summary: "Obtener producto publicado por id",
    description: "Público. Oculto/ajeno → 404.",
    tags: ["webshop"],
    auth: "public",
    paramsSchema: webshopSchemas.paramUuidSchema,
    successStatus: 200,
    successDescription: "Producto encontrado.",
    successExample: { ok: true, data: { id: ORDER_ID_EXAMPLE, name: "iPhone 13" } },
    errorCodes: ["VALIDATION_ERROR", "NOT_FOUND_OR_FORBIDDEN"]
  },
  {
    method: "get",
    path: "/api/v1/promo-slides",
    summary: "Listar slides promocionales",
    description: "Público.",
    tags: ["webshop"],
    auth: "public",
    successStatus: 200,
    successDescription: "Slides promocionales.",
    successExample: { ok: true, data: [] },
    errorCodes: []
  },
  {
    method: "post",
    path: "/api/v1/orders",
    summary: "Crear orden",
    description: "Requiere Bearer. productId exige UUID (los ids texto del seed dan 422). Chequea stock sin reservar.",
    tags: ["webshop"],
    auth: "bearer",
    bodySchema: webshopSchemas.orderCreateSchema,
    bodyExample: {
      customer: "Martín Rodríguez",
      email: "martin@example.com",
      phone: "099 123 456",
      items: [{ productId: ORDER_ID_EXAMPLE, quantity: 1 }]
    },
    successStatus: 201,
    successDescription: "Orden creada (Pendiente de pago).",
    successExample: { ok: true, data: { order: { id: ORDER_ID_EXAMPLE }, items: [] } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "INSUFFICIENT_STOCK", "CONFLICT", "TOO_MANY_REQUESTS"]
  },
  {
    method: "get",
    path: "/api/v1/orders",
    summary: "Listar mis órdenes",
    description: "Requiere Bearer. Solo propias.",
    tags: ["webshop"],
    auth: "bearer",
    querySchema: webshopSchemas.pageQuerySchema,
    successStatus: 200,
    successDescription: "Página de órdenes propias.",
    successExample: { ok: true, data: { page: 1, limit: 20, total: 0, items: [] } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED"]
  },
  {
    method: "get",
    path: "/api/v1/orders/{id}",
    summary: "Obtener mi orden por id",
    description: "Requiere Bearer. Ajena → 404 (sin leak).",
    tags: ["webshop"],
    auth: "bearer",
    paramsSchema: webshopSchemas.paramUuidSchema,
    successStatus: 200,
    successDescription: "Orden encontrada.",
    successExample: { ok: true, data: { order: { id: ORDER_ID_EXAMPLE } } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "NOT_FOUND_OR_FORBIDDEN"]
  },
  {
    method: "post",
    path: "/api/v1/checkout-sessions",
    summary: "Crear sesión de checkout",
    description: "Requiere Bearer. Una sola sesión pendiente por orden; la orden debe seguir Pendiente de pago.",
    tags: ["webshop"],
    auth: "bearer",
    bodySchema: webshopSchemas.checkoutSessionCreateSchema,
    bodyExample: { orderId: ORDER_ID_EXAMPLE },
    successStatus: 201,
    successDescription: "Sesión de checkout minteada.",
    successExample: {
      ok: true,
      data: { id: ORDER_ID_EXAMPLE, url: "https://checkout.example/checkout/abc", status: "pending" }
    },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "CONFLICT", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/orders/{id}/cancel",
    summary: "Cancelar mi orden",
    description: "Requiere Bearer. Idempotente; pagada o no pendiente → 409. Sin reembolso automático.",
    tags: ["webshop"],
    auth: "bearer",
    paramsSchema: webshopSchemas.paramOrderIdSchema,
    successStatus: 200,
    successDescription: "Orden cancelada.",
    successExample: { ok: true, data: { order: { id: ORDER_ID_EXAMPLE } } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "NOT_FOUND_OR_FORBIDDEN", "CONFLICT", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/orders/{id}/payment-preference",
    summary: "Crear preferencia de pago (MercadoPago)",
    description: "Requiere Bearer. Mintea preferencia nueva (pisa la anterior); sin MP_ACCESS_TOKEN → 503.",
    tags: ["webshop"],
    auth: "bearer",
    paramsSchema: webshopSchemas.paramOrderIdSchema,
    successStatus: 201,
    successDescription: "Preferencia creada.",
    successExample: { ok: true, data: { preferenceId: "1234567890", initPoint: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=1234567890" } },
    errorCodes: ["VALIDATION_ERROR", "AUTHENTICATION_REQUIRED", "NOT_FOUND_OR_FORBIDDEN", "DEPENDENCY_UNAVAILABLE", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/webhooks/mercadopago",
    summary: "Webhook de MercadoPago (IPN)",
    description: "Sin Bearer: se autentica con el header x-signature (ausente/inválido → 403). Responde 200 en casos de negocio para frenar reintentos.",
    tags: ["webshop"],
    auth: "signature",
    headersSchema: webhookHeadersSchema,
    bodySchema: webshopSchemas.mpWebhookSchema,
    bodyExample: {
      id: "1234567890",
      live_mode: true,
      type: "payment",
      action: "payment.created",
      data: { id: "1234567890" }
    },
    successStatus: 200,
    successDescription: "Notificación procesada.",
    successExample: { ok: true, data: { status: "paid", orderId: ORDER_ID_EXAMPLE } },
    errorCodes: ["FORBIDDEN", "DEPENDENCY_UNAVAILABLE", "TOO_MANY_REQUESTS"]
  },
  {
    method: "post",
    path: "/api/v1/uploads/product-image",
    summary: "Subir imagen de producto",
    description: "Requiere Bearer con rol admin. Body binario crudo; el Content-Type decide la extensión (png/jpeg/gif/webp/avif).",
    tags: ["webshop"],
    auth: "bearer",
    rawBodyContent: {
      "image/png": { schema: binarySchema },
      "image/jpeg": { schema: binarySchema },
      "image/gif": { schema: binarySchema },
      "image/webp": { schema: binarySchema },
      "image/avif": { schema: binarySchema }
    },
    successStatus: 201,
    successDescription: "Imagen guardada.",
    successExample: { ok: true, data: { url: "/api/v1/uploads/a1b2c3d4-e5f6-47a7-b8c9-d0e1f2a3b4c5.png" } },
    errorCodes: ["AUTHENTICATION_REQUIRED", "FORBIDDEN", "UNSUPPORTED_MEDIA_TYPE", "PAYLOAD_TOO_LARGE", "TOO_MANY_REQUESTS"]
  },
  {
    method: "get",
    path: "/api/v1/uploads/{filename}",
    summary: "Descargar imagen subida",
    description: "Público. Filename validado (uuid + extensión); inválido/ausente → 404.",
    tags: ["webshop"],
    auth: "public",
    paramsSchema: filenameParamsSchema,
    successStatus: 200,
    successDescription: "Bytes de la imagen.",
    successExample: undefined,
    rawSuccessContent: { "application/octet-stream": { schema: binarySchema } },
    errorCodes: ["NOT_FOUND_OR_FORBIDDEN"]
  }
];

/** Builds the OpenAPI 3.0 document by walking the curated registry. */
export function buildOpenApiDocument(): Record<string, unknown> {
  const registry = new OpenAPIRegistry();
  registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "opaque",
    description: "Token opaco de sesión webshop (Authorization: Bearer <token>)."
  });

  for (const route of OPENAPI_ROUTES) {
    const responses: Record<string, ResponseConfig> = {
      [String(route.successStatus)]: {
        description: route.successDescription,
        content:
          route.rawSuccessContent ??
          ({
            "application/json": { schema: successEnvelope(route.successExample) }
          } as ZodContentObject)
      }
    };
    for (const code of route.errorCodes) {
      responses[String(ERROR_CODES[code])] = {
        description: MESSAGE_BY_CODE[code],
        content: {
          "application/json": { schema: errorEnvelope(code) }
        }
      };
    }

    registry.registerPath({
      method: route.method,
      path: route.path,
      summary: route.summary,
      ...(route.description !== undefined ? { description: route.description } : {}),
      tags: route.tags,
      ...(route.auth === "bearer" ? { security: [{ bearerAuth: [] }] } : {}),
      ...(route.paramsSchema ?? route.querySchema ?? route.headersSchema ?? route.bodySchema ?? route.rawBodyContent
        ? {
            request: {
              ...(route.paramsSchema ? { params: route.paramsSchema } : {}),
              ...(route.querySchema ? { query: route.querySchema } : {}),
              ...(route.headersSchema ? { headers: route.headersSchema } : {}),
              ...(route.bodySchema
                ? {
                    body: {
                      content: {
                        "application/json": {
                          schema: route.bodySchema,
                          ...(route.bodyExample !== undefined ? { example: route.bodyExample } : {})
                        }
                      }
                    }
                  }
                : {}),
              ...(route.rawBodyContent ? { body: { content: route.rawBodyContent } } : {})
            }
          }
        : {}),
      responses
    });
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: "3.0.0",
    // Keep in sync with apps/api/package.json.
    info: {
      title: "Beim API",
      version: "0.0.0",
      description:
        "Contrato generado de la API del taller (gestión + tienda). Todas las respuestas usan el envelope { ok, data } y los errores usan la taxonomía de códigos. UI interactiva en /docs (solo fuera de producción)."
    },
    tags: [
      { name: "system", description: "Salud y preparación del servicio." },
      { name: "gestion", description: "Operación del taller (roles operador/admin)." },
      { name: "webshop", description: "Tienda en línea, autenticación y pagos." }
    ]
  }) as unknown as Record<string, unknown>;
}

/** Built once: the contract is static until the next deploy. */
export const openApiDocument: Record<string, unknown> = buildOpenApiDocument();
