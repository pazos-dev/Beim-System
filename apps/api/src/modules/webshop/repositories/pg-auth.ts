/**
 * Postgres auth repository (PR 4) — dual identity model (auth-identity/spec.md).
 *
 * Webshop identities live in `users` (role cliente/admin/superadmin); console
 * identities live in `gestion_users`, bridged to the web side through
 * `gestion_web_access_tokens` (bridge tokens stored as sha256 hash + expiry).
 * Session tokens for webshop clients are opaque and stored ONLY as sha256
 * hashes in `webshop_sessions` (migration 0001) — the raw token never touches
 * the database.
 */
import { createHash } from "node:crypto";
import { query } from "../../../config/db.js";
import { withTransaction } from "../../../db/withTransaction.js";
import type { AuthPort, AuthUser, SessionTokenClaims } from "../ports.js";

interface UserDbRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  password_hash: string;
  role: string;
  is_approved: boolean;
}

function mapUser(row: UserDbRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    isApproved: row.is_approved
  };
}

export const authRepository: AuthPort = {
  async findByIdentifier(identifier: string): Promise<AuthUser | null> {
    const { rows } = await query<UserDbRow>(
      "SELECT id, name, email, username, password_hash, role, is_approved FROM users WHERE username = $1 OR email = $1 LIMIT 1",
      [identifier]
    );
    return rows[0] !== undefined ? mapUser(rows[0]) : null;
  },

  async findById(id: string): Promise<AuthUser | null> {
    const { rows } = await query<UserDbRow>(
      "SELECT id, name, email, username, password_hash, role, is_approved FROM users WHERE id = $1",
      [id]
    );
    return rows[0] !== undefined ? mapUser(rows[0]) : null;
  },

  async insertClient(input: { name: string; email: string; passwordHash: string }): Promise<AuthUser | null> {
    const { rows } = await query<UserDbRow>(
      `INSERT INTO users (name, email, password_hash, role, is_approved)
       VALUES ($1, $2, $3, 'cliente', false)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, name, email, username, password_hash, role, is_approved`,
      [input.name, input.email, input.passwordHash]
    );
    // Null on duplicate email: the service answers 201 with a null user
    // (anti-enumeration) instead of leaking the conflict as 409.
    return rows[0] === undefined ? null : mapUser(rows[0]);
  },

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    // Single active session per user: revoke-then-insert atomically so two
    // concurrent logins cannot leave two live sessions behind.
    await withTransaction(async (client) => {
      await client.query("DELETE FROM webshop_sessions WHERE user_id = $1", [input.userId]);
      await client.query("INSERT INTO webshop_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
        input.tokenHash,
        input.userId,
        input.expiresAt
      ]);
    });
  },

  async findSessionWithUser(tokenHash: string): Promise<SessionTokenClaims | null> {
    const { rows } = await query<{ user_id: string; role: string }>(
      `SELECT s.user_id, u.role
       FROM webshop_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash]
    );
    return rows[0] !== undefined ? { userId: rows[0].user_id, role: rows[0].role } : null;
  },

  async findBridgeToken(tokenHash: string): Promise<{ webUserId: string; expiresAt: Date } | null> {
    const { rows } = await query<{ web_user_id: string; expires_at: Date }>(
      "SELECT web_user_id, expires_at FROM gestion_web_access_tokens WHERE token_hash = $1 AND expires_at > now()",
      [tokenHash]
    );
    return rows[0] !== undefined
      ? { webUserId: rows[0].web_user_id, expiresAt: rows[0].expires_at }
      : null;
  },

  async deleteSessionByHash(tokenHash: string): Promise<void> {
    await query("DELETE FROM webshop_sessions WHERE token_hash = $1", [tokenHash]);
  },

  async consumeBridgeToken(tokenHash: string): Promise<void> {
    await query("DELETE FROM gestion_web_access_tokens WHERE token_hash = $1", [tokenHash]);
  }
};

/** sha256 hex digest — the ONLY representation of a session/bridge token in the DB. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}