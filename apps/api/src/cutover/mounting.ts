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
  router.use("/sales-batch", onlyMethods(["POST"], operatorGuard, gestionWriteLimiter, idempotency("sales-batch")));
  // Webshop order + checkout: session token + mutating bucket + scopes.
  router.use("/orders", onlyMethods(["POST"], tokenGuard, webshopWriteLimiter, idempotency("orders")));
  router.use(
    "/checkout-sessions",
    onlyMethods(["POST"], tokenGuard, webshopWriteLimiter, idempotency("checkout"))
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
  // legacy token guard; cancel keeps the mutating bucket.
  router.use("/orders", onlyMethods(["GET", "POST"], tokenGuard));
  router.use("/orders/:id/cancel", onlyMethods(["POST"], webshopWriteLimiter));
  router.use(inner);
  return router;
}

export function createCutoverPagoRouter(port: PagoLegacyPort = legacyPagoPort): Router {
  // No wrapper guards: the thin router answers 401 itself on the preference
  // route and keeps both legacy limiter budgets inside; the webhook stays
  // unauthenticated by design (x-signature, 403 without it).
  return createPagoRouter(makePagoDeps(port));
}

export function createCutoverUploadRouter(
  port: UploadLegacyPort = legacyUploadPort,
  maxUploadBytes?: number,
  inner: Router = createUploadRouter(makeUploadDeps(port, maxUploadBytes))
): Router {
  const router: Router = Router();
  // Admin writes stay webshop-session-only (401 before 403/404, like
  // legacy); serving stays public.
  router.use("/uploads/product-image", onlyMethods(["POST"], tokenGuard));
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

/**
 * Webshop-side cutover router: the public catalog/auth surface plus the
 * token-guarded webshop writes. Mounted FIRST under `/api/v1` (the legacy
 * webshop router mounted before gestion; paths are disjoint by design).
 */
export function createCutoverWebshopRouter(ports: CutoverPorts = {}): Router {
  const router: Router = Router();
  router.use(createCatalogRouter(makeCatalogDeps(ports.catalogPort)));
  router.use(createCutoverUserRouter(ports.userPort));
  router.use(createCutoverVentaRouter(ports.ventaPort, ports.ventaOptions));
  router.use(createCutoverOrdersReadRouter(ports.ordersReadPort));
  router.use(createCutoverPagoRouter(ports.pagoPort));
  router.use(createCutoverUploadRouter(ports.uploadPort, ports.maxUploadBytes));
  return router;
}

/**
 * Gestion-side cutover router: the operator/admin surface. Mounted SECOND
 * under `/api/v1`, mirroring the legacy mount order. The relative thin
 * routers (categories/clients/purchases/service register `/` and `/:id`)
 * mount at their legacy subpaths here.
 */
export function createCutoverGestionRouter(ports: CutoverPorts = {}): Router {
  const router: Router = Router();
  router.use(createAuditRouter(makeAuditDeps(ports.auditPort)));
  router.use(createCajaRouter(makeCajaDeps(ports.cajaPort)));
  router.use(createFinanceRouter(makeFinanceDeps(ports.financePort)));
  router.use(createReportsRouter(makeReportsDeps(ports.reportsPort)));
  router.use(createCutoverReceiptRouter(ports.receiptPort));
  router.use("/categories", createCutoverCategoriesRouter(ports.categoriesPort));
  router.use("/clients", createCutoverClientsRouter(ports.clientsPort));
  router.use("/purchases", createCutoverPurchasesRouter(ports.purchasesPort));
  router.use("/services", createCutoverServiceRouter(ports.servicePort));
  return router;
}

/* --------------------- production singletons (mounted) --------------------- */

/**
 * Shared thin routers (openapi identity map): each wiring singleton below
 * reuses its thin singleton, so the contract test resolves every nested
 * layer by identity. The factories above build fresh pairs for tests; the
 * singletons below are what the composition root mounts.
 */
export const cutoverCatalogRouter = createCatalogRouter(makeCatalogDeps());
export const cutoverUserRouter = createCutoverUserRouter();
export const cutoverVentaInner = createVentaRouter(makeVentaDeps());
export const cutoverOrdersReadInner = createOrdersReadRouter(makeOrdersReadDeps());
export const cutoverPagoRouter = createCutoverPagoRouter();
export const cutoverUploadInner = createUploadRouter(makeUploadDeps());

export const cutoverAuditRouter = createAuditRouter(makeAuditDeps());
export const cutoverCajaRouter = createCajaRouter(makeCajaDeps());
export const cutoverFinanceRouter = createFinanceRouter(makeFinanceDeps());
export const cutoverReportsRouter = createReportsRouter(makeReportsDeps());
export const cutoverReceiptInner = createReceiptRouter(makeReceiptDeps());
export const cutoverCategoriesInner = makeCategoryRouter(makeCategoriesDeps());
export const cutoverClientsInner = makeClientRouter(makeClientsDeps());
export const cutoverPurchasesInner = makePurchaseRouter(makePurchasesDeps());
export const cutoverServiceInner = makeServiceRouter(makeServiceDeps(), { legacyOnly: true });

export const cutoverVentaWiring = createCutoverVentaRouter(legacyVentaPort, {}, cutoverVentaInner);
export const cutoverOrdersReadWiring = createCutoverOrdersReadRouter(legacyOrdersReadPort, cutoverOrdersReadInner);
export const cutoverUploadWiring = createCutoverUploadRouter(legacyUploadPort, undefined, cutoverUploadInner);
export const cutoverReceiptWiring = createCutoverReceiptRouter(legacyReceiptPort, cutoverReceiptInner);
export const cutoverCategoriesWiring = createCutoverCategoriesRouter(legacyCategoriesPort, cutoverCategoriesInner);
export const cutoverClientsWiring = createCutoverClientsRouter(legacyClientsPort, cutoverClientsInner);
export const cutoverPurchasesWiring = createCutoverPurchasesRouter(legacyPurchasesPort, cutoverPurchasesInner);
export const cutoverServiceWiring = createCutoverServiceRouter(legacyServicePort, cutoverServiceInner);

/**
 * Production webshop aggregate: the shared routers above, mounted in the
 * same order the factories use. Mounted FIRST under `/api/v1`.
 */
export const cutoverWebshopRouter: Router = Router();
cutoverWebshopRouter.use(cutoverCatalogRouter);
cutoverWebshopRouter.use(cutoverUserRouter);
cutoverWebshopRouter.use(cutoverVentaWiring);
cutoverWebshopRouter.use(cutoverOrdersReadWiring);
cutoverWebshopRouter.use(cutoverPagoRouter);
cutoverWebshopRouter.use(cutoverUploadWiring);

/**
 * Production gestion aggregate: the shared routers above, mounted in the
 * same order the factories use. Mounted SECOND under `/api/v1`.
 */
export const cutoverGestionRouter: Router = Router();
cutoverGestionRouter.use(cutoverAuditRouter);
cutoverGestionRouter.use(cutoverCajaRouter);
cutoverGestionRouter.use(cutoverFinanceRouter);
cutoverGestionRouter.use(cutoverReportsRouter);
cutoverGestionRouter.use(cutoverReceiptWiring);
cutoverGestionRouter.use("/categories", cutoverCategoriesWiring);
cutoverGestionRouter.use("/clients", cutoverClientsWiring);
cutoverGestionRouter.use("/purchases", cutoverPurchasesWiring);
cutoverGestionRouter.use("/services", cutoverServiceWiring);
