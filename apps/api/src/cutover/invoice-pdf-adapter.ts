import { NotFoundError } from "../errors/taxonomy.js";
import type { ReceiptInvoicePdf } from "../interface/http/receipt/router.js";
import { invoiceSettingsService } from "../modules/gestion/services/invoice-settings.js";
import { receiptsService } from "../modules/gestion/services/receipts.js";
import { buildTicketDocument } from "../modules/gestion/services/ticket-document.js";
import { renderTicketPdf } from "../modules/gestion/services/ticket-pdf.js";

/**
 * Cutover wiring, part A (change `clean-arch-interface`, F8a).
 *
 * Legacy-equivalent `getInvoicePdf` composition for the receipt thin router:
 * receipt read → template settings → ticket document → PDF render, raising
 * `NotFoundError` with the `Recibo no encontrado: <id>` message on unknown
 * ids (same order and message as the legacy `gestion` invoice route). Every
 * step delegates to the injected port — zero duplicated logic. The default
 * port binds the real legacy services; tests inject fakes.
 *
 * NOT mounted: the composition root keeps serving the legacy router, so
 * `/openapi.json` stays byte-identical in this slice.
 */

/** Legacy composition surface the invoice PDF needs (ports, not concretions). */
export interface InvoicePdfLegacyPort {
  getReceiptById: typeof receiptsService.getById;
  getSettings: typeof invoiceSettingsService.get;
  buildDocument: typeof buildTicketDocument;
  renderPdf: typeof renderTicketPdf;
}

/** Default port: the real legacy composition (production binding). */
export const legacyInvoicePdfPort: InvoicePdfLegacyPort = {
  getReceiptById: receiptsService.getById,
  getSettings: invoiceSettingsService.get,
  buildDocument: buildTicketDocument,
  renderPdf: renderTicketPdf
};

/** Builds the receipt router `getInvoicePdf` handler over the legacy port. */
export function makeGetInvoicePdf(
  port: InvoicePdfLegacyPort = legacyInvoicePdfPort
): (receiptId: string) => Promise<ReceiptInvoicePdf> {
  return async (receiptId: string): Promise<ReceiptInvoicePdf> => {
    const receipt = await port.getReceiptById(receiptId);
    if (receipt === null) throw new NotFoundError(`Recibo no encontrado: ${receiptId}`);
    const settings = await port.getSettings();
    const pdf = await port.renderPdf(port.buildDocument(receipt, settings));
    return { pdf, receiptNumber: receipt.receiptNumber };
  };
}
