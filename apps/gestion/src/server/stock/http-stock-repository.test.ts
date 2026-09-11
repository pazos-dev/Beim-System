import { describe, expect, it, vi } from "vitest";

import type { Compra, MovimientoStock, Producto } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { GestionHttpFetch } from "../api/http-client";
import { HttpStockRepository } from "./http-stock-repository";

const ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };

const productoFixture: Producto = {
  id: "p_1",
  ownerId: "u-owner",
  version: 1,
  displayName: "Batería alternativa",
  price: 1200,
  cost: 800,
  stock: 15,
  minimum: 3,
  active: true
};

const movimientoFixture: MovimientoStock = {
  id: "m_1",
  ownerId: "u-owner",
  version: 1,
  productoId: "p_1",
  deposito: "principal",
  cantidad: -2,
  motivo: "venta",
  referencia: "v_1",
  balanceAfter: 13
};

const compraFixture: Compra = {
  id: "co_1",
  ownerId: "u-owner",
  version: 1,
  productoId: "p_1",
  proveedor: "Proveedor Andina",
  cantidad: 5,
  costoUnitario: 600,
  deposito: "principal",
  comprobante: "FAC-001",
  fecha: "2026-01-10T12:00:00.000Z",
  total: 3000
};

interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface MockResponse {
  status: number;
  body: unknown;
}

function fetchSpy(
  handler: (request: RecordedRequest) => MockResponse | Promise<MockResponse>
): { calls: RecordedRequest[]; fetchImpl: GestionHttpFetch } {
  const calls: RecordedRequest[] = [];
  const fetchImpl: GestionHttpFetch = async (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body
    };
    calls.push(request);
    const response = await handler(request);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body
    };
  };
  return { calls, fetchImpl };
}

function makeRepository(fetchImpl: GestionHttpFetch): HttpStockRepository {
  return new HttpStockRepository({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

function auditHookSpy(): { called: boolean; hook: () => Promise<{ ok: true; value: undefined }> } {
  const state = { called: false };
  return {
    get called() {
      return state.called;
    },
    hook: async () => {
      state.called = true;
      return { ok: true as const, value: undefined };
    }
  };
}

describe("HttpStockRepository", () => {
  it("lists productos from GET /api/v1/stock with a Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [productoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listProductos(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([productoFixture]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("reads a producto by id from GET /api/v1/stock/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: productoFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getProducto(ACTOR, "p_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("p_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock/p_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("encodes producto ids in the URL", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...productoFixture, id: "p 1" } }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.getProducto(ACTOR, "p 1");

    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock/p%201");
  });

  it("lists movimientos from GET /api/v1/stock/movements", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [movimientoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listMovimientos(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([movimientoFixture]);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock/movements");
    expect(calls[0]?.method).toBe("GET");
  });

  it("filters movimientos by productoId query when provided", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [movimientoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listMovimientos(ACTOR, "p_1");

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock/movements?productoId=p_1");
  });

  it("encodes productoId in the movimientos query", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [movimientoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.listMovimientos(ACTOR, "p 1");

    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/stock/movements?productoId=p+1");
  });

  it("lists compras from GET /api/v1/purchases", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [compraFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listCompras(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([compraFixture]);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/purchases");
    expect(calls[0]?.method).toBe("GET");
  });

  it("reads a compra by id from GET /api/v1/purchases/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: compraFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getCompra(ACTOR, "co_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("co_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/purchases/co_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("encodes compra ids in the URL", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...compraFixture, id: "co 1" } }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.getCompra(ACTOR, "co 1");

    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/purchases/co%201");
  });

  it("maps a forbidden response to FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 403,
      body: { ok: false, error: { code: "FORBIDDEN", message: "Acceso denegado." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listProductos(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("maps a not-found response to NOT_FOUND_OR_FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No existe." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getProducto(ACTOR, "missing");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("maps a validation error response to VALIDATION_ERROR", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 422,
      body: { ok: false, error: { code: "VALIDATION_ERROR", message: "Datos inválidos." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listCompras(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("fails closed on a malformed success envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true } }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listCompras(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed producto does not satisfy productoSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "p_x", displayName: "Sin owner" }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listProductos(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed movimiento does not satisfy movimientoStockSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "m_x", cantidad: 1 }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listMovimientos(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed compra does not satisfy compraSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "co_x", proveedor: "X" }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.listCompras(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed on network failure", async () => {
    const fetchImpl: GestionHttpFetch = async () => {
      throw new Error("connection refused");
    };
    const repository = makeRepository(fetchImpl);

    const result = await repository.getCompra(ACTOR, "co_1");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("applyOutflow returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyOutflow(
      ACTOR,
      { movimiento: movimientoFixture, producto: productoFixture },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyOutflow does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyOutflow(
      ACTOR,
      { movimiento: movimientoFixture, producto: productoFixture },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyTransferPair returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyTransferPair(
      ACTOR,
      { movimientos: [movimientoFixture, { ...movimientoFixture, id: "m_2", cantidad: 2, balanceAfter: 15 }] as [MovimientoStock, MovimientoStock] },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyTransferPair does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyTransferPair(
      ACTOR,
      { movimientos: [movimientoFixture, { ...movimientoFixture, id: "m_2" }] as [MovimientoStock, MovimientoStock] },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyPurchase returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyPurchase(
      ACTOR,
      { compra: compraFixture, movimiento: movimientoFixture, producto: productoFixture },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyPurchase does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyPurchase(
      ACTOR,
      { compra: compraFixture, movimiento: movimientoFixture, producto: productoFixture },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("never sends actor id, role or ownerId in requests", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [productoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.listProductos(ACTOR);
    await repository.listMovimientos(ACTOR, "p_1");
    await repository.getCompra(ACTOR, "co_1");

    for (const call of calls) {
      expect(call.url).not.toContain("u-admin");
      expect(call.url).not.toContain("u-owner");
      expect(call.body).toBeUndefined();
      for (const headerValue of Object.values(call.headers)) {
        expect(headerValue).not.toContain("u-admin");
        expect(headerValue).not.toContain("u-owner");
      }
    }
  });

  it("does not invent an idempotency key when the port input provides none", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [productoFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.listProductos(ACTOR);

    expect(calls[0]?.headers["x-idempotency-key"]).toBeUndefined();
  });

  it("never touches the network when a fetch implementation is injected", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: [] } }));
    const repository = makeRepository(fetchImpl);

    await repository.listProductos(ACTOR);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
