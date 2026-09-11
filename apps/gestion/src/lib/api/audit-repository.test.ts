import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { auditRepository, type ApiEnvelope, type AuditListResponse } from "./audit-repository";

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

describe("AuditRepository", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists audit events with the correct query string, auth header and mapping", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          items: [
            {
              action: "venta.creada",
              actorRole: "vendedor",
              actorUserId: "u-admin",
              createdAt: "2026-09-08T10:00:00.000Z",
              details: {},
              entityId: "v_1",
              entityType: "venta",
              id: "a_1",
            },
            {
              action: "caja.abierta",
              actorRole: "caja",
              actorUserId: null,
              createdAt: "2026-09-08T09:00:00.000Z",
              details: {},
              entityId: "sc_1",
              entityType: "caja",
              id: "a_2",
            },
          ],
          limit: 50,
          page: 1,
          total: 2,
        },
      })
    );

    const result = await auditRepository.list({
      action: "venta",
      actor: "u-admin",
      from: "2026-09-01",
      limit: 50,
      page: 1,
      to: "2026-09-30",
    });

    expect(result.ok).toBe(true);
    expect((result as { ok: true; data: AuditListResponse }).data).toEqual({
      items: [
        {
          action: "venta.creada",
          actor: "u-admin",
          entity: "venta",
          id: "a_1",
          instant: "2026-09-08T10:00:00.000Z",
          result: "ok",
        },
        {
          action: "caja.abierta",
          actor: "caja",
          entity: "caja",
          id: "a_2",
          instant: "2026-09-08T09:00:00.000Z",
          result: "ok",
        },
      ],
      limit: 50,
      page: 1,
      total: 2,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/http:\/\/localhost:4000\/api\/v1\/audit-logs\?/),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        method: "GET",
      })
    );
    const callUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(callUrl.searchParams.get("actor")).toBe("u-admin");
    expect(callUrl.searchParams.get("action")).toBe("venta");
    expect(callUrl.searchParams.get("from")).toBe("2026-09-01");
    expect(callUrl.searchParams.get("to")).toBe("2026-09-30");
    expect(callUrl.searchParams.get("page")).toBe("1");
    expect(callUrl.searchParams.get("limit")).toBe("50");
  });

  it("omits undefined/empty query params", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { items: [], limit: 50, page: 1, total: 0 } })
    );

    await auditRepository.list({ page: 2 });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/v1/audit-logs?page=2",
      expect.anything()
    );
  });

  it("returns an error envelope when the backend fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: "FORBIDDEN", message: "Acceso denegado" }, ok: false }, 403)
    );

    const result = await auditRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: "FORBIDDEN", message: "Acceso denegado" });
  });

  it("returns a dependency error when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await auditRepository.list({});

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
