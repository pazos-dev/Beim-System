/**
 * Postgres users admin repository (issue #85).
 *
 * Operates ONLY on webshop identities (`users`: role cliente/admin/superadmin
 * with a check constraint, scrypt password hashes, is_approved gate). Console
 * identities (`gestion_users` + bridge tokens + role permissions matrix) are a
 * separate future issue — untouched here.
 */
import { query } from "../../../config/db.js";

/** Public user shape: password_hash is NEVER selected, let alone returned. */
export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  isApproved: boolean;
}

export interface UsersListFilter {
  role?: string;
  approved?: boolean;
  page?: number;
  limit?: number;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  is_approved: boolean;
}

const PUBLIC_COLUMNS = "id, name, email, username, role, is_approved";

function mapUserRow(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    role: row.role,
    isApproved: row.is_approved
  };
}

export const usersRepository = {
  async list(filter: UsersListFilter): Promise<{
    items: PublicUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Clamp pagination bounds (same contract as the receipts list) and bind
    // them as query params instead of interpolating them into the SQL text.
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;

    const where = "WHERE ($1::text IS NULL OR role = $1) AND ($2::boolean IS NULL OR is_approved = $2)";
    const params: unknown[] = [filter.role ?? null, filter.approved ?? null];

    const { rows } = await query<UserRow>(
      `SELECT ${PUBLIC_COLUMNS} FROM users ${where} ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await query<{ n: string }>(`SELECT count(*)::text AS n FROM users ${where}`, params);

    return {
      items: rows.map(mapUserRow),
      total: Number(countRows[0].n),
      page,
      limit
    };
  },

  /** Marks the user approved. Idempotent: re-approving answers the same row. */
  async approve(id: string): Promise<PublicUser | null> {
    const { rows } = await query<UserRow>(
      `UPDATE users SET is_approved = true, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id]
    );
    return rows[0] === undefined ? null : mapUserRow(rows[0]);
  },

  /** Changes the user role. Callers validate the closed role list first. */
  async setRole(id: string, role: string): Promise<PublicUser | null> {
    const { rows } = await query<UserRow>(
      `UPDATE users SET role = $2, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id, role]
    );
    return rows[0] === undefined ? null : mapUserRow(rows[0]);
  },

  /**
   * Disables the user (unapproved) and revokes every webshop session so
   * existing tokens stop working immediately. Idempotent: re-disabling
   * answers the same row. Console sessions are out of scope: console login
   * and gestion_users session issuance do not exist yet (future issue).
   */
  async disable(id: string): Promise<PublicUser | null> {
    const { rows } = await query<UserRow>(
      `UPDATE users SET is_approved = false, updated_at = now() WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id]
    );
    if (rows[0] === undefined) return null;
    await query("DELETE FROM webshop_sessions WHERE user_id = $1", [id]);
    return mapUserRow(rows[0]);
  }
};
