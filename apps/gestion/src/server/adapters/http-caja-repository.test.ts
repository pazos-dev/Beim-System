import { describe, expect, it, vi } from "vitest";

import type { SesionCaja } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { GestionHttpFetch } from "../api/http-client";
import { HttpCajaRepository } from "./http-caja-repository";

const GLOBAL_ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };
const OWNER_ACTOR: PortActor = { hasGlobalAccess: false, id: "u-mine" };
const OTHER_ACTOR: PortActor = { hasGlobalAccess: false, id: "u-other" };

function sesionFixture(
  id: string,
  ownerId: string,
  estado: SesionCaja["estado"],
  fecha: string
): SesionCaja {
  return {
    id,
    ownerId,
    version: 1,
    fecha,
    apertura: 1000,
    esperado: 1000,
    contado: 0,
    diferencia: 0,
    estado,
    ...(estado === "cerrada" ? { cierre: "2026-01-15T20:00:00.000Z" } : {})
  };
}

const OPEN_MINE = sesionFixture("sc_1", "u-mine", "abierta", "2026-01-15");
const CLOSED_OTHER = sesionFixture("sc_2", "u-other", "cerrada", "2026-01-14");
const CLOSED_MINE = sesionFixture("sc_3", "u-mine", "cerrada", "2026-01-13");

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

function makeRepository(fetchImpl: GestionHttpFetch): HttpCajaRepository {
  return new HttpCajaRepository({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

function auditHookSpy(): { called: boolean; hook: (persisted: SesionCaja) => Promise<{ ok: true; value: undefined }> } {
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

describe("HttpCajaRepository", () => {
  it("lists sesiones from GET /api/v1/cash-sessions with a Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [OPEN_MINE, CLOSED_OTHER] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(GLOBAL_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([OPEN_MINE, CLOSED_OTHER]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/cash-sessions");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("reads a sesion by id from GET /api/v1/cash-sessions/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: OPEN_MINE }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(GLOBAL_ACTOR, "sc_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("sc_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/cash-sessions/sc_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("encodes sesion ids in the URL", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...OPEN_MINE, id: "sc 1" } }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.getById(GLOBAL_ACTOR, "sc 1");

    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/cash-sessions/sc%201");
  });

  it("findAbierta returns the visible open session for the actor", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [OPEN_MINE, CLOSED_OTHER, CLOSED_MINE] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.findAbierta(OWNER_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.id).toBe("sc_1");
  });

  it("findAbierta returns null when no open session is visible to the actor", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [CLOSED_OTHER] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.findAbierta(OWNER_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("findAbierta lets a global admin see any open session", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [CLOSED_MINE, OPEN_MINE] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.findAbierta(GLOBAL_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value?.id).toBe("sc_1");
  });

  it("findAbierta returns null when the list contains no open sessions", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [CLOSED_MINE, CLOSED_OTHER] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.findAbierta(OWNER_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("findAbierta hides a foreign open session from a non-global actor", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [sesionFixture("sc_open_other", "u-other", "abierta", "2026-01-15")] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.findAbierta(OWNER_ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("readMovements returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.readMovements(OWNER_ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("readMovements does not call the remote API", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);

    await repository.readMovements(OWNER_ACTOR);

    expect(calls).toHaveLength(0);
  });

  it("applyAbrir returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyAbrir(
      OWNER_ACTOR,
      { fecha: "2026-01-16", apertura: 500 },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyAbrir does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 201, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyAbrir(
      OWNER_ACTOR,
      { fecha: "2026-01-16", apertura: 500 },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("applyCerrar returns DEPENDENCY_UNAVAILABLE with a next-implementation message", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    const result = await repository.applyCerrar(
      OWNER_ACTOR,
      { contado: 1150, retiros: 0 },
      audit.hook
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(result.error.message).toMatch(/^Próxima implementación:/);
    }
  });

  it("applyCerrar does not call the remote API or the audit hook", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: {} } }));
    const repository = makeRepository(fetchImpl);
    const audit = auditHookSpy();

    await repository.applyCerrar(
      OWNER_ACTOR,
      { contado: 1150, retiros: 0 },
      audit.hook
    );

    expect(calls).toHaveLength(0);
    expect(audit.called).toBe(false);
  });

  it("maps a forbidden response to FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 403,
      body: { ok: false, error: { code: "FORBIDDEN", message: "Acceso denegado." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(GLOBAL_ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("maps a not-found response to NOT_FOUND_OR_FORBIDDEN", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 404,
      body: { ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN", message: "No existe." } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(GLOBAL_ACTOR, "missing");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("fails closed on a malformed success envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true } }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(GLOBAL_ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed item does not satisfy sesionCajaSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "sc_x", apertura: 100 }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(GLOBAL_ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a detail response does not satisfy sesionCajaSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { id: "sc_x", apertura: 100 } }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(GLOBAL_ACTOR, "sc_x");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed on network failure", async () => {
    const fetchImpl: GestionHttpFetch = async () => {
      throw new Error("connection refused");
    };
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(GLOBAL_ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("never sends actor id, role or ownerId in requests", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [OPEN_MINE] }
    }));
    const repository = makeRepository(fetchImpl);

    await repository.list(OWNER_ACTOR);
    await repository.getById(OWNER_ACTOR, "sc_1");
    await repository.findAbierta(OWNER_ACTOR);

    for (const call of calls) {
      expect(call.url).not.toContain("u-mine");
      expect(call.url).not.toContain("u-owner");
      expect(call.body).toBeUndefined();
      for (const headerValue of Object.values(call.headers)) {
        expect(headerValue).not.toContain("u-mine");
        expect(headerValue).not.toContain("u-owner");
      }
    }
  });

  it("never touches the network when a fetch implementation is injected", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: [] } }));
    const repository = makeRepository(fetchImpl);

    await repository.list(GLOBAL_ACTOR);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
