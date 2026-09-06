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
import { ConflictError } from "../../../errors/taxonomy.js";
import type { ClientRecord, ClientsPort } from "../ports.js";

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

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

export const clientsRepository: ClientsPort = {
  async list() {
    const { rows } = await query<UserRow>(
      `SELECT id, name, email, phone, ci, rut, company, is_approved
       FROM users WHERE role = 'cliente' ORDER BY name`
    );
    return rows.map(mapClientRow);
  },

  async getById(id) {
    const { rows } = await query<UserRow>(
      `SELECT id, name, email, phone, ci, rut, company, is_approved
       FROM users WHERE id = $1 AND role = 'cliente'`,
      [id]
    );
    return rows[0] === undefined ? null : mapClientRow(rows[0]);
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