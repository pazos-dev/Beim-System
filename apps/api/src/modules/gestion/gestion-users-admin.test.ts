/**
 * HTTP-layer tests for console-user administration (issue #155).
 *
 * Covers the admin-only `gestion-users` surface through createApp: creation
 * closes the circle with the real console login (gestion-login, issue #153),
 * duplicate usernames stay 201-null (anti-enumeration), role changes enforce
 * the closed console list, disable revokes sessions, enable revives login,
 * password reset swaps the credential, and the 403/404/422 matrix holds.
 * Runs against beim_api_test (see src/db/testDb.ts).
 *
 * Scope note: these routes operate ONLY on console identities
 * (`gestion_users`). Webshop identities (`users`) are untouched here, and
 * `gestion_role_permissions` stays unvalidated (future issue).
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

/** Production-like app: Bearer console sessions resolved against the DB. */
const bearerApp = createApp({ resolveIdentity: resolveBearerIdentity });

const OPERATOR = ["vendedor"];
const ADMIN = ["administrador"];
const UNKNOWN_ID = "00000000-0000-0000-0000-000000000000";
const PASSWORD = "Secreto-123!";
const NEW_PASSWORD = "Nueva-Clave-456!";

async function seedGestionUser(
  overrides: { username?: string; password?: string; role?: string; active?: boolean } = {}
): Promise<{ id: string; username: string }> {
  const id = randomUUID();
  const username = overrides.username ?? `gu-${id.slice(0, 8)}`;
  const passwordHash = await hashPassword(overrides.password ?? PASSWORD);
  await query(
    `INSERT INTO gestion_users (id, username, name, password_hash, role, active)
     VALUES ($1::uuid, $2, $3, $4, $5, $6)`,
    [id, username, `Consola ${username}`, passwordHash, overrides.role ?? "vendedor", overrides.active ?? true]
  );
  return { id, username };
}

async function gestionLogin(username: string, password: string = PASSWORD): Promise<string> {
  const res = await request(bearerApp).post("/api/v1/auth/gestion-login").send({ username, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describePg("gestion users admin — create closes the circle with gestion-login", () => {
  it("admin creates a console user (201, public shape) and gestion-login succeeds", async () => {
    const username = `alta-${randomUUID().slice(0, 8)}`;

    const created = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/gestion-users")
      .send({ username, name: "Caja Alta", password: PASSWORD, role: "caja" });
    expect(created.status).toBe(201);
    expect(created.body.data.user).toMatchObject({ username, name: "Caja Alta", role: "caja", active: true });
    expect(created.body.data.user).not.toHaveProperty("password_hash");
    expect(created.body.data.user).not.toHaveProperty("passwordHash");

    // The circle closes through the untouched console login (issue #153):
    // the fresh credential authenticates and the token authorizes an
    // operator-gated route with the DB role.
    const token = await gestionLogin(username);
    expect(typeof token).toBe("string");

    const receipts = await request(bearerApp).get("/api/v1/receipts").set("Authorization", `Bearer ${token}`);
    expect(receipts.status).toBe(200);
  });

  it("duplicate username answers 201 with a null user (anti-enumeration)", async () => {
    const user = await seedGestionUser();

    const again = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/gestion-users")
      .send({ username: user.username, name: "Otro Nombre", password: PASSWORD, role: "caja" });
    expect(again.status).toBe(201);
    expect(again.body.data).toEqual({ user: null });

    // The pre-existing row is untouched: the original credential still works.
    const token = await gestionLogin(user.username);
    expect(typeof token).toBe("string");
  });
});

describePg("gestion users admin — role", () => {
  it("sets a valid console role (tecnico, 200, public shape)", async () => {
    const user = await seedGestionUser({ role: "vendedor" });

    const res = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/gestion-users/${user.id}/role`)
      .send({ role: "tecnico" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: user.id, username: user.username, role: "tecnico" });
    expect(res.body.data).not.toHaveProperty("password_hash");
    expect(res.body.data).not.toHaveProperty("passwordHash");
  });

  it("rejects roles outside the closed console list with 422 (superadmin, admin)", async () => {
    const user = await seedGestionUser({ role: "vendedor" });

    // superadmin is NOT a console role (it belongs to webshop `users`).
    const superadmin = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/gestion-users/${user.id}/role`)
      .send({ role: "superadmin" });
    expect(superadmin.status).toBe(422);
    expect(superadmin.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    // admin is a webshop role too — also rejected on the console surface.
    const admin = await request(appWith({ roles: ADMIN }))
      .put(`/api/v1/gestion-users/${user.id}/role`)
      .send({ role: "admin" });
    expect(admin.status).toBe(422);

    const { rows } = await query<{ role: string }>("SELECT role FROM gestion_users WHERE id = $1", [user.id]);
    expect(rows[0].role).toBe("vendedor");
  });
});

describePg("gestion users admin — disable revokes sessions", () => {
  it("disable deactivates, kills the live token and blocks login (401); idempotent", async () => {
    const user = await seedGestionUser({ role: "caja" });
    const token = await gestionLogin(user.username);

    const before = await request(bearerApp).get("/api/v1/receipts").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    const disabled = await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${user.id}/disable`);
    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toMatchObject({ id: user.id, active: false });
    expect(disabled.body.data).not.toHaveProperty("password_hash");

    // Dead console token resolves to no identity → the gestion guard answers
    // 404 (never a hint the session existed); the login stays a uniform 401.
    const revoked = await request(bearerApp).get("/api/v1/receipts").set("Authorization", `Bearer ${token}`);
    expect(revoked.status).toBe(404);

    const relogin = await request(bearerApp)
      .post("/api/v1/auth/gestion-login")
      .send({ username: user.username, password: PASSWORD });
    expect(relogin.status).toBe(401);

    const again = await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${user.id}/disable`);
    expect(again.status).toBe(200);
    expect(again.body.data.active).toBe(false);
  });
});

describePg("gestion users admin — enable revives login", () => {
  it("enable reactivates and gestion-login works again (idempotent)", async () => {
    const user = await seedGestionUser({ active: false });

    const denied = await request(bearerApp)
      .post("/api/v1/auth/gestion-login")
      .send({ username: user.username, password: PASSWORD });
    expect(denied.status).toBe(401);

    const enabled = await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${user.id}/enable`);
    expect(enabled.status).toBe(200);
    expect(enabled.body.data).toMatchObject({ id: user.id, active: true });

    const token = await gestionLogin(user.username);
    const receipts = await request(bearerApp).get("/api/v1/receipts").set("Authorization", `Bearer ${token}`);
    expect(receipts.status).toBe(200);

    const again = await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${user.id}/enable`);
    expect(again.status).toBe(200);
    expect(again.body.data.active).toBe(true);
  });
});

describePg("gestion users admin — password reset", () => {
  it("reset swaps the credential (old 401, new 200) without leaking secrets", async () => {
    const user = await seedGestionUser();
    await gestionLogin(user.username);

    const reset = await request(appWith({ roles: ADMIN }))
      .post(`/api/v1/gestion-users/${user.id}/password`)
      .send({ password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ passwordReset: true });
    expect(reset.body.data).not.toHaveProperty("password_hash");
    expect(reset.body.data).not.toHaveProperty("passwordHash");
    expect(reset.body.data).not.toHaveProperty("password");
    expect(JSON.stringify(reset.body)).not.toContain("scrypt$");

    const stale = await request(bearerApp)
      .post("/api/v1/auth/gestion-login")
      .send({ username: user.username, password: PASSWORD });
    expect(stale.status).toBe(401);

    const fresh = await gestionLogin(user.username, NEW_PASSWORD);
    expect(typeof fresh).toBe("string");
  });

  it("rejects weak passwords with 422 and keeps the old credential", async () => {
    const user = await seedGestionUser();

    const weak = await request(appWith({ roles: ADMIN }))
      .post(`/api/v1/gestion-users/${user.id}/password`)
      .send({ password: "corta" });
    expect(weak.status).toBe(422);
    expect(weak.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });

    const token = await gestionLogin(user.username);
    expect(typeof token).toBe("string");
  });
});

describePg("gestion users admin — list", () => {
  it("lists paginated public users, never password hashes, with role/active filters", async () => {
    const seller = await seedGestionUser({ role: "vendedor", active: true });
    const tech = await seedGestionUser({ role: "tecnico", active: true });
    const inactive = await seedGestionUser({ role: "caja", active: false });

    const list = await request(appWith({ roles: ADMIN })).get("/api/v1/gestion-users");
    expect(list.status).toBe(200);
    expect(list.body.data.page).toBe(1);
    expect(list.body.data.total).toBeGreaterThanOrEqual(3);
    expect(list.body.data.items.map((u: { id: string }) => u.id)).toEqual(
      expect.arrayContaining([seller.id, tech.id, inactive.id])
    );
    for (const item of list.body.data.items as Array<Record<string, unknown>>) {
      expect(item).not.toHaveProperty("password_hash");
      expect(item).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(item)).not.toContain("scrypt$");
    }

    const technicians = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/gestion-users")
      .query({ role: "tecnico" });
    expect(technicians.status).toBe(200);
    expect(technicians.body.data.items.map((u: { id: string }) => u.id)).toContain(tech.id);
    expect(technicians.body.data.items.map((u: { id: string }) => u.id)).not.toContain(seller.id);
    expect((technicians.body.data.items as Array<{ role: string }>).every((u) => u.role === "tecnico")).toBe(true);

    // active=false arrives as the STRING "false" and must match deactivated
    // users only (a boolean cast would flip it to true).
    const off = await request(appWith({ roles: ADMIN })).get("/api/v1/gestion-users").query({ active: "false" });
    expect(off.status).toBe(200);
    expect(off.body.data.items.map((u: { id: string }) => u.id)).toContain(inactive.id);
    expect(off.body.data.items.map((u: { id: string }) => u.id)).not.toContain(seller.id);
    expect((off.body.data.items as Array<{ active: boolean }>).every((u) => u.active === false)).toBe(true);

    const on = await request(appWith({ roles: ADMIN })).get("/api/v1/gestion-users").query({ active: "true" });
    expect(on.body.data.items.map((u: { id: string }) => u.id)).toContain(seller.id);
    expect(on.body.data.items.map((u: { id: string }) => u.id)).not.toContain(inactive.id);

    const badRole = await request(appWith({ roles: ADMIN })).get("/api/v1/gestion-users").query({ role: "superadmin" });
    expect(badRole.status).toBe(422);
  });

  it("searches by username/name substring and paginates", async () => {
    const prefix = `busqueda-${randomUUID().slice(0, 8)}`;
    const first = await seedGestionUser({ username: `${prefix}-uno` });
    const second = await seedGestionUser({ username: `${prefix}-dos` });
    await seedGestionUser();

    const found = await request(appWith({ roles: ADMIN })).get("/api/v1/gestion-users").query({ search: prefix });
    expect(found.status).toBe(200);
    expect(found.body.data.items.map((u: { id: string }) => u.id)).toEqual(
      expect.arrayContaining([first.id, second.id])
    );
    expect(found.body.data.total).toBe(2);

    const page = await request(appWith({ roles: ADMIN }))
      .get("/api/v1/gestion-users")
      .query({ search: prefix, page: "2", limit: "1" });
    expect(page.status).toBe(200);
    expect(page.body.data).toMatchObject({ total: 2, page: 2, limit: 1 });
    expect(page.body.data.items).toHaveLength(1);
  });
});

describePg("gestion users admin — guards and errors", () => {
  it("operator role is forbidden (403) on all six routes", async () => {
    const user = await seedGestionUser();
    const payload = { username: `op-${randomUUID().slice(0, 8)}`, name: "Operador", password: PASSWORD, role: "caja" };

    expect((await request(appWith({ roles: OPERATOR })).get("/api/v1/gestion-users")).status).toBe(403);
    expect((await request(appWith({ roles: OPERATOR })).post("/api/v1/gestion-users").send(payload)).status).toBe(403);
    expect(
      (await request(appWith({ roles: OPERATOR })).put(`/api/v1/gestion-users/${user.id}/role`).send({ role: "tecnico" }))
        .status
    ).toBe(403);
    expect((await request(appWith({ roles: OPERATOR })).post(`/api/v1/gestion-users/${user.id}/disable`)).status).toBe(
      403
    );
    expect((await request(appWith({ roles: OPERATOR })).post(`/api/v1/gestion-users/${user.id}/enable`)).status).toBe(
      403
    );
    expect(
      (await request(appWith({ roles: OPERATOR })).post(`/api/v1/gestion-users/${user.id}/password`).send({ password: NEW_PASSWORD }))
        .status
    ).toBe(403);
  });

  it("anonymous caller sees 404 (never a hint the resource exists) on all six routes", async () => {
    const user = await seedGestionUser();
    const payload = { username: `anon-${randomUUID().slice(0, 8)}`, name: "Anonimo", password: PASSWORD, role: "caja" };

    expect((await request(appWith()).get("/api/v1/gestion-users")).status).toBe(404);
    expect((await request(appWith()).post("/api/v1/gestion-users").send(payload)).status).toBe(404);
    expect((await request(appWith()).put(`/api/v1/gestion-users/${user.id}/role`).send({ role: "tecnico" })).status).toBe(
      404
    );
    expect((await request(appWith()).post(`/api/v1/gestion-users/${user.id}/disable`)).status).toBe(404);
    expect((await request(appWith()).post(`/api/v1/gestion-users/${user.id}/enable`)).status).toBe(404);
    expect(
      (await request(appWith()).post(`/api/v1/gestion-users/${user.id}/password`).send({ password: NEW_PASSWORD }))
        .status
    ).toBe(404);
  });

  it("unknown uuid answers 404 on role/disable/enable/password; malformed uuid answers 422", async () => {
    expect(
      (await request(appWith({ roles: ADMIN })).put(`/api/v1/gestion-users/${UNKNOWN_ID}/role`).send({ role: "tecnico" }))
        .status
    ).toBe(404);
    expect((await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${UNKNOWN_ID}/disable`)).status).toBe(
      404
    );
    expect((await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${UNKNOWN_ID}/enable`)).status).toBe(
      404
    );
    expect(
      (await request(appWith({ roles: ADMIN })).post(`/api/v1/gestion-users/${UNKNOWN_ID}/password`).send({ password: NEW_PASSWORD }))
        .status
    ).toBe(404);

    const malformed = await request(appWith({ roles: ADMIN })).post("/api/v1/gestion-users/not-a-uuid/disable");
    expect(malformed.status).toBe(422);
    expect(malformed.body).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("create rejects weak passwords, missing fields and unknown keys with 422", async () => {
    const base = { username: `val-${randomUUID().slice(0, 8)}`, name: "Valido", password: PASSWORD, role: "caja" };

    const weak = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/gestion-users")
      .send({ ...base, password: "sinsimbolos1A" });
    expect(weak.status).toBe(422);

    const short = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/gestion-users")
      .send({ ...base, password: "Corta-1!" });
    expect(short.status).toBe(422);

    const noRole = await request(appWith({ roles: ADMIN })).post("/api/v1/gestion-users").send({
      username: base.username,
      name: base.name,
      password: base.password
    });
    expect(noRole.status).toBe(422);

    const extra = await request(appWith({ roles: ADMIN }))
      .post("/api/v1/gestion-users")
      .send({ ...base, email: "extra@example.com" });
    expect(extra.status).toBe(422);
  });
});

describePg("gestion users admin — audit journal", () => {
  it("journals create/role/disable with the admin actor and no secrets", async () => {
    const adminId = randomUUID();
    const adminEmail = `audit-admin-${adminId.slice(0, 8)}@beim.test`;
    await query(
      `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
       VALUES ($1::uuid, 'Admin Audit', $2, $3, $4, 'admin', true)`,
      [adminId, `audit-admin-${adminId.slice(0, 8)}`, adminEmail, await hashPassword(PASSWORD)]
    );
    const loginRes = await request(bearerApp)
      .post("/api/v1/auth/login")
      .send({ identifier: adminEmail, password: PASSWORD });
    expect(loginRes.status).toBe(200);
    const adminToken = loginRes.body.data.token as string;
    const authHeader = { Authorization: `Bearer ${adminToken}` };

    const username = `audit-${randomUUID().slice(0, 8)}`;
    const created = await request(bearerApp)
      .post("/api/v1/gestion-users")
      .set(authHeader)
      .send({ username, name: "Auditado", password: PASSWORD, role: "caja" });
    expect(created.status).toBe(201);
    const uid = created.body.data.user.id as string;

    const role = await request(bearerApp)
      .put(`/api/v1/gestion-users/${uid}/role`)
      .set(authHeader)
      .send({ role: "tecnico" });
    expect(role.status).toBe(200);

    const disable = await request(bearerApp).post(`/api/v1/gestion-users/${uid}/disable`).set(authHeader);
    expect(disable.status).toBe(200);

    const { rows } = await query<{
      action: string;
      entityId: string;
      actorUserId: string | null;
      actorRole: string | null;
      details: unknown;
    }>(
      `SELECT action, entity_id AS "entityId", actor_user_id AS "actorUserId",
              actor_role AS "actorRole", details
       FROM audit_logs WHERE entity_id = $1`,
      [uid]
    );
    expect(rows.map((r) => r.action).sort()).toEqual(
      ["gestion-user.active", "gestion-user.create", "gestion-user.role"].sort()
    );
    for (const row of rows) {
      expect(row.entityId).toBe(uid);
      expect(row.actorUserId).toBe(adminId);
      expect(row.actorRole).toBe("admin");
    }
    expect(JSON.stringify(rows)).not.toContain("password_hash");
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
  });
});
