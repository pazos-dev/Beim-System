import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ventaRepository } from "./venta-repository";

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

describe("VentaRepository", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists receipts with the correct query string and auth header", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          items: [
            {
              estado: "confirmada",
              id: "v_1",
              numero: "V-0001",
              total: 2500,
              version: 1,
            },
          ],
          limit: 25,
          page: 1,
          total: 1,
        },
      })
    );

    const result = await ventaRepository.list({
      client: "maria",
      limit: 25,
      page: 1,
      status: "confirmada",
      type: "sale",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      items: [
        {
          estado: "confirmada",
          id: "v_1",
          numero: "V-0001",
          total: 2500,
          version: 1,
        },
      ],
      limit: 25,
      page: 1,
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/http:\/\/localhost:4000\/api\/v1\/receipts\?/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
    const callUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(callUrl.searchParams.get("client")).toBe("maria");
    expect(callUrl.searchParams.get("status")).toBe("confirmada");
    expect(callUrl.searchParams.get("type")).toBe("sale");
    expect(callUrl.searchParams.get("page")).toBe("1");
    expect(callUrl.searchParams.get("limit")).toBe("25");
  });

  it("omits undefined/empty query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { items: [], limit: 25, page: 1, total: 0 } })
    );

    await ventaRepository.list({ page: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts?page=2",
      expect.anything()
    );
  });

  it("creates a sale with POST /api/v1/sales-batch", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          data: {
            estado: "confirmada",
            id: "v_2",
            numero: "V-0002",
            total: 2500,
            version: 1,
          },
        },
        201
      )
    );

    const result = await ventaRepository.create({
      clientId: "c_1",
      clientName: "María Gómez",
      items: [{ productId: "p_1", quantity: 2 }],
      payments: [{ amount: 2500, method: "efectivo" }],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      estado: "confirmada",
      id: "v_2",
      numero: "V-0002",
      total: 2500,
      version: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/sales-batch",
      expect.objectContaining({
        body: JSON.stringify({
          clientId: "c_1",
          clientName: "María Gómez",
          items: [{ productId: "p_1", quantity: 2 }],
          payments: [{ amount: 2500, method: "efectivo" }],
        }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("annuls a receipt with POST /api/v1/receipts/:id/annul", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: undefined }));

    const result = await ventaRepository.annul("v_1");

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts/v_1/annul",
      expect.objectContaining({
        body: JSON.stringify({}),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("reads a receipt by id", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          estado: "confirmada",
          id: "v_1",
          numero: "V-0001",
          total: 2500,
          version: 1,
        },
      })
    );

    const result = await ventaRepository.getById("v_1");

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      estado: "confirmada",
      id: "v_1",
      numero: "V-0001",
      total: 2500,
      version: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts/v_1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
  });

  it("encodes the id when reading or annulling", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { id: "v 1" } }));

    await ventaRepository.getById("v 1");
    await ventaRepository.annul("v 1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts/v%201",
      expect.anything()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts/v%201/annul",
      expect.anything()
    );
  });

  it("fetches the next receipt number", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { nextNumber: "V-0003" } }));

    const result = await ventaRepository.nextNumber();

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ nextNumber: "V-0003" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts/next-number",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
  });

  it("creates an order with POST /api/v1/receipts", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          data: {
            clienteId: "c_1",
            clienteNombre: "María Gómez",
            estado: "en_diagnostico",
            id: "ord_1",
            numero: "ORD-001",
            total: 1500,
            version: 1,
          },
        },
        201
      )
    );

    const result = await ventaRepository.createOrder({
      clientName: "María Gómez",
      deviceBrand: "Samsung",
      deviceModel: "A54",
      reportedIssue: "No enciende",
    });

    expect(result.ok).toBe(true);
    expect(result.data?.numero).toBe("ORD-001");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/receipts",
      expect.objectContaining({
        body: JSON.stringify({
          clientName: "María Gómez",
          deviceBrand: "Samsung",
          deviceModel: "A54",
          reportedIssue: "No enciende",
        }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("returns an error envelope when the backend fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Cliente requerido" }, ok: false }, 400)
    );

    const result = await ventaRepository.create({
      clientId: "",
      clientName: "",
      items: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "VALIDATION_ERROR", message: "Cliente requerido" });
  });

  it("returns a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await ventaRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
