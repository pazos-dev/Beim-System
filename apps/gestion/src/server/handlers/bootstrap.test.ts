import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "../../../app/api/gestion/bootstrap/route.js";
import { SESSION_COOKIE_NAME } from "../handlers/session.js";
import { AuthService, clearSessionsForTests } from "../handlers/auth.js";

const BOOTSTRAP_KEYS = ["clientes", "categorias", "productos", "servicios", "ordenes", "ventas",
  "compras", "movimientosStock", "sesionesCaja", "gastos", "users", "audit"];

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let healthyDirectory = "";
let sessionCookie = "";

function bootstrapRequest(cookie: string | undefined): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest("http://localhost/api/gestion/bootstrap", { headers });
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("GET /api/gestion/bootstrap", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    healthyDirectory = await mkdtemp(join(tmpdir(), "gestion-bootstrap-"));
    await cp(join(process.cwd(), "data"), healthyDirectory, { recursive: true });
    const service = new AuthService(healthyDirectory);
    const login = await service.login({ username: "administrador", credential: "dev-administrador" });
    if (!login.ok) throw new Error("Expected the seed administrator to authenticate.");
    sessionCookie = login.value.cookieValue;
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(healthyDirectory, { force: true, recursive: true });
  });

  it("rejects requests without a valid session and exposes no data", async () => {
    process.env.GESTION_DATA_DIR = healthyDirectory;
    const response = await GET(bootstrapRequest(undefined));
    const body = await responseBody(response);
    expect(response.status).toBe(401);
    expect(body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(body).not.toHaveProperty("data");
  });

  it("returns the twelve typed collections with meta for a valid session", async () => {
    process.env.GESTION_DATA_DIR = healthyDirectory;
    const response = await GET(bootstrapRequest(sessionCookie));
    const body = await responseBody(response);
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;
    for (const key of BOOTSTRAP_KEYS) expect(data).toHaveProperty(key);
    expect(data).toMatchObject({ meta: { version: 1 } });
  });

  it("reports a non-durable storage error without partial collections", async () => {
    const brokenDirectory = await mkdtemp(join(tmpdir(), "gestion-bootstrap-broken-"));
    await cp(join(process.cwd(), "data"), brokenDirectory, { recursive: true });
    await writeFile(join(brokenDirectory, "productos.json"), "{invalid}\n", "utf8");
    process.env.GESTION_DATA_DIR = brokenDirectory;
    const response = await GET(bootstrapRequest(sessionCookie));
    const body = await responseBody(response);
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(body).not.toHaveProperty("data");
    await rm(brokenDirectory, { force: true, recursive: true });
    process.env.GESTION_DATA_DIR = healthyDirectory;
  });
});
