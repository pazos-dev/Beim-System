// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAuthStore } from "./auth-store";
import {
  close,
  current,
  list,
  movement,
  open,
} from "./caja-repository";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

const OPEN_SESSION = {
  id: "sc_1",
  businessDate: "2026-04-01",
  openingAmount: 1000,
  expectedAmount: 1000,
  countedAmount: 0,
  difference: 0,
  status: "open",
  notes: "",
  openedAt: "2026-04-01T08:00:00Z",
  closedAt: null,
};

const CLOSED_SESSION = {
  id: "sc_1",
  businessDate: "2026-04-01",
  openingAmount: 1000,
  expectedAmount: 1000,
  countedAmount: 1150,
  difference: 150,
  status: "closed",
  notes: "",
  openedAt: "2026-04-01T08:00:00Z",
  closedAt: "2026-04-01T23:00:00Z",
};

describe("caja-repository", () => {
  beforeEach(() => {
    useAuthStore.setState({
      actor: { id: "u-1", name: "Test", role: "caja", username: "test" },
      token: "tok-123",
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    useAuthStore.setState({ actor: null, token: null });
    vi.unstubAllGlobals();
  });

  it("lists sessions from GET /api/v1/cash-sessions", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { items: [OPEN_SESSION], total: 1 } })
    );

    const result = await list();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/cash-sessions"
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("fetches the current open session and maps it to CajaEstadoView", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: OPEN_SESSION }));

    const result = await current();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/cash-sessions/current"
    );
    expect(result.abierta).toBe(true);
    expect(result.esperado).toBe(1000);
    expect(result.sesion).toEqual({
      apertura: 1000,
      estado: "open",
      fecha: "2026-04-01",
      id: "sc_1",
    });
  });

  it("returns closed estado when current session is null (404 from backend)", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: { code: "NOT_FOUND", message: "No hay sesión abierta" } }, 404)
    );

    await expect(current()).rejects.toThrow("No hay sesión abierta");
  });

  it("throws when the current session request fails with 403", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: { code: "FORBIDDEN", message: "Acceso denegado" } },
        403
      )
    );

    await expect(current()).rejects.toThrow("Acceso denegado");
  });

  it("opens a session with POST /api/v1/cash-sessions", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: OPEN_SESSION }, 201));

    await open({ businessDate: "2026-04-01", openingAmount: 1000 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/cash-sessions"
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      businessDate: "2026-04-01",
      openingAmount: 1000,
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("posts a movement to /api/v1/cash-sessions/:id/movements", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { id: "m_1" } }, 201));

    await movement("sc_1", { type: "egreso", amount: 100 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/cash-sessions/sc_1/movements"
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      type: "egreso",
      amount: 100,
    });
  });

  it("closes a session mapping body to countedAmount and response to CajaCierreView", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: CLOSED_SESSION }));

    const result = await close("sc_1", { contado: 1150, retiros: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:4000/api/v1/cash-sessions/sc_1/close"
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ countedAmount: 1150 });

    expect(result.contado).toBe(1150);
    expect(result.diferencia).toBe(150);
    expect(result.esperado).toBe(1000);
    expect(result.resultado).toBe("sobrante");
  });

  it("subtracts retiros from contado when computing countedAmount", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: CLOSED_SESSION }));

    await close("sc_1", { contado: 1200, retiros: 50 });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({ countedAmount: 1150 });
  });

  it("throws when opening fails", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        { ok: false, error: { code: "CONFLICT", message: "Ya existe una sesión abierta" } },
        409
      )
    );

    await expect(
      open({ businessDate: "2026-04-01", openingAmount: 1000 })
    ).rejects.toThrow("Ya existe una sesión abierta");
  });
});
