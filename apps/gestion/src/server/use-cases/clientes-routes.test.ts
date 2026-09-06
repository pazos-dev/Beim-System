import { rm } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listClientes } from "../../../app/api/gestion/clientes/route";
import { GET as getCliente } from "../../../app/api/gestion/clientes/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let adminCookie = "";

function clientesRequest(cookie: string | undefined, url = "http://localhost/api/gestion/clientes"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

function clienteByIdRequest(cookie: string | undefined, id: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/clientes/${id}`, { headers });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/clientes GET routes (CLI-5)", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-clientes-routes-");
    process.env.GESTION_DATA_DIR = directory;
    sellerCookie = await loginAs("vendedor");
    adminCookie = await loginAs("administrador");
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });

  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listClientes(clientesRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getCliente(clienteByIdRequest(undefined, "c_1"), {
      params: Promise.resolve({ id: "c_1" })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listClientes(
      clientesRequest(sellerCookie, "http://localhost/api/gestion/clientes?role=administrador")
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await listClientes(
      clientesRequest(undefined, "http://localhost/api/gestion/clientes?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists paginated clientes with the envelope contract", async () => {
    const response = await listClientes(clientesRequest(adminCookie));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(25);
    expect(body.data.totalItems).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(body)).not.toMatch(/ownerId/);
  });

  it("returns 404 for unknown cliente ids", async () => {
    const response = await getCliente(clienteByIdRequest(adminCookie, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(response.status).toBe(404);
  });
});
