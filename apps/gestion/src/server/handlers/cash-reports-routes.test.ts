import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as estadoCaja, POST as moverCaja } from "../../../app/api/gestion/caja/route";
import { GET as verReportes } from "../../../app/api/gestion/reportes/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { SESSION_COOKIE_NAME } from "../handlers/session";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let emptyDirectory = "";
let cajaCookie = "";
let vendedorCookie = "";

const CAJA_OWNER = "u-caja";

function fixtureDocs(): Record<string, unknown> {
  return {
    "ventas.json": {
      version: 0,
      ventas: [
        { id: "v_1", ownerId: CAJA_OWNER, version: 1, numero: "0001-000001", items: [{ productoId: "p_1", cantidad: 1, precio: 500 }], pagos: [{ metodo: "efectivo", monto: 300 }, { metodo: "tarjeta", monto: 200 }], total: 500, estado: "confirmada" },
        { id: "v_2", ownerId: CAJA_OWNER, version: 1, numero: "0001-000002", items: [{ productoId: "p_1", cantidad: 1, precio: 200 }], pagos: [{ metodo: "efectivo", monto: 200 }], total: 200, estado: "confirmada" },
        { id: "v_3", ownerId: CAJA_OWNER, version: 1, numero: "0001-000003", items: [{ productoId: "p_1", cantidad: 1, precio: 999 }], pagos: [{ metodo: "efectivo", monto: 999 }], total: 999, estado: "anulada" },
        { id: "v_4", ownerId: CAJA_OWNER, version: 1, numero: "0001-000004", items: [{ productoId: "p_1", cantidad: 1, precio: 150 }], pagos: [{ metodo: "efectivo", monto: 150 }], total: 150, estado: "devuelta" }
      ]
    },
    "gastos.json": {
      version: 0,
      gastos: [
        { id: "g_1", ownerId: CAJA_OWNER, version: 1, descripcion: "Insumo", importe: 100, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" },
        { id: "g_2", ownerId: CAJA_OWNER, version: 1, descripcion: "Insumo", importe: 200, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" },
        { id: "g_3", ownerId: CAJA_OWNER, version: 1, descripcion: "Fuera de periodo", importe: 999, fecha: "2026-02-01T12:00:00.000Z", categoria: "operativo", medio: "efectivo" }
      ]
    },
    "compras.json": {
      version: 0,
      compras: [
        { id: "c_1", ownerId: CAJA_OWNER, version: 1, productoId: "p_1", proveedor: "Prov", cantidad: 2, costoUnitario: 200, fecha: "2026-01-10T12:00:00.000Z", total: 400 }
      ]
    },
    "sesiones-caja.json": { version: 0, sesionesCaja: [] }
  };
}

async function seed(directoryPath: string, docs: Record<string, unknown>): Promise<void> {
  for (const [file, doc] of Object.entries(docs)) {
    await writeFile(join(directoryPath, file), JSON.stringify(doc));
  }
}

function request(url: string, cookie: string | undefined, init?: { method?: string; body?: string; headers?: Record<string, string> }): NextRequest {
  const headers = new Headers(init?.headers);
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(url, { ...init, headers });
}

async function loginAs(dataDirectory: string, username: string): Promise<string> {
  const service = new AuthService(dataDirectory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/caja + /api/gestion/reportes routes", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-cash-");
    await seed(directory, fixtureDocs());
    process.env.GESTION_DATA_DIR = directory;
    cajaCookie = await loginAs(directory, "caja");
    vendedorCookie = await loginAs(directory, "vendedor");
    emptyDirectory = await createSeedDirectory("gestion-cash-empty-");
    await seed(emptyDirectory, {
      "ventas.json": { version: 0, ventas: [] },
      "gastos.json": { version: 0, gastos: [] },
      "compras.json": { version: 0, compras: [] },
      "sesiones-caja.json": { version: 0, sesionesCaja: [] }
    });
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
    await rm(emptyDirectory, { force: true, recursive: true });
  });

  it("rejects cash and reports without a session cookie", async () => {
    expect((await estadoCaja(request("http://localhost/api/gestion/caja", undefined))).status).toBe(401);
    expect((await moverCaja(request("http://localhost/api/gestion/caja", undefined, { method: "POST", body: JSON.stringify({ accion: "abrir", fecha: "2026-01-15", apertura: 1000 }) }))).status).toBe(401);
    expect((await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31", undefined))).status).toBe(401);
  });

  it("denies roles without cash/reports permission", async () => {
    const opened = await moverCaja(request("http://localhost/api/gestion/caja", vendedorCookie, { method: "POST", body: JSON.stringify({ accion: "abrir", fecha: "2026-01-15", apertura: 1000 }) }));
    expect(opened.status).toBe(403);
    const report = await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31", vendedorCookie));
    expect(report.status).toBe(403);
  });

  it("opens once, reports deterministic expected and blocks a second opening", async () => {
    const opened = await moverCaja(request("http://localhost/api/gestion/caja", cajaCookie, { method: "POST", body: JSON.stringify({ accion: "abrir", fecha: "2026-01-15", apertura: 1000 }) }));
    expect(opened.status).toBe(201);
    const estado = await estadoCaja(request("http://localhost/api/gestion/caja", cajaCookie));
    const body = (await estado.json()) as { ok: boolean; data: { abierta: boolean; esperado: number } };
    expect(body.data.abierta).toBe(true);
    expect(body.data.esperado).toBe(1000 + 500 - 300 - 0);
    const before = await readFile(join(directory, "sesiones-caja.json"), "utf8");
    const repeated = await moverCaja(request("http://localhost/api/gestion/caja", cajaCookie, { method: "POST", body: JSON.stringify({ accion: "abrir", fecha: "2026-01-15", apertura: 1000 }) }));
    expect(repeated.status).toBe(409);
    expect(await readFile(join(directory, "sesiones-caja.json"), "utf8")).toBe(before);
  });

  it("closes with an audited difference", async () => {
    const closed = await moverCaja(request("http://localhost/api/gestion/caja", cajaCookie, { method: "POST", body: JSON.stringify({ accion: "cerrar", contado: 1150, retiros: 100 }) }));
    expect(closed.status).toBe(200);
    const body = (await closed.json()) as { ok: boolean; data: { estado: string; esperado: number; contado: number; diferencia: number } };
    expect(body.data.estado).toBe("cerrada");
    expect(body.data.esperado).toBe(1000 + 500 - 300 - 100);
    expect(body.data.diferencia).toBe(50);
    const audit = await readFile(join(directory, "audit.json"), "utf8");
    expect(audit).toMatch(/caja\.cerrar/);
    expect(audit).toMatch(/sobrante/);
  });

  it("serves CSV with the same numbers as JSON", async () => {
    const json = await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31", cajaCookie));
    const snapshot = ((await json.json()) as { data: { ventas: { netas: number }; compras: { total: number }; gastos: { total: number }; neto: number } }).data;
    expect(snapshot.ventas.netas).toBe(550);
    expect(snapshot.gastos.total).toBe(300);
    expect(snapshot.compras.total).toBe(400);
    expect(snapshot.neto).toBe(250);
    const csv = await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31&formato=csv", cajaCookie));
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    const text = (await csv.text()).replace(/"/g, "");
    expect(text).toMatch(new RegExp(`ventas_netas;${snapshot.ventas.netas}`));
    expect(text).toMatch(new RegExp(`gastos_total;${snapshot.gastos.total}`));
    expect(text).toMatch(new RegExp(`neto;${snapshot.neto}`));
  });

  it("answers zeros for an empty period instead of failing", async () => {
    process.env.GESTION_DATA_DIR = emptyDirectory;
    try {
      const emptyCookie = await loginAs(emptyDirectory, "caja");
      const response = await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01&hasta=2026-01-31", emptyCookie));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { ok: boolean; data: { ventas: { netas: number }; gastos: { total: number }; neto: number } };
      expect(body.data.ventas.netas).toBe(0);
      expect(body.data.gastos.total).toBe(0);
      expect(body.data.neto).toBe(0);
    } finally {
      process.env.GESTION_DATA_DIR = directory;
    }
  });
});
