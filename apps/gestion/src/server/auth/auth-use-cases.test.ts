import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema } from "../data/schemas";
import { AuditRepository } from "../shared/audit";
import {
  AuthService,
  clearSessionsForTests,
  ROLE_VALUES,
  tokenFromCookie
} from "../shared/auth";
import type { AuthRepositoryPort, AuthUserDocument, RolePermissionsDocument } from "./auth-port";
import { AuthUseCases } from "./auth-use-cases";

const users = {
  version: 1,
  users: ROLE_VALUES.map((role) => ({
    active: true,
    credential: `dev-${role}`,
    displayName: role,
    id: `u-${role}`,
    role,
    username: role
  }))
};

const permissions = {
  version: 1,
  permissions: Object.fromEntries(
    ROLE_VALUES.map((role) => [role, role === "vendedor" ? ["orders.create"] : ["users.manage"]])
  )
};

class StubAuthRepository implements AuthRepositoryPort {
  public async readUsers(): Promise<{ ok: true; value: AuthUserDocument }> {
    return { ok: true, value: users as AuthUserDocument };
  }

  public async readPermissions(): Promise<{ ok: true; value: RolePermissionsDocument }> {
    return { ok: true, value: permissions as RolePermissionsDocument };
  }
}

let directory = "";
let useCases: AuthUseCases;
let service: AuthService;

async function freshUseCases(): Promise<void> {
  clearSessionsForTests();
  directory = await mkdtemp(join(tmpdir(), "gestion-auth-use-cases-"));
  await writeFile(join(directory, "users.json"), `${JSON.stringify(users)}\n`, "utf8");
  await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(permissions)}\n`, "utf8");
  await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
  const audit = new AuditRepository(
    new JsonStore(join(directory, "audit.json"), auditDocumentSchema)
  );
  useCases = new AuthUseCases({
    audit,
    dataDirectory: directory,
    repository: new StubAuthRepository()
  });
  service = new AuthService(directory);
}

beforeEach(async () => {
  await freshUseCases();
});

afterEach(async () => {
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("AuthUseCases", () => {
  it("logs in with the same actor envelope as AuthService", async () => {
    const input = { credential: "dev-vendedor", username: "vendedor" };

    const actual = await useCases.login(input);
    const expected = await service.login(input);

    if (!actual.ok || !expected.ok) throw new Error("Expected both logins to succeed.");
    expect(actual.value.actor).toEqual(expected.value.actor);
    expect(tokenFromCookie(actual.value.cookieValue)).not.toBeNull();
    expect(tokenFromCookie(expected.value.cookieValue)).not.toBeNull();
  });

  it("rejects invalid credentials with the frozen AuthService envelope", async () => {
    const input = { credential: "wrong", username: "vendedor" };

    const actual = await useCases.login(input);
    const expected = await service.login(input);

    expect(actual.ok).toBe(false);
    expect(expected.ok).toBe(false);
    if (actual.ok || expected.ok) throw new Error("Expected both logins to fail.");
    expect(actual.error).toEqual(expected.error);
  });

  it("resolves the session round-trip and closes it on logout", async () => {
    const login = await useCases.login({ credential: "dev-caja", username: "caja" });
    if (!login.ok) throw new Error("Expected login to succeed.");

    const session = await useCases.session(login.value.cookieValue);
    if (!session.ok) throw new Error("Expected the session to resolve.");
    expect(session.value).toEqual(login.value.actor);

    const logout = await useCases.logout(login.value.cookieValue);
    expect(logout.ok).toBe(true);

    const after = await useCases.session(login.value.cookieValue);
    const frozen = await service.session(login.value.cookieValue);
    expect(after.ok).toBe(false);
    expect(frozen.ok).toBe(false);
    if (after.ok || frozen.ok) throw new Error("Expected both sessions to be closed.");
    expect(after.error).toEqual(frozen.error);
  });

  it("authorizes permitted actions and forbids the rest like AuthService", async () => {
    const login = await useCases.login({
      credential: "dev-administrador",
      username: "administrador"
    });
    if (!login.ok) throw new Error("Expected login to succeed.");
    const cookie = login.value.cookieValue;

    const allowed = await useCases.authorize(cookie, { action: "users.manage" });
    expect(allowed.ok).toBe(true);

    const denied = await useCases.authorize(cookie, { action: "orders.create" });
    const frozen = await service.authorize(cookie, { action: "orders.create" });
    expect(denied.ok).toBe(false);
    expect(frozen.ok).toBe(false);
    if (denied.ok || frozen.ok) throw new Error("Expected both authorizations to fail.");
    expect(denied.error).toEqual(frozen.error);
  });
});
