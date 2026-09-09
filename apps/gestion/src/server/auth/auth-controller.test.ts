import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema } from "../data/schemas";
import { AuditRepository } from "../shared/audit";
import { clearSessionsForTests, ROLE_VALUES, tokenFromCookie } from "../shared/auth";
import type { AuthRepositoryPort, AuthUserDocument, RolePermissionsDocument } from "./auth-port";
import { AuthController } from "./auth-controller";
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
let controller: AuthController;

beforeEach(async () => {
  clearSessionsForTests();
  directory = await mkdtemp(join(tmpdir(), "gestion-auth-controller-"));
  await writeFile(join(directory, "users.json"), `${JSON.stringify(users)}\n`, "utf8");
  await writeFile(join(directory, "role-permissions.json"), `${JSON.stringify(permissions)}\n`, "utf8");
  await writeFile(join(directory, "audit.json"), '{"version":1,"events":[]}\n', "utf8");
  const useCases = new AuthUseCases({
    audit: new AuditRepository(new JsonStore(join(directory, "audit.json"), auditDocumentSchema)),
    dataDirectory: directory,
    repository: new StubAuthRepository()
  });
  controller = new AuthController(useCases);
});

afterEach(async () => {
  clearSessionsForTests();
  await rm(directory, { force: true, recursive: true });
});

describe("AuthController", () => {
  it("passes login through with status 200 and a settable cookie value", async () => {
    const response = await controller.login({ credential: "dev-vendedor", username: "vendedor" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ok: true, data: { id: "u-vendedor", role: "vendedor" } });
    expect(tokenFromCookie(response.cookieValue ?? "")).not.toBeNull();
  });

  it("maps invalid credentials to 401 without a cookie value", async () => {
    const response = await controller.login({ credential: "wrong", username: "vendedor" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
    expect(response.cookieValue).toBeUndefined();
  });

  it("maps a non-object login payload to 400", async () => {
    const response = await controller.login(null);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("maps a missing session cookie to 401", async () => {
    const response = await controller.session(undefined);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ ok: false, error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it("closes the session on logout with status 200", async () => {
    const login = await controller.login({ credential: "dev-caja", username: "caja" });
    if (login.cookieValue === undefined) throw new Error("Expected a cookie value.");

    const logout = await controller.logout(login.cookieValue);
    expect(logout.status).toBe(200);
    expect(logout.body).toMatchObject({ ok: true });

    const after = await controller.session(login.cookieValue);
    expect(after.status).toBe(401);
  });

  it("maps a forbidden action to 403", async () => {
    const login = await controller.login({
      credential: "dev-vendedor",
      username: "vendedor"
    });
    if (login.cookieValue === undefined) throw new Error("Expected a cookie value.");

    const response = await controller.authorize(login.cookieValue, { action: "users.manage" });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
});
