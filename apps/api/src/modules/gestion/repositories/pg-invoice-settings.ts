/**
 * Postgres ticket-template settings (issue #167).
 *
 * The template lives as a single JSON document in app_settings under the
 * `invoice.` prefix — no migration needed. Mirrors the pg-services.ts
 * pattern (jsonb document keyed by a string, upsert by key).
 */
import { query } from "../../../config/db.js";
import type { InvoiceSettings } from "../schemas.js";

/** Storage key for the ticket template document. */
export const INVOICE_SETTINGS_KEY = "invoice.settings";

interface SettingRow {
  key: string;
  value: InvoiceSettings;
}

export const invoiceSettingsRepository = {
  /** Stored template, or null when never saved. */
  async get(): Promise<InvoiceSettings | null> {
    const { rows } = await query<SettingRow>(`SELECT key, value FROM app_settings WHERE key = $1`, [
      INVOICE_SETTINGS_KEY
    ]);
    return rows[0] === undefined ? null : (rows[0].value ?? {});
  },

  /** Full replace of the template document (upsert by key). */
  async save(doc: InvoiceSettings): Promise<InvoiceSettings> {
    const { rows } = await query<SettingRow>(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`,
      [INVOICE_SETTINGS_KEY, JSON.stringify(doc)]
    );
    return rows[0].value ?? {};
  }
};
