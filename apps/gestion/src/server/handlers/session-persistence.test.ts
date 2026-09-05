import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AuthService,
  clearSessionsForTests,
  resolveSession
} from "./auth";
import { sessionsDocumentSchema } from "./session-store";

const users = {
  version: 1,
  users: [
    {
      id: "u-vendedor",
      username: "vendedor",
      credential: "dev-vendedor",
      displayName: "Vendedor",
      role: "vendedor",
      active: true
    }
  ]
};

const permissions = {
  version: 1,
  permissions: { vendedor: ["orders.create"] }
};

function tokenFromCookie(cookieValue: string): string {
  const token = cookieValue.split(".")[2];
  if (!token) throw new Error("Expected a versioned session cookie.");
  return token;
}

describe("persistencia de sesión ante reinicios", () => {
  let directories: string[] = [];
  let previousDataDir: string | undefined;
  let previousMaxAge: string | undefined;
  let previousSliding: string | undefined;

  beforeEach(() => {
    directories = [];
    previousDataDir = process.env.GESTION_DATA_DIR;
    previousMaxAge = process.env.GESTION_SESSION_MAX_AGE_SECONDS;
    previousSliding = process.env.GESTION_SESSION_SLIDING_SECONDS;
    clearSessionsForTests();
  });

  afterEach(async () => {
    for (const directory of directories) {
      await rm(directory, { recursive: true, force: true });
    }
    clearSessionsForTests();
    if (previousDataDir === undefined) delete process.env.GESTION_DATA_DIR;
    else process.env.GESTION_DATA_DIR = previousDataDir;
    if (previousMaxAge === undefined) delete process.env.GESTION_SESSION_MAX_AGE_SECONDS;
    else process.env.GESTION_SESSION_MAX_AGE_SECONDS = previousMaxAge;
    if (previousSliding === undefined) delete process.env.GESTION_SESSION_SLIDING_SECONDS;
    else process.env.GESTION_SESSION_SLIDING_SECONDS = previousSliding;
  });

  async function makeService(): Promise<{ service: AuthService; directory: string }> {
    const directory = await mkdtemp(join(tmpdir(), "gestion-session-persist-"));
    await writeFile(join(directory, "users.json"), `${JSON.stringify(users)}\n`, "utf8");
    await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(permissions)}\n`, "utf8");
    await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
    process.env.GESTION_DATA_DIR = directory;
    directories.push(directory);
    return { service: new AuthService(directory), directory };
  }

  async function loginCookie(service: AuthService): Promise<string> {
    const result = await service.login({ username: "vendedor", credential: "dev-vendedor" });
    if (!result.ok) throw new Error("Expected the fixture login to succeed.");
    return result.value.cookieValue;
  }

  it("REGRESIÓN: emitir → SIMULAR REINICIO (vaciar memoria) → resolver OK", async () => {
    const { service } = await makeService();
    const cookie = await loginCookie(service);

    clearSessionsForTests();

    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });
  });

  it("roundtrip: el archivo valida contra el schema y recarga la sesión", async () => {
    const { service, directory } = await makeService();
    const cookie = await loginCookie(service);
    const raw = await readFile(join(directory, "sesiones.json"), "utf8");
    const document = sessionsDocumentSchema.parse(JSON.parse(raw) as unknown);

    expect(document.version).toBe(1);
    expect(document.sessions.map((entry) => entry.token)).toContain(tokenFromCookie(cookie));

    clearSessionsForTests();

    expect(resolveSession(cookie, new Date())).toMatchObject({ id: "u-vendedor" });
  });

  it("expirada sigue inválida tras el reinicio", async () => {
    process.env.GESTION_SESSION_MAX_AGE_SECONDS = "7200";
    process.env.GESTION_SESSION_SLIDING_SECONDS = "600";
    const { service } = await makeService();
    const cookie = await loginCookie(service);

    clearSessionsForTests();

    expect(resolveSession(cookie, new Date(Date.now() + 601 * 1000))).toBeNull();
  });

  it("logout persiste el borrado en el archivo", async () => {
    const { service, directory } = await makeService();
    const cookie = await loginCookie(service);
    const token = tokenFromCookie(cookie);

    const logout = await service.logout(cookie);
    expect(logout).toMatchObject({ ok: true });

    clearSessionsForTests();

    expect(resolveSession(cookie, new Date())).toBeNull();
    const raw = await readFile(join(directory, "sesiones.json"), "utf8");
    expect(raw).not.toContain(token);
  });

  it("archivo corrupto → fail-closed (null, sin throw)", async () => {
    const { service, directory } = await makeService();
    const cookie = await loginCookie(service);

    await writeFile(join(directory, "sesiones.json"), "no-json{{{", "utf8");
    clearSessionsForTests();

    expect(() => resolveSession(cookie, new Date())).not.toThrow();
    expect(resolveSession(cookie, new Date())).toBeNull();
  });
});
