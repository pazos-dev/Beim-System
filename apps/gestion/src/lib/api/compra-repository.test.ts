import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { compraRepository } from "./compra-repository";

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

describe("CompraRepository", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists purchases sending only 'active' to backend and paginates client-side", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: [
          { id: "p_1", supplierName: "Proveedor Uno", data: { productoId: "pr_1", cantidad: 10 } },
          { id: "p_2", supplierName: "Proveedor Dos", data: { productoId: "pr_2", cantidad: 5 } },
        ],
      })
    );

    const result = await compraRepository.list({
      active: "true",
      limit: 1,
      page: 1,
      q: "Uno",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.items).toHaveLength(1);
    expect(result.data?.items[0].id).toBe("p_1");
    expect(result.data?.total).toBe(1); // Only "Uno" matches
    expect(result.data?.page).toBe(1);
    expect(result.data?.limit).toBe(1);

    // Backend should only receive 'active'
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/purchases?active=true",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
  });

  it("omits undefined and empty query params from backend call", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: [] })
    );

    await compraRepository.list({ page: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/purchases",
      expect.anything()
    );
  });

  it("creates a purchase with a JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          data: { id: "p_2", supplierName: "Proveedor Dos", data: { cantidad: 5 } },
        },
        201
      )
    );

    const result = await compraRepository.create({
      supplierName: "Proveedor Dos",
      data: { cantidad: 5 },
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ id: "p_2", supplierName: "Proveedor Dos", data: { cantidad: 5 } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/purchases",
      expect.objectContaining({
        body: JSON.stringify({ supplierName: "Proveedor Dos", data: { cantidad: 5 } }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("updates a purchase by id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { active: false, id: "p_1", supplierName: "Proveedor Uno" },
      })
    );

    const result = await compraRepository.update("p_1", { active: false });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ active: false, id: "p_1", supplierName: "Proveedor Uno" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/purchases/p_1",
      expect.objectContaining({
        body: JSON.stringify({ active: false }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "PUT",
      })
    );
  });

  it("encodes the id when updating", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { id: "a/b", supplierName: "X" } })
    );

    await compraRepository.update("a/b", { supplierName: "X" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/purchases/a%2Fb",
      expect.anything()
    );
  });

  it("returns an error envelope when the backend fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Proveedor requerido" }, ok: false }, 400)
    );

    const result = await compraRepository.create({ supplierName: "" });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "VALIDATION_ERROR", message: "Proveedor requerido" });
  });

  it("returns a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await compraRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
