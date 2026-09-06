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
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { AuthError } from "../../../errors/taxonomy.js";
import { webshopConfig } from "../config.js";
import type { AuthUser, SessionTokenClaims } from "../ports.js";
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
      console.info(`[audit] webshop_login ok=false identifier=${input.identifier}`);
      throw new AuthError("AUTHENTICATION_REQUIRED", "Credenciales inválidas");
    }
    console.info(`[audit] webshop_login ok=true identifier=${input.identifier}`);
    return issueSession(user);
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
      console.info("[audit] gestion_access ok=false");
      throw new AuthError("AUTHENTICATION_REQUIRED", "Token de acceso inválido");
    }
    const user = await authRepository.findById(bridge.webUserId);
    if (user === null) {
      console.info("[audit] gestion_access ok=false");
      throw new AuthError("AUTHENTICATION_REQUIRED", "Token de acceso inválido");
    }
    // Consume the bridge token BEFORE issuing the session: a second exchange
    // of the same token finds nothing and fails with the same 401.
    await authRepository.consumeBridgeToken(hashToken(input.token));
    console.info(`[audit] gestion_access ok=true userId=${user.id}`);
    return issueSession(user);
  },

  /** Logout: deletes the session stored under the token hash (idempotent). */
  async logout(input: { token: string }): Promise<void> {
    await authRepository.deleteSessionByHash(hashToken(input.token));
  },

  /** Resolves a presented session token to user claims, or null (unknown/expired). */
  async verifySessionToken(token: string): Promise<SessionTokenClaims | null> {
    return authRepository.findSessionWithUser(hashToken(token));
  }
};