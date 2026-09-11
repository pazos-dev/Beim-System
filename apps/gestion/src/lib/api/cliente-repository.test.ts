import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { clienteRepository } from "./cliente-repository";

const fetchMock = vi.fn();

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  });
}

vi.mock("./auth-store", () => ({
  useAuthStore: Object.assign(
    () => ({}),
    {
      getState: () => ({ token: "test-token" }),
      setState: vi.fn(),
      subscribe: vi.fn(),
      destroy: vi.fn(),
    }
  ),
}));

describe("ClienteRepository", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists clients with the correct query string and auth header", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          items: [
            { active: true, email: "maria@example.com", id: "c_1", name: "María Gómez", phone: "1112345678" },
          ],
          limit: 25,
          page: 1,
          total: 1,
        },
      })
    );

    const result = await clienteRepository.list({ active: "true", limit: 25, page: 1, search: "maria" });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      items: [{ active: true, email: "maria@example.com", id: "c_1", name: "María Gómez", phone: "1112345678" }],
      limit: 25,
      page: 1,
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/http:\/\/localhost:4000\/api\/v1\/clients\?/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
    const callUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(callUrl.searchParams.get("search")).toBe("maria");
    expect(callUrl.searchParams.get("active")).toBe("true");
    expect(callUrl.searchParams.get("page")).toBe("1");
    expect(callUrl.searchParams.get("limit")).toBe("25");
  });

  it("omits undefined/empty query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { items: [], limit: 25, page: 1, total: 0 } })
    );

    await clienteRepository.list({ page: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/clients?page=2",
      expect.anything()
    );
  });

  it("creates a client with a JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { active: true, email: "ana@example.com", id: "c_2", name: "Ana Ruiz" },
      }, 201)
    );

    const result = await clienteRepository.create({ email: "ana@example.com", name: "Ana Ruiz" });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ active: true, email: "ana@example.com", id: "c_2", name: "Ana Ruiz" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/clients",
      expect.objectContaining({
        body: JSON.stringify({ email: "ana@example.com", name: "Ana Ruiz" }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("updates a client by id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { active: false, id: "c_1", name: "María Gómez" } })
    );

    const result = await clienteRepository.update("c_1", { active: false, name: "María Gómez" });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ active: false, id: "c_1", name: "María Gómez" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/clients/c_1",
      expect.objectContaining({
        body: JSON.stringify({ active: false, name: "María Gómez" }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "PUT",
      })
    );
  });

  it("encodes the id when updating", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { active: true, id: "a/b", name: "X" } }));

    await clienteRepository.update("a/b", { name: "X" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/clients/a%2Fb",
      expect.anything()
    );
  });

  it("returns an error envelope when the backend fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Nombre requerido" }, ok: false }, 400)
    );

    const result = await clienteRepository.create({ name: "" });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "VALIDATION_ERROR", message: "Nombre requerido" });
  });

  it("returns a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await clienteRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
