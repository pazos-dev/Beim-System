import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { AuthError, NotFoundError } from "../../../errors/taxonomy.js";
import type { Identity } from "../edge/auth.js";
import { interfaceErrorHandler } from "../errorHandler.js";
import { createUserRouter, type UserRouterDeps } from "./router.js";

const ADMIN: Identity = { userId: "11111111-1111-4111-8111-111111111111", roles: ["administrador_principal"] };
const CLIENTE: Identity = { userId: "22222222-2222-4222-8222-222222222222", roles: ["cliente"] };

const SESSION = { token: "tok", expiresAt: new Date("2030-01-01T00:00:00.000Z"), user: { id: ADMIN.userId } };

function baseFakes(): UserRouterDeps {
  return {
    login: vi.fn(async () => SESSION),
    register: vi.fn(async () => ({ id: "33333333-3333-4333-8333-333333333333" })),
    gestionAccess: vi.fn(async () => SESSION),
    gestionLogin: vi.fn(async () => SESSION),
    logout: vi.fn(async () => undefined),
    listUsers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
    approveUser: vi.fn(async () => ({ id: ADMIN.userId })),
    setUserRole: vi.fn(async () => ({ id: ADMIN.userId })),
    disableUser: vi.fn(async () => ({ id: ADMIN.userId })),
    listGestionUsers: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
    createGestionUser: vi.fn(async () => ({ id: ADMIN.userId })),
    setGestionUserRole: vi.fn(async () => ({ id: ADMIN.userId })),
    setGestionUserActive: vi.fn(async () => ({ id: ADMIN.userId })),
    resetGestionUserPassword: vi.fn(async () => undefined)
  };
}

function testApp(overrides: Partial<UserRouterDeps> = {}, identity: Identity | null = ADMIN): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());
  app.use((req, _res, next) => {
    if (identity !== null) req.identity = identity;
    next();
  });
  app.use("/api/v1", createUserRouter({ ...baseFakes(), ...overrides }));
  app.use(interfaceErrorHandler);
  return app;
}

const VALID_REGISTER = { name: "Ana", email: "ana@example.com", password: "Aa1!aaaaaaaa" };

describe("user router auth (frozen contract)", () => {
  it("register answers 201 with null user on duplicate (anti-enumeration)", async () => {
    const ok = await request(testApp()).post("/api/v1/auth/register").send(VALID_REGISTER);
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ ok: true, data: { user: ok.body.data.user } });
    const dup = await request(testApp({ register: vi.fn(async () => null) }))
      .post("/api/v1/auth/register")
      .send(VALID_REGISTER);
    expect(dup.status).toBe(201);
    expect(dup.body).toEqual({ ok: true, data: { user: null } });
  });

  it("login renders 200 on success and uniform 401 on handler AuthError", async () => {
    const ok = await request(testApp())
      .post("/api/v1/auth/login")
      .send({ identifier: "ana@example.com", password: "x" });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    const bad = await request(
      testApp({ login: vi.fn(async () => { throw new AuthError("AUTHENTICATION_REQUIRED", "Credenciales inválidas"); }) })
    )
      .post("/api/v1/auth/login")
      .send({ identifier: "nadie@example.com", password: "x" });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED", message: "Credenciales inválidas" }
    });
  });

  it("gestion-login and gestion-access render 200 through handlers only", async () => {
    const login = await request(testApp())
      .post("/api/v1/auth/gestion-login")
      .send({ username: "admin", password: "x" });
    expect(login.status).toBe(200);
    expect(login.body.ok).toBe(true);
    const access = await request(testApp()).post("/api/v1/auth/gestion-access").send({ token: "bridge" });
    expect(access.status).toBe(200);
    expect(access.body.ok).toBe(true);
  });

  it("logout answers 200 and rejects a missing bearer with 401", async () => {
    const logout = vi.fn(async () => undefined);
    const ok = await request(testApp({ logout })).post("/api/v1/auth/logout").set("Authorization", "Bearer tok");
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, data: { loggedOut: true } });
    expect(logout).toHaveBeenCalledWith({ token: "tok" });
    const missing = await request(testApp({ logout })).post("/api/v1/auth/logout");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects unknown body keys with 422 (strict edge validation)", async () => {
    for (const path of ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/gestion-login"]) {
      const res = await request(testApp()).post(path).send({ unknownKey: "x" });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("user router admin users (frozen contract)", () => {
  const UID = "44444444-4444-4444-8444-444444444444";

  it("lists with skin pagination defaults and rejects limit 500 plus unknown keys", async () => {
    const listUsers = vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 }));
    const ok = await request(testApp({ listUsers })).get("/api/v1/users");
    expect(ok.status).toBe(200);
    expect(listUsers).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(await request(testApp()).get("/api/v1/users?limit=500")).toHaveProperty("status", 422);
    expect(await request(testApp()).get("/api/v1/users?unknownKey=x")).toHaveProperty("status", 422);
  });

  it("approve renders 200, 422 on non-uuid id, 404 on handler NotFound", async () => {
    expect(await request(testApp()).post(`/api/v1/users/${UID}/approve`)).toHaveProperty("status", 200);
    expect(await request(testApp()).post("/api/v1/users/not-a-uuid/approve")).toHaveProperty("status", 422);
    const missing = await request(
      testApp({ approveUser: vi.fn(async () => { throw new NotFoundError("Usuario no encontrado"); }) })
    ).post(`/api/v1/users/${UID}/approve`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("role change renders 200 and rejects roles outside the closed list", async () => {
    const setUserRole = vi.fn(async () => ({ id: UID }));
    const ok = await request(testApp({ setUserRole })).put(`/api/v1/users/${UID}/role`).send({ role: "admin" });
    expect(ok.status).toBe(200);
    expect(setUserRole).toHaveBeenCalledWith(UID, "admin", expect.anything());
    expect(await request(testApp()).put(`/api/v1/users/${UID}/role`).send({ role: "vendedor" })).toHaveProperty(
      "status",
      422
    );
  });

  it("applies the admin gate: no identity 404, cliente role 403", async () => {
    expect(await request(testApp({}, null)).get("/api/v1/users")).toHaveProperty("status", 404);
    const forbidden = await request(testApp({}, CLIENTE)).get("/api/v1/users");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
  });

  it("disable renders 200", async () => {
    expect(await request(testApp()).post(`/api/v1/users/${UID}/disable`)).toHaveProperty("status", 200);
  });
});

describe("user router console gestion-users (frozen contract)", () => {
  const UID = "55555555-5555-4555-8555-555555555555";
  const VALID_CREATE = { username: "caja1", name: "Caja Uno", password: "Aa1!aaaaaaaa", role: "caja" };

  it("create answers 201 with null user on duplicate username (anti-enumeration)", async () => {
    const ok = await request(testApp()).post("/api/v1/gestion-users").send(VALID_CREATE);
    expect(ok.status).toBe(201);
    const dup = await request(testApp({ createGestionUser: vi.fn(async () => null) }))
      .post("/api/v1/gestion-users")
      .send(VALID_CREATE);
    expect(dup.status).toBe(201);
    expect(dup.body).toEqual({ ok: true, data: { user: null } });
  });

  it("rejects weak passwords and webshop roles with 422", async () => {
    expect(await request(testApp()).post("/api/v1/gestion-users").send({ ...VALID_CREATE, password: "corta" }))
      .toHaveProperty("status", 422);
    expect(await request(testApp()).post("/api/v1/gestion-users").send({ ...VALID_CREATE, role: "cliente" }))
      .toHaveProperty("status", 422);
  });

  it("covers list, role, disable, enable and password reset with the frozen envelope", async () => {
    const app = testApp();
    expect(await request(app).get("/api/v1/gestion-users?active=true")).toHaveProperty("status", 200);
    expect(await request(app).put(`/api/v1/gestion-users/${UID}/role`).send({ role: "tecnico" })).toHaveProperty(
      "status",
      200
    );
    expect(await request(app).post(`/api/v1/gestion-users/${UID}/disable`)).toHaveProperty("status", 200);
    expect(await request(app).post(`/api/v1/gestion-users/${UID}/enable`)).toHaveProperty("status", 200);
    const reset = await request(app).post(`/api/v1/gestion-users/${UID}/password`).send({ password: "Bb2@bbbbbbbb" });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ ok: true, data: { passwordReset: true } });
  });
});
