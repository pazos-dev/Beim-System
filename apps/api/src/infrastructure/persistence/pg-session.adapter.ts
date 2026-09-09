import { query } from "../../config/db.js";
import { withTransaction, type TxClient } from "../../db/withTransaction.js";

/**
 * Session persistence (slice 2.1, change `clean-arch-infrastructure`).
 *
 * Raw pg over the session tables of both realms (`webshop_sessions`,
 * `gestion_sessions`, `gestion_web_access_tokens`). Every statement is copied
 * byte-identical from `modules/webshop/repositories/pg-auth.ts` — the raw
 * token never touches the database, only its sha256 hash, and no SELECT
 * returns a hash: claims carry `userId`/`role` only.
 *
 * Writes accept an optional caller `TxClient` so deactivation revokes
 * sessions on the same connection; without one they open their own
 * transaction exactly like the legacy repository.
 */
export interface NewSession {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface SessionClaims {
  userId: string;
  role: string;
}

export interface BridgeClaims {
  webUserId: string;
  expiresAt: Date;
}

/**
 * Runs one statement on the caller `TxClient` when given, else on the shared
 * pool. Keeps the union out of call position: `PoolClient.query` overloads
 * and the shared `query` helper are not mutually callable.
 */
export async function queryOn<T>(client: TxClient | undefined, text: string, params: unknown[]): Promise<T[]> {
  if (client !== undefined) {
    const result = await client.query(text, params);
    return result.rows as T[];
  }
  const result = await query(text, params);
  return result.rows as T[];
}

export class PgSessionAdapter {
  async createWebSession(input: NewSession, client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      await tx.query("DELETE FROM webshop_sessions WHERE user_id = $1", [input.userId]);
      await tx.query("INSERT INTO webshop_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
        input.tokenHash,
        input.userId,
        input.expiresAt
      ]);
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  async createConsoleSession(input: NewSession, client?: TxClient): Promise<void> {
    const run = async (tx: TxClient): Promise<void> => {
      await tx.query("DELETE FROM gestion_sessions WHERE gestion_user_id = $1", [input.userId]);
      await tx.query("INSERT INTO gestion_sessions (token_hash, gestion_user_id, expires_at) VALUES ($1, $2, $3)", [
        input.tokenHash,
        input.userId,
        input.expiresAt
      ]);
    };
    if (client !== undefined) await run(client);
    else await withTransaction(run);
  }

  async resolveWebSession(tokenHash: string, client?: TxClient): Promise<SessionClaims | null> {
    const rows = await queryOn<{ user_id: string; role: string }>(client,
      `SELECT s.user_id, u.role
        FROM webshop_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash]
    );
    return rows[0] === undefined ? null : { userId: rows[0].user_id, role: rows[0].role };
  }

  async resolveConsoleSession(tokenHash: string, client?: TxClient): Promise<SessionClaims | null> {
    const rows = await queryOn<{ gestion_user_id: string; role: string }>(client,
      `SELECT s.gestion_user_id, u.role
        FROM gestion_sessions s
        JOIN gestion_users u ON u.id = s.gestion_user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true`,
      [tokenHash]
    );
    return rows[0] === undefined ? null : { userId: rows[0].gestion_user_id, role: rows[0].role };
  }

  async findBridgeToken(tokenHash: string, client?: TxClient): Promise<BridgeClaims | null> {
    const rows = await queryOn<{ web_user_id: string; expires_at: Date }>(client,
      "SELECT web_user_id, expires_at FROM gestion_web_access_tokens WHERE token_hash = $1 AND expires_at > now()",
      [tokenHash]
    );
    return rows[0] === undefined ? null : { webUserId: rows[0].web_user_id, expiresAt: rows[0].expires_at };
  }

  async consumeBridgeToken(tokenHash: string, client?: TxClient): Promise<void> {
    await queryOn<never>(client, "DELETE FROM gestion_web_access_tokens WHERE token_hash = $1", [tokenHash]);
  }

  async revokeWebSessions(userId: string, client?: TxClient): Promise<void> {
    await queryOn<never>(client, "DELETE FROM webshop_sessions WHERE user_id = $1", [userId]);
  }

  async revokeConsoleSessions(userId: string, client?: TxClient): Promise<void> {
    await queryOn<never>(client, "DELETE FROM gestion_sessions WHERE gestion_user_id = $1", [userId]);
  }

  async deleteWebSession(tokenHash: string, client?: TxClient): Promise<void> {
    await queryOn<never>(client, "DELETE FROM webshop_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async deleteConsoleSession(tokenHash: string, client?: TxClient): Promise<void> {
    await queryOn<never>(client, "DELETE FROM gestion_sessions WHERE token_hash = $1", [tokenHash]);
  }
}
