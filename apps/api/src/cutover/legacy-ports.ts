import { Readable } from "node:stream";
import type { ConfirmSalesBatchInput, ConfirmSalesBatchResult } from "../application/sales-batch/sales-batch.js";
import type {
  CreateOrderInput,
  MintCheckoutSessionInput,
  OrderResult
} from "../application/orders/orders.js";
import type { Uuid } from "../domain/shared/ports.js";
import type { Venta } from "../domain/venta/venta.js";
import { AuthError, NotFoundError, ValidationError } from "../errors/taxonomy.js";
import { SystemUuid } from "../infrastructure/uuid/system-uuid.js";
import type { AuditRouterDeps } from "../interface/http/audit/router.js";
import type { CajaRouterDeps } from "../interface/http/caja/router.js";
import type { CatalogRouterDeps } from "../interface/http/catalog/router.js";
import type { CategoryRouterHandlers } from "../interface/http/categories/router.js";
import type { ClientRouterHandlers } from "../interface/http/clients/router.js";
import type { FinanceRouterDeps } from "../interface/http/finance/router.js";
import type { OrdersReadRouterDeps } from "../interface/http/orders-read/router.js";
import type { PagoRouterDeps } from "../interface/http/pago/router.js";
import type { PurchaseRouterHandlers } from "../interface/http/purchases/router.js";
import type { ReceiptRouterDeps } from "../interface/http/receipt/router.js";
import type { ReportsRouterDeps } from "../interface/http/reports/router.js";
import type { ServiceRouterHandlers } from "../interface/http/service/router.js";
import type { UploadRouterDeps } from "../interface/http/upload/router.js";
import type { VentaAuditActor, VentaRouterDeps } from "../interface/http/venta/router.js";
import { auditLogsService } from "../modules/gestion/services/audit-logs.js";
import { cashSessionsService } from "../modules/gestion/services/cash-sessions.js";
import {
  categoriesService,
  clientsService,
  purchasesService,
  servicesService
} from "../modules/gestion/services/crud.js";
import { financialStateService } from "../modules/gestion/services/financial-state.js";
import { invoiceSettingsService } from "../modules/gestion/services/invoice-settings.js";
import { receiptsService } from "../modules/gestion/services/receipts.js";
import { reportsService } from "../modules/gestion/services/reports.js";
import {
  salesBatchService,
  type SalesBatchResult
} from "../modules/gestion/services/sales-batch.js";
import { stockMovementsService } from "../modules/gestion/services/stock-movements.js";
import { webshopConfig } from "../modules/webshop/config.js";
import { catalogService } from "../modules/webshop/services/catalog.js";
import { checkoutService, ordersService } from "../modules/webshop/services/orders.js";
import { paymentsService } from "../modules/webshop/services/payments.js";
import { uploadsService } from "../modules/webshop/services/uploads.js";
import { makeGetInvoicePdf } from "./invoice-pdf-adapter.js";

/**
 * Cutover wiring, part B (change `clean-arch-interface`, F8b4).
 *
 * Real-deps adapters: every thin router `Deps` interface implemented by
 * delegating to the LEGACY services — never the application handlers, whose
 * persistence targets and envelopes differ (ventas domain vs beim_receipts,
 * `{venta, pago}` vs legacy rows). Zero duplicated logic: each method
 * forwards to the injected legacy port with the exact argument shape the
 * legacy route used. Default ports bind the real legacy services
 * (production binding); tests inject fakes.
 *
 * NOT mounted here: `mounting.ts` composes these deps with the guards,
 * limiters and idempotency scopes the legacy routers carried.
 */

/* ---------------------------------- audit ---------------------------------- */

export type AuditLegacyPort = Pick<typeof auditLogsService, "list">;

export const legacyAuditPort: AuditLegacyPort = {
  list: (filter) => auditLogsService.list(filter)
};

export function makeAuditDeps(port: AuditLegacyPort = legacyAuditPort): AuditRouterDeps {
  return {
    listAudits: (query) => port.list(query)
  };
}

/* ---------------------------------- caja ----------------------------------- */

export type CajaLegacyPort = Pick<
  typeof cashSessionsService,
  "current" | "list" | "open" | "close" | "recordMovement"
>;

export const legacyCajaPort: CajaLegacyPort = {
  current: () => cashSessionsService.current(),
  list: () => cashSessionsService.list(),
  open: (input) => cashSessionsService.open(input),
  close: (id, countedAmount) => cashSessionsService.close(id, countedAmount),
  recordMovement: (id, input, actor) => cashSessionsService.recordMovement(id, input, actor)
};

export function makeCajaDeps(port: CajaLegacyPort = legacyCajaPort): CajaRouterDeps {
  return {
    current: () => port.current(),
    list: () => port.list(),
    open: (input) => port.open(input),
    close: (id, countedAmount) => port.close(id, countedAmount),
    recordMovement: (id, input, actor) => port.recordMovement(id, input, actor)
  };
}

/* --------------------------------- catalog --------------------------------- */

export type CatalogLegacyPort = Pick<
  typeof catalogService,
  "listPublished" | "getPublishedById" | "listSlides"
>;

export const legacyCatalogPort: CatalogLegacyPort = {
  listPublished: (options) => catalogService.listPublished(options),
  getPublishedById: (id) => catalogService.getPublishedById(id),
  listSlides: () => catalogService.listSlides()
};

export function makeCatalogDeps(port: CatalogLegacyPort = legacyCatalogPort): CatalogRouterDeps {
  return {
    listPublished: (query) => port.listPublished(query),
    getPublishedById: (id) => port.getPublishedById(id),
    listSlides: () => port.listSlides()
  };
}

/* -------------------------------- categories ------------------------------- */

export type CategoriesLegacyPort = Pick<
  typeof categoriesService,
  "list" | "getById" | "create" | "update"
>;

export const legacyCategoriesPort: CategoriesLegacyPort = {
  list: (filter) => categoriesService.list(filter),
  getById: (id) => categoriesService.getById(id),
  create: (input) => categoriesService.create(input),
  update: (id, input) => categoriesService.update(id, input)
};

export function makeCategoriesDeps(
  port: CategoriesLegacyPort = legacyCategoriesPort
): CategoryRouterHandlers {
  return {
    list: (filter) => port.list(filter),
    getById: (id) => port.getById(id),
    create: (input) => port.create(input),
    update: (id, patch) => port.update(id, patch)
  };
}

/* --------------------------------- clients --------------------------------- */

export type ClientsLegacyPort = Pick<typeof clientsService, "list" | "getById" | "create" | "update">;

export const legacyClientsPort: ClientsLegacyPort = {
  list: (filter) => clientsService.list(filter),
  getById: (id) => clientsService.getById(id),
  create: (input) => clientsService.create(input),
  update: (id, input) => clientsService.update(id, input)
};

export function makeClientsDeps(port: ClientsLegacyPort = legacyClientsPort): ClientRouterHandlers {
  return {
    list: (filter) => port.list(filter),
    getById: (id) => port.getById(id),
    create: (input) => port.create(input),
    update: (id, patch) => port.update(id, patch)
  };
}

/* --------------------------------- finance --------------------------------- */

export type FinanceLegacyPort = {
  getFinancialState: typeof financialStateService.get;
  upsertFinancialState: typeof financialStateService.upsert;
  getInvoiceSettings: typeof invoiceSettingsService.get;
  saveInvoiceSettings: typeof invoiceSettingsService.save;
  listStockMovements: typeof stockMovementsService.list;
  recordStockMovement: typeof stockMovementsService.record;
};

export const legacyFinancePort: FinanceLegacyPort = {
  getFinancialState: () => financialStateService.get(),
  upsertFinancialState: (patch) => financialStateService.upsert(patch),
  getInvoiceSettings: () => invoiceSettingsService.get(),
  saveInvoiceSettings: (doc) => invoiceSettingsService.save(doc),
  listStockMovements: (filter) => stockMovementsService.list(filter),
  recordStockMovement: (input, actor) => stockMovementsService.record(input, actor)
};

export function makeFinanceDeps(port: FinanceLegacyPort = legacyFinancePort): FinanceRouterDeps {
  return {
    getFinancialState: () => port.getFinancialState(),
    // Validated JSON both sides (strict zod edge → JsonValue service): the
    // cast only reconciles the nominal `unknown` vs `JsonValue` spelling.
    upsertFinancialState: (patch) =>
      port.upsertFinancialState(patch as Parameters<typeof financialStateService.upsert>[0]),
    getInvoiceSettings: () => port.getInvoiceSettings(),
    saveInvoiceSettings: (doc) => port.saveInvoiceSettings(doc),
    listStockMovements: (filter) => port.listStockMovements(filter),
    recordStockMovement: (input, actor) => port.recordStockMovement(input, actor)
  };
}

/* -------------------------------- orders-read ------------------------------- */

export type OrdersReadLegacyPort = Pick<typeof ordersService, "listMine" | "getMine" | "cancel">;

export const legacyOrdersReadPort: OrdersReadLegacyPort = {
  listMine: (userId, options) => ordersService.listMine(userId, options),
  getMine: (userId, orderId) => ordersService.getMine(userId, orderId),
  cancel: (userId, orderId) => ordersService.cancel(userId, orderId)
};

export function makeOrdersReadDeps(
  port: OrdersReadLegacyPort = legacyOrdersReadPort
): OrdersReadRouterDeps {
  return {
    listMine: (userId, query) => port.listMine(userId, query),
    getMine: (userId, orderId) => port.getMine(userId, orderId),
    // Legacy answers `{ order }`: the thin router shapes the same envelope
    // from this wrapper, so the served bytes stay identical.
    cancel: async (userId, orderId) => ({ order: await port.cancel(userId, orderId) })
  };
}

/* ----------------------------------- pago ----------------------------------- */

export type PagoLegacyPort = Pick<typeof paymentsService, "createPreferenceForOrder" | "handlePaymentNotification">;

export const legacyPagoPort: PagoLegacyPort = {
  createPreferenceForOrder: (userId, orderId) => paymentsService.createPreferenceForOrder(userId, orderId),
  handlePaymentNotification: (input) => paymentsService.handlePaymentNotification(input)
};

export function makePagoDeps(port: PagoLegacyPort = legacyPagoPort): PagoRouterDeps {
  return {
    createPreference: (input) => port.createPreferenceForOrder(input.userId, input.orderId),
    handleWebhook: (input) => port.handlePaymentNotification(input)
  };
}

/* --------------------------------- purchases -------------------------------- */

export type PurchasesLegacyPort = Pick<typeof purchasesService, "list" | "getById" | "create" | "update">;

export const legacyPurchasesPort: PurchasesLegacyPort = {
  list: (filter) => purchasesService.list(filter),
  getById: (id) => purchasesService.getById(id),
  create: (input, actor) => purchasesService.create(input, actor),
  update: (id, input) => purchasesService.update(id, input)
};

export function makePurchasesDeps(
  port: PurchasesLegacyPort = legacyPurchasesPort
): PurchaseRouterHandlers {
  return {
    list: (filter) => port.list(filter),
    getById: (id) => port.getById(id),
    // Same validated-JSON cast as finance: nominal `unknown` vs `JsonValue`.
    create: (input, actor) => port.create(input as Parameters<typeof purchasesService.create>[0], actor),
    update: (id, patch) => port.update(id, patch as Parameters<typeof purchasesService.update>[1])
  };
}

/* ---------------------------------- receipt --------------------------------- */

export type ReceiptLegacyPort = Pick<
  typeof receiptsService,
  "nextNumber" | "list" | "create" | "getById" | "annul" | "transitionRepairStatus"
>;

export const legacyReceiptPort: ReceiptLegacyPort = {
  nextNumber: () => receiptsService.nextNumber(),
  list: (filter) => receiptsService.list(filter),
  create: (input) => receiptsService.create(input),
  getById: (id) => receiptsService.getById(id),
  annul: (id, actor) => receiptsService.annul(id, actor),
  transitionRepairStatus: (id, status, actor) => receiptsService.transitionRepairStatus(id, status, actor)
};

export function makeReceiptDeps(port: ReceiptLegacyPort = legacyReceiptPort): ReceiptRouterDeps {
  return {
    nextNumber: () => port.nextNumber(),
    listReceipts: (filter) => port.list(filter),
    // Same validated-JSON cast as finance: nominal `unknown` vs `JsonValue`.
    createReceipt: (input) => port.create(input as Parameters<typeof receiptsService.create>[0]),
    getReceiptById: (id) => port.getById(id),
    annulReceipt: (id, actor) => port.annul(id, actor),
    transitionRepairStatus: (id, status, actor) => port.transitionRepairStatus(id, status, actor),
    getInvoicePdf: makeGetInvoicePdf()
  };
}

/* ---------------------------------- reports --------------------------------- */

export type ReportsLegacyPort = Pick<
  typeof reportsService,
  "salesSummary" | "stockValuation" | "cashSummary" | "topProducts" | "repairsByStatus"
>;

export const legacyReportsPort: ReportsLegacyPort = {
  salesSummary: (input) => reportsService.salesSummary(input),
  stockValuation: () => reportsService.stockValuation(),
  cashSummary: (input) => reportsService.cashSummary(input),
  topProducts: (input) => reportsService.topProducts(input),
  repairsByStatus: () => reportsService.repairsByStatus()
};

export function makeReportsDeps(port: ReportsLegacyPort = legacyReportsPort): ReportsRouterDeps {
  return {
    // Pick the legacy range keys explicitly: the thin DTO carries exactly
    // these, and anything extra must never leak into the service call.
    salesSummary: (range) => port.salesSummary({ from: range.from, to: range.to }),
    stockValuation: () => port.stockValuation(),
    cashSummary: (range) => port.cashSummary({ from: range.from, to: range.to }),
    topProducts: (query) => port.topProducts({ from: query.from, to: query.to, limit: query.limit }),
    repairsByStatus: () => port.repairsByStatus()
  };
}

/* ---------------------------------- service --------------------------------- */

export type ServiceLegacyPort = Pick<typeof servicesService, "list" | "getById" | "create" | "update">;

export const legacyServicePort: ServiceLegacyPort = {
  list: (filter) => servicesService.list(filter),
  getById: (id) => servicesService.getById(id),
  create: (input) => servicesService.create(input),
  update: (id, input) => servicesService.update(id, input)
};

export function makeServiceDeps(port: ServiceLegacyPort = legacyServicePort): ServiceRouterHandlers {
  return {
    list: (filter) => port.list(filter),
    getById: (id) => port.getById(id),
    // Same validated-JSON cast as finance: nominal `ServiceData` vs `JsonValue`.
    create: (input) => port.create(input as Parameters<typeof servicesService.create>[0]),
    // Domain-only routes stay unmounted at cutover (`legacyOnly`): calling
    // them is a wiring bug, so fail loud instead of touching the catalog.
    rename: () => Promise.reject(new NotFoundError("Servicio no encontrado")),
    reprice: () => Promise.reject(new NotFoundError("Servicio no encontrado")),
    update: (input) =>
      port.update(input.serviceId, input.patch as Parameters<typeof servicesService.update>[1]),
    activate: () => Promise.reject(new NotFoundError("Servicio no encontrado")),
    deactivate: () => Promise.reject(new NotFoundError("Servicio no encontrado"))
  };
}

/* ---------------------------------- upload ---------------------------------- */

export type UploadLegacyPort = Pick<typeof uploadsService, "storeImage" | "load">;

export const legacyUploadPort: UploadLegacyPort = {
  storeImage: (body, contentType, storage, actor) => uploadsService.storeImage(body, contentType, storage, actor),
  load: (filename, storage) => uploadsService.load(filename, storage)
};

export function makeUploadDeps(
  port: UploadLegacyPort = legacyUploadPort,
  maxUploadBytes: number = webshopConfig().maxUploadBytes
): UploadRouterDeps {
  return {
    maxUploadBytes,
    // The thin router buffers the raw body and hands over bytes; the legacy
    // service streams them back from an in-memory source — same bytes, same
    // cap policy (already enforced at the edge), same stored file.
    store: async (input) => {
      const stored = await port.storeImage(
        Readable.from(input.bytes),
        input.contentType,
        undefined,
        input.actor
      );
      return { url: stored.url };
    },
    load: (filename) => port.load(filename)
  };
}

/* ----------------------------------- venta ----------------------------------- */

export type VentaLegacyPort = {
  runSalesBatch: typeof salesBatchService.run;
  createOrder: typeof ordersService.create;
  createCheckoutSession: typeof checkoutService.create;
};

export const legacyVentaPort: VentaLegacyPort = {
  runSalesBatch: (input, actor) => salesBatchService.run(input, actor),
  createOrder: (userId, input) => ordersService.create(userId, input),
  createCheckoutSession: (userId, orderId, paymentMethodId) =>
    checkoutService.create(userId, orderId, paymentMethodId)
};

export interface VentaCutoverOptions {
  uuid?: Uuid;
  checkoutBaseUrl?: string;
}

/**
 * Shapes the legacy batch result for the thin router WITHOUT touching the
 * served bytes: `receipt` keeps the legacy row's own enumerable properties
 * (exactly what `res.json` serializes), while `total`/`lines` ride as
 * non-enumerable properties — the router reads them, JSON skips them.
 */
function adaptSalesBatchResult(result: SalesBatchResult): ConfirmSalesBatchResult {
  const venta = { ...result.receipt };
  Object.defineProperties(venta, {
    total: { value: { amount: result.total }, enumerable: false },
    lines: {
      value: result.items.map((item) => ({
        ...item,
        unitPrice: { amount: item.unitPrice }
      })),
      enumerable: false
    }
  });
  return { venta: venta as unknown as Venta, products: [] };
}

export function makeVentaDeps(
  port: VentaLegacyPort = legacyVentaPort,
  options: VentaCutoverOptions = {}
): VentaRouterDeps {
  const uuid = options.uuid ?? new SystemUuid();
  const checkoutBaseUrl = options.checkoutBaseUrl ?? webshopConfig().checkoutBaseUrl;
  return {
    confirmBatch: async (input: ConfirmSalesBatchInput, actor: VentaAuditActor) => {
      // Unreachable through the validated edge (`clientId` is required by
      // the DTO): fail closed instead of persisting a client-less receipt.
      if (input.clientId === undefined || input.clientId === null) {
        throw new ValidationError("clientId requerido", { field: "clientId" });
      }
      const legacy = await port.runSalesBatch(
        {
          clientName: input.clientName,
          clientId: input.clientId,
          clientPhone: input.clientPhone ?? undefined,
          deviceBrand: input.deviceBrand ?? undefined,
          deviceModel: input.deviceModel ?? undefined,
          deviceColor: input.deviceColor ?? undefined,
          imeiSerial: input.imeiSerial ?? undefined,
          reportedIssue: input.reportedIssue ?? undefined,
          services: input.services === null || input.services === undefined ? undefined : [...input.services],
          items: input.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
          payments: (input.payments ?? []).map((payment) => ({
            method: payment.method,
            amount: payment.amount
          }))
        },
        actor
      );
      return adaptSalesBatchResult(legacy);
    },
    // The edge-generated `orderId` is intentionally dropped: like the legacy
    // route, the database owns order identity server-side.
    createOrder: async (input: CreateOrderInput) => {
      const order = await port.createOrder(input.userId, {
        customer: input.customer,
        email: input.email ?? null,
        phone: input.phone ?? null,
        ci: input.ci ?? null,
        rut: input.rut ?? null,
        address: input.address ?? null,
        shipping: input.shipping ?? null,
        comments: input.comments ?? null,
        items: input.items.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      });
      return order as unknown as OrderResult;
    },
    mintCheckoutSession: async (input: MintCheckoutSessionInput) => {
      // The wiring token guard guarantees an identity (legacy 401
      // otherwise): fail with the same uniform 401 when it is missing.
      if (input.userId === undefined) throw new AuthError("AUTHENTICATION_REQUIRED");
      const session = await port.createCheckoutSession(
        input.userId,
        input.orderId,
        input.paymentMethodId ?? null
      );
      const venta = {
        id: session.orderId,
        checkoutSession: { id: session.id, status: session.status, expiresAt: session.expiresAt }
      } as unknown as Venta;
      return { venta, pago: null } as unknown as OrderResult;
    },
    uuid,
    checkoutBaseUrl
  };
}
