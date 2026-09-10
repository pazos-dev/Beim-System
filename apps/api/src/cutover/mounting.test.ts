import express from "express";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { ReceiptRouterDeps } from "../interface/http/receipt/router.js";
import type { UserLegacyPort } from "./user-adapters.js";
import type { OrdersReadLegacyPort, UploadLegacyPort, VentaLegacyPort } from "./legacy-ports.js";

// Same DB-free convention as src/app.test.ts: the cutover factories bind the
// legacy services (shared pool at import time), so point it at the test
// database BEFORE the dynamic imports below. Guards that verify real Bearer
// tokens (tokenGuard) are only exercised on their no-token path here — the
// positive paths run in the full API suite against Postgres.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { interfaceErrorHandler } = await import("../interface/http/errorHandler.js");
const {
  adminGuard,
  createCutoverCategoriesRouter,
  createCutoverClientsRouter,
  createCutoverGestionRouter,
  createCutoverOrdersReadRouter,
  createCutoverPagoRouter,
  createCutoverReceiptRouter,
  createCutoverServiceRouter,
  createCutoverUploadRouter,
  createCutoverUserRouter,
  createCutoverVentaRouter,
  createCutoverWebshopRouter,
  onlyMethods,
  operatorGuard
} = await import("./mounting.js");

const OPERATOR = { userId: "op-1", roles: ["vendedor"] };
const ADMIN = { userId: "a1", roles: ["administrador_principal"] };
const CLIENTE = { userId: "c1", roles: ["cliente"] };

function fakeUserPort(): UserLegacyPort {
  return {
    auth: {
      login: vi.fn(async () => ({ token: "t" })),
      register: vi.fn(async () => null),
      gestionAccess: vi.fn(async () => ({ token: "t" })),
      gestionLogin: vi.fn(async () => ({ token: "t" })),
      logout: vi.fn(async () => undefined)
    },
    users: {
      listUsers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
      approveUser: vi.fn(async () => ({})),
      setUserRole: vi.fn(async () => ({})),
      disableUser: vi.fn(async () => ({}))
    },
    gestionUsers: {
      listGestionUsers: vi.fn(async () => ({ items: [] })),
      createGestionUser: vi.fn(async () => null),
      setGestionUserRole: vi.fn(async () => ({})),
      setGestionUserActive: vi.fn(async () => ({})),
      resetGestionUserPassword: vi.fn(async () => ({}))
    }
  } as unknown as UserLegacyPort;
}

function fakeReceiptDeps(): ReceiptRouterDeps {
  return {
    nextNumber: vi.fn(async () => 7),
    listReceipts: vi.fn(async () => ({ items: [] })),
    createReceipt: vi.fn(async () => ({})),
    getReceiptById: vi.fn(async () => ({})),
    annulReceipt: vi.fn(async () => ({})),
    transitionRepairStatus: vi.fn(async () => ({})),
    getInvoicePdf: vi.fn(async () => ({ pdf: new Uint8Array([1]), receiptNumber: 7 }))
  };
}

const LEGACY_RECEIPT = {
  id: "r-1",
  receiptNumber: 7,
  clientName: "Cliente",
  clientId: "cli-1",
  price: "200",
  repairStatus: "Entregado",
  quoteStatus: "Aceptado",
  quoteTotal: 200,
  paymentStatus: "Pagado",
  payload: { sale: true }
};

function fakeVentaPort(): VentaLegacyPort {
  return {
    runSalesBatch: vi.fn(async () => ({
      receipt: LEGACY_RECEIPT,
      items: [{ productId: "p-1", quantity: 1, unitPrice: 200 }],
      total: 200
    })),
    createOrder: vi.fn(async () => ({ id: "o-1" })),
    createCheckoutSession: vi.fn(async () => ({
      id: "sess-1",
      url: "https://checkout.test/checkout/sess-1",
      status: "pending",
      orderId: "o-1",
      expiresAt: new Date("2026-04-01T10:30:00.000Z")
    }))
  } as unknown as VentaLegacyPort;
}

function fakeOrdersReadPort(): OrdersReadLegacyPort {
  return {
    listMine: vi.fn(async () => ({ items: [] })),
    getMine: vi.fn(async () => null),
    cancel: vi.fn(async () => ({ order: { id: "o-1" }, items: [] }))
  } as unknown as OrdersReadLegacyPort;
}

function fakeUploadPort(): UploadLegacyPort {
  return {
    storeImage: vi.fn(async () => ({ url: "/api/v1/uploads/f.png", filename: "f.png", bytes: 3 })),
    load: vi.fn(async () => null)
  } as unknown as UploadLegacyPort;
}

/** Test app: identity injection + wrapper under /api/v1 + 404 fall-through. */
function wiredApp(
  identity: { userId: string; roles: string[] } | null,
  router: express.Router
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", router);
  app.use((_req, res) => res.status(404).json({ ok: false }));
  app.use(interfaceErrorHandler);
  return app;
}

describe("onlyMethods (method-scoped wiring guards)", () => {
  it("runs the guards for served methods and skips anything else", async () => {
    const calls: string[] = [];
    const guard = ((req: Request, _res: Response, next: NextFunction) => {
      void req;
      calls.push("guard");
      next();
    }) as unknown as Parameters<typeof onlyMethods>[1];
    const app = express();
    app.use("/scoped", onlyMethods(["POST"], guard));
    app.use("/scoped", (_req, res) => res.json({ ok: true }));
    await request(app).get("/scoped").expect(200);
    expect(calls).toEqual([]);
    await request(app).post("/scoped").expect(200);
    expect(calls).toEqual(["guard"]);
  });

  it("short-circuits the chain on guard errors in order", async () => {
    const order: string[] = [];
    const failing = ((_req: Request, _res: Response, next: NextFunction) => {
      order.push("first");
      next(new Error("nope"));
    }) as unknown as Parameters<typeof onlyMethods>[1];
    const second = ((_req: Request, _res: Response, next: NextFunction) => {
      order.push("second");
      next();
    }) as unknown as Parameters<typeof onlyMethods>[1];
    const app = express();
    app.use("/chain", onlyMethods(["POST"], failing, second));
    app.use("/chain", (_req, res) => res.json({ ok: true }));
    await request(app).post("/chain").expect(500);
    expect(order).toEqual(["first"]);
  });
});

describe("cutover wiring guards (legacy parity)", () => {
  it("wires the user router behind its admin gate (anonymous sees 404)", async () => {
    const router = createCutoverUserRouter(fakeUserPort());
    expect((await request(wiredApp(null, router)).get("/api/v1/users")).status).toBe(404);
    expect((await request(wiredApp(ADMIN, router)).get("/api/v1/users")).status).toBe(200);
  });

  it("guards the guard-less receipt router with the operator gate at wiring", async () => {
    const { createReceiptRouter } = await import("../interface/http/receipt/router.js");
    const withFakes = createCutoverReceiptRouter(undefined as never, createReceiptRouter(fakeReceiptDeps()));
    expect((await request(wiredApp(null, withFakes)).get("/api/v1/receipts/next-number")).status).toBe(404);
    const operator = await request(wiredApp(OPERATOR, withFakes)).get("/api/v1/receipts/next-number");
    expect(operator.status).toBe(200);
    expect(operator.body).toEqual({ ok: true, data: { receiptNumber: 7 } });
  });

  it("exposes the admin gate for legacy writes (services POST/PUT mount behind it)", async () => {
    const app = (identity: { userId: string; roles: string[] } | null): express.Express => {
      const probe = express();
      probe.use(express.json());
      probe.use((req, _res, next) => {
        if (identity !== null) req.identity = identity;
        next();
      });
      probe.post("/services", adminGuard, (_req, res) => res.json({ ok: true }));
      probe.use(interfaceErrorHandler);
      return probe;
    };
    expect((await request(app(null)).post("/services")).status).toBe(404);
    expect((await request(app(OPERATOR)).post("/services")).status).toBe(403);
    expect((await request(app(ADMIN)).post("/services")).status).toBe(200);
  });

  it("serves sales-batch for operators with the legacy envelope, 404 otherwise", async () => {
    const router = createCutoverVentaRouter(fakeVentaPort(), {
      uuid: { generate: () => "gen-1" },
      checkoutBaseUrl: "https://checkout.test"
    });
    const body = {
      clientName: "Cliente",
      clientId: "cli-1",
      items: [{ productId: "p-1", quantity: 1 }],
      payments: [{ method: "Efectivo", amount: 200 }]
    };
    expect((await request(wiredApp(null, router)).post("/api/v1/sales-batch").send(body)).status).toBe(404);
    const res = await request(wiredApp(OPERATOR, router)).post("/api/v1/sales-batch").send(body);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ok: true,
      data: {
        receipt: JSON.parse(JSON.stringify(LEGACY_RECEIPT)),
        items: [{ productId: "p-1", quantity: 1, unitPrice: 200 }],
        total: 200
      }
    });
  });

  it("lets unserved methods fall through instead of guarding them", async () => {
    const router = createCutoverVentaRouter(fakeVentaPort());
    // GET /sales-batch never existed: operator identity still sees the
    // fall-through 404, never a guard verdict.
    expect((await request(wiredApp(OPERATOR, router)).get("/api/v1/sales-batch")).status).toBe(404);
    expect((await request(wiredApp(null, router)).get("/api/v1/sales-batch")).status).toBe(404);
  });

  it("answers 401 on token paths without a Bearer token (never a hint)", async () => {
    const venta = createCutoverVentaRouter(fakeVentaPort());
    expect((await request(wiredApp(null, venta)).post("/api/v1/orders").send({})).status).toBe(401);
    const reads = createCutoverOrdersReadRouter(fakeOrdersReadPort());
    expect((await request(wiredApp(OPERATOR, reads)).get("/api/v1/orders")).status).toBe(401);
    const upload = createCutoverUploadRouter(fakeUploadPort(), 1024);
    expect((await request(wiredApp(ADMIN, upload)).post("/api/v1/uploads/product-image")).status).toBe(401);
  });

  it("keeps upload serving public with the frozen 404 contract", async () => {
    const router = createCutoverUploadRouter(fakeUploadPort(), 1024);
    const res = await request(wiredApp(null, router)).get("/api/v1/uploads/nope.png");
    expect(res.status).toBe(404);
  });

  it("splits category reads (operator) from writes (admin)", async () => {
    const { makeCategoryRouter } = await import("../interface/http/categories/router.js");
    const handlers = {
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: "c-1" })),
      update: vi.fn(async () => ({}))
    };
    const router = createCutoverCategoriesRouter(undefined as never, makeCategoryRouter(handlers));
    expect((await request(wiredApp(null, router)).get("/api/v1/")).status).toBe(404);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.identity = OPERATOR;
      next();
    });
    app.use("/api/v1/categories", router);
    app.use((_req, res) => res.status(404).json({ ok: false }));
    app.use(interfaceErrorHandler);
    expect((await request(app).get("/api/v1/categories")).status).toBe(200);
    expect((await request(app).post("/api/v1/categories").send({ id: "c-1", name: "N", code: "C" })).status).toBe(
      403
    );
  });

  it("drops the domain-only service routes at wiring (legacyOnly)", async () => {
    const router = createCutoverServiceRouter();
    const res = await request(wiredApp(ADMIN, router)).patch("/api/v1/services/x/rename").send({ name: "Y" });
    expect(res.status).toBe(404);
  });

  it("builds both aggregates with the webshop surface mounted first", async () => {
    const webshop = createCutoverWebshopRouter();
    const gestion = createCutoverGestionRouter();
    expect(webshop).toBeDefined();
    expect(gestion).toBeDefined();
    // The pago thin router mounts without a wrapper (401-inside, budgets
    // inside): the webhook stays reachable without auth.
    const pago = createCutoverPagoRouter({
      createPreferenceForOrder: vi.fn(),
      handlePaymentNotification: vi.fn(async () => ({ outcome: "ignored" as const }))
    } as unknown as Parameters<typeof createCutoverPagoRouter>[0]);
    const res = await request(wiredApp(null, pago))
      .post("/api/v1/webhooks/mercadopago")
      .send({ id: "n", type: "payment", data: { id: "d" } });
    expect(res.status).toBe(403);
  });

  it("keeps the operator and admin gates fail-closed without identity", async () => {
    const probe = express();
    probe.use(express.json());
    probe.get("/op", operatorGuard, (_req, res) => res.json({ ok: true }));
    probe.get("/ad", adminGuard, (_req, res) => res.json({ ok: true }));
    probe.use(interfaceErrorHandler);
    expect((await request(probe).get("/op")).status).toBe(404);
    expect((await request(probe).get("/ad")).status).toBe(404);
    expect((await request(probe).get("/op").set("Authorization", "Bearer x")).status).toBe(404);
  });
});

describe("cutover clients aggregate spot check", () => {
  it("serves the operator-gated clients surface", async () => {
    const { makeClientRouter } = await import("../interface/http/clients/router.js");
    const handlers = {
      list: vi.fn(async () => ({ items: [] })),
      getById: vi.fn(async () => null),
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({}))
    };
    const router = createCutoverClientsRouter(undefined as never, makeClientRouter(handlers));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.identity = CLIENTE;
      next();
    });
    app.use("/api/v1/clients", router);
    app.use((_req, res) => res.status(404).json({ ok: false }));
    app.use(interfaceErrorHandler);
    // Cliente is not an operator: the wiring gate answers 403, like legacy.
    expect((await request(app).get("/api/v1/clients")).status).toBe(403);
  });
});
