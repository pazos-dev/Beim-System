import { rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadNewOrderView } from "./new-order-view";
import { createSeedDirectory } from "../../test/seed-dir";
import { AuthService, clearSessionsForTests } from "../handlers/auth";

const previousDataDirectory = process.env.GESTION_DATA_DIR;
let directory = "";

async function loginAs(username: string): Promise<string> {
  const service = new AuthService(directory);
  const result = await service.login({ username, credential: `dev-${username}` });
  if (!result.ok) throw new Error(`Expected ${username} to authenticate.`);
  return result.value.cookieValue;
}

describe("loader de /app/ordenes/nueva", () => {
  beforeAll(async () => {
    clearSessionsForTests();
    directory = await createSeedDirectory("gestion-nueva-orden-");
  });

  afterAll(async () => {
    if (previousDataDirectory === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDirectory;
    clearSessionsForTests();
    await rm(directory, { force: true, recursive: true });
  });

  it("redirige a la lista sin sesión", async () => {
    const result = await loadNewOrderView(undefined, directory);
    expect(result).toEqual({ redirect: "/app/ordenes" });
  });

  it("redirige a la lista para un rol sin permiso de creación", async () => {
    const cookie = await loginAs("caja");
    const result = await loadNewOrderView(cookie, directory);
    expect(result).toEqual({ redirect: "/app/ordenes" });
  });

  it("calcula nextNumber desde el documento de órdenes para roles autorizados", async () => {
    const cookie = await loginAs("vendedor");
    const result = await loadNewOrderView(cookie, directory);
    if (!("view" in result)) throw new Error("Expected an authorized view.");
    expect(result.view.nextNumber).toBeGreaterThan(0);
    expect(typeof result.view.version).toBe("string");
  });
});