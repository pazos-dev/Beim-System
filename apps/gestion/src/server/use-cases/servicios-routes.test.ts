import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET as listServicios } from "../../../app/api/gestion/servicios/route";
import { GET as getServicio } from "../../../app/api/gestion/servicios/[id]/route";
import { AuthService, clearSessionsForTests } from "../handlers/auth";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createSeedDirectory } from "../../test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";
let sellerCookie = "";
let technicianCookie = "";

function serviciosRequest(cookie: string | undefined, url = "http://localhost/api/gestion/servicios"): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(url, { headers });
}

function servicioByIdRequest(cookie: string | undefined, id: string, query = ""): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  return new NextRequest(`http://localhost/api/gestion/servicios/${id}${query}`, { headers });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/servicios GET routes (SRV-1/SRV-4)", () => {
  it("rejects listing and detail without a session (401)", async () => {
    const listed = await listServicios(serviciosRequest(undefined));
    expect(listed.status).toBe(401);
    expect(await listed.json()).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" }
    });
    const found = await getServicio(servicioByIdRequest(undefined, "s_1"), {
      params: Promise.resolve({ id: "s_1" })
    });
    expect(found.status).toBe(401);
  });

  it("ignores a forged client-side role and authorizes from the session", async () => {
    const forged = await listServicios(
      serviciosRequest(sellerCookie, "http://localhost/api/gestion/servicios?role=administrador")
    );
    expect(forged.status).toBe(200);
    const unauthenticated = await listServicios(
      serviciosRequest(undefined, "http://localhost/api/gestion/servicios?role=administrador")
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("lists any-role with the envelope contract and no owner leak", async () => {
    for (const cookie of [sellerCookie, technicianCookie]) {
      const response = await listServicios(serviciosRequest(cookie));
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(25);
      expect(body.data.totalItems).toBe(2);
      expect(JSON.stringify(body)).not.toMatch(/ownerId/);
    }
  });

  it("filters by q and active, paginating the envelope", async () => {
    const filtered = await listServicios(
      serviciosRequest(sellerCookie, "http://localhost/api/gestion/servicios?q=tecnico&active=true&page=1&pageSize=25")
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; totalItems: number };
    };
    expect(filteredBody.data.totalItems).toBe(1);
    expect(filteredBody.data.items[0]?.id).toBe("s_2");

    const onlyInactive = await listServicios(
      serviciosRequest(sellerCookie, "http://localhost/api/gestion/servicios?active=false")
    );
    const inactiveBody = (await onlyInactive.json()) as {
      ok: boolean;
      data: { items: { id: string }[]; totalItems: number };
    };
    expect(inactiveBody.data.totalItems).toBe(1);
    expect(inactiveBody.data.items[0]?.id).toBe("s_hidden");
  });

  it("returns 404 for unknown servicio ids", async () => {
    const response = await getServicio(servicioByIdRequest(sellerCookie, "missing"), {
      params: Promise.resolve({ id: "missing" })
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND_OR_FORBIDDEN" }
    });
  });

  it("hides inactive servicios by default but keeps them readable with active=all", async () => {
    const hidden = await getServicio(servicioByIdRequest(sellerCookie, "s_hidden"), {
      params: Promise.resolve({ id: "s_hidden" })
    });
    expect(hidden.status).toBe(404);
    const readable = await getServicio(servicioByIdRequest(sellerCookie, "s_hidden", "?active=all"), {
      params: Promise.resolve({ id: "s_hidden" })
    });
    expect(readable.status).toBe(200);
  });

  it("exposes the entity version as ETag on GET detail", async () => {
    const response = await getServicio(servicioByIdRequest(sellerCookie, "s_1"), {
      params: Promise.resolve({ id: "s_1" })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('W/"v1"');
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  directory = await createSeedDirectory("gestion-servicios-routes-");
  const file = join(directory, "servicios.json");
  const raw = JSON.parse(await readFile(file, "utf8")) as {
    version: number;
    servicios: Record<string, unknown>[];
  };
  raw.servicios.push(
    { id: "s_2", ownerId: "u-administrador", version: 1, displayName: "Soporte tecnico", price: 450, active: true },
    { id: "s_hidden", ownerId: "u-administrador", version: 1, displayName: "Servicio archivado", price: 50, active: false }
  );
  await writeFile(file, JSON.stringify(raw, null, 2), "utf8");
  process.env.GESTION_DATA_DIR = directory;
  sellerCookie = await loginAs("vendedor");
  technicianCookie = await loginAs("tecnico");
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});
