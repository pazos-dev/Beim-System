/**
 * Console login tests (issue #153) — `gestion_users` sessions end to end.
 *
 * Covers the console realm against beim_api_test (see src/db/testDb.ts):
 * login by username issues an opaque console session (role from the DB row,
 * never the password hash), unknown/inactive/wrong-password all answer the
 * same uniform 401, a second login revokes the first token, logout kills the
 * console session, and unknown tokens verify to null. Realm separation is
 * proved on the wire with REAL Bearer tokens: a console token passes the
 * gestion `requireRole` gate (`GET /api/v1/clients`) but never the webshop
 * `requireWebshopToken` guard (`GET /api/v1/orders` → 401).
 */
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import request from "supertest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { authService, hashPassword } = await import("./services/auth.js");
const { hashToken } = await import("./repositories/pg-auth.js");
const { createApp } = await import("../../app.js");
const { resolveBearerIdentity } = await import("./webshop-token.js");

// Production wiring: the real Bearer resolver (webshop realm first, console
// realm fallback) so gestion gates see console sessions end to end.
const app = createApp({ resolveIdentity: resolveBearerIdentity });

const PASSWORD = "Secreto-123!";

async function seedGestionUser(overrides: { username?: string; role?: string; active?: boolean } = {}): Promise<{
  id: string;
  username: string;
}> {
  const username = overrides.username ?? `consola-${randomUUID().slice(0, 8)}`;
  const passwordHash = await hashPassword(PASSWORD);
  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_users (username, name, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id::text AS id`,
    [username, "Operador Consola", passwordHash, overrides.role ?? "vendedor", overrides.active ?? true]
  );
  return { id: rows[0].id, username };
}

async function gestionLogin(username: string, password: string = PASSWORD): Promise<request.Response> {
  return request(app).post("/api/v1/auth/gestion-login").send({ username, password });
}

describePg("gestion-login over HTTP", () => {
  it("logs in a console user, returning an opaque token + role and no password hash", async () => {
    const { username } = await seedGestionUser({ role: "vendedor" });

    const res = await gestionLogin(username);
    expect(res.status).toBe(200);
    expect(res.body.data.token.length).toBeGreaterThanOrEqual(32);
    expect(res.body.data.expiresAt).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ username, name: "Operador Consola", role: "vendedor" });
    expect(res.body.data.user.id).toBeDefined();
    // The password hash is never exposed (same hash-strip rule as register).
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
  });

  it("answers unknown username, wrong password and inactive user with the same uniform 401", async () => {
    const { username } = await seedGestionUser();
    const { username: inactiveUsername } = await seedGestionUser({ active: false });

    const unknown = await gestionLogin(`nadie-${randomUUID().slice(0, 8)}`);
    const wrong = await gestionLogin(username, "Erronea-1234!");
    const inactive = await gestionLogin(inactiveUsername);

    for (const res of [unknown, wrong, inactive]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
    }
    // Uniform: no response leaks which of the three cases it was.
    expect(wrong.body.error).toEqual(unknown.body.error);
    expect(inactive.body.error).toEqual(unknown.body.error);
  });

  it("keeps a SINGLE console session per user: the old token dies on gestion routes, the new one passes", async () => {
    const { username } = await seedGestionUser({ role: "vendedor" });

    const first = await gestionLogin(username);
    const second = await gestionLogin(username);
    expect(first.body.data.token).not.toBe(second.body.data.token);

    // Old token: no identity anymore → gestion policy answers 404 (never a hint).
    const stale = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${first.body.data.token}`);
    expect(stale.status).toBe(404);
    expect(stale.body.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");

    // New token: resolves the console identity end to end (vendedor is operator).
    const live = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${second.body.data.token}`);
    expect(live.status).toBe(200);
  });

  it("console sessions never pass the webshop token guard (orders stay webshop-only)", async () => {
    const { username } = await seedGestionUser({ role: "vendedor" });
    const { body } = await gestionLogin(username);

    const res = await request(app).get("/api/v1/orders").set("Authorization", `Bearer ${body.data.token}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("logout kills the console session (idempotent, then unknown)", async () => {
    const { username } = await seedGestionUser({ role: "vendedor" });
    const { body } = await gestionLogin(username);
    const token = body.data.token as string;

    const before = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    await authService.logout({ token });
    expect(await authService.verifyGestionSessionToken(token)).toBeNull();

    const after = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(404);

    // Second logout of the same token stays silent (idempotent, no oracle).
    await authService.logout({ token });
  });

  it("console logout works over HTTP: the route accepts console Bearer and kills it", async () => {
    const { username } = await seedGestionUser({ role: "vendedor" });
    const { body } = await gestionLogin(username);
    const token = body.data.token as string;

    const out = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, data: { loggedOut: true } });

    const after = await request(app).get("/api/v1/clients").set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(404);

    // Repeating the HTTP logout stays silent (idempotent, no oracle).
    const again = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(again.status).toBe(401);
  });

  it("verifyGestionSessionToken returns null for unknown and expired console sessions", async () => {
    expect(await authService.verifyGestionSessionToken("token-que-no-existe")).toBeNull();

    const { id } = await seedGestionUser({ role: "caja" });
    await query("INSERT INTO gestion_sessions (token_hash, gestion_user_id, expires_at) VALUES ($1, $2, now() - interval '1 hour')", [
      hashToken("token-consola-expirado"),
      id
    ]);
    expect(await authService.verifyGestionSessionToken("token-consola-expirado")).toBeNull();
  });

  it("a session of a deactivated console user resolves to null (fail-closed)", async () => {
    const { id, username } = await seedGestionUser({ role: "vendedor" });
    const { body } = await gestionLogin(username);
    const token = body.data.token as string;
    expect(await authService.verifyGestionSessionToken(token)).toEqual({ userId: id, role: "vendedor" });

    await query("UPDATE gestion_users SET active = false WHERE id = $1", [id]);
    expect(await authService.verifyGestionSessionToken(token)).toBeNull();
  });
});
