/**
 * Auth service tests (PR 4) — dual identity model per auth-identity/spec.md.
 *
 * Exercises the webshop auth core against beim_api_test (see src/db/testDb.ts):
 * scrypt password hashing in the legacy `scrypt$salt$hash` format, opaque
 * session tokens stored as sha256 with expiry (one active session per user),
 * the gestion-access bridge (gestion_web_access_tokens → scoped webshop
 * session), and the 401 policy for unknown/expired/forbidden credentials.
 */
import { expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { AuthError, ConflictError } from "../../errors/taxonomy.js";
import { withTransaction } from "../../db/withTransaction.js";

setupTestDatabase();

const { query } = await import("../../config/db.js");
const { authService, generateToken, hashPassword, hashToken, verifyPassword } = await import("./services/auth.js");

const U = {
  ok: "aaaaaaaa-0000-0000-0000-000000000001",
  noApproval: "aaaaaaaa-0000-0000-0000-000000000002",
  bridged: "aaaaaaaa-0000-0000-0000-000000000003",
  gestion: "bbbbbbbb-0000-0000-0000-000000000001"
};

async function seedUser(id: string, identifier: string, password: string, approved: boolean): Promise<string> {
  const passwordHash = await hashPassword(password);
  await query(
    `INSERT INTO users (id, name, username, email, password_hash, role, is_approved)
     VALUES ($1, 'Api User', $2, $2 || '@beim.test', $3, 'cliente', $4)
     ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_approved = EXCLUDED.is_approved, updated_at = now()`,
    [id, identifier, passwordHash, approved]
  );
  return id;
}

async function countActiveSessions(userId: string): Promise<number> {
  const { rows } = await query<{ n: string }>(
    "SELECT count(*)::text AS n FROM webshop_sessions WHERE user_id = $1 AND expires_at > now()",
    [userId]
  );
  return Number(rows[0].n);
}

async function insertSession(userId: string, token: string, expiresAt: Date): Promise<void> {
  await query(
    "INSERT INTO webshop_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [hashToken(token), userId, expiresAt]
  );
}

describePg("password + token primitives", () => {
  it("hashPassword produces the legacy scrypt$salt$hash format and verifyPassword round-trips", async () => {
    const hashed = await hashPassword("clave-secreta-123");
    expect(hashed.startsWith("scrypt$")).toBe(true);
    const [, salt, hash] = hashed.split("$");
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(await verifyPassword("clave-secreta-123", hashed)).toBe(true);
  });

  it("verifyPassword rejects a wrong password and a malformed stored hash", async () => {
    const hashed = await hashPassword("clave-secreta-123");
    expect(await verifyPassword("otra-clave", hashed)).toBe(false);
    expect(await verifyPassword("clave-secreta-123", "plain-text-hash")).toBe(false);
  });

  it("hashToken is a deterministic sha256 hex of the token; generateToken is unique", () => {
    const token = "token-opaco-abc";
    const first = hashToken(token);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(first);
    expect(hashToken("token-opaco-abc2")).not.toBe(first);
    expect(generateToken()).not.toBe(generateToken());
    expect(generateToken().length).toBeGreaterThanOrEqual(32);
  });
});

describePg("login (users table, approved only)", () => {
  it("logs in an approved user by username and by email, returning an opaque token + expiry", async () => {
    await seedUser(U.ok, "comprador", "pass-ok-123", true);

    const byUsername = await authService.login({ identifier: "comprador", password: "pass-ok-123" });
    expect(byUsername.token.length).toBeGreaterThanOrEqual(32);
    expect(byUsername.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(byUsername.user.id).toBe(U.ok);
    expect(byUsername.user.role).toBe("cliente");
    expect(await countActiveSessions(U.ok)).toBe(1);

    const byEmail = await authService.login({ identifier: "comprador@beim.test", password: "pass-ok-123" });
    expect(byEmail.user.id).toBe(U.ok);
  });

  it("rejects a wrong password with 401 and nothing leaks about the account", async () => {
    await seedUser(U.ok, "comprador", "pass-ok-123", true);
    await expect(authService.login({ identifier: "comprador", password: "incorrecta" })).rejects.toBeInstanceOf(
      AuthError
    );
  });

  it("rejects an unknown identifier with 401 (no existence hint)", async () => {
    await expect(authService.login({ identifier: "nadie", password: "pass-ok-123" })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects a not-approved account with 401 (same error as bad credentials)", async () => {
    await seedUser(U.noApproval, "pendiente", "pass-ok-123", false);
    await expect(authService.login({ identifier: "pendiente", password: "pass-ok-123" })).rejects.toMatchObject({
      status: 401
    });
  });

  it("keeps a SINGLE active session per user: a new login revokes the previous token", async () => {
    await seedUser(U.ok, "comprador", "pass-ok-123", true);
    const first = await authService.login({ identifier: "comprador", password: "pass-ok-123" });
    const second = await authService.login({ identifier: "comprador", password: "pass-ok-123" });

    expect(await authService.verifySessionToken(first.token)).toBeNull();
    expect((await authService.verifySessionToken(second.token))?.userId).toBe(U.ok);
    expect(await countActiveSessions(U.ok)).toBe(1);
  });
});

describePg("session verification + expiry", () => {
  it("resolves a valid session to the user claims", async () => {
    await seedUser(U.ok, "comprador", "pass-ok-123", true);
    const { token } = await authService.login({ identifier: "comprador", password: "pass-ok-123" });
    const claims = await authService.verifySessionToken(token);
    expect(claims).toEqual({ userId: U.ok, role: "cliente" });
  });

  it("returns null for unknown tokens and for expired sessions (middleware maps to 401)", async () => {
    await seedUser(U.ok, "comprador", "pass-ok-123", true);
    expect(await authService.verifySessionToken("token-que-no-existe")).toBeNull();

    await insertSession(U.ok, "token-expirado", new Date(Date.now() - 60_000));
    expect(await authService.verifySessionToken("token-expirado")).toBeNull();
  });
});

describePg("register", () => {
  it("creates a cliente account that is NOT approved yet (no session issued)", async () => {
    const user = await authService.register({ name: "Nuevo Cliente", email: "nuevo@beim.test", password: "pass-reg-123" });
    expect(user.role).toBe("cliente");
    expect(user.isApproved).toBe(false);
  });

  it("rejects a duplicate email with 409 ConflictError", async () => {
    const first = await authService.register({ name: "Duplicado", email: "dup@beim.test", password: "pass-reg-123" });
    expect(first.id).toBeDefined();
    await expect(
      authService.register({ name: "Otro Duplicado", email: "dup@beim.test", password: "pass-reg-456" })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describePg("gestion-access bridge (auth-identity/spec.md)", () => {
  it("issues a scoped webshop session for a valid unexpired bridge token", async () => {
    await seedUser(U.bridged, "empresa", "pass-ok-123", true);
    await query(
      `INSERT INTO gestion_users (id, username, name, password_hash, role)
       VALUES ($1, 'gestion-bridge', 'Gestion Bridge', 'irrelevant', 'vendedor')
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [U.gestion]
    );
    const bridgeToken = "bridge-token-valido";
    await query(
      `INSERT INTO gestion_web_access_tokens (token_hash, web_user_id, gestion_user_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')
       ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [hashToken(bridgeToken), U.bridged, U.gestion]
    );

    const session = await authService.gestionAccess({ token: bridgeToken });
    expect(session.user.id).toBe(U.bridged);
    expect(await authService.verifySessionToken(session.token)).toEqual({ userId: U.bridged, role: "cliente" });
  });

  it("rejects an expired bridge token with 401 and issues no session", async () => {
    const bridgeToken = "bridge-token-expirado";
    await query(
      `INSERT INTO gestion_web_access_tokens (token_hash, web_user_id, gestion_user_id, expires_at)
       VALUES ($1, $2, $3, now() - interval '1 hour')`,
      [hashToken(bridgeToken), U.bridged, U.gestion]
    );
    await expect(authService.gestionAccess({ token: bridgeToken })).rejects.toMatchObject({ status: 401 });
  });

  it("rejects an unknown bridge token with 401", async () => {
    await expect(authService.gestionAccess({ token: "bridge-desconocido" })).rejects.toMatchObject({ status: 401 });
  });
});