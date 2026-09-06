import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as postMovimientos } from "../../../app/api/gestion/stock/movimientos/route";
import { POST as postTransferencias } from "../../../app/api/gestion/stock/transferencias/route";
import { POST as postCompras } from "../../../app/api/gestion/compras/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
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

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("POST /api/gestion/stock/movimientos (STK-2 RED)", () => {
  it("rejects outflow without a session (401)", async () => {
    const response = await postMovimientos(
      postRequest(undefined, { productoId: "p_1", cantidad: 1, motivo: "venta" }, "k-401")
    );
    expect(response.status).toBe(401);
  });

  it("requires Idempotency-Key (400)", async () => {
    const response = await postMovimientos(
      postRequest(adminCookie, { productoId: "p_1", cantidad: 1, motivo: "venta" })
    );
    expect(response.status).toBe(400);
  });

  it("rejects ajuste from non-principal admin (403) with zero writes", async () => {
    const before = await readFile(join(directory, "movimientos-stock.json"), "utf8");
    const response = await postMovimientos(
      postRequest(adminCookie, { productoId: "p_1", cantidad: 1, motivo: "venta", ajuste: true }, "k-ajuste-403")
    );
    expect(response.status).toBe(403);
    expect(await readFile(join(directory, "movimientos-stock.json"), "utf8")).toBe(before);
  });

  it("records seller outflow on visible stock and replays once", async () => {
    const first = await postMovimientos(
      postRequest(principalCookie, { productoId: "p_1", cantidad: 1, motivo: "venta" }, "k-mov-replay")
    );
    expect(first.status).toBe(201);
    const second = await postMovimientos(
      postRequest(principalCookie, { productoId: "p_1", cantidad: 1, motivo: "venta" }, "k-mov-replay")
    );
    expect(second.status).toBe(201);
    expect(await second.json()).toMatchObject({ ok: true });
    expect(sellerCookie.length).toBeGreaterThan(0);
  });
});

describe("POST transferencias hardened (STK-3 RED)", () => {
  it("rejects tecnico transfer with 403", async () => {
    const response = await postTransferencias(
      postRequest(technicianCookie, { productoId: "p_1", cantidad: 1, origen: "principal", destino: "taller" }, "k-tr-403", "http://localhost/api/gestion/stock/transferencias")
    );
    expect(response.status).toBe(403);
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
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
