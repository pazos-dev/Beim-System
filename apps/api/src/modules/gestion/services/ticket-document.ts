/**
 * Internal ticket document builder (issue #167).
 *
 * Pure function: maps a BeimReceipt + the stored template settings to a
 * plain TicketDocument with no DB or PDF dependency, so it is unit-testable
 * in isolation. The ticket carries no tax breakdown of any kind — it is an
 * internal workshop record, never a fiscal voucher.
 */
import type { BeimReceipt, JsonValue } from "../ports.js";
import type { InvoiceSettings } from "../schemas.js";

/** One monetary row of the ticket (amount = quantity × unitPrice). */
export interface TicketLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** One trailing text block (template content, fixed order). */
export interface TicketSection {
  id: string;
  title: string;
  body: string;
}

/** Plain ticket document: header + ticket + lines + total + sections. */
export interface TicketDocument {
  header: { name?: string; address?: string; phone?: string; rut?: string };
  ticket: {
    id: string;
    number: number;
    createdAt: Date;
    updatedAt: Date;
    status: string;
    paymentStatus: string;
    client: { name: string; id?: string | null; phone?: string | null };
    device: { brand?: string | null; model?: string | null; color?: string | null; services: string[] };
    imei?: string | null;
    issue?: string | null;
  };
  lines: TicketLine[];
  total: number;
  sections: TicketSection[];
  nonFiscal: true;
  nonFiscalText: string;
}

/** Printed on every ticket: the document is internal, not a fiscal voucher. */
export const NON_FISCAL_TEXT = "Ticket interno del taller — no válido como comprobante fiscal";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses legacy money-as-text / numeric totals; null when not a usable amount. */
function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9,.-]/g, "").replace(",", ".");
    if (cleaned === "") return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Lines stored by sales-batch in the receipt payload
 * ({ items: [{ productId, quantity, unitPrice }] }); null for plain repair
 * intakes, which carry no itemized lines.
 */
function payloadLines(payload: JsonValue): TicketLine[] | null {
  if (!isRecord(payload)) return null;
  const items = payload.items;
  if (!Array.isArray(items) || items.length === 0) return null;
  const lines: TicketLine[] = [];
  for (const item of items) {
    if (!isRecord(item)) return null;
    const description = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = item.quantity;
    const unitPrice = item.unitPrice;
    if (description === "") return null;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) return null;
    if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) return null;
    lines.push({ description, quantity, unitPrice, amount: round2(quantity * unitPrice) });
  }
  return lines;
}

/** Receipt total: server-side quoteTotal first, then legacy price text, then payload total. */
function receiptTotal(receipt: BeimReceipt): number {
  const candidates: unknown[] = [receipt.quoteTotal, receipt.price];
  if (isRecord(receipt.payload)) candidates.push(receipt.payload.total);
  for (const candidate of candidates) {
    const parsed = parseAmount(candidate);
    if (parsed !== null) return round2(parsed);
  }
  return 0;
}

function present(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Builds the ticket document. Sections keep a fixed order: custom sections
 * (stored order) first, then policies, warranty and footer — only the blocks
 * present in the settings appear.
 */
export function buildTicketDocument(
  receipt: BeimReceipt,
  settings: InvoiceSettings = {}
): TicketDocument {
  const itemized = payloadLines(receipt.payload);
  const fallbackTotal = receiptTotal(receipt);
  const lines: TicketLine[] =
    itemized ??
    [
      {
        description: receipt.reportedIssue?.trim() !== "" ? (receipt.reportedIssue as string).trim() : "Servicio de reparación",
        quantity: 1,
        unitPrice: fallbackTotal,
        amount: fallbackTotal
      }
    ];
  const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));

  const sections: TicketSection[] = [];
  for (const custom of settings.customSections ?? []) {
    if (custom.title.trim() !== "" && custom.body.trim() !== "") {
      sections.push({ id: custom.id, title: custom.title, body: custom.body });
    }
  }
  if (present(settings.policies)) sections.push({ id: "policies", title: "Políticas", body: settings.policies });
  if (present(settings.warranty)) sections.push({ id: "warranty", title: "Garantía", body: settings.warranty });
  if (present(settings.footer)) sections.push({ id: "footer", title: "", body: settings.footer });

  return {
    header: {
      ...(present(settings.business?.name) ? { name: settings.business?.name } : {}),
      ...(present(settings.business?.address) ? { address: settings.business?.address } : {}),
      ...(present(settings.business?.phone) ? { phone: settings.business?.phone } : {}),
      ...(present(settings.business?.rut) ? { rut: settings.business?.rut } : {})
    },
    ticket: {
      id: receipt.id,
      number: receipt.receiptNumber,
      createdAt: receipt.createdAt,
      updatedAt: receipt.updatedAt,
      status: receipt.repairStatus,
      paymentStatus: receipt.paymentStatus,
      client: { name: receipt.clientName, id: receipt.clientId, phone: receipt.clientPhone },
      device: {
        brand: receipt.deviceBrand,
        model: receipt.deviceModel,
        color: receipt.deviceColor,
        services: receipt.services ?? []
      },
      imei: receipt.imeiSerial,
      issue: receipt.reportedIssue
    },
    lines,
    total,
    sections,
    nonFiscal: true,
    nonFiscalText: NON_FISCAL_TEXT
  };
}
