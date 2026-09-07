/**
 * Postgres ClientsPort (PR 3).
 *
 * Clients map onto the legacy `users` table with role 'cliente' (the vendored
 * schema has no dedicated clients table). password_hash is NOT NULL in the
 * schema, so client rows are created with an empty hash only — auth is out of
 * scope here; duplicate emails surface as 409 ConflictError via the unique
 * users_email_key constraint.
 */
import { query } from "../../../config/db.js";
import { clampPagination } from "../../../db/pagination.js";
import { isPgUniqueViolation as isUniqueViolation } from "../../../db/pg-errors.js";
import { ConflictError } from "../../../errors/taxonomy.js";
import type { ClientRecord, ClientsListFilter, ClientsPort } from "../ports.js";

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ci: string | null;
  rut: string | null;
  company: string | null;
  is_approved: boolean;
}

function mapClientRow(row: UserRow): ClientRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    ci: row.ci,
    rut: row.rut,
    company: row.company,
    isApproved: row.is_approved
  };
}

export const clientsRepository: ClientsPort = {
  async list(filter?: ClientsListFilter) {
    // Clamp pagination bounds (same contract as the users list) and bind
    // them as query params instead of interpolating them into the SQL text.
    const { page, limit, offset } = clampPagination(filter?.page, filter?.limit);
    // Default = active only (is_approved=true); "all" disables the filter.
    const approved: boolean | null = filter?.active === "all" ? null : (filter?.active ?? true);
    const search = filter?.search?.trim() === "" ? undefined : filter?.search;
    const where =
      "WHERE role = 'cliente' AND ($1::boolean IS NULL OR is_approved = $1)" +
      " AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR email ILIKE '%' || $2 || '%')";
    const params: unknown[] = [approved, search ?? null];

    const { rows } = await query<UserRow>(
      `SELECT id, name, email, phone, ci, rut, company, is_approved
       FROM users ${where} ORDER BY name LIMIT $3 OFFSET $4`,
      [...params, limit, offset]
    );
    const { rows: countRows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n FROM users ${where}`,
      params
    );
    return {
      items: rows.map(mapClientRow),
      total: Number(countRows[0].n),
      page,
      limit
    };
  },

  async getById(id) {
    const { rows } = await query<UserRow>(
      `SELECT id, name, email, phone, ci, rut, company, is_approved
       FROM users WHERE id = $1 AND role = 'cliente'`,
      [id]
    );
    return rows[0] === undefined ? null : mapClientRow(rows[0]);
  },

  async update(id, input) {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.email !== undefined) {
      params.push(input.email);
      sets.push(`email = $${params.length}`);
    }
    if (input.phone !== undefined) {
      params.push(input.phone);
      sets.push(`phone = $${params.length}`);
    }
    if (sets.length === 0) return clientsRepository.getById(id);
    params.push(id);
    try {
      const { rows } = await query<UserRow>(
        `UPDATE users SET ${sets.join(", ")}, updated_at = now()
         WHERE id = $${params.length} AND role = 'cliente'
         RETURNING id, name, email, phone, ci, rut, company, is_approved`,
        params
      );
      return rows[0] === undefined ? null : mapClientRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("Ya existe un cliente con ese email");
      }
      throw err;
    }
  },
  async create(input) {
    try {
      const { rows } = await query<UserRow>(
        `INSERT INTO users (name, email, phone, role, password_hash, is_approved)
         VALUES ($1, $2, $3, 'cliente', '', false)
         RETURNING id, name, email, phone, ci, rut, company, is_approved`,
        [input.name, input.email ?? null, input.phone ?? null]
      );
      return mapClientRow(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("Ya existe un cliente con ese email");
      }
      throw err;
    }
  }
};