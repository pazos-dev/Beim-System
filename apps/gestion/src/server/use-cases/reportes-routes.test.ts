import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as verReportes } from "../../../app/api/gestion/reportes/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let cajaCookie = "";
let vendedorCookie = "";
let tecnicoCookie = "";
let adminCookie = "";

const CAJA_OWNER = "u-caja";

function fixtureDocs(): Record<string, unknown> {
  return {
    "ventas.json": {
      version: 0,
      ventas: [
        { id: "v_mine", ownerId: CAJA_OWNER, version: 1, numero: "0001-000001", items: [{ productoId: "p_1", cantidad: 1, precio: 500 }], pagos: [{ metodo: "efectivo", monto: 500 }], total: 500, estado: "confirmada" },
        { id: "v_other", ownerId: "u-other", version: 1, numero: "0001-000002", items: [{ productoId: "p_1", cantidad: 1, precio: 1000 }], pagos: [{ metodo: "efectivo", monto: 1000 }], total: 1000, estado: "confirmada" }
      ]
    },
    "gastos.json": {
      version: 0,
      gastos: [
        { id: "g_mine", ownerId: CAJA_OWNER, version: 1, descripcion: "Insumo", importe: 100, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" }
      ]
    },
    "compras.json": {
      version: 0,
      compras: [
        { id: "c_mine", ownerId: CAJA_OWNER, version: 1, productoId: "p_1", proveedor: "Prov", cantidad: 1, costoUnitario: 50, fecha: "2026-01-10T12:00:00.000Z", total: 50 },
        { id: "c_other", ownerId: "u-other", version: 1, productoId: "p_1", proveedor: "Prov", cantidad: 1, costoUnitario: 400, fecha: "2026-01-10T12:00:00.000Z", total: 400 }
      ]
    },
    "sesiones-caja.json": { version: 0, sesionesCaja: [] }
  };
}

function request(url: string, cookie: string | undefined): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
  return new NextRequest(url, { headers });
}

async function loginAs(dataDirectory: string, username: string): Promise<string> {
  const service = new AuthService(dataDirectory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

const PERIOD = "desde=2026-01-01&hasta=2026-01-31";

describe("GET /api/gestion/reportes (RPT-1/3/5)", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-reportes-");
    for (const [file, doc] of Object.entries(fixtureDocs())) {
      await writeFile(join(directory, file), JSON.stringify(doc));
    }
    process.env.GESTION_DATA_DIR = directory;
    cajaCookie = await loginAs(directory, "caja");
    vendedorCookie = await loginAs(directory, "vendedor");
    tecnicoCookie = await loginAs(directory, "tecnico");
    adminCookie = await loginAs(directory, "administrador");
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects reads without a session (401)", async () => {
    for (const formato of ["", "&formato=csv"]) {
      const response = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}${formato}`, undefined));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    }
  });

  it("denies vendedor and tecnico with zero leaks and no audit", async () => {
    const auditBefore = await readFile(join(directory, "audit.json"), "utf8").catch(() => "missing");
    for (const cookie of [vendedorCookie, tecnicoCookie]) {
      const response = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}`, cookie));
      expect(response.status).toBe(403);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect("data" in body).toBe(false);
    }
    expect(await readFile(join(directory, "audit.json"), "utf8").catch(() => "missing")).toBe(auditBefore);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await verReportes(
      request(`http://localhost/api/gestion/reportes?${PERIOD}&role=administrador`, vendedorCookie)
    );
    expect(forged.status).toBe(403);
    const unauthenticated = await verReportes(
      request(`http://localhost/api/gestion/reportes?${PERIOD}&role=administrador`, undefined)
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("rejects inverted and missing periods with VALIDATION_ERROR", async () => {
    const inverted = await verReportes(
      request("http://localhost/api/gestion/reportes?desde=2026-02-01&hasta=2026-01-01", cajaCookie)
    );
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    const missing = await verReportes(request("http://localhost/api/gestion/reportes?desde=2026-01-01", cajaCookie));
    expect(missing.status).toBe(400);
  });

  it("scopes caja to own items while globals see every document", async () => {
    const caja = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}`, cajaCookie));
    expect(caja.status).toBe(200);
    const scoped = ((await caja.json()) as { data: { ventas: { netas: number }; compras: { total: number }; gastos: { total: number }; neto: number } }).data;
    expect(scoped.ventas.netas).toBe(500);
    expect(scoped.compras.total).toBe(50);
    expect(scoped.gastos.total).toBe(100);
    expect(scoped.neto).toBe(400);
    const admin = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}`, adminCookie));
    expect(admin.status).toBe(200);
    const every = ((await admin.json()) as { data: { ventas: { netas: number }; compras: { total: number } } }).data;
    expect(every.ventas.netas).toBe(1500);
    expect(every.compras.total).toBe(450);
  });

  it("serves CSV with attachment for the identical snapshot", async () => {
    const json = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}`, cajaCookie));
    const snapshot = ((await json.json()) as { data: { ventas: { netas: number }; compras: { total: number }; gastos: { total: number }; neto: number } }).data;
    const csv = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}&formato=csv`, cajaCookie));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/text\/csv/);
    expect(csv.headers.get("content-disposition")).toBe(
      'attachment; filename="reporte-2026-01-01-2026-01-31.csv"'
    );
    const text = (await csv.text()).replace(/"/g, "");
    expect(text).toMatch(new RegExp(`ventas_netas;${snapshot.ventas.netas}`));
    expect(text).toMatch(new RegExp(`compras_total;${snapshot.compras.total}`));
    expect(text).toMatch(new RegExp(`gastos_total;${snapshot.gastos.total}`));
    expect(text).toMatch(new RegExp(`neto;${snapshot.neto}`));
  });

  it("fails closed with STORAGE_ERROR on corrupt stores", async () => {
    const corrupt = await createSeedDirectory("gestion-reportes-corrupt-");
    try {
      await writeFile(join(corrupt, "ventas.json"), "{ corrupt");
      process.env.GESTION_DATA_DIR = corrupt;
      const cookie = await loginAs(corrupt, "administrador");
      const response = await verReportes(request(`http://localhost/api/gestion/reportes?${PERIOD}`, cookie));
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    } finally {
      process.env.GESTION_DATA_DIR = directory;
      await rm(corrupt, { force: true, recursive: true });
    }
  });
});
