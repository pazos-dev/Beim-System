/**
 * Ticket-template settings service (issue #167).
 *
 * Thin wrapper over the pg repository: `get` returns the stored template or
 * the blank default when never saved; `save` replaces the whole document
 * (the PUT body is already validated by invoiceSettingsSchema at the edge).
 */
import type { InvoiceSettings } from "../schemas.js";
import { invoiceSettingsRepository } from "../repositories/pg-invoice-settings.js";

export const invoiceSettingsService = {
  /** Stored template, or the blank default when never saved. */
  async get(): Promise<InvoiceSettings> {
    return (await invoiceSettingsRepository.get()) ?? {};
  },

  /** Full replace of the template document. */
  async save(doc: InvoiceSettings): Promise<InvoiceSettings> {
    return invoiceSettingsRepository.save(doc);
  }
};
