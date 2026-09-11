import { describe, expect, it, vi } from "vitest";

import type { Cliente } from "../data/schemas";
import type { PortActor } from "../shared/actor";
import type { GestionHttpFetch } from "../api/http-client";
import { HttpClienteRepository } from "./http-cliente-repository";

const ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };

const clienteFixture: Cliente = {
  id: "c_1",
  ownerId: "u-owner",
  version: 1,
  displayName: "Maria Perez",
  document: "1234567",
  phone: "099123456",
  email: "maria@example.com",
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
  const fetchImpl = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string }
  ) => {
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

function makeRepository(fetchImpl: GestionHttpFetch): HttpClienteRepository {
  return new HttpClienteRepository({
    baseUrl: "http://localhost:4000/",
    token: "tok-123",
    fetchImpl
  });
}

describe("HttpClienteRepository", () => {
  it("lists clientes from GET /api/v1/clients with a Bearer token", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [clienteFixture] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([clienteFixture]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok-123");
  });

  it("reads a cliente by id from GET /api/v1/clients/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: clienteFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.getById(ACTOR, "c_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.id).toBe("c_1");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients/c_1");
    expect(calls[0]?.method).toBe("GET");
  });

  it("creates a cliente with only the writable fields in the body", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 201,
      body: { ok: true, data: clienteFixture }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.create(ACTOR, clienteFixture);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients");
    expect(calls[0]?.method).toBe("POST");
    const body = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body).toEqual({
      displayName: "Maria Perez",
      document: "1234567",
      phone: "099123456",
      email: "maria@example.com",
      active: true
    });
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("version");
  });

  it("updates a cliente with expectedVersion and no authority fields", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: { ...clienteFixture, version: 2, displayName: "Maria A. Perez" } }
    }));
    const repository = makeRepository(fetchImpl);

    const patch: Cliente = { ...clienteFixture, version: 2, displayName: "Maria A. Perez" };
    const result = await repository.update(ACTOR, "c_1", patch, 1);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.displayName).toBe("Maria A. Perez");
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients/c_1");
    expect(calls[0]?.method).toBe("PATCH");
    const body = JSON.parse(calls[0]?.body ?? "{}") as Record<string, unknown>;
    expect(body.expectedVersion).toBe(1);
    expect(body.displayName).toBe("Maria A. Perez");
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("version");
  });

  it("removes a cliente with DELETE /api/v1/clients/:id", async () => {
    const { calls, fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: null }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.remove(ACTOR, "c_1");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeUndefined();
    expect(calls[0]?.url).toBe("http://localhost:4000/api/v1/clients/c_1");
    expect(calls[0]?.method).toBe("DELETE");
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

  it("fails closed when a listed item does not satisfy clienteSchema", async () => {
    const { fetchImpl } = fetchSpy(() => ({
      status: 200,
      body: { ok: true, data: [{ id: "c_x", displayName: "Sin owner" }] }
    }));
    const repository = makeRepository(fetchImpl);

    const result = await repository.list(ACTOR);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("fails closed on network failure", async () => {
    const fetchImpl = async (): Promise<{
      ok: boolean;
      status: number;
      json(): Promise<unknown>;
    }> => {
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
