/**
 * Postgres ServicesPort (PR 3, issue #87 update/deactivate).
 *
 * The legacy `gestion_services` table is NOT part of the vendored 19-table
 * schema and schema files are out of scope for this change — services are
 * stored as jsonb documents in app_settings under the key
 * 'gestion.services.<uuid>' ({ name, data, isActive }). This is a documented
 * storage resolution (ports.ts): the route contract (id, name, active)
 * matches the spec exactly; only the persistence shape differs from the
 * legacy table. `isActive` absent counts as active (legacy compatible);
 * migration 0003 backfills it on existing rows.
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import type { ActiveFilter, JsonValue, ServicesPort } from "../ports.js";

const KEY_PREFIX = "gestion.services.";

interface SettingRow {
  key: string;
  value: { name: string; data?: JsonValue; isActive?: boolean };
}

interface ServiceRecord {
  id: string;
  name: string;
  active: boolean;
}

function mapServiceRow(row: SettingRow): ServiceRecord {
  return {
    id: row.key.slice(KEY_PREFIX.length),
    name: row.value.name,
    active: row.value.isActive ?? true
  };
}

function matchesFilter(row: SettingRow, active: ActiveFilter | undefined): boolean {
  if (active === "all") return true;
  const want = active ?? true;
  return (row.value.isActive ?? true) === want;
}

export const servicesRepository: ServicesPort = {
  async list(filter?: { active?: ActiveFilter }) {
    const { rows } = await query<SettingRow>(
      `SELECT key, value FROM app_settings WHERE key LIKE $1 ORDER BY updated_at DESC`,
      [`${KEY_PREFIX}%`]
    );
    return rows.filter((row) => matchesFilter(row, filter?.active)).map(mapServiceRow);
  },

  async getById(id) {
    const { rows } = await query<SettingRow>(`SELECT key, value FROM app_settings WHERE key = $1`, [
      KEY_PREFIX + id
    ]);
    return rows[0] === undefined ? null : mapServiceRow(rows[0]);
  },

  async create(input) {
    const id = randomUUID();
    const { rows } = await query<SettingRow>(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       RETURNING key, value`,
      [KEY_PREFIX + id, JSON.stringify({ name: input.name, data: input.data ?? {}, isActive: true })]
    );
    const row = rows[0];
    return mapServiceRow(row);
  },

  async update(id, input) {
    const { rows } = await query<SettingRow>(`SELECT key, value FROM app_settings WHERE key = $1`, [
      KEY_PREFIX + id
    ]);
    const current = rows[0];
    if (current === undefined) return null;
    // Partial merge: only present fields are written.
    const next = {
      name: input.name ?? current.value.name,
      data: input.data ?? current.value.data ?? {},
      isActive: input.active ?? current.value.isActive ?? true
    };
    const { rows: updated } = await query<SettingRow>(
      `UPDATE app_settings SET value = $2::jsonb, updated_at = now() WHERE key = $1
       RETURNING key, value`,
      [KEY_PREFIX + id, JSON.stringify(next)]
    );
    return mapServiceRow(updated[0]);
  }
};
