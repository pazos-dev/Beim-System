/**
 * Webshop auth service (PR 4) — auth-identity/spec.md.
 *
 * Dual model: `login` authenticates webshop `users` (username or email +
 * password, scrypt in the legacy `scrypt$salt$hash` format) and issues an
 * opaque session token. `gestionAccess` exchanges a bridge token from
 * `gestion_web_access_tokens` for a scoped webshop session. Sessions store
 * ONLY the sha256 hash of the token, one active session per user (a new
 * login revokes the previous one). Server-side enforcement only: bad
 * credentials, unknown identifiers, unapproved accounts and unknown/expired
 * bridge tokens all surface as 401 with the same message — no existence leak.
 * `gestionLogin` (issue #153) is the console counterpart: it authenticates
 * `gestion_users` and issues sessions in `gestion_sessions` under the same
 * rules (uniform 401, dummy scrypt, single active session).
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AuthError } from "../../../errors/taxonomy.js";
import { query } from "../../../config/db.js";
import { logger } from "../../../observability/logger.js";
import { auditLogsRepository } from "../../gestion/repositories/pg-audit-logs.js";
import { webshopConfig } from "../config.js";
import type { AuthUser, GestionUser, SessionTokenClaims } from "../ports.js";
import { authRepository, hashToken } from "../repositories/pg-auth.js";

export { hashToken };

const scrypt = promisify(scryptCallback);

const SCRYPT_KEYLEN = 64;

/**
 * Dummy scrypt hash (32 zero salt bytes, 64 zero key bytes) used only for
 * timing: login always runs scrypt — even for unknown identifiers or
 * unapproved accounts — so response time never reveals whether the account
 * exists. Outcomes are unchanged (still 401).
 */
const DUMMY_PASSWORD_HASH = `scrypt$${"00".repeat(32)}$${"00".repeat(64)}`;

/** Hashes a password in the legacy `scrypt$salt$hash` format (32-byte salt,
 * 64-byte key) — byte-compatible with the vendored seed.sql hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/** Constant-time verification of a password against a stored scrypt hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, hashHex] = parts;
  if (!/^[0-9a-f]+$/.test(saltHex) || !/^[0-9a-f]+$/.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  try {
    const derived = (await scrypt(password, salt, expected.length)) as Buffer;
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Opaque session token: 32 random bytes, base64url — never persisted raw. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface SessionResult {
  token: string;
  expiresAt: Date;
  user: Pick<AuthUser, "id" | "name" | "email" | "username" | "role">;
}

/** Console session (issue #153): same opaque-token shape as webshop, but the
 * user comes from `gestion_users` — no email, never the password hash. */
export interface GestionSessionResult {
  token: string;
  expiresAt: Date;
  user: Pick<GestionUser, "id" | "username" | "name" | "role">;
}

function toSessionResult(token: string, expiresAt: Date, user: AuthUser): SessionResult {
  return { token, expiresAt, user: { id: user.id, name: user.name, email: user.email, username: user.username, role: user.role } };
}

async function issueSession(user: AuthUser): Promise<SessionResult> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + webshopConfig().sessionTtlMs);
  await authRepository.createSession({ userId: user.id, tokenHash: hashToken(token), expiresAt });
  return toSessionResult(token, expiresAt, user);
}

export const authService = {
  async login(input: { identifier: string; password: string }): Promise<SessionResult> {
    const user = await authRepository.findByIdentifier(input.identifier);
    // Always run scrypt (dummy hash when there is nothing to check) so
    // timing does not leak account existence or approval state.
    const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    const valid = user !== null && user.isApproved && passwordOk;
    if (!valid) {
      // Audit line carries the identifier and the outcome only — never the password.
      logger.info({ event: "webshop_login", ok: false, identifier: input.identifier });
      throw new AuthError("AUTHENTICATION_REQUIRED", "Credenciales inválidas");
    }
    logger.info({ event: "webshop_login", ok: true, identifier: input.identifier });
    const session = await issueSession(user);
    // Audit journal (issue #97): successful logins only — failures stay in the
    // logger (no actor to attribute, brute-force noise). Best-effort so the
    // journal never blocks authentication.
    await auditLogsRepository
      .insert({
        actorUserId: user.id,
        actorRole: user.role,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        details: { userId: user.id, source: "webshop-login" }
      })
      .catch(() => undefined);
    return session;
  },

  /**
   * Returns the public user, or null when the email is already taken
   * (anti-enumeration: the router still answers 201 with `{ user: null }`).
   * The password hash is never exposed (tanda 1 hash-strip stays).
   */
  async register(input: { name: string; email: string; password: string }): Promise<Omit<AuthUser, "passwordHash"> | null> {
    const passwordHash = await hashPassword(input.password);
    const created = await authRepository.insertClient({ name: input.name, email: input.email, passwordHash });
    if (created === null) return null;
    // Never expose the password hash: register returns the public user only
    // (login already strips it via toSessionResult).
    const { passwordHash: _omitted, ...publicUser } = created;
    return publicUser;
  },

  /** Bridge-token exchange (auth-identity/spec.md scenario), single-use. */
  async gestionAccess(input: { token: string }): Promise<SessionResult> {
    const bridge = await authRepository.findBridgeToken(hashToken(input.token));
    if (bridge === null) {
      // Audit line carries the outcome only — never the bridge token.
      logger.info({ event: "gestion_access", ok: false });
      throw new AuthError("AUTHENTICATION_REQUIRED", "Token de acceso inválido");
    }
    const user = await authRepository.findById(bridge.webUserId);
    if (user === null) {
      logger.info({ event: "gestion_access", ok: false });
      throw new AuthError("AUTHENTICATION_REQUIRED", "Token de acceso inválido");
    }
    // Consume the bridge token BEFORE issuing the session: a second exchange
    // of the same token finds nothing and fails with the same 401.
    await authRepository.consumeBridgeToken(hashToken(input.token));
    logger.info({ event: "gestion_access", ok: true, userId: user.id });
    return issueSession(user);
  },

  /** Logout: deletes the session stored under the token hash (idempotent). */
  async logout(input: { token: string }): Promise<void> {
    // Resolve the owner BEFORE deleting so the journal carries the actor.
    // Unknown tokens stay silent (idempotent, no oracle).
    const { rows } = await query<{ user_id: string }>(
      "SELECT user_id FROM webshop_sessions WHERE token_hash = $1",
      [hashToken(input.token)]
    );
    const userId = rows[0]?.user_id ?? null;
    await authRepository.deleteSessionByHash(hashToken(input.token));
    // Console sessions live in a separate realm (gestion_sessions, issue
    // #153): a webshop logout never finds them above, so delete there too.
    // Same token can never exist in both tables (32 random bytes), making
    // the double delete a safe no-op for the other realm.
    await authRepository.deleteGestionSessionByHash(hashToken(input.token));
    if (userId !== null) {
      await auditLogsRepository
        .insert({
          actorUserId: userId,
          action: "auth.logout",
          entityType: "user",
          entityId: userId,
          details: { userId, source: "webshop-logout" }
        })
        .catch(() => undefined);
    }
  },

  /** Resolves a presented session token to user claims, or null (unknown/expired). */
  async verifySessionToken(token: string): Promise<SessionTokenClaims | null> {
    return authRepository.findSessionWithUser(hashToken(token));
  },

  /**
   * Console login (issue #153): authenticates `gestion_users` by username +
   * password (same legacy scrypt format as webshop) and issues an opaque
   * console session token. Unknown usernames, deactivated accounts and wrong
   * passwords all surface as the same 401 — no existence leak — and scrypt
   * always runs (dummy hash fallback) so timing reveals nothing either.
   * The role comes from the DB row: callers never accept a client-sent role.
   */
  async gestionLogin(input: { username: string; password: string }): Promise<GestionSessionResult> {
    const user = await authRepository.findGestionUserByUsername(input.username);
    const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    const valid = user !== null && user.active && passwordOk;
    if (!valid) {
      // Audit line carries the identifier and the outcome only — never the password.
      logger.info({ event: "gestion_login", ok: false, identifier: input.username });
      throw new AuthError("AUTHENTICATION_REQUIRED", "Credenciales inválidas");
    }
    logger.info({ event: "gestion_login", ok: true, identifier: input.username });
    const token = generateToken();
    const expiresAt = new Date(Date.now() + webshopConfig().sessionTtlMs);
    await authRepository.createGestionSession({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt
    });
    return {
      token,
      expiresAt,
      user: { id: user.id, username: user.username, name: user.name, role: user.role }
    };
  },

  /**
   * Resolves a presented console session token to user claims, or null
   * (unknown/expired, or the console user was deactivated after login).
   */
  async verifyGestionSessionToken(token: string): Promise<SessionTokenClaims | null> {
    return authRepository.findGestionSessionWithUser(hashToken(token));
  }
};