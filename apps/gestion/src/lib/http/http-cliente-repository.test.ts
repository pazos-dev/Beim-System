// Offline contract for HttpClienteRepository (PR2): port round-trips over
// recorded fixtures, zod-typed errors, limit clamp, zero sockets. The global
// fetch is stubbed to throw so any socket attempt fails the suite loudly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "../../server/shared/errors";
import { useSessionStore } from "../../store/session.slice";
import { createRecordedFetch } from "../../test/fixtures/http/recorded-fetch";
import { HttpClienteRepository } from "./http-cliente-repository";
import clienteCreate201 from "../../test/fixtures/http/cliente-create-201.json";
import clienteDetail from "../../test/fixtures/http/cliente-detail.json";
import clienteUpdate from "../../test/fixtures/http/cliente-update.json";
import clientesList from "../../test/fixtures/http/clientes-list.json";
import forbidden from "../../test/fixtures/http/errors/403.json";
import notFound from "../../test/fixtures/http/errors/404.json";
import unknownKey from "../../test/fixtures/http/errors/422-unknown-key.json";
import unauthorized from "../../test/fixtures/http/errors/401.json";
import malformedList from "../../test/fixtures/http/errors/malformed-list.json";

const ACTOR = { hasGlobalAccess: false, id: "u_ana" };

const BASE_ROUTES = {
  "/api/v1/clients": { body: clientesList, status: 200 },
  "/api/v1/clients/c-1": { body: clienteDetail, status: 200 },
  "/api/v1/clients/c-3": { body: clienteCreate201, status: 201 },
  "/api/v1/clients/c-1-put": { body: clienteUpdate, status: 200 }
};

beforeEach(() => {
  useSessionStore.setState({ actor: null, token: null });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Network socket opened during an offline test.");
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpClienteRepository list", () => {
  it("round-trips items through GET /clients with pagination query", async () => {
    const recorded = createRecordedFetch(BASE_ROUTES);
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.list(ACTOR, { active: true, limit: 20, page: 1, search: "ana" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((cliente) => cliente.id)).toEqual(["c-1", "c-2"]);
    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0]?.method).toBe("GET");
    expect(recorded.calls[0]?.url).toContain("/api/v1/clients?");
    expect(recorded.calls[0]?.url).toContain("search=ana");
    expect(recorded.calls[0]?.url).toContain("active=true");
  });

  it("clamps limit 500 to the frozen maximum of 100", async () => {
    const recorded = createRecordedFetch(BASE_ROUTES);
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.list(ACTOR, { limit: 500, page: 1 });

    expect(result.ok).toBe(true);
    expect(recorded.calls[0]?.url).toContain("limit=100");
    expect(recorded.calls[0]?.url).not.toContain("limit=500");
  });

  it("attaches the Bearer token while logged in", async () => {
    useSessionStore.getState().setSession(
      { displayName: "Ana Vendedora", id: "u_ana", role: "vendedor", username: "ana" },
      "recorded-dev-token"
    );
    const recorded = createRecordedFetch(BASE_ROUTES);
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    await repo.list(ACTOR);

    expect(recorded.calls[0]?.headers["authorization"]).toBe("Bearer recorded-dev-token");
  });

  it("surfaces a typed parse error for a malformed list payload", async () => {
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: malformedList, status: 200 }
    });
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.list(ACTOR);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
});

describe("HttpClienteRepository detail/create/update", () => {
  it("round-trips detail through GET /clients/:id", async () => {
    const recorded = createRecordedFetch(BASE_ROUTES);
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.getById(ACTOR, "c-1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.displayName).toBe("Ana Vendedora");
    expect(recorded.calls[0]?.url).toContain("/api/v1/clients/c-1");
  });

  it("creates through POST /clients and returns the 201 data", async () => {
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: clienteCreate201, status: 201 }
    });
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.create(ACTOR, { displayName: "Ceci Nueva" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe("c-3");
    expect(recorded.calls[0]?.method).toBe("POST");
  });

  it("surfaces unknown-key 422 as a typed validation error", async () => {
    const recorded = createRecordedFetch({
      "/api/v1/clients": { body: unknownKey, status: 422 }
    });
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const failed = await repo.create(ACTOR, { displayName: "Ceci Nueva", nickname: "x" });

    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(failed.error.details).toMatchObject({ nickname: "Unknown key." });

    // 422 never mutates local state: the adapter is stateless, so a later
    // list over the same recorded routes still resolves cleanly.
    const replay = createRecordedFetch(BASE_ROUTES);
    const replayed = await new HttpClienteRepository({
      fetchImpl: replay.fetchImpl
    }).list(ACTOR);
    expect(replayed.ok).toBe(true);
  });

  it("updates through PUT /clients/:id with the expected version", async () => {
    const recorded = createRecordedFetch({
      "/api/v1/clients/c-1": { body: clienteUpdate, status: 200 }
    });
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    const result = await repo.update(ACTOR, "c-1", { displayName: "Ana Vendedora Actualizada" }, 3);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.version).toBe(4);
    expect(recorded.calls[0]?.method).toBe("PUT");
  });

  it("exposes no remove: the backend offers no DELETE /clients/:id and the frozen port remove means hard-delete", async () => {
    const recorded = createRecordedFetch(BASE_ROUTES);
    const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });

    expect("remove" in repo).toBe(false);
    expect(recorded.calls).toHaveLength(0);
  });

  it("maps backend status codes to distinguishable GestionError codes", async () => {
    const table = [
      { body: unauthorized, code: ERROR_CODES.AUTHENTICATION_REQUIRED, status: 401 },
      { body: forbidden, code: ERROR_CODES.FORBIDDEN, status: 403 },
      { body: notFound, code: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN, status: 404 }
    ] as const;
    for (const entry of table) {
      const recorded = createRecordedFetch({
        "/api/v1/clients/missing": { body: entry.body, status: entry.status }
      });
      const repo = new HttpClienteRepository({ fetchImpl: recorded.fetchImpl });
      const result = await repo.getById(ACTOR, "missing");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe(entry.code);
    }
  });
});
