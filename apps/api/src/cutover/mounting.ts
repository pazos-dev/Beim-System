import { Router, type RequestHandler } from "express";
import { requireRole } from "../interface/http/edge/auth.js";
import { idempotency } from "../interface/http/edge/idempotency.js";
import { rateLimit } from "../interface/http/edge/rate-limit.js";
import { createAuditRouter } from "../interface/http/audit/router.js";
import { createCajaRouter } from "../interface/http/caja/router.js";
import { createCatalogRouter } from "../interface/http/catalog/router.js";
import { makeCategoryRouter } from "../interface/http/categories/router.js";
import { makeClientRouter } from "../interface/http/clients/router.js";
import { createFinanceRouter } from "../interface/http/finance/router.js";
import { createOrdersReadRouter } from "../interface/http/orders-read/router.js";
import { createPagoRouter } from "../interface/http/pago/router.js";
import { makePurchaseRouter } from "../interface/http/purchases/router.js";
import { createReceiptRouter } from "../interface/http/receipt/router.js";
import { createReportsRouter } from "../interface/http/reports/router.js";
import { makeServiceRouter } from "../interface/http/service/router.js";
import { createUploadRouter } from "../interface/http/upload/router.js";
import { createUserRouter } from "../interface/http/user/router.js";
import { createVentaRouter } from "../interface/http/venta/router.js";
import { requireWebshopToken } from "../modules/webshop/webshop-token.js";
import {
  legacyAuditPort,
  legacyCajaPort,
  legacyCatalogPort,
  legacyCategoriesPort,
  legacyClientsPort,
  legacyFinancePort,
  legacyOrdersReadPort,
  legacyPagoPort,
  legacyPurchasesPort,
  legacyReceiptPort,
  legacyReportsPort,
  legacyServicePort,
  legacyUploadPort,
  legacyVentaPort,
  makeAuditDeps,
  makeCajaDeps,
  makeCatalogDeps,
  makeCategoriesDeps,
  makeClientsDeps,
  makeFinanceDeps,
  makeOrdersReadDeps,
  makePagoDeps,
  makePurchasesDeps,
  makeReceiptDeps,
  makeReportsDeps,
  makeServiceDeps,
  makeUploadDeps,
  makeVentaDeps,
  type AuditLegacyPort,
  type CajaLegacyPort,
  type CatalogLegacyPort,
  type CategoriesLegacyPort,
  type ClientsLegacyPort,
  type FinanceLegacyPort,
  type OrdersReadLegacyPort,
  type PagoLegacyPort,
  type PurchasesLegacyPort,
  type ReceiptLegacyPort,
  type ReportsLegacyPort,
  type ServiceLegacyPort,
  type UploadLegacyPort,
  type VentaCutoverOptions,
  type VentaLegacyPort
} from "./legacy-ports.js";
import { legacyUserPort, makeUserRouterDeps, type UserLegacyPort } from "./user-adapters.js";

/**
 * Cutover mounting (change `clean-arch-interface`, F8b4 SWAP).
 *
 * Builds the thin routers wired to the real legacy-service deps and mounts
 * them under `/api/v1` with the exact guards, limiters and idempotency
 * scopes the legacy `gestion`/`webshop` routers carried — ONLY the 68
 * legacy-equivalent routes. Domain-only thin routes (`product/*`, service
 * `rename`/`reprice`/`activate`/`deactivate`) stay unmounted: the served
 * contract (`/openapi.json`, envelope matrix) stays byte-identical.
 *
 * Guard placement rule: a wrapper applies a guard ONLY on the (method, path)
 * pairs the legacy route served (`onlyMethods`). Anything else falls through
 * to the catch-all 404, exactly like the legacy routers. Guards without an
 * identity answer 404 (NOT_FOUND_OR_FORBIDDEN edge policy), never a hint —
 * the same envelope the catch-all renders.
 */

/** Operator roles mirrored from the legacy `gestion` router. */
export const OPERATOR_ROLES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal",
  "admin",
  "superadmin"
];

/** Wiring-time operator gate (NOT_FOUND_OR_FORBIDDEN edge policy). */
export const operatorGuard = requireRole(...OPERATOR_ROLES);

/** Admin roles mirrored from the legacy routers (`ADMIN_ROLES`). */
export const ADMIN_ROLES = ["administrador", "administrador_principal", "admin", "superadmin"];

/**
 * Wiring-time admin gate for legacy writes (categories/purchases/service
 * POST/PUT mount behind it at cutover; the thin routers carry no role gates
 * by design). Same NOT_FOUND_OR_FORBIDDEN edge policy as operators.
 */
export const adminGuard = requireRole(...ADMIN_ROLES);

/** Webshop session gate (uniform 401, webshop realm only — legacy parity). */
export const tokenGuard = requireWebshopToken();

// Same budgets as legacy: the gestion counter-sale bucket and the webshop
// mutating bucket (both keyed by IP + path, bypassed in NODE_ENV=test like
// before). The auth/IPN buckets live inside the user/pago thin routers.
const gestionWriteLimiter = rateLimit(60_000, 60);
const webshopWriteLimiter = rateLimit(60_000, 60);

/**
 * Runs the guards only for the served HTTP methods; every other method
 * falls through to the catch-all 404, exactly like the legacy routers
 * (whose guards sat behind Express method matching).
 */
export function onlyMethods(methods: string[], ...guards: RequestHandler[]): RequestHandler {
  return (req, res, next) => {
    if (!methods.includes(req.method)) {
      next();
      return;
    }
    const [first, ...rest] = guards;
    if (first === undefined) {
      next();
      return;
    }
    first(req, res, function step(err?: unknown): void {
      if (err !== undefined) {
        next(err);
        return;
      }
      const guard = rest.shift();
      if (guard === undefined) {
        next();
        return;
      }
      guard(req, res, step);
    });
  };
}

/** GET → read guard, anything else → write guard (legacy per-route split). */
function methodScoped(readGuard: RequestHandler, writeGuard: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET") readGuard(req, res, next);
    else writeGuard(req, res, next);
  };
}

/**
 * Runs the guards only on the exact legacy path (`:params` match one
 * segment) and the served verbs: Express `use()` scoping is prefix-based,
 * so a bare `/orders` prefix would also swallow `/orders/:id/cancel` and
 * `/orders/:id/payment-preference`, which belong to sibling routers with
 * their own guard chains. Anything else falls through untouched (catch-all
 * 404, like the legacy routers).
 */
export function onlyExactPath(path: string, methods: string[], ...guards: RequestHandler[]): RequestHandler {
  const pattern = new RegExp(
    `^${path
      .split("/")
      .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      .join("/")}$`
  );
  return (req, res, next) => {
    if (!methods.includes(req.method) || !pattern.test(req.path)) {
      next();
      return;
    }
    const chain = [...guards];
    const step = (err?: unknown): void => {
      if (err !== undefined) {
        next(err);
        return;
      }
      const guard = chain.shift();
      if (guard === undefined) {
        next();
        return;
      }
      guard(req, res, step);
    };
    step();
  };
}

/** Every legacy-service port the cutover can inject (fakes in tests). */
export interface CutoverPorts {
  userPort?: UserLegacyPort;
  auditPort?: AuditLegacyPort;
  cajaPort?: CajaLegacyPort;
  catalogPort?: CatalogLegacyPort;
  categoriesPort?: CategoriesLegacyPort;
  clientsPort?: ClientsLegacyPort;
  financePort?: FinanceLegacyPort;
  ordersReadPort?: OrdersReadLegacyPort;
  pagoPort?: PagoLegacyPort;
  purchasesPort?: PurchasesLegacyPort;
  receiptPort?: ReceiptLegacyPort;
  reportsPort?: ReportsLegacyPort;
  servicePort?: ServiceLegacyPort;
  uploadPort?: UploadLegacyPort;
  ventaPort?: VentaLegacyPort;
  ventaOptions?: VentaCutoverOptions;
  maxUploadBytes?: number;
}

/* ------------------------- thin router constructors ------------------------ */

export function createCutoverUserRouter(port: UserLegacyPort = legacyUserPort): Router {
  return createUserRouter(makeUserRouterDeps(port));
}

export function createCutoverReceiptRouter(
  port: ReceiptLegacyPort = legacyReceiptPort,
  inner: Router = createReceiptRouter(makeReceiptDeps(port))
): Router {
  const router: Router = Router();
  router.use(operatorGuard, inner);
  return router;
}

export function createCutoverVentaRouter(
  port: VentaLegacyPort = legacyVentaPort,
  options: VentaCutoverOptions = {},
  inner: Router = createVentaRouter(makeVentaDeps(port, options))
): Router {
  const router: Router = Router();
  // Counter sale: operator + sale bucket + sale idempotency scope.
  router.use(
    onlyExactPath("/sales-batch", ["POST"], operatorGuard, gestionWriteLimiter, idempotency("sales-batch"))
  );
  // Webshop order + checkout: session token + mutating bucket + scopes.
  router.use(onlyExactPath("/orders", ["POST"], tokenGuard, webshopWriteLimiter, idempotency("orders")));
  router.use(
    onlyExactPath("/checkout-sessions", ["POST"], tokenGuard, webshopWriteLimiter, idempotency("checkout"))
  );
  router.use(inner);
  return router;
}

export function createCutoverOrdersReadRouter(
  port: OrdersReadLegacyPort = legacyOrdersReadPort,
  inner: Router = createOrdersReadRouter(makeOrdersReadDeps(port))
): Router {
  const router: Router = Router();
  // Served pairs only (GET list/get, POST cancel): uniform 401 like the
  // legacy token guard; cancel keeps the mutating bucket. Exact paths so
  // sibling routes (`POST /orders`, payment-preference) pass through.
  router.use(onlyExactPath("/orders", ["GET"], tokenGuard));
  router.use(onlyExactPath("/orders/:id", ["GET"], tokenGuard));
  router.use(onlyExactPath("/orders/:id/cancel", ["POST"], tokenGuard, webshopWriteLimiter));
  router.use(inner);
  return router;
}

export function createCutoverPagoRouter(
  port: PagoLegacyPort = legacyPagoPort,
  inner: Router = createPagoRouter(makePagoDeps(port))
): Router {
  const router: Router = Router();
  // The preference route stays webshop-session-only at the edge (the guard
  // verifies AND attaches the webshop identity, like the legacy route —
  // the thin router alone only sees the global resolver, which also
  // accepts console sessions). The thin router keeps its own 401 + both
  // limiter budgets inside; the webhook stays unauthenticated by design
  // (x-signature, 403 without it).
  router.use(onlyExactPath("/orders/:id/payment-preference", ["POST"], tokenGuard));
  router.use(inner);
  return router;
}

export function createCutoverUploadRouter(
  port: UploadLegacyPort = legacyUploadPort,
  maxUploadBytes?: number,
  inner: Router = createUploadRouter(makeUploadDeps(port, maxUploadBytes))
): Router {
  const router: Router = Router();
  // Admin writes stay webshop-session-only (401 before 403/404, like
  // legacy); serving stays public. Exact path so sibling upload reads and
  // unserved methods fall through to the catch-all.
  router.use(onlyExactPath("/uploads/product-image", ["POST"], tokenGuard));
  router.use(inner);
  return router;
}

export function createCutoverCategoriesRouter(
  port: CategoriesLegacyPort = legacyCategoriesPort,
  inner: Router = makeCategoryRouter(makeCategoriesDeps(port))
): Router {
  const router: Router = Router();
  // Legacy split: reads operator, writes admin.
  router.use(methodScoped(operatorGuard, adminGuard));
  router.use(inner);
  return router;
}

export function createCutoverClientsRouter(
  port: ClientsLegacyPort = legacyClientsPort,
  inner: Router = makeClientRouter(makeClientsDeps(port))
): Router {
  const router: Router = Router();
  router.use(operatorGuard);
  router.use(inner);
  return router;
}

export function createCutoverPurchasesRouter(
  port: PurchasesLegacyPort = legacyPurchasesPort,
  inner: Router = makePurchaseRouter(makePurchasesDeps(port))
): Router {
  const router: Router = Router();
  // Legacy split: reads operator, writes admin.
  router.use(methodScoped(operatorGuard, adminGuard));
  router.use(inner);
  return router;
}

export function createCutoverServiceRouter(
  port: ServiceLegacyPort = legacyServicePort,
  inner: Router = makeServiceRouter(makeServiceDeps(port), { legacyOnly: true })
): Router {
  const router: Router = Router();
  // Legacy split: reads operator, writes admin. `legacyOnly` drops the
  // domain-only routes (rename/reprice/activate/deactivate).
  router.use(methodScoped(operatorGuard, adminGuard));
  router.use(inner);
  return router;
}

/* ------------------------------ aggregates --------------------------------- */

/** Every router in a cutover set, by role (openapi identity map). */
export interface CutoverRouterParts {
  catalog: Router;
  user: Router;
  ventaWiring: Router;
  ventaInner: Router;
  ordersReadWiring: Router;
  ordersReadInner: Router;
  pagoWiring: Router;
  pagoInner: Router;
  uploadWiring: Router;
  uploadInner: Router;
  audit: Router;
  caja: Router;
  finance: Router;
  reports: Router;
  receiptWiring: Router;
  receiptInner: Router;
  categoriesWiring: Router;
  categoriesInner: Router;
  clientsWiring: Router;
  clientsInner: Router;
  purchasesWiring: Router;
  purchasesInner: Router;
  serviceWiring: Router;
  serviceInner: Router;
}

export interface CutoverRouterSet {
  webshop: Router;
  gestion: Router;
  parts: CutoverRouterParts;
}

/**
 * Builds one full cutover set (aggregates + every nested piece). The
 * composition root calls this ONCE at startup and mounts `webshop` FIRST
 * under `/api/v1` (legacy order; paths are disjoint by design), `gestion`
 * SECOND. The relative thin routers (categories/clients/purchases/service
 * register `/` and `/:id`) mount at their legacy subpaths. No top-level
 * construction happens here on purpose: the legacy services reach the
 * shared pool through `config/db.ts` (composition-root cycle), so building
 * at import time would read partially-initialized ports.
 */
export function buildCutoverRouters(ports: CutoverPorts = {}): CutoverRouterSet {
  const catalog = createCatalogRouter(makeCatalogDeps(ports.catalogPort));
  const user = createCutoverUserRouter(ports.userPort);
  const ventaInner = createVentaRouter(makeVentaDeps(ports.ventaPort, ports.ventaOptions));
  const ventaWiring = createCutoverVentaRouter(ports.ventaPort, ports.ventaOptions, ventaInner);
  const ordersReadInner = createOrdersReadRouter(makeOrdersReadDeps(ports.ordersReadPort));
  const ordersReadWiring = createCutoverOrdersReadRouter(ports.ordersReadPort, ordersReadInner);
  const pagoInner = createPagoRouter(makePagoDeps(ports.pagoPort));
  const pagoWiring = createCutoverPagoRouter(ports.pagoPort, pagoInner);
  const uploadInner = createUploadRouter(makeUploadDeps(ports.uploadPort, ports.maxUploadBytes));
  const uploadWiring = createCutoverUploadRouter(ports.uploadPort, ports.maxUploadBytes, uploadInner);

  const webshop: Router = Router();
  webshop.use(catalog);
  webshop.use(user);
  webshop.use(ventaWiring);
  webshop.use(ordersReadWiring);
  webshop.use(pagoWiring);
  webshop.use(uploadWiring);

  const audit = createAuditRouter(makeAuditDeps(ports.auditPort));
  const caja = createCajaRouter(makeCajaDeps(ports.cajaPort));
  const finance = createFinanceRouter(makeFinanceDeps(ports.financePort));
  const reports = createReportsRouter(makeReportsDeps(ports.reportsPort));
  const receiptInner = createReceiptRouter(makeReceiptDeps(ports.receiptPort));
  const receiptWiring = createCutoverReceiptRouter(ports.receiptPort, receiptInner);
  const categoriesInner = makeCategoryRouter(makeCategoriesDeps(ports.categoriesPort));
  const categoriesWiring = createCutoverCategoriesRouter(ports.categoriesPort, categoriesInner);
  const clientsInner = makeClientRouter(makeClientsDeps(ports.clientsPort));
  const clientsWiring = createCutoverClientsRouter(ports.clientsPort, clientsInner);
  const purchasesInner = makePurchaseRouter(makePurchasesDeps(ports.purchasesPort));
  const purchasesWiring = createCutoverPurchasesRouter(ports.purchasesPort, purchasesInner);
  const serviceInner = makeServiceRouter(makeServiceDeps(ports.servicePort), { legacyOnly: true });
  const serviceWiring = createCutoverServiceRouter(ports.servicePort, serviceInner);

  const gestion: Router = Router();
  gestion.use(audit);
  gestion.use(caja);
  gestion.use(finance);
  gestion.use(reports);
  gestion.use(receiptWiring);
  gestion.use("/categories", categoriesWiring);
  gestion.use("/clients", clientsWiring);
  gestion.use("/purchases", purchasesWiring);
  gestion.use("/services", serviceWiring);

  return {
    webshop,
    gestion,
    parts: {
      catalog,
      user,
      ventaWiring,
      ventaInner,
      ordersReadWiring,
      ordersReadInner,
      pagoWiring,
      pagoInner,
      uploadWiring,
      uploadInner,
      audit,
      caja,
      finance,
      reports,
      receiptWiring,
      receiptInner,
      categoriesWiring,
      categoriesInner,
      clientsWiring,
      clientsInner,
      purchasesWiring,
      purchasesInner,
      serviceWiring,
      serviceInner
    }
  };
}
