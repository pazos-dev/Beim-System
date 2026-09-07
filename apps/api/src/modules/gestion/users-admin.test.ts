/**
 * HTTP-layer tests for webshop user administration (issue #85).
 *
 * Covers the admin-only `users` surface through createApp: approve unblocks
 * login, role promotion takes effect on guarded routes, disable revokes
 * sessions, and the 403/404/422/404 matrix holds. Runs against beim_api_test
 * (see src/db/testDb.ts).
 *
 * Scope note: these routes operate ONLY on webshop identities (`users`).
 * Console identities (`gestion_users`) have no login/session issuance yet —
 * that is a separate future issue, asserted nowhere here.
 */
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

setupTestDatabase();

// Dynamic imports AFTER setupTestDatabase() set DATABASE_URL at module top:
// createApp pulls in the router → services → config/db, which builds the
// shared Pool from DATABASE_URL at module evaluation time.
const { createApp } = await import("../../app.js");
const { query } = await import("../../config/db.js");
const { hashPassword } = await import("../webshop/services/auth.js");
const { resolveBearerIdentity } = await import("../webshop/webshop-token.js");

interface TestIdentityOptions {
  roles?: string[] | null;
}

/** createApp with an injected identity (tests stand in for the auth module). */
function appWith({ roles }: TestIdentityOptions = {}): Express {
  return createApp({
    resolveIdentity:
      roles === undefined || roles === null ? undefined : () => ({ userId: "u-test", roles })
  });
}

/** Production-like app: Bearer webshop sessions resolved against the DB. */
const bearerApp = createApp({ resolveIdentity: resolveBearerIdentity });

const OPERATOR = ["vendedor"];
const ADMIN = ["administrador"];
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";

async function seedWebUser(
  overrides: { email?: string; role?: string; approve?: boolean } = {}
): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = overrides.email ?? `users-admin-${id.slice(0, 8)}@beim.test`;
  const passwordHash = await hashPassword("Secreto-123!");
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
    [id, "Usuario Gestion", `ug-${id.slice(0, 8)}`, email, passwordHash, overrides.role ?? "cliente", overrides.approve ?? true]
  );
  return { id, email };
}

async function login(email: string, password = "Secreto-123!"): Promise<string> {
  const res = await request(bearerApp).post("/api/v1/auth/login").send({ identifier: email, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describePg("users admin — approve unblocks login", () => {
  it("admin approves an unapproved user (200, public shape) and login succeeds", async () => {
    const user = await seedWebUser({ approve: false });

    const denied = await request(bearerApp)
      .post("/api/v1/auth/login")
      .send({ identifier: user.email, password: "Secreto-123!" });
    expect(denied.status).toBe(401);

    const approved = await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${user.id}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ id: user.id, email: user.email, role: "cliente", isApproved: true });
    expect(approved.body.data).not.toHaveProperty("password_hash");
    expect(approved.body.data).not.toHaveProperty("passwordHash");

    const token = await login(user.email);
    expect(typeof token).toBe("string");
  });

  it("approving an already-approved user is idempotent (200)", async () => {
    const user = await seedWebUser({ approve: true });
    const res = await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${user.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.data.isApproved).toBe(true);
  });
});

describePg("users admin — list", () => {
  it("lists paginated public users, never password hashes, with role/approved filters", async () => {
    const pending = await seedWebUser({ approve: false });
    const active = await seedWebUser({ approve: true });

    const list = await request(appWith({ roles: ADMIN })).get("/api/v1/users");
    expect(list.status).toBe(200);
    expect(list.body.data.page).toBe(1);
    expect(list.body.data.total).toBeGreaterThanOrEqual(2);
    expect(list.body.data.items.map((u: { id: string }) => u.id)).toEqual(
      expect.arrayContaining([pending.id, active.id])
    );
    for (const item of list.body.data.items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("password_hash");
      expect(item).not.toHaveProperty("passwordHash");
    }

    // approved=false arrives as the STRING "false" and must match unapproved
    // users only (a boolean cast would flip it to true).
    const unapproved = await request(appWith({ roles: ADMIN })).get("/api/v1/users").query({ approved: "false" });
    expect(unapproved.status).toBe(200);
    expect(unapproved.body.data.items.map((u: { id: string }) => u.id)).toContain(pending.id);
    expect(unapproved.body.data.items.map((u: { id: string }) => u.id)).not.toContain(active.id);
    expect(
      (unapproved.body.data.items as Array<{ isApproved: boolean }>).every((u) => u.isApproved === false)
    ).toBe(true);

    const approved = await request(appWith({ roles: ADMIN })).get("/api/v1/users").query({ approved: "true" });
    expect(approved.body.data.items.map((u: { id: string }) => u.id)).toContain(active.id);
    expect(approved.body.data.items.map((u: { id: string }) => u.id)).not.toContain(pending.id);

    const clientes = await request(appWith({ roles: ADMIN })).get("/api/v1/users").query({ role: "cliente" });
    expect(clientes.status).toBe(200);
    expect(
      (clientes.body.data.items as Array<{ role: string }>).every((u) => u.role === "cliente")
    ).toBe(true);
  });
});

describePg("users admin — role promotion takes effect", () => {
  it("promotes cliente to admin and the Bearer session can create services (201)", async () => {
    const user = await seedWebUser({ approve: true, role: "cliente" });

    const promoted = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/users/${user.id}/role`)
      .send({ role: "admin" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data).toMatchObject({ id: user.id, role: "admin", isApproved: true });
    expect(promoted.body.data).not.toHaveProperty("password_hash");

    const token = await login(user.email);
    const created = await request(bearerApp)
      .post("/api/v1/services")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Servicio Promocionado" });
    expect(created.status).toBe(201);
  });

  it("rejects roles outside the closed webshop list with 422 (console roles included)", async () => {
    const user = await seedWebUser({ approve: true });
    const res = await request(appWith({ roles: ADMIN })).put(`/api/v1/users/${user.id}/role`).send({ role: "vendedor" });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    const { rows } = await query<{ role: string }>("SELECT role FROM users WHERE id = $1", [user.id]);
    expect(rows[0].role).toBe("cliente");
  });
});

describePg("users admin — disable revokes sessions", () => {
  it("disable revokes the live token (401) and blocks login (401); idempotent (200)", async () => {
    const user = await seedWebUser({ approve: true });
    const token = await login(user.email);

    const before = await request(bearerApp).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    const disabled = await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${user.id}/disable`);
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toMatchObject({ id: user.id, isApproved: false });
    expect(disabled.body.data).not.toHaveProperty("password_hash");

    const revoked = await request(bearerApp).get("/api/v1/orders").set("Authorization", `Bearer ${token}`);
    expect(revoked.status).toBe(401);

    const relogin = await request(bearerApp)
      .post("/api/v1/auth/login")
      .send({ identifier: user.email, password: "Secreto-123!" });
    expect(relogin.status).toBe(401);

    const again = await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${user.id}/disable`);
    expect(again.status).toBe(200);
    expect(again.body.data.isApproved).toBe(false);
  });
});

describePg("users admin — guards and errors", () => {
  it("operator role is forbidden (403) on all four routes", async () => {
    const user = await seedWebUser({ approve: true });

    expect((await request(appWith({ roles: OPERATOR })).get("/api/v1/users")).status).toBe(403);
    expect((await request(appWith({ roles: OPERATOR })).post(`/api/v1/users/${user.id}/approve`)).status).toBe(403);
    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/users/${user.id}/role`).send({ role: "admin" })).status
    ).toBe(403);
    expect((await request(appWith({ roles: OPERATOR })).post(`/api/v1/users/${user.id}/disable`)).status).toBe(403);
  });

  it("anonymous caller sees 404 (never a hint the resource exists) on all four routes", async () => {
    const user = await seedWebUser({ approve: true });

    expect((await request(appWith()).get("/api/v1/users")).status).toBe(404);
    expect((await request(appWith()).post(`/api/v1/users/${user.id}/approve`)).status).toBe(404);
    expect((await request(appWith()).put(`/api/v1/users/${user.id}/role`).send({ role: "admin" })).status).toBe(404);
    expect((await request(appWith()).post(`/api/v1/users/${user.id}/disable`)).status).toBe(404);
  });

  it("unknown uuid answers 404 on approve/role/disable; malformed uuid answers 422", async () => {
    expect((await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${UNKNOWN_ID}/approve`)).status).toBe(404);
    expect(
      (await request(appWith({ roles: ADMIN })).put(`/api/v1/users/${UNKNOWN_ID}/role`).send({ role: "admin" })).status
    ).toBe(404);
    expect((await request(appWith({ roles: ADMIN })).post(`/api/v1/users/${UNKNOWN_ID}/disable`)).status).toBe(404);

    const malformed = await request(appWith({ roles: ADMIN })).post("/api/v1/users/not-a-uuid/approve");
    expect(malformed.status).toBe(422);
    expect(malformed.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
