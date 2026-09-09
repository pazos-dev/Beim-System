import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSeedDirectory } from "../../test/seed-dir";
import { JsonAuthRepository } from "./json-auth-repository";

let seedDirectory = "";

beforeAll(async () => {
  seedDirectory = await createSeedDirectory("gestion-auth-repo-");
});

afterAll(async () => {
  await rm(seedDirectory, { force: true, recursive: true });
});

describe("JsonAuthRepository", () => {
  it("reads the seed user and permission documents", async () => {
    const repository = new JsonAuthRepository(seedDirectory);

    const users = await repository.readUsers();
    const permissions = await repository.readPermissions();

    if (!users.ok) throw new Error("Expected seed users to read.");
    if (!permissions.ok) throw new Error("Expected seed permissions to read.");
    expect(users.value.users.length).toBeGreaterThan(0);
    expect(users.value.users[0]).toHaveProperty("role");
    expect(Object.keys(permissions.value.permissions).length).toBeGreaterThan(0);
  });

  it("surfaces STORAGE_ERROR when users.json is corrupt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-auth-corrupt-"));
    await writeFile(join(directory, "users.json"), "{not valid json", "utf8");
    await writeFile(
      join(directory, "role-permissions.json"),
      '{"version":1,"permissions":{}}\n',
      "utf8"
    );

    const repository = new JsonAuthRepository(directory);
    const users = await repository.readUsers();

    expect(users).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    await rm(directory, { force: true, recursive: true });
  });

  it("surfaces STORAGE_ERROR when the seed files are missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-auth-missing-"));

    const repository = new JsonAuthRepository(directory);
    const users = await repository.readUsers();
    const permissions = await repository.readPermissions();

    expect(users).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    expect(permissions).toMatchObject({ ok: false, error: { code: "STORAGE_ERROR" } });
    await rm(directory, { force: true, recursive: true });
  });
});
