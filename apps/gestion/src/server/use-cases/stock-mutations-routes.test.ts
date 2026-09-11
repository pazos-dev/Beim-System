import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as postMovimientos } from "../../../app/api/gestion/stock/movimientos/route";
import { POST as postTransferencias } from "../../../app/api/gestion/stock/transferencias/route";
import { POST as postCompras } from "../../../app/api/gestion/compras/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
let directory = "";
let adminCookie = "";
let principalCookie = "";
let sellerCookie = "";
let technicianCookie = "";

function postRequest(
  cookie: string | undefined,
  body: unknown,
  key?: string,
  url = "http://localhost/api/gestion/stock/movimientos"
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

async function snapshot(): Promise<Record<string, string>> {
  return {
    productos: await readFile(join(directory, "productos.json"), "utf8"),
    movimientos: await readFile(join(directory, "movimientos-stock.json"), "utf8"),
    compras: await readFile(join(directory, "compras.json"), "utf8"),
  };
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("POST /api/gestion/stock/movimientos", () => {
  it("rejects outflow without a session (401)", async () => {
    const response = await postMovimientos(
      postRequest(undefined, { productoId: "p_1", cantidad: 1, motivo: "venta" }, "k-401")
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("requires Idempotency-Key (400)", async () => {
    const response = await postMovimientos(
      postRequest(adminCookie, { productoId: "p_1", cantidad: 1, motivo: "venta" })
    );
    expect(response.status).toBe(400);
  });

  it("rejects ajuste from non-principal admin (403) with zero writes", async () => {
    const before = await snapshot();
    const response = await postMovimientos(
      postRequest(
        adminCookie,
        { productoId: "p_1", cantidad: 1, motivo: "venta", ajuste: true },
        "k-ajuste-403"
      )
    );
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("returns 503 for authorized outflow without local mutation or fetch", async () => {
    const before = await snapshot();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await postMovimientos(
      postRequest(sellerCookie, { productoId: "p_1", cantidad: 1, motivo: "venta" }, "k-mov-503")
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    expect(body.error.message).toMatch(/^Próxima implementación:/);
    expect(await snapshot()).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns 503 for principal ajuste without local mutation or fetch", async () => {
    const before = await snapshot();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await postMovimientos(
      postRequest(
        principalCookie,
        { productoId: "p_1", cantidad: 1, motivo: "venta", ajuste: true },
        "k-ajuste-503"
      )
    );

    expect(response.status).toBe(503);
    expect(await snapshot()).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("POST /api/gestion/stock/transferencias", () => {
  it("rejects without a session (401)", async () => {
    const response = await postTransferencias(
      postRequest(
        undefined,
        { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
        "k-tr-401",
        "http://localhost/api/gestion/stock/transferencias"
      )
    );
    expect(response.status).toBe(401);
  });

  it("requires Idempotency-Key (400)", async () => {
    const response = await postTransferencias(
      postRequest(
        adminCookie,
        { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
        undefined,
        "http://localhost/api/gestion/stock/transferencias"
      )
    );
    expect(response.status).toBe(400);
  });

  it("rejects tecnico (403) with zero writes", async () => {
    const before = await snapshot();
    const response = await postTransferencias(
      postRequest(
        technicianCookie,
        { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
        "k-tr-403",
        "http://localhost/api/gestion/stock/transferencias"
      )
    );
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("returns 503 for authorized transfer without local mutation or fetch", async () => {
    const before = await snapshot();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await postTransferencias(
      postRequest(
        adminCookie,
        { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" },
        "k-tr-503",
        "http://localhost/api/gestion/stock/transferencias"
      )
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    expect(body.error.message).toMatch(/^Próxima implementación:/);
    expect(await snapshot()).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("POST /api/gestion/compras", () => {
  it("rejects without a session (401)", async () => {
    const response = await postCompras(
      postRequest(
        undefined,
        { productoId: "p_1", cantidad: 1, costoUnitario: 800, proveedor: "Proveedor SA" },
        "k-compra-401",
        "http://localhost/api/gestion/compras"
      )
    );
    expect(response.status).toBe(401);
  });

  it("requires Idempotency-Key (400)", async () => {
    const response = await postCompras(
      postRequest(
        adminCookie,
        { productoId: "p_1", cantidad: 1, costoUnitario: 800, proveedor: "Proveedor SA" },
        undefined,
        "http://localhost/api/gestion/compras"
      )
    );
    expect(response.status).toBe(400);
  });

  it("rejects vendedor (403) with zero writes", async () => {
    const before = await snapshot();
    const response = await postCompras(
      postRequest(
        sellerCookie,
        { productoId: "p_1", cantidad: 1, costoUnitario: 800, proveedor: "Proveedor SA" },
        "k-compra-403",
        "http://localhost/api/gestion/compras"
      )
    );
    expect(response.status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });

  it("returns 503 for authorized purchase without local mutation or fetch", async () => {
    const before = await snapshot();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await postCompras(
      postRequest(
        adminCookie,
        { productoId: "p_1", cantidad: 1, costoUnitario: 800, proveedor: "Proveedor SA" },
        "k-compra-503",
        "http://localhost/api/gestion/compras"
      )
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body).toMatchObject({ ok: false, error: { code: "DEPENDENCY_UNAVAILABLE" } });
    expect(body.error.message).toMatch(/^Próxima implementación:/);
    expect(await snapshot()).toEqual(before);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-stock-mutations-routes-");
  process.env.GESTION_DATA_DIR = directory;
  adminCookie = await loginAs("administrador");
  principalCookie = await loginAs("administrador_principal");
  sellerCookie = await loginAs("vendedor");
  technicianCookie = await loginAs("tecnico");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  if (previousBaseUrl === undefined) delete process.env.BEIM_API_BASE_URL;
  else process.env.BEIM_API_BASE_URL = previousBaseUrl;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
