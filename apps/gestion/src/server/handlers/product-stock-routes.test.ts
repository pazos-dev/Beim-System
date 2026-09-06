import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as listProductos, POST as createProducto } from "../../../app/api/gestion/productos/route";
import { GET as getProducto } from "../../../app/api/gestion/productos/[id]/route";
import { POST as createCompra } from "../../../app/api/gestion/compras/route";
import { GET as getStock } from "../../../app/api/gestion/stock/route";
import { POST as createTransferencia } from "../../../app/api/gestion/stock/transferencias/route";
import { AuthService, clearSessionsForTests } from "./auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { SESSION_COOKIE_NAME } from "./session";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let adminCookie = "";
let sellerCookie = "";
let cashierCookie = "";

function apiRequest(path: string, cookie: string | undefined, body?: unknown, method = "GET", key?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function loginAs(username: string): Promise<string> {
  const result = await new AuthService(directory).login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("rutas de productos, compras y stock", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-product-stock-");
    process.env.GESTION_DATA_DIR = directory;
    adminCookie = await loginAs("administrador");
    sellerCookie = await loginAs("vendedor");
    cashierCookie = await loginAs("caja");
  });
  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });
  it("rechaza sin sesion con 401", async () => {
    const responses = [
      await listProductos(apiRequest("/api/gestion/productos", undefined)),
      await createCompra(apiRequest("/api/gestion/compras", undefined, {}, "POST")),
      await getStock(apiRequest("/api/gestion/stock?productoId=p_1", undefined)),
      await createTransferencia(apiRequest("/api/gestion/stock/transferencias", undefined, {}, "POST"))
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await bodyOf(response)).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    }
  });
  it("da de alta un producto y la compra actualiza el costo ponderado", async () => {
    const created = await createProducto(apiRequest("/api/gestion/productos", adminCookie,
      { displayName: "Filtro de aceite", price: 1200, cost: 800, stock: 8 }, "POST"));
    expect(created.status).toBe(201);
    const product = (await bodyOf(created))["data"] as { id: string };
    const purchased = await createCompra(apiRequest("/api/gestion/compras", adminCookie,
      { productoId: product.id, cantidad: 4, costoUnitario: 850, proveedor: "Proveedor SA" }, "POST", "k-product-compra-1"));
    expect(purchased.status).toBe(201);
    expect(await bodyOf(purchased)).toMatchObject({ ok: true, data: { producto: { stock: 12, cost: 816.67 } } });
  });
  it("transfiere con movimientos pareados y expone el nivel", async () => {
    const transferred = await createTransferencia(apiRequest("/api/gestion/stock/transferencias", adminCookie,
      { productoId: "p_1", cantidad: 2, origen: "principal", destino: "taller" }, "POST", "k-product-transfer-1"));
    expect(transferred.status).toBe(201);
    const movements = (await bodyOf(transferred))["data"] as { movimientos: Array<Record<string, unknown>> };
    expect(movements.movimientos[0]).toMatchObject({ cantidad: -2, motivo: "transferencia", balanceAfter: 2 });
    expect(movements.movimientos[1]).toMatchObject({ cantidad: 2, motivo: "transferencia", balanceAfter: 2 });
    expect(movements.movimientos[0]?.["referencia"]).toBe(movements.movimientos[1]?.["referencia"]);
    const level = await getStock(apiRequest("/api/gestion/stock?productoId=p_1", adminCookie));
    expect(level.status).toBe(200);
    const levelBody = (await bodyOf(level))["data"] as {
      items: Array<{ productoId: string; deposito: string }>;
      totalItems: number;
    };
    expect(levelBody.totalItems).toBeGreaterThanOrEqual(1);
    expect(levelBody.items.some((item) => item.productoId === "p_1" && item.deposito === "principal")).toBe(true);
  });
  it("rechaza stock insuficiente con 4xx sin mutar", async () => {
    const before = await readFile(join(directory, "movimientos-stock.json"), "utf8");
    const transferred = await createTransferencia(apiRequest("/api/gestion/stock/transferencias", adminCookie,
      { productoId: "p_1", cantidad: 999, origen: "principal", destino: "taller" }, "POST", "k-product-transfer-409"));
    expect(transferred.status).toBe(409);
    expect(await bodyOf(transferred)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await readFile(join(directory, "movimientos-stock.json"), "utf8")).toBe(before);
  });
  it("niega rol sin permiso y oculta producto ajeno", async () => {
    const created = await createProducto(apiRequest("/api/gestion/productos", cashierCookie, { displayName: "Bujia", price: 500 }, "POST"));
    expect(created.status).toBe(403);
    const purchased = await createCompra(apiRequest("/api/gestion/compras", sellerCookie,
      { productoId: "p_1", cantidad: 1, costoUnitario: 100, proveedor: "Proveedor SA" }, "POST"));
    expect(purchased.status).toBe(403);
    const foreign = await getProducto(apiRequest("/api/gestion/productos/p_1", sellerCookie), { params: Promise.resolve({ id: "p_1" }) });
    expect(foreign.status).toBe(404);
    expect(await bodyOf(foreign)).toMatchObject({ ok: false, error: { code: "NOT_FOUND_OR_FORBIDDEN" } });
  });
});
