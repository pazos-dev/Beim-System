import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createServicioRoute } from "../../../app/api/gestion/servicios/route";
import { PATCH as patchServicioRoute } from "../../../app/api/gestion/servicios/[id]/route";
import { AuthService, clearSessionsForTests, type AuthActor } from "../handlers/auth";
import { ERROR_CODES } from "../handlers/errors";
import { SESSION_COOKIE_NAME } from "../handlers/session";
import { createServicioUseCases } from "../composition/servicios";
import { createSeedDirectory } from "../../test/seed-dir";
import { toServicioActor } from "./servicios";

function adminActor(): AuthActor {
  return { id: "u-administrador", username: "administrador", displayName: "Admin", role: "administrador" };
}

function principalActor(): AuthActor {
  return {
    id: "u-administrador_principal",
    username: "administrador_principal",
    displayName: "Principal",
    role: "administrador_principal"
  };
}

function sellerActor(): AuthActor {
  return { id: "u-vendedor", username: "vendedor", displayName: "Vendedor", role: "vendedor" };
}

function technicianActor(): AuthActor {
  return { id: "u-tecnico", username: "tecnico", displayName: "Tecnico", role: "tecnico" };
}

async function fileText(directory: string, name: string): Promise<string> {
  return readFile(join(directory, name), "utf8");
}

async function auditEventCount(directory: string): Promise<number> {
  const raw = await fileText(directory, "audit.json");
  return (JSON.parse(raw) as { events: unknown[] }).events.length;
}

describe("servicio mutations create (SRV-2)", () => {
  it("creates with a fresh key, persists the price, and records one servicio.create audit", async () => {
    const directory = await createSeedDirectory("gestion-servicios-create-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = await auditEventCount(directory);
      const created = await useCases.create(
        toServicioActor(adminActor()),
        { displayName: "Mantenimiento", price: 750 },
        `key-${randomUUID()}`
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.value.displayName).toBe("Mantenimiento");
      expect(created.value.price).toBe(750);
      expect(created.value.active).toBe(true);
      expect(await auditEventCount(directory)).toBe(before + 1);
      expect(await fileText(directory, "audit.json")).toContain("servicio.create");
      const stored = JSON.parse(await fileText(directory, "servicios.json")) as {
        servicios: { id: string; price: number }[];
      };
      expect(stored.servicios.some((row) => row.id === created.value.id && row.price === 750)).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects seller and technician creates with 403, zero writes, and no audit", async () => {
    const directory = await createSeedDirectory("gestion-servicios-create-403-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = {
        servicios: await fileText(directory, "servicios.json"),
        audit: await fileText(directory, "audit.json")
      };
      for (const actor of [sellerActor(), technicianActor()]) {
        const result = await useCases.create(
          toServicioActor(actor),
          { displayName: "No autorizado", price: 100 },
          `key-${randomUUID()}`
        );
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe(ERROR_CODES.FORBIDDEN);
      }
      expect(await fileText(directory, "servicios.json")).toBe(before.servicios);
      expect(await fileText(directory, "audit.json")).toBe(before.audit);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects invalid bodies (negative price, blank displayName) with 400", async () => {
    const directory = await createSeedDirectory("gestion-servicios-create-400-");
    try {
      const useCases = createServicioUseCases(directory);
      for (const body of [
        { displayName: "Precio negativo", price: -5 },
        { displayName: "", price: 100 },
        { price: 100 },
        { displayName: "Sin precio" }
      ]) {
        const result = await useCases.create(toServicioActor(adminActor()), body, `key-${randomUUID()}`);
        expect(result.ok).toBe(false);
        if (result.ok) continue;
        expect(result.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      }
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a missing idempotency key with 400", async () => {
    const directory = await createSeedDirectory("gestion-servicios-create-key-");
    try {
      const useCases = createServicioUseCases(directory);
      const result = await useCases.create(
        toServicioActor(adminActor()),
        { displayName: "Sin clave", price: 100 },
        undefined
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("replays the same key+payload once and rejects a new payload on the same key with 409", async () => {
    const directory = await createSeedDirectory("gestion-servicios-create-replay-");
    try {
      const useCases = createServicioUseCases(directory);
      const payload = { displayName: "Repetible", price: 200 };
      const key = `key-${randomUUID()}`;
      const first = await useCases.create(toServicioActor(adminActor()), payload, key);
      const second = await useCases.create(toServicioActor(adminActor()), payload, key);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.id).toBe(first.value.id);
      const stored = JSON.parse(await fileText(directory, "servicios.json")) as {
        servicios: { displayName: string }[];
      };
      expect(stored.servicios.filter((row) => row.displayName === "Repetible")).toHaveLength(1);
      const conflict = await useCases.create(
        toServicioActor(adminActor()),
        { ...payload, price: 999 },
        key
      );
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.error.code).toBe(ERROR_CODES.CONFLICT);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("servicio mutations update (SRV-2 OCC)", () => {
  it("updates price with the current version and records one servicio.update audit", async () => {
    const directory = await createSeedDirectory("gestion-servicios-update-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = await auditEventCount(directory);
      const updated = await useCases.update(
        toServicioActor(adminActor()),
        "s_1",
        { price: 380 },
        1,
        `key-${randomUUID()}`
      );
      expect(updated.ok).toBe(true);
      if (!updated.ok) return;
      expect(updated.value.price).toBe(380);
      expect(updated.value.version).toBe(2);
      expect(updated.value.displayName).toBe("Diagnóstico sintético");
      expect(await auditEventCount(directory)).toBe(before + 1);
      expect(await fileText(directory, "audit.json")).toContain("servicio.update");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a stale expectedVersion with 409, persists nothing, and audits the conflict", async () => {
    const directory = await createSeedDirectory("gestion-servicios-update-409-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = {
        servicios: await fileText(directory, "servicios.json"),
        auditCount: await auditEventCount(directory)
      };
      const result = await useCases.update(
        toServicioActor(principalActor()),
        "s_1",
        { price: 1 },
        0,
        `key-${randomUUID()}`
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.CONFLICT);
      expect(await fileText(directory, "servicios.json")).toBe(before.servicios);
      expect(await auditEventCount(directory)).toBe(before.auditCount + 1);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects non-admin updates with 403, zero writes, and no audit", async () => {
    const directory = await createSeedDirectory("gestion-servicios-update-403-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = {
        servicios: await fileText(directory, "servicios.json"),
        audit: await fileText(directory, "audit.json")
      };
      const result = await useCases.update(
        toServicioActor(sellerActor()),
        "s_1",
        { price: 10 },
        1,
        `key-${randomUUID()}`
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(await fileText(directory, "servicios.json")).toBe(before.servicios);
      expect(await fileText(directory, "audit.json")).toBe(before.audit);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("replays an update once and rejects payload mismatch on the same key with 409", async () => {
    const directory = await createSeedDirectory("gestion-servicios-update-replay-");
    try {
      const useCases = createServicioUseCases(directory);
      const key = `key-${randomUUID()}`;
      const first = await useCases.update(toServicioActor(adminActor()), "s_1", { price: 500 }, 1, key);
      const second = await useCases.update(toServicioActor(adminActor()), "s_1", { price: 500 }, 1, key);
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.version).toBe(first.value.version);
      const conflict = await useCases.update(toServicioActor(adminActor()), "s_1", { price: 501 }, 1, key);
      expect(conflict.ok).toBe(false);
      if (conflict.ok) return;
      expect(conflict.error.code).toBe(ERROR_CODES.CONFLICT);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

describe("servicio mutations toggleActive (SRV-3)", () => {
  it("deactivates with admin key, leaves default lists, and stays readable by id", async () => {
    const directory = await createSeedDirectory("gestion-servicios-toggle-");
    try {
      const useCases = createServicioUseCases(directory);
      const toggled = await useCases.toggleActive(
        toServicioActor(adminActor()),
        "s_1",
        { active: false, expectedVersion: 1 },
        `key-${randomUUID()}`
      );
      expect(toggled.ok).toBe(true);
      if (!toggled.ok) return;
      expect(toggled.value.active).toBe(false);
      expect(await fileText(directory, "audit.json")).toContain("servicio.update");
      const listed = await useCases.list(toServicioActor(adminActor()), {
        active: "true",
        page: 1,
        pageSize: 25
      });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value.totalItems).toBe(0);
      const hidden = await useCases.getById(toServicioActor(adminActor()), "s_1");
      expect(hidden.ok).toBe(false);
      const readable = await useCases.getById(toServicioActor(adminActor()), "s_1", "all");
      expect(readable.ok).toBe(true);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects non-admin toggle with 403, zero writes, and no audit", async () => {
    const directory = await createSeedDirectory("gestion-servicios-toggle-403-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = {
        servicios: await fileText(directory, "servicios.json"),
        audit: await fileText(directory, "audit.json")
      };
      const result = await useCases.toggleActive(
        toServicioActor(technicianActor()),
        "s_1",
        { active: false, expectedVersion: 1 },
        `key-${randomUUID()}`
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.FORBIDDEN);
      expect(await fileText(directory, "servicios.json")).toBe(before.servicios);
      expect(await fileText(directory, "audit.json")).toBe(before.audit);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("rejects a stale toggle version with 409 and persists nothing", async () => {
    const directory = await createSeedDirectory("gestion-servicios-toggle-409-");
    try {
      const useCases = createServicioUseCases(directory);
      const before = await fileText(directory, "servicios.json");
      const result = await useCases.toggleActive(
        toServicioActor(adminActor()),
        "s_1",
        { active: false, expectedVersion: 0 },
        `key-${randomUUID()}`
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(ERROR_CODES.CONFLICT);
      expect(await fileText(directory, "servicios.json")).toBe(before);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let routeDirectory = "";
let adminCookie = "";
let sellerCookie = "";

function postServiciosRequest(
  cookie: string | undefined,
  body: unknown,
  key: string | undefined,
  url = "http://localhost/api/gestion/servicios"
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(url, { method: "POST", headers, body: JSON.stringify(body) });
}

function patchServicioRequest(
  cookie: string | undefined,
  id: string,
  body: unknown,
  key: string | undefined
): NextRequest {
  const headers: Record<string, string> = {};
  if (cookie !== undefined) headers.cookie = `${SESSION_COOKIE_NAME}=${cookie}`;
  if (key !== undefined) headers["x-idempotency-key"] = key;
  return new NextRequest(`http://localhost/api/gestion/servicios/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body)
  });
}

function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("POST/PATCH /api/gestion/servicios routes (SRV-2/SRV-4)", () => {
  it("rejects POST and PATCH without a session (401)", async () => {
    const created = await createServicioRoute(
      postServiciosRequest(undefined, { displayName: "X", price: 1 }, "key-route-401")
    );
    expect(created.status).toBe(401);
    const patched = await patchServicioRoute(
      patchServicioRequest(undefined, "s_1", { price: 1, expectedVersion: 1 }, "key-route-401"),
      routeParams("s_1")
    );
    expect(patched.status).toBe(401);
  });

  it("authorizes from the session and ignores a forged client-side role", async () => {
    const forged = await createServicioRoute(
      postServiciosRequest(sellerCookie, { displayName: "Forjado", price: 1 }, `key-${randomUUID()}`)
    );
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects seller POST with 403 and zero writes", async () => {
    const before = await fileText(routeDirectory, "servicios.json");
    const response = await createServicioRoute(
      postServiciosRequest(sellerCookie, { displayName: "Vendedor crea", price: 50 }, `key-${randomUUID()}`)
    );
    expect(response.status).toBe(403);
    expect(await fileText(routeDirectory, "servicios.json")).toBe(before);
  });

  it("rejects POST without an idempotency key (400)", async () => {
    const response = await createServicioRoute(
      postServiciosRequest(adminCookie, { displayName: "Sin clave", price: 10 }, undefined)
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" }
    });
  });

  it("creates via POST with 201 and replays the key once", async () => {
    const key = `key-${randomUUID()}`;
    const first = await createServicioRoute(
      postServiciosRequest(adminCookie, { displayName: "Alta por ruta", price: 620 }, key)
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { ok: boolean; data: { id: string } };
    const second = await createServicioRoute(
      postServiciosRequest(adminCookie, { displayName: "Alta por ruta", price: 620 }, key)
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { ok: boolean; data: { id: string } };
    expect(secondBody.data.id).toBe(firstBody.data.id);
    const mismatch = await createServicioRoute(
      postServiciosRequest(adminCookie, { displayName: "Alta por ruta", price: 621 }, key)
    );
    expect(mismatch.status).toBe(409);
  });

  it("rejects PATCH without expectedVersion (400) or key (400)", async () => {
    const noVersion = await patchServicioRoute(
      patchServicioRequest(adminCookie, "s_1", { price: 999 }, `key-${randomUUID()}`),
      routeParams("s_1")
    );
    expect(noVersion.status).toBe(400);
    const noKey = await patchServicioRoute(
      patchServicioRequest(adminCookie, "s_1", { price: 999, expectedVersion: 1 }, undefined),
      routeParams("s_1")
    );
    expect(noKey.status).toBe(400);
  });

  it("rejects seller PATCH with 403 and zero writes", async () => {
    const before = await fileText(routeDirectory, "servicios.json");
    const response = await patchServicioRoute(
      patchServicioRequest(sellerCookie, "s_1", { price: 5, expectedVersion: 1 }, `key-${randomUUID()}`),
      routeParams("s_1")
    );
    expect(response.status).toBe(403);
    expect(await fileText(routeDirectory, "servicios.json")).toBe(before);
  });

  it("rejects stale PATCH with 409 and persists nothing", async () => {
    const before = await fileText(routeDirectory, "servicios.json");
    const response = await patchServicioRoute(
      patchServicioRequest(adminCookie, "s_1", { price: 5, expectedVersion: 0 }, `key-${randomUUID()}`),
      routeParams("s_1")
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await fileText(routeDirectory, "servicios.json")).toBe(before);
  });

  it("updates price via PATCH and deactivates via active-only PATCH", async () => {
    const updated = await patchServicioRoute(
      patchServicioRequest(adminCookie, "s_1", { price: 390, expectedVersion: 1 }, `key-${randomUUID()}`),
      routeParams("s_1")
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as { ok: boolean; data: { price: number; version: number } };
    expect(updatedBody.data.price).toBe(390);
    expect(updatedBody.data.version).toBe(2);
    const toggled = await patchServicioRoute(
      patchServicioRequest(adminCookie, "s_1", { active: false, expectedVersion: 2 }, `key-${randomUUID()}`),
      routeParams("s_1")
    );
    expect(toggled.status).toBe(200);
    const toggledBody = (await toggled.json()) as { ok: boolean; data: { active: boolean } };
    expect(toggledBody.data.active).toBe(false);
  });
});

beforeAll(async () => {
  clearSessionsForTests();
  routeDirectory = await createSeedDirectory("gestion-servicios-mut-routes-");
  process.env.GESTION_DATA_DIR = routeDirectory;
  const service = new AuthService(routeDirectory);
  const adminLogin = await service.login({ username: "administrador", credential: "dev-administrador" });
  const sellerLogin = await service.login({ username: "vendedor", credential: "dev-vendedor" });
  if (!adminLogin.ok || !sellerLogin.ok) throw new Error("Expected route logins to authenticate.");
  adminCookie = adminLogin.value.cookieValue;
  sellerCookie = sellerLogin.value.cookieValue;
});

afterAll(async () => {
  if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
  else process.env.GESTION_DATA_DIR = previousDataDirectory;
  clearSessionsForTests();
  await rm(routeDirectory, { force: true, recursive: true });
});
