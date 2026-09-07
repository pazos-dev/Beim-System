/**
 * Postgres console-users repository (issue #155).
 *
 * Operates ONLY on console identities (`gestion_users`: unique username,
 * scrypt password hashes, closed console role list, active gate). Webshop
 * identities (`users`) are untouched here. password_hash is NEVER selected,
 * let alone returned — every SELECT lists public columns explicitly.
 */
import { query } from "../../../config/db.js";
import { clampPagination } from "../../../db/pagination.js";

/** Public console-user shape: password_hash is NEVER selected, let alone returned. */
export interface PublicGestionUser {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
}

export interface GestionUsersFilter {
  role?: string;
  active?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

interface GestionUserRow {
  id: string;
  username: string;
  name: string;
  role: string;
  active: boolean;
}

const PUBLIC_COLUMNS = "id, username, name, role, active";

function mapGestionUserRow(row: GestionUserRow): PublicGestionUser {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    active: row.active
  };
}

export const gestionUsersRepository = {
  async list(filter: GestionUsersFilter): Promise<{
    items: PublicGestionUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Clamp pagination bounds (same contract as the webshop users list) and
    // bind them as query params instead of interpolating them into the SQL
    // text. The search disjunction is parenthesized so combined filters keep
    // working (AND binds tighter than OR in SQL).
    const { page, limit, offset } = clampPagination(filter.page, filter.limit);

    const where =
      "WHERE ($1::text IS NULL OR role = $1) AND ($2::boolean IS NULL OR active = $2)" +
      " AND ($3::text IS NULL OR (username ILIKE '%' || $3 || '%' OR name ILIKE '%' || $3 || '%'))";
    const params: unknown[] = [filter.role ?? null, filter.active ?? null, filter.search ?? null];

    const { rows } = await query<GestionUserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM gestion_users ${where} ORDER BY created_at DESC LIMIT $4 OFFSET $5`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM gestion_users ${where}`,
      params
    );

    return {
      items: rows.map(mapGestionUserRow),
      total: Number(countRows[0].n),
      page,
      limit
    };
  },

  /**
   * Creates the console user. Null on duplicate username: the service answers
   * 201 with a null user (anti-enumeration) instead of leaking the conflict
   * as 409 — the same contract as the webshop register route.
   */
  async create(input: {
    username: string;
    name: string;
    passwordHash: string;
    role: string;
  }): Promise<PublicGestionUser | null> {
    const { rows } = await query<GestionUserRow>(
      `INSERT INTO gestion_users (username, name, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING ${PUBLIC_COLUMNS}`,
      [input.username, input.name, input.passwordHash, input.role]
    );
    return rows[0] === undefined ? null : mapGestionUserRow(rows[0]);
  },

  /** Changes the console-user role. Callers validate the closed role list first. */
  async setRole(id: string, role: string): Promise<PublicGestionUser | null> {
    const { rows } = await query<GestionUserRow>(
      `UPDATE gestion_users SET role = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id, role]
    );
    return rows[0] === undefined ? null : mapGestionUserRow(rows[0]);
  },

  /**
   * Toggles the active gate. Idempotent: re-disabling (or re-enabling)
   * answers the same row. Deactivation also revokes every console session so
   * live tokens die at once (the session lookup already fail-closes on
   * active = false; this makes revocation immediate instead of waiting for
   * expiry). Webshop sessions are out of scope: console users never own any.
   */
  async setActive(id: string, active: boolean): Promise<PublicGestionUser | null> {
    const { rows } = await query<GestionUserRow>(
      `UPDATE gestion_users SET active = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id, active]
    );
    if (rows[0] === undefined) return null;
    if (!active) {
      await query("DELETE FROM gestion_sessions WHERE gestion_user_id = $1", [id]);
    }
    return mapGestionUserRow(rows[0]);
  },

  /** Swaps the password hash. Existing sessions are left alone (the disable
   * path owns revocation); the old password simply stops verifying. */
  async resetPassword(id: string, passwordHash: string): Promise<PublicGestionUser | null> {
    const { rows } = await query<GestionUserRow>(
      `UPDATE gestion_users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id, passwordHash]
    );
    return rows[0] === undefined ? null : mapGestionUserRow(rows[0]);
  },

  /** Revokes every console session of the user (DELETE is idempotent). */
  async deleteSessions(userId: string): Promise<void> {
    await query("DELETE FROM gestion_sessions WHERE gestion_user_id = $1", [userId]);
  }
};
