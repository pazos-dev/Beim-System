import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clearSessionsForTests, tokenFromCookie } from "../shared/auth";
import { createSeedDirectory } from "../../test/seed-dir";
import { createAuthController, createAuthUseCases } from "./auth.composition";

let seedDirectory = "";

beforeAll(async () => {
  clearSessionsForTests();
  seedDirectory = await createSeedDirectory("gestion-auth-composition-");
  // Seed fixtures ship no audit trail; auth writes require one.
  await writeFile(join(seedDirectory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
});

afterAll(async () => {
  clearSessionsForTests();
  await rm(seedDirectory, { force: true, recursive: true });
});

describe("auth composition", () => {
  it("wires port to use-cases with a login round-trip", async () => {
    const useCases = createAuthUseCases(seedDirectory);

    const login = await useCases.login({ credential: "dev-administrador", username: "administrador" });

    if (!login.ok) throw new Error("Expected the seed administrator to authenticate.");
    expect(login.value.actor).toMatchObject({ id: expect.any(String), role: "administrador" });
    expect(tokenFromCookie(login.value.cookieValue)).not.toBeNull();
  });

  it("wires the controller with HTTP-mapped responses", async () => {
    const controller = createAuthController(seedDirectory);

    const login = await controller.login({
      credential: "dev-vendedor",
      username: "vendedor"
    });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ ok: true });
    if (login.cookieValue === undefined) throw new Error("Expected a cookie value.");

    const session = await controller.session(login.cookieValue);
    expect(session.status).toBe(200);
  });
});
