import { describe, expect, it, vi } from "vitest";
import type { UserLegacyPort } from "./user-adapters.js";

// Same DB-free convention as src/app.test.ts: legacy services build the
// shared pool at import time, so point it at the test database BEFORE the
// dynamic imports below. This suite never issues a query.
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

const { makeUserRouterDeps, legacyUserPort } = await import("./user-adapters.js");
const { authService } = await import("../modules/webshop/services/auth.js");
const { usersService } = await import("../modules/gestion/services/users.js");
const { gestionUsersService } = await import("../modules/gestion/services/gestion-users.js");

function fakePort(): UserLegacyPort {
  return {
    auth: {
      login: vi.fn(async () => ({ token: "t" })),
      register: vi.fn(async () => ({ id: "u1" })),
      gestionAccess: vi.fn(async () => ({ token: "t" })),
      gestionLogin: vi.fn(async () => ({ token: "t" })),
      logout: vi.fn(async () => undefined)
    },
    users: {
      listUsers: vi.fn(async () => ({ items: [] })),
      approveUser: vi.fn(async () => ({ id: "u1" })),
      setUserRole: vi.fn(async () => ({ id: "u1" })),
      disableUser: vi.fn(async () => ({ id: "u1" }))
    },
    gestionUsers: {
      listGestionUsers: vi.fn(async () => ({ items: [] })),
      createGestionUser: vi.fn(async () => ({ id: "g1" })),
      setGestionUserRole: vi.fn(async () => ({ id: "g1" })),
      setGestionUserActive: vi.fn(async () => ({ id: "g1" })),
      resetGestionUserPassword: vi.fn(async () => ({ id: "g1" }))
    }
  } as unknown as UserLegacyPort;
}

const ACTOR = { actorUserId: "a1", actorRole: "administrador_principal" };

describe("user adapters (legacy delegation)", () => {
  it("delegates the auth quartet plus logout with the exact input", async () => {
    const port = fakePort();
    const deps = makeUserRouterDeps(port);
    await deps.login({ identifier: "ana@example.com", password: "x" });
    await deps.register({ name: "Ana", email: "ana@example.com", password: "Aa1!aaaaaaaa" });
    await deps.gestionAccess({ token: "bridge" });
    await deps.gestionLogin({ username: "op", password: "x" });
    await deps.logout({ token: "sess" });
    expect(port.auth.login).toHaveBeenCalledWith({ identifier: "ana@example.com", password: "x" });
    expect(port.auth.register).toHaveBeenCalledWith({
      name: "Ana",
      email: "ana@example.com",
      password: "Aa1!aaaaaaaa"
    });
    expect(port.auth.gestionAccess).toHaveBeenCalledWith({ token: "bridge" });
    expect(port.auth.gestionLogin).toHaveBeenCalledWith({ username: "op", password: "x" });
    expect(port.auth.logout).toHaveBeenCalledWith({ token: "sess" });
  });

  it("delegates webshop user admin actions with id plus audit actor", async () => {
    const port = fakePort();
    const deps = makeUserRouterDeps(port);
    await deps.listUsers({ page: 1, limit: 20 });
    await deps.approveUser("u1", ACTOR);
    await deps.setUserRole("u1", "admin", ACTOR);
    await deps.disableUser("u1", ACTOR);
    expect(port.users.listUsers).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(port.users.approveUser).toHaveBeenCalledWith("u1", ACTOR);
    expect(port.users.setUserRole).toHaveBeenCalledWith("u1", "admin", ACTOR);
    expect(port.users.disableUser).toHaveBeenCalledWith("u1", ACTOR);
  });

  it("delegates console user admin actions and drops the password result to void", async () => {
    const port = fakePort();
    const deps = makeUserRouterDeps(port);
    await deps.listGestionUsers({ page: 1, limit: 20 });
    await deps.createGestionUser(
      { username: "op", name: "Op", password: "Aa1!aaaaaaaa", role: "caja" },
      ACTOR
    );
    await deps.setGestionUserRole("g1", "caja", ACTOR);
    await deps.setGestionUserActive("g1", false, ACTOR);
    await expect(deps.resetGestionUserPassword("g1", "Bb2@bbbbbbbb", ACTOR)).resolves.toBeUndefined();
    expect(port.gestionUsers.listGestionUsers).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(port.gestionUsers.setGestionUserActive).toHaveBeenCalledWith("g1", false, ACTOR);
    expect(port.gestionUsers.resetGestionUserPassword).toHaveBeenCalledWith("g1", "Bb2@bbbbbbbb", ACTOR);
  });

  it("binds the legacy services by default (no logic duplicated)", () => {
    expect(legacyUserPort.auth).toBe(authService);
    expect(legacyUserPort.users).toBe(usersService);
    expect(legacyUserPort.gestionUsers).toBe(gestionUsersService);
  });
});
