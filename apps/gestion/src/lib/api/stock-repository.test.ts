import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { stockRepository } from "./stock-repository";

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

describe("StockRepository", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists movements with query string and auth header", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          items: [
            {
              id: "sm_1",
              productId: "p_1",
              movementType: "entrada",
              quantity: 5,
              detail: "Compra inicial",
              createdAt: "2026-01-10T12:00:00.000Z",
            },
          ],
          limit: 25,
          page: 1,
          total: 1,
        },
      })
    );

    const result = await stockRepository.list({
      from: "2026-01-01",
      productId: "p_1",
      to: "2026-01-31",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      items: [
        {
          id: "sm_1",
          productId: "p_1",
          movementType: "entrada",
          quantity: 5,
          detail: "Compra inicial",
          createdAt: "2026-01-10T12:00:00.000Z",
        },
      ],
      limit: 25,
      page: 1,
      total: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/stock-movements?from=2026-01-01&productId=p_1&to=2026-01-31",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
  });

  it("omits undefined and empty query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { items: [], limit: 25, page: 1, total: 0 } })
    );

    await stockRepository.list({ productId: "p_2" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/stock-movements?productId=p_2",
      expect.anything()
    );
  });

  it("creates a movement with JSON body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          ok: true,
          data: {
            id: "sm_2",
            productId: "p_1",
            movementType: "salida",
            quantity: 2,
            detail: "venta",
            createdAt: "2026-01-11T12:00:00.000Z",
          },
        },
        201
      )
    );

    const result = await stockRepository.create({
      detail: "venta",
      movementType: "salida",
      productId: "p_1",
      quantity: 2,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({
      id: "sm_2",
      productId: "p_1",
      movementType: "salida",
      quantity: 2,
      detail: "venta",
      createdAt: "2026-01-11T12:00:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/stock-movements",
      expect.objectContaining({
        body: JSON.stringify({
          detail: "venta",
          movementType: "salida",
          productId: "p_1",
          quantity: 2,
        }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "POST",
      })
    );
  });

  it("returns an error envelope when the backend fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: "INSUFFICIENT_STOCK", message: "Stock insuficiente" }, ok: false },
        409
      )
    );

    const result = await stockRepository.create({
      movementType: "salida",
      productId: "p_1",
      quantity: 100,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "INSUFFICIENT_STOCK", message: "Stock insuficiente" });
  });

  it("returns a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await stockRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
