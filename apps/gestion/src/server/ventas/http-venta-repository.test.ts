import { describe, expect, it, vi } from "vitest";

import type { Venta } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { GestionHttpFetch } from "../api/http-client";
import { HttpVentaRepository } from "./http-venta-repository";

const ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };

const ventaFixture: Venta = {
  id: "v_1",
  ownerId: "u-owner",
  version: 1,
  numero: "0001-000101",
  items: [{ productoId: "p_1", cantidad: 1, precio: 100 }],
  pagos: [{ metodo: "efectivo", monto: 100 }],
  total: 100,
  estado: "confirmada",
  fecha: "2026-01-15T12:00:00.000Z"
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

function makeRepository(fetchImpl: GestionHttpFetch): HttpVentaRepository {
  return new HttpVentaRepository({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

function auditHookSpy(): { called: boolean; hook: (persisted: Venta) => Promise<{ ok: true; value: undefined }> } {
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

describe("HttpVentaRepository", () => {
  it("lists ventas from GET /api/v1/receipts with a Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [ventaFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([ventaFixture]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/receipts");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("reads a venta by id from GET /api/v1/receipts/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: ventaFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(ACTOR, "v_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("v_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/receipts/v_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("encodes venta ids in the URL", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...ventaFixture, id: "v 1" } }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.getById(ACTOR, "v 1");

    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/receipts/v%201");
  });

  it("maps a forbidden response to FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 403,
      body: { ok: false, error: { code: "FORBIDDEN", message: "Acceso denegado." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("maps a not-found response to NOT_FOUND_OR_FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No existe." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(ACTOR, "missing");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("fails closed on a malformed success envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true } }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed item does not satisfy ventaSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "v_x", total: 100 }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a detail response does not satisfy ventaSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { id: "v_x", total: 100 } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(ACTOR, "v_x");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed on network failure", async () => {
    const fetchImpl: GestionHttpFetch = async () => {
      throw new Error("connection refused");
    };
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("applyCreate returns DEPENDENCY_UNAVAILABLE for a draft input too", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyCreate(
      ACTOR,
      {
        deltas: [{ productoId: "p_1", cantidad: 1 }],
        draft: {
          fecha: "2026-01-15T12:00:00.000Z",
          items: [{ productoId: "p_1", cantidad: 1, precio: 100 }],
          pagos: [{ metodo: "efectivo", monto: 100 }],
          total: 100
        }
      },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyCreate returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyCreate(
      ACTOR,
      { venta: ventaFixture },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyCreate does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyCreate(
      ACTOR,
      { venta: ventaFixture },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyAnular returns DEPENDENCY_UNAVAILABLE when a motivo is supplied", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyAnular(
      ACTOR,
      { venta: ventaFixture, motivo: "Cancelación solicitada." },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyAnular returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyAnular(
      ACTOR,
      { venta: ventaFixture },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyAnular does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyAnular(
      ACTOR,
      { venta: ventaFixture },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("never sends actor id, role or ownerId in requests", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [ventaFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.list(ACTOR);
    await repository.getById(ACTOR, "v_1");

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

  it("never touches the network when a fetch implementation is injected", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: [] } }));
    const repository = makeRepository(fetchImpl);

    await repository.list(ACTOR);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
