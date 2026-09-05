import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  AuthService,
  ROLE_VALUES,
  authenticate,
  authorizeAction,
  resolveSession,
  rolePermissionsDocumentSchema,
  usersDocumentSchema
} from "./auth";

const users = {
  version: 1,
  users: ROLE_VALUES.map((role) => ({
    id: `u-${role}`,
    username: role,
    credential: `dev-${role}`,
    displayName: role,
    role,
    active: true
  }))
};

const permissions = {
  version: 1,
  permissions: Object.fromEntries(
    ROLE_VALUES.map((role) => [role, role === "vendedor" ? ["orders.create"] : ["users.manage"]])
  )
};

describe("mock identity", () => {
  it("accepts the five development roles and authenticates active users", () => {
    expect(usersDocumentSchema.parse(users).users.map((user) => user.role)).toEqual(ROLE_VALUES);

    const result = authenticate(
      { username: "vendedor", credential: "dev-vendedor" },
      usersDocumentSchema.parse(users)
    );

    expect(result).toMatchObject({ ok: true, value: { id: "u-vendedor", role: "vendedor" } });
  });

  it("rejects invalid credentials without authenticating a user", () => {
    const result = authenticate(
      { username: "vendedor", credential: "wrong" },
      usersDocumentSchema.parse(users)
    );

    expect(result).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("ignores a spoofed actor and evaluates the trusted role", () => {
    const actor = authenticate(
      { username: "vendedor", credential: "dev-vendedor" },
      usersDocumentSchema.parse(users)
    );
    if (!actor.ok) throw new Error("Expected the fixture user to authenticate.");

    const result = authorizeAction(
      actor.value,
      { actorId: "u-administrador_principal", role: "administrador_principal" },
      rolePermissionsDocumentSchema.parse(permissions),
      "users.manage"
    );

    expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("audits invalid login and leaves users unchanged", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-auth-"));
    await writeFile(join(directory, "users.json"), `${JSON.stringify(users)}\n`, "utf8");
    await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(permissions)}\n`, "utf8");
    await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
    const before = await readFile(join(directory, "users.json"), "utf8");

    const service = new AuthService(directory);
    const result = await service.login({ username: "missing", credential: "wrong" });
    const after = await readFile(join(directory, "users.json"), "utf8");
    const audit = JSON.parse(await readFile(join(directory, "audit.json"), "utf8")) as {
      events: Array<Record<string, unknown>>;
    };

    expect(result).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(after).toBe(before);
    expect(audit.events[0]).toMatchObject({
      actorId: null,
      accion: "auth.login",
      resultado: "AUTHENTICATION_REQUIRED"
    });
    await rm(directory, { recursive: true, force: true });
  });
});

describe("login bypass", () => {
  // Test-only env setup, restored after each case.
  it("returns the dev principal actor when bypass is active and cookie is missing", () => {
    const previousBypass = process.env.BEIM_BYPASS_LOGIN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.BEIM_BYPASS_LOGIN = "1";
    process.env.NODE_ENV = "test";
    try {
      expect(resolveSession(undefined)).toMatchObject({
        id: "dev-bypass",
        username: "administrador_principal",
        role: "administrador_principal"
      });
    } finally {
      if (previousBypass === undefined) delete process.env.BEIM_BYPASS_LOGIN;
      else process.env.BEIM_BYPASS_LOGIN = previousBypass;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // Test-only env setup, restored after each case.
  it("returns the dev principal actor when bypass is active and cookie is invalid", () => {
    const previousBypass = process.env.BEIM_BYPASS_LOGIN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.BEIM_BYPASS_LOGIN = "1";
    process.env.NODE_ENV = "test";
    try {
      expect(resolveSession("not-a-session")).toMatchObject({
        id: "dev-bypass",
        username: "administrador_principal",
        role: "administrador_principal"
      });
    } finally {
      if (previousBypass === undefined) delete process.env.BEIM_BYPASS_LOGIN;
      else process.env.BEIM_BYPASS_LOGIN = previousBypass;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // Test-only env setup, restored after each case.
  it("returns null without the bypass variable as before", () => {
    const previousBypass = process.env.BEIM_BYPASS_LOGIN;
    const previousNodeEnv = process.env.NODE_ENV;
    delete process.env.BEIM_BYPASS_LOGIN;
    process.env.NODE_ENV = "test";
    try {
      expect(resolveSession(undefined)).toBeNull();
      expect(resolveSession("not-a-session")).toBeNull();
    } finally {
      if (previousBypass === undefined) delete process.env.BEIM_BYPASS_LOGIN;
      else process.env.BEIM_BYPASS_LOGIN = previousBypass;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  // Test-only env setup, restored after each case.
  it("returns null in production even with the bypass variable set", () => {
    const previousBypass = process.env.BEIM_BYPASS_LOGIN;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.BEIM_BYPASS_LOGIN = "1";
    process.env.NODE_ENV = "production";
    try {
      expect(resolveSession(undefined)).toBeNull();
      expect(resolveSession("not-a-session")).toBeNull();
    } finally {
      if (previousBypass === undefined) delete process.env.BEIM_BYPASS_LOGIN;
      else process.env.BEIM_BYPASS_LOGIN = previousBypass;
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
