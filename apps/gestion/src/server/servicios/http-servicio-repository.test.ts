import { describe, expect, it, vi } from "vitest";

import type { Servicio } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { GestionHttpFetch } from "../api/http-client";
import { HttpServicioRepository } from "./http-servicio-repository";

const ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };

const servicioFixture: Servicio = {
  id: "s_1",
  ownerId: "u-owner",
  version: 1,
  displayName: "Soporte tecnico",
  price: 300,
  active: true
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

function makeRepository(fetchImpl: GestionHttpFetch): HttpServicioRepository {
  return new HttpServicioRepository({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

describe("HttpServicioRepository", () => {
  it("lists servicios from GET /api/v1/services with a Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [servicioFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([servicioFixture]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/services");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("reads a servicio by id from GET /api/v1/services/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: servicioFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(ACTOR, "s_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("s_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/services/s_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("creates a servicio with only the writable fields in the body", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 201,
      body: { ok: true, data: servicioFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.create(ACTOR, servicioFixture);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/services");
    expect(calls[0]?.method).toBe("POST");
    const body = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body).toEqual({ displayName: "Soporte tecnico", price: 300, active: true });
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("version");
  });

  it("updates a servicio with expectedVersion and no authority fields", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...servicioFixture, version: 2, price: 350 } }
    }));
    const repository = makeRepository(fetchImpl);

    const patch: Servicio = { ...servicioFixture, version: 2, price: 350 };
    const result = await repository.update(ACTOR, "s_1", patch, 1);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.price).toBe(350);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/services/s_1");
    expect(calls[0]?.method).toBe("PATCH");
    const body = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.expectedVersion).toBe(1);
    expect(body.price).toBe(350);
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("version");
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

  it("fails closed on a malformed success envelope", async () => {
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true } }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed when a listed item does not satisfy servicioSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "s_x", displayName: "Sin owner" }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

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

  it("never touches the network when a fetch implementation is injected", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { fetchImpl } = fetchSpy(() => ({ status: 200, body: { ok: true, data: [] } }));
    const repository = makeRepository(fetchImpl);

    await repository.list(ACTOR);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
