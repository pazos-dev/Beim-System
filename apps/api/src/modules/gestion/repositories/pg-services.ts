/**
 * Postgres ServicesPort (PR 3).
 *
 * The legacy `gestion_services` table is NOT part of the vendored 19-table
 * schema and schema files are out of scope for this change — services are
 * stored as jsonb documents in app_settings under the key
 * 'gestion.services.<uuid>' ({ name, data }). This is a documented storage
 * resolution (ports.ts): the route contract (id, name) matches the spec
 * exactly; only the persistence shape differs from the legacy table.
 */
import { randomUUID } from "node:crypto";
import { query } from "../../../config/db.js";
import type { JsonValue, ServicesPort } from "../ports.js";

const KEY_PREFIX = "gestion.services.";

interface SettingRow {
  key: string;
  value: { name: string; data: JsonValue };
}

export const servicesRepository: ServicesPort = {
  async list() {
    const { rows } = await query<SettingRow>(
      `SELECT key, value FROM app_settings WHERE key LIKE $1 ORDER BY updated_at DESC`,
      [`${KEY_PREFIX}%`]
    );
    return rows.map((row) => ({ id: row.key.slice(KEY_PREFIX.length), name: row.value.name }));
  },

  async create(input) {
    const id = randomUUID();
    const { rows } = await query<SettingRow>(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       RETURNING key, value`,
      [KEY_PREFIX + id, JSON.stringify({ name: input.name, data: input.data ?? {} })]
    );
    const row = rows[0];
    return { id: row.key.slice(KEY_PREFIX.length), name: row.value.name };
  }
};