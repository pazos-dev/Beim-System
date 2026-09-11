import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as listServicios, POST as createServicio } from "./route";
import { GET as getServicio, PATCH as patchServicio } from "./[id]/route";
import { AuthService, clearSessionsForTests } from "../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { attachApiBearer } from "../../../../src/server/shared/session-store";
import { tokenFromCookie } from "../../../../src/server/shared/auth";
import { createSeedDirectory } from "../../../../src/test/seed-dir";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
const previousBaseUrl = process.env.BEIM_API_BASE_URL;
const REMOTE_BASE_URL = "http://remote-servicios.test";

let directory = "";
let adminCookieWithBearer = "";
let adminCookieWithoutBearer = "";
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

function mutationRequest(
  cookie: string | undefined,
  url: string,
  method: string,
  body: unknown,
  key: string | undefined
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(url, { method, headers, body: JSON.stringify(body) });
}

function remoteOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data: body }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("/api/gestion/servicios remote read routes", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-servicios-remote-routes-");
    process.env.GESTION_DATA_DIR = directory;
    process.env.BEIM_API_BASE_URL = REMOTE_BASE_URL;
    await writeFile(join(directory, "servicios.json"), "not-json", "utf8");

    adminCookieWithBearer = await loginAs("administrador");
    adminCookieWithoutBearer = await loginAs("administrador_principal");
    sellerCookie = await loginAs("vendedor");
    technicianCookie = await loginAs("tecnico");

    const token = tokenFromCookie(adminCookieWithBearer);
    if (token === null) throw new Error("Expected a session token.");
    attachApiBearer(token, { token: "remote-bearer", expiresAtMs: Date.now() + 3600000 });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    if (previousBaseUrl === undefined) delete process.env.BEIM_API_BASE_URL;
    else process.env.BEIM_API_BASE_URL = previousBaseUrl;
    clearSessionsForTests();
    const { rm } = await import("node:fs/promises");
    await rm(directory, { force: true, recursive: true });
  });

  it("uses an isolated temp directory instead of the repository data directory", () => {
    const repositoryDataDirectory = join(process.cwd(), "data");
    expect(directory).not.toBe(repositoryDataDirectory);
    expect(directory.startsWith(tmpdir())).toBe(true);
    expect(process.env.GESTION_DATA_DIR).toBe(directory);
    expect(process.env.GESTION_DATA_DIR).not.toBe(repositoryDataDirectory);
  });

  describe("GET /api/gestion/servicios", () => {
    it("rejects unauthenticated requests with 401 before checking the API bearer", async () => {
      const response = await listServicios(serviciosRequest(undefined));

      expect(response.status).toBe(401);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("AUTHENTICATION_REQUIRED");
    });

    it("returns 503 next-implementation when the session has no API bearer", async () => {
      const response = await listServicios(serviciosRequest(adminCookieWithoutBearer));

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
    });

    it("reads from the remote repository and does not touch the local JSON file", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        remoteOk([
          { id: "s_remote", ownerId: "u-remote", version: 1, displayName: "Servicio remoto", price: 100, active: true }
        ])
      );
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listServicios(serviciosRequest(adminCookieWithBearer));

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: { id: string }[]; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0]?.id).toBe("s_remote");
      expect(body.data.totalItems).toBe(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
      expect(url).toBe(`${REMOTE_BASE_URL}/api/v1/services`);
      expect(init.method).toBe("GET");
      expect(init.headers.Authorization).toBe("Bearer remote-bearer");
      vi.unstubAllGlobals();
    });

    it("preserves query parsing, filtering and pagination on remote data", async () => {
      const remoteServicios = Array.from({ length: 4 }, (_, index) => ({
        id: `s_${index}`,
        ownerId: "u-remote",
        version: 1,
        displayName: `Servicio ${index}`,
        price: 100 + index,
        active: index !== 3
      }));
      const fetchSpy = vi.fn().mockResolvedValue(remoteOk(remoteServicios));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await listServicios(
        serviciosRequest(adminCookieWithBearer, "http://localhost/api/gestion/servicios?page=1&pageSize=2&q=Servicio")
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        ok: boolean;
        data: { items: unknown[]; page: number; pageSize: number; totalItems: number };
      };
      expect(body.ok).toBe(true);
      expect(body.data.page).toBe(1);
      expect(body.data.pageSize).toBe(2);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.totalItems).toBe(3);
      vi.unstubAllGlobals();
    });
  });

  describe("GET /api/gestion/servicios/[id]", () => {
    it("returns 503 next-implementation when the session has no API bearer", async () => {
      const response = await getServicio(servicioByIdRequest(adminCookieWithoutBearer, "s_1"), {
        params: Promise.resolve({ id: "s_1" })
      });

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
    });

    it("reads a servicio from the remote repository and exposes the version as ETag", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        remoteOk({
          id: "s_remote",
          ownerId: "u-remote",
          version: 2,
          displayName: "Servicio remoto detalle",
          price: 250,
          active: true
        })
      );
      vi.stubGlobal("fetch", fetchSpy);

      const response = await getServicio(servicioByIdRequest(adminCookieWithBearer, "s_remote"), {
        params: Promise.resolve({ id: "s_remote" })
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("etag")).toBe('W/"v2"');
      const body = (await response.json()) as { ok: boolean; data: { id: string; displayName: string } };
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe("s_remote");
      expect(body.data.displayName).toBe("Servicio remoto detalle");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0] as [string, unknown];
      expect(url).toBe(`${REMOTE_BASE_URL}/api/v1/services/s_remote`);
      vi.unstubAllGlobals();
    });
  });

  describe("POST /api/gestion/servicios", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await createServicio(
        mutationRequest(undefined, "http://localhost/api/gestion/servicios", "POST", { displayName: "Nuevo", price: 100 }, "key-1")
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 403 for roles that cannot write servicios", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const sellerResponse = await createServicio(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/servicios", "POST", { displayName: "Nuevo", price: 100 }, "key-1")
      );
      expect(sellerResponse.status).toBe(403);

      const technicianResponse = await createServicio(
        mutationRequest(technicianCookie, "http://localhost/api/gestion/servicios", "POST", { displayName: "Nuevo", price: 100 }, "key-1")
      );
      expect(technicianResponse.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 503 next-implementation for an authorized writer and does not call fetch", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await createServicio(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/servicios",
          "POST",
          { displayName: "Nuevo", price: 100 },
          "key-1"
        )
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(body.error.message).toMatch(/^Próxima implementación:/);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe("PATCH /api/gestion/servicios/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      const response = await patchServicio(
        mutationRequest(undefined, "http://localhost/api/gestion/servicios/s_1", "PATCH", { expectedVersion: 1, price: 200 }, "key-1"),
        { params: Promise.resolve({ id: "s_1" }) }
      );

      expect(response.status).toBe(401);
      expect((await response.json()).ok).toBe(false);
    });

    it("returns 403 for roles that cannot write servicios", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const sellerResponse = await patchServicio(
        mutationRequest(sellerCookie, "http://localhost/api/gestion/servicios/s_1", "PATCH", { expectedVersion: 1, price: 200 }, "key-1"),
        { params: Promise.resolve({ id: "s_1" }) }
      );
      expect(sellerResponse.status).toBe(403);

      const technicianResponse = await patchServicio(
        mutationRequest(technicianCookie, "http://localhost/api/gestion/servicios/s_1", "PATCH", { expectedVersion: 1, price: 200 }, "key-1"),
        { params: Promise.resolve({ id: "s_1" }) }
      );
      expect(technicianResponse.status).toBe(403);
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("returns 503 next-implementation for an authorized writer and does not call fetch", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("network must not be called"));
      vi.stubGlobal("fetch", fetchSpy);

      const response = await patchServicio(
        mutationRequest(
          adminCookieWithBearer,
          "http://localhost/api/gestion/servicios/s_1",
          "PATCH",
          { expectedVersion: 1, price: 200 },
          "key-1"
        ),
        { params: Promise.resolve({ id: "s_1" }) }
      );

      expect(response.status).toBe(503);
      const body = (await response.json()) as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("DEPENDENCY_UNAVAILABLE");
      expect(fetchSpy).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });
});
