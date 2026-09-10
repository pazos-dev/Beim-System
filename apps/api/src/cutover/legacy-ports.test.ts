import { describe, expect, it, vi } from "vitest";
import type {
  AuditLegacyPort,
  CajaLegacyPort,
  CatalogLegacyPort,
  CategoriesLegacyPort,
  ClientsLegacyPort,
  FinanceLegacyPort,
  OrdersReadLegacyPort,
  PagoLegacyPort,
  PurchasesLegacyPort,
  ReceiptLegacyPort,
  ReportsLegacyPort,
  ServiceLegacyPort,
  UploadLegacyPort,
  VentaLegacyPort
} from "./legacy-ports.js";

// Same DB-free convention as mounting.test.ts: the adapters bind the legacy
// services (shared pool at import time), so point it at the test database
// BEFORE the dynamic imports below. This suite never issues a query.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { AuthError } = await import("../errors/taxonomy.js");
const {
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
  makeVentaDeps
} = await import("./legacy-ports.js");

// DB-free: every adapter delegates to the injected fake port — no query is
// ever issued. These tests pin the cutover wiring contract: exact legacy
// argument shapes, envelope-preserving result mappings, and the sales-batch
// serialization trick (receipt byte-identical, total/lines non-enumerable).

function fake<T>(methods: Record<string, unknown>): T {
  return methods as unknown as T;
}

describe("legacy-ports passthrough adapters", () => {
  it("delegates audit list with the same filter", async () => {
    const port = fake<AuditLegacyPort>({ list: vi.fn(async (filter: unknown) => ({ filter })) });
    const filter = { action: "sale.create", page: 1, limit: 20 };
    await expect(makeAuditDeps(port).listAudits(filter)).resolves.toEqual({ filter });
    expect(port.list).toHaveBeenCalledWith(filter);
  });

  it("delegates caja current/list/open/close/movements with legacy shapes", async () => {
    const port = fake<CajaLegacyPort>({
      current: vi.fn(async () => null),
      list: vi.fn(async () => []),
      open: vi.fn(async (input: unknown) => ({ opened: input })),
      close: vi.fn(async (id: string, counted: number) => ({ id, counted })),
      recordMovement: vi.fn(async (id: string, input: unknown, actor: unknown) => ({ id, input, actor }))
    });
    const deps = makeCajaDeps(port);
    await expect(deps.current()).resolves.toBeNull();
    await expect(deps.list()).resolves.toEqual([]);
    await expect(deps.open({ openingAmount: 100 } as never)).resolves.toEqual({ opened: { openingAmount: 100 } });
    await expect(deps.close("cs-1", 150)).resolves.toEqual({ id: "cs-1", counted: 150 });
    const actor = { actorUserId: "u1", actorRole: "caja" };
    await expect(deps.recordMovement("cs-1", { kind: "ingreso" } as never, actor)).resolves.toEqual({
      id: "cs-1",
      input: { kind: "ingreso" },
      actor
    });
  });

  it("delegates catalog reads with the same arguments", async () => {
    const port = fake<CatalogLegacyPort>({
      listPublished: vi.fn(async (query: unknown) => ({ query })),
      getPublishedById: vi.fn(async (id: string) => ({ id })),
      listSlides: vi.fn(async () => ["slide"])
    });
    const deps = makeCatalogDeps(port);
    await expect(deps.listPublished({ page: 2 } as never)).resolves.toEqual({ query: { page: 2 } });
    await expect(deps.getPublishedById("p-1")).resolves.toEqual({ id: "p-1" });
    await expect(deps.listSlides()).resolves.toEqual(["slide"]);
  });

  it("delegates categories/clients CRUD with id+patch shapes", async () => {
    const categories = fake<CategoriesLegacyPort>({
      list: vi.fn(async () => []),
      getById: vi.fn(async (id: string) => ({ id })),
      create: vi.fn(async (input: unknown) => ({ created: input })),
      update: vi.fn(async (id: string, patch: unknown) => ({ id, patch }))
    });
    const catDeps = makeCategoriesDeps(categories);
    await expect(catDeps.update("c-1", { name: "N" } as never)).resolves.toEqual({
      id: "c-1",
      patch: { name: "N" }
    });

    const clients = fake<ClientsLegacyPort>({
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(async (input: unknown) => ({ created: input })),
      update: vi.fn(async (id: string, patch: unknown) => ({ id, patch }))
    });
    const cliDeps = makeClientsDeps(clients);
    await expect(cliDeps.getById("missing")).resolves.toBeNull();
    await expect(cliDeps.create({ name: "Ana" } as never)).resolves.toEqual({ created: { name: "Ana" } });
  });

  it("delegates finance reads/writes with the same arguments", async () => {
    const port = fake<FinanceLegacyPort>({
      getFinancialState: vi.fn(async () => ({ cash: 1 })),
      upsertFinancialState: vi.fn(async (patch: unknown) => ({ saved: patch })),
      getInvoiceSettings: vi.fn(async () => ({})),
      saveInvoiceSettings: vi.fn(async (doc: unknown) => doc),
      listStockMovements: vi.fn(async () => []),
      recordStockMovement: vi.fn(async (input: unknown, actor: unknown) => ({ input, actor }))
    });
    const deps = makeFinanceDeps(port);
    await expect(deps.getFinancialState()).resolves.toEqual({ cash: 1 });
    await expect(deps.upsertFinancialState({ cash: 2 } as never)).resolves.toEqual({ saved: { cash: 2 } });
    const actor = { actorUserId: "u1", actorRole: "vendedor" };
    await expect(deps.recordStockMovement({ productId: "p" } as never, actor)).resolves.toEqual({
      input: { productId: "p" },
      actor
    });
  });

  it("wraps order cancel in the legacy { order } envelope", async () => {
    const cancelled = { order: { id: "o-1" }, items: [] };
    const port = fake<OrdersReadLegacyPort>({
      listMine: vi.fn(async () => []),
      getMine: vi.fn(async () => null),
      cancel: vi.fn(async () => cancelled)
    });
    const deps = makeOrdersReadDeps(port);
    // Legacy serves the INNER order row, not the `{order, items}` pair.
    await expect(deps.cancel("u-1", "o-1")).resolves.toEqual({ order: { id: "o-1" } });
    expect(port.cancel).toHaveBeenCalledWith("u-1", "o-1");
  });

  it("delegates pago preference/webhook with legacy argument order", async () => {
    const port = fake<PagoLegacyPort>({
      createPreferenceForOrder: vi.fn(async (userId: string, orderId: string) => ({ userId, orderId })),
      handlePaymentNotification: vi.fn(async (input: unknown) => ({ outcome: "ignored" as const, input }))
    });
    const deps = makePagoDeps(port);
    await expect(deps.createPreference({ userId: "u-1", orderId: "o-1" })).resolves.toEqual({
      userId: "u-1",
      orderId: "o-1"
    });
    expect(port.createPreferenceForOrder).toHaveBeenCalledWith("u-1", "o-1");
    await expect(
      deps.handleWebhook({
        notificationId: "n",
        type: "payment",
        dataId: "d",
        xSignature: "sig"
      })
    ).resolves.toMatchObject({ outcome: "ignored" });
  });

  it("delegates purchases CRUD forwarding the audit actor on create", async () => {
    const port = fake<PurchasesLegacyPort>({
      list: vi.fn(async () => []),
      getById: vi.fn(async (id: string) => ({ id })),
      create: vi.fn(async (input: unknown, actor: unknown) => ({ input, actor })),
      update: vi.fn(async (id: string, patch: unknown) => ({ id, patch }))
    });
    const deps = makePurchasesDeps(port);
    const actor = { actorUserId: "u1", actorRole: "administrador" };
    await expect(deps.create({ supplierName: "S" } as never, actor)).resolves.toEqual({
      input: { supplierName: "S" },
      actor
    });
  });

  it("delegates receipt reads/writes with legacy shapes", async () => {
    const port = fake<ReceiptLegacyPort>({
      nextNumber: vi.fn(async () => 7),
      list: vi.fn(async () => []),
      create: vi.fn(async (input: unknown) => ({ created: input })),
      getById: vi.fn(async () => null),
      annul: vi.fn(async (id: string, actor: unknown) => ({ id, actor })),
      transitionRepairStatus: vi.fn(async (id: string, status: string) => ({ id, status }))
    });
    const deps = makeReceiptDeps(port);
    await expect(deps.nextNumber()).resolves.toBe(7);
    await expect(deps.getReceiptById("missing")).resolves.toBeNull();
    const actor = { actorUserId: "u1", actorRole: "vendedor" };
    await expect(deps.annulReceipt("r-1", actor)).resolves.toEqual({ id: "r-1", actor });
    await expect(deps.transitionRepairStatus("r-1", "Listo", actor)).resolves.toEqual({
      id: "r-1",
      status: "Listo"
    });
  });

  it("picks only the legacy range keys for reports", async () => {
    const port = fake<ReportsLegacyPort>({
      salesSummary: vi.fn(async (input: unknown) => input),
      stockValuation: vi.fn(async () => ({})),
      cashSummary: vi.fn(async (input: unknown) => input),
      topProducts: vi.fn(async (input: unknown) => input),
      repairsByStatus: vi.fn(async () => ({}))
    });
    const deps = makeReportsDeps(port);
    await expect(deps.salesSummary({ from: "2026-01-01", to: "2026-02-01" })).resolves.toEqual({
      from: "2026-01-01",
      to: "2026-02-01"
    });
    await expect(
      deps.topProducts({ from: undefined, to: undefined, limit: 5 } as never)
    ).resolves.toEqual({ from: undefined, to: undefined, limit: 5 });
    expect(port.topProducts).toHaveBeenCalledWith({ from: undefined, to: undefined, limit: 5 });
  });

  it("maps service update to the legacy id+patch call", async () => {
    const port = fake<ServiceLegacyPort>({
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      create: vi.fn(async (input: unknown) => ({ created: input })),
      update: vi.fn(async (id: string, patch: unknown) => ({ id, patch }))
    });
    const deps = makeServiceDeps(port);
    await expect(deps.update({ serviceId: "s-1", patch: { name: "X" } } as never)).resolves.toEqual({
      id: "s-1",
      patch: { name: "X" }
    });
    await expect(deps.rename({ serviceId: "s-1", name: "X" } as never)).rejects.toMatchObject({
      status: 404
    });
  });
});

describe("upload legacy-port adapter", () => {
  it("streams the buffered bytes to the legacy service and returns only the url", async () => {
    let seen: Buffer = Buffer.alloc(0);
    const port = fake<UploadLegacyPort>({
      storeImage: vi.fn(async (body: AsyncIterable<Buffer>) => {
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(chunk);
        seen = Buffer.concat(chunks);
        return { url: "/api/v1/uploads/abc.png", filename: "abc.png", bytes: seen.length };
      }),
      load: vi.fn(async () => null)
    });
    const bytes = Buffer.from([1, 2, 3, 4]);
    const actor = { actorUserId: "u1", actorRole: "admin" };
    const deps = makeUploadDeps(port, 1024);
    await expect(
      deps.store({ contentType: "image/png", bytes, actor })
    ).resolves.toEqual({ url: "/api/v1/uploads/abc.png" });
    expect(seen.equals(bytes)).toBe(true);
    expect(port.storeImage).toHaveBeenCalledWith(
      expect.anything(),
      "image/png",
      undefined,
      actor
    );
    expect(deps.maxUploadBytes).toBe(1024);
  });

  it("passes file serving through with the frozen 404 contract", async () => {
    const port = fake<UploadLegacyPort>({
      storeImage: vi.fn(),
      load: vi.fn(async () => null)
    });
    await expect(makeUploadDeps(port, 8).load("missing.png")).resolves.toBeNull();
  });
});

describe("venta legacy-port adapter", () => {
  const RECEIPT = {
    id: "r-1",
    receiptNumber: 7,
    clientName: "Cliente Batch",
    clientId: "api-cli-5",
    clientPhone: null,
    deviceBrand: "Samsung",
    deviceModel: "A15",
    deviceColor: null,
    imeiSerial: "358000000000001",
    reportedIssue: "Pantalla rota",
    services: ["Cambio de pantalla"],
    price: "200",
    repairStatus: "Entregado",
    quoteStatus: "Aceptado",
    quoteTotal: 200,
    paymentStatus: "Pagado",
    payload: { sale: true },
    createdAt: new Date("2026-03-01T10:00:00.000Z"),
    updatedAt: new Date("2026-03-01T10:00:00.000Z")
  };
  const ITEMS = [{ productId: "p-1", quantity: 2, unitPrice: 100 }];
  const ACTOR = { actorUserId: "u-9", actorRole: "vendedor" };

  function ventaPort(overrides: Record<string, unknown> = {}): VentaLegacyPort {
    return fake<VentaLegacyPort>({
      runSalesBatch: vi.fn(async () => ({ receipt: RECEIPT, items: ITEMS, total: 200 })),
      createOrder: vi.fn(async (_userId: string, input: unknown) => ({ recorded: input })),
      createCheckoutSession: vi.fn(async (_userId: string, orderId: string) => ({
        id: "sess-1",
        url: "https://checkout.beim.test/checkout/sess-1",
        status: "pending",
        orderId,
        expiresAt: new Date("2026-04-01T10:30:00.000Z")
      })),
      ...overrides
    });
  }

  it("maps the thin batch to the legacy intake and keeps the receipt bytes", async () => {
    const port = ventaPort();
    const deps = makeVentaDeps(port, { uuid: { generate: () => "gen-1" }, checkoutBaseUrl: "https://x" });
    const result = await deps.confirmBatch(
      {
        ventaId: "gen-1",
        clientName: "Cliente Batch",
        clientId: "api-cli-5",
        clientPhone: null,
        deviceBrand: "Samsung",
        deviceModel: "A15",
        deviceColor: null,
        imeiSerial: "358000000000001",
        reportedIssue: "Pantalla rota",
        services: ["Cambio de pantalla"],
        lines: [{ productId: "p-1", quantity: 2 }],
        payments: [{ method: "Efectivo", amount: 200, currency: "UYU" }],
        userId: "u-9"
      },
      ACTOR
    );
    expect(port.runSalesBatch).toHaveBeenCalledWith(
      {
        clientName: "Cliente Batch",
        clientId: "api-cli-5",
        clientPhone: undefined,
        deviceBrand: "Samsung",
        deviceModel: "A15",
        deviceColor: undefined,
        imeiSerial: "358000000000001",
        reportedIssue: "Pantalla rota",
        services: ["Cambio de pantalla"],
        items: [{ productId: "p-1", quantity: 2 }],
        payments: [{ method: "Efectivo", amount: 200 }]
      },
      ACTOR
    );
    // Served bytes: the receipt serializes exactly like the legacy row…
    expect(JSON.parse(JSON.stringify(result.venta))).toEqual(JSON.parse(JSON.stringify(RECEIPT)));
    // …while the router reads total/lines off the non-enumerable view.
    expect(result.venta.total).toEqual({ amount: 200 });
    expect(result.venta.lines).toEqual([{ productId: "p-1", quantity: 2, unitPrice: { amount: 100 } }]);
    expect(Object.keys(result.venta as unknown as Record<string, unknown>)).not.toContain("total");
    expect(Object.keys(result.venta as unknown as Record<string, unknown>)).not.toContain("lines");
  });

  it("fails closed with 422 when clientId is missing", async () => {
    const port = ventaPort();
    const deps = makeVentaDeps(port);
    await expect(
      deps.confirmBatch(
        {
          ventaId: "v-1",
          clientName: "X",
          clientId: null,
          lines: [{ productId: "p-1", quantity: 1 }],
          userId: "u-9"
        } as never,
        ACTOR
      )
    ).rejects.toMatchObject({ status: 422 });
    expect(port.runSalesBatch).not.toHaveBeenCalled();
  });

  it("creates orders letting the database own identity (edge orderId dropped)", async () => {
    const port = ventaPort();
    const deps = makeVentaDeps(port);
    const result = await deps.createOrder({
      orderId: "edge-ignored",
      customer: "Comprador",
      email: null,
      phone: null,
      ci: null,
      rut: null,
      address: null,
      shipping: null,
      comments: null,
      items: [{ productId: "p-1", quantity: 1 }],
      userId: "buyer-1"
    });
    expect(port.createOrder).toHaveBeenCalledWith("buyer-1", {
      customer: "Comprador",
      email: null,
      phone: null,
      ci: null,
      rut: null,
      address: null,
      shipping: null,
      comments: null,
      items: [{ productId: "p-1", quantity: 1 }]
    });
    expect(result).toEqual({
      recorded: {
        customer: "Comprador",
        email: null,
        phone: null,
        ci: null,
        rut: null,
        address: null,
        shipping: null,
        comments: null,
        items: [{ productId: "p-1", quantity: 1 }]
      }
    });
  });

  it("mints checkout sessions with 401 when no identity is wired", async () => {
    const port = ventaPort();
    const deps = makeVentaDeps(port, { checkoutBaseUrl: "https://checkout.beim.test" });
    await expect(
      deps.mintCheckoutSession({ orderId: "o-1", paymentMethodId: null })
    ).rejects.toBeInstanceOf(AuthError);
    expect(port.createCheckoutSession).not.toHaveBeenCalled();
    const result = await deps.mintCheckoutSession({
      orderId: "o-1",
      paymentMethodId: "transferencia-bancaria",
      userId: "buyer-1"
    });
    expect(port.createCheckoutSession).toHaveBeenCalledWith("buyer-1", "o-1", "transferencia-bancaria");
    expect(result.venta.checkoutSession).toMatchObject({ id: "sess-1", status: "pending" });
    expect(result.venta.id).toBe("o-1");
    expect(deps.checkoutBaseUrl).toBe("https://checkout.beim.test");
  });
});
