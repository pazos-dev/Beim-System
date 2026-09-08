import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as verReportes } from "../../../app/api/gestion/reportes/route";
import { POST as loginRoute } from "../../../app/api/gestion/auth/login/route";
import { buildPeriodSnapshot, snapshotToCsv } from "../../lib/domain/reports/reports";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const CONSOLE_BASE_URL = "http://console-sales-test:4000";
const CONSOLE_BEARER = "console-bearer-sales-1";

const REMOTE_SUMMARY = {
  ok: true,
  data: {
    from: "2026-01-01",
    to: "2026-01-31",
    totalSales: 5000,
    ticketCount: 25,
    averageTicket: 200,
    byDay: [
      { date: "2026-01-01", total: 0, count: 0 },
      { date: "2026-01-02", total: 5000, count: 25 }
    ],
    byMethod: [
      { method: "efectivo", total: 3000, count: 15 },
      { method: "tarjeta", total: 2000, count: 10 }
    ]
  }
};

function fixtureDocs(): Record<string, unknown> {
  return {
    "ventas.json": {
      version: 0,
      ventas: [
        { id: "v_1", ownerId: "u-admin", version: 1, numero: "0001-000001", items: [{ productoId: "p_1", cantidad: 1, precio: 700 }], pagos: [{ metodo: "efectivo", monto: 700 }], total: 700, estado: "confirmada" },
        { id: "v_2", ownerId: "u-admin", version: 1, numero: "0001-000002", items: [{ productoId: "p_1", cantidad: 1, precio: 150 }], pagos: [{ metodo: "efectivo", monto: 150 }], total: 150, estado: "devuelta" }
      ]
    },
    "gastos.json": {
      version: 0,
      gastos: [
        { id: "g_1", ownerId: "u-admin", version: 1, descripcion: "Insumo", importe: 100, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" }
      ]
    },
    "compras.json": {
      version: 0,
      compras: [
        { id: "c_1", ownerId: "u-admin", version: 1, productoId: "p_1", proveedor: "Prov", cantidad: 2, costoUnitario: 200, fecha: "2026-01-10T12:00:00.000Z", total: 400 }
      ]
    }
  };
}

async function seed(directoryPath: string): Promise<void> {
  for (const [file, doc] of Object.entries(fixtureDocs())) {
    await writeFile(join(directoryPath, file), JSON.stringify(doc));
  }
}

function reportRequest(cookie: string | undefined, query = "desde=2026-01-01&hasta=2026-01-31"): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(`http://localhost/api/gestion/reportes?${query}`, { headers });
}

function loginRequest(username: string): NextRequest {
  return new NextRequest("http://localhost/api/gestion/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, credential: `dev-${username}` })
  });
}

function consoleLoginOk(): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        token: CONSOLE_BEARER,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        user: { id: "c-1", username: "administrador", name: "Admin", role: "admin" }
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

async function localAdminCookie(): Promise<string> {
  const service = new AuthService(process.env.GESTION_DATA_DIR as string);
  const result = await service.login({ username: "administrador", credential: "dev-administrador" });
  if (!result.ok) throw new Error("Expected administrador to authenticate.");
  return result.value.cookieValue;
}

async function bearerAdminCookie(): Promise<string> {
  vi.stubGlobal("fetch", async () => consoleLoginOk());
  const login = await loginRoute(loginRequest("administrador"));
  expect(login.status).toBe(200);
  const cookie = login.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie === undefined) throw new Error("Expected a session cookie with console bearer.");
  return cookie;
}

const previousDataDir = process.env.GESTION_DATA_DIR;
const previousConsoleBase = process.env.BEIM_API_BASE_URL;
let directory = "";

describe("GET /api/gestion/reportes sales-summary slice", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-reportes-sales-");
    await seed(directory);
    process.env.GESTION_DATA_DIR = directory;
    process.env.BEIM_API_BASE_URL = CONSOLE_BASE_URL;
  });

  afterAll(async () => {
    if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDir;
    if (previousConsoleBase === undefined) delete process.env.BEIM_API_BASE_URL;
    else process.env.BEIM_API_BASE_URL = previousConsoleBase;
    clearSessionsForTests();
    vi.unstubAllGlobals();
    await rm(directory, { force: true, recursive: true });
  });

  afterEach(async () => {
    clearSessionsForTests();
    vi.unstubAllGlobals();
    await seed(directory);
  });

  it("serves the byte-identical local snapshot with source local when no Bearer exists", async () => {
    const cookie = await localAdminCookie();
    const response = await verReportes(reportRequest(cookie));
    const body = (await response.json()) as { ok: boolean; data: Record<string, unknown> };

    const expected = buildPeriodSnapshot({
      desde: "2026-01-01",
      hasta: "2026-01-31",
      ventas: [
        { estado: "confirmada", total: 700 },
        { estado: "devuelta", total: 150 }
      ],
      compras: [{ fecha: "2026-01-10T12:00:00.000Z", total: 400 }],
      gastos: [{ fecha: "2026-01-15T12:00:00.000Z", importe: 100, categoria: "operativo" }]
    });

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ ...expected, source: "local" });
    expect(body.data).not.toHaveProperty("ventasApi");
  });

  it("builds VENTAS from the API with extras and the Authorization header when a Bearer exists", async () => {
    const cookie = await bearerAdminCookie();
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(REMOTE_SUMMARY), { status: 200 });
    });

    const response = await verReportes(reportRequest(cookie));
    const body = (await response.json()) as {
      ok: boolean;
      data: {
        ventas: { netas: number; cantidad: number; devoluciones: number };
        compras: { total: number };
        gastos: { total: number };
        neto: number;
        source: string;
        ventasApi: { promedio: number; byDay: unknown[]; byMethod: Array<{ method: string; label: string }> };
      };
    };

    expect(response.status).toBe(200);
    expect(body.data.ventas).toEqual({ netas: 5000, cantidad: 25, devoluciones: 150 });
    expect(body.data.compras.total).toBe(400);
    expect(body.data.gastos.total).toBe(100);
    expect(body.data.neto).toBe(5000 - 100);
    expect(body.data.source).toBe("api");
    expect(body.data.ventasApi.promedio).toBe(200);
    expect(body.data.ventasApi.byDay).toHaveLength(2);
    expect(body.data.ventasApi.byMethod).toEqual([
      { method: "efectivo", label: "Efectivo", total: 3000, count: 15 },
      { method: "tarjeta", label: "Tarjeta", total: 2000, count: 10 }
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${CONSOLE_BASE_URL}/api/v1/reports/sales-summary?from=2026-01-01&to=2026-01-31`);
    expect((calls[0]?.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${CONSOLE_BEARER}`);
    expect(JSON.stringify(body)).not.toContain(CONSOLE_BEARER);
  });

  it("fails closed with DEPENDENCY_UNAVAILABLE on an invalid API envelope", async () => {
    const cookie = await bearerAdminCookie();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true, data: null }), { status: 200 }));

    const response = await verReportes(reportRequest(cookie));
    const raw = await response.text();

    expect(response.status).toBe(503);
    expect(raw).toContain("DEPENDENCY_UNAVAILABLE");
  });

  it("serializes CSV through the unchanged snapshotToCsv, ignoring extras", async () => {
    const cookie = await bearerAdminCookie();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(REMOTE_SUMMARY), { status: 200 }));

    const response = await verReportes(reportRequest(cookie, "desde=2026-01-01&hasta=2026-01-31&formato=csv"));
    expect(response.headers.get("content-type")).toMatch(/text\/csv/);
    const text = (await response.text()).replace(/"/g, "");
    expect(text).toMatch(/ventas_netas;5000/);
    expect(text).toMatch(/ventas_devoluciones;150/);
    expect(text).toMatch(/neto;4900/);
    expect(snapshotToCsv(buildPeriodSnapshot({
      desde: "2026-01-01",
      hasta: "2026-01-31",
      ventas: [],
      compras: [],
      gastos: []
    }))).toContain("ventas_netas");
  });
});
