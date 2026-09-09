/**
 * Ticket handlers (change `clean-arch-application`, Unit 9).
 *
 * DTO → `UnitOfWork.run` → load singleton settings (id 1) + `Venta` /
 * `Receipt` → one domain merge or pure ticket build → save on the same
 * `TxClient` → commit. Partial settings merge via `mergeFinancialState`
 * (absent fields kept, negative capital 422); the ticket is an internal
 * workshop record — never a fiscal voucher — rendered server-side through
 * `TicketPdfPort`. Domain errors pass through untouched.
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import {
  mergeFinancialState,
  type FinancialState,
  type FinancialStatePartial
} from "../../domain/settings/settings.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { Venta } from "../../domain/venta/venta.js";
import type {
  TicketDeps,
  TicketDocument,
  TicketHeader,
  TicketLine
} from "./ports.js";

export type UpdateTicketSettingsInput = FinancialStatePartial;

export interface SaleTicketInput {
  readonly ventaId: string;
}

export interface RepairTicketInput {
  readonly receiptId: string;
}

export interface TicketResult {
  readonly document: TicketDocument;
  readonly pdf: Uint8Array;
}

/** Printed on every ticket: the document is internal, not a fiscal voucher. */
export const NON_FISCAL_TEXT = "Ticket interno del taller — no válido como comprobante fiscal";

function saleNotFound(id: string): NotFoundError {
  return new NotFoundError(`Venta no encontrada: ${id}`);
}

function receiptNotFound(id: string): NotFoundError {
  return new NotFoundError(`Recibo no encontrado: ${id}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Header from the singleton template; unknown shapes fall back to blank. */
function headerFromSettings(state: FinancialState): TicketHeader {
  const prefs = state.preferences;
  if (!isRecord(prefs)) return {};
  const business = prefs["business"];
  if (!isRecord(business)) return {};
  const pick = (key: string): string | undefined => {
    const value = business[key];
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const header: TicketHeader = {
    name: pick("name"),
    address: pick("address"),
    phone: pick("phone"),
    rut: pick("rut")
  };
  return Object.fromEntries(Object.entries(header).filter(([, value]) => value !== undefined));
}

/** Legacy money-as-text / numeric totals; null when not a usable amount. */
function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9,.-]/g, "").replace(",", "."));
    if (value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function saleLines(venta: Venta): TicketLine[] {
  return venta.lines.map((line) => {
    const unitPrice = line.unitPrice?.amount ?? 0;
    return {
      description: line.productId ?? "Venta mostrador",
      quantity: line.quantity,
      unitPrice,
      amount: round2(line.quantity * unitPrice)
    };
  });
}

function repairLines(receipt: Receipt): TicketLine[] {
  if (receipt.parts.length > 0) {
    return receipt.parts.map((part) => {
      const unitPrice = part.unitPrice?.amount ?? parseAmount(receipt.price) ?? 0;
      return {
        description: part.productId ?? "Servicio de reparación",
        quantity: part.quantity,
        unitPrice,
        amount: round2(part.quantity * unitPrice)
      };
    });
  }
  const total = parseAmount(receipt.price) ?? 0;
  return [{ description: "Servicio de reparación", quantity: 1, unitPrice: total, amount: total }];
}

export function makeTicketHandlers(deps: TicketDeps) {
  const { uow, settings, ventas, receipts, pdf } = deps;

  async function render(
    header: TicketHeader,
    id: string,
    kind: "venta" | "receipt",
    status: string,
    lines: TicketLine[]
  ): Promise<TicketResult> {
    const document: TicketDocument = {
      header,
      ticket: { id, kind, status },
      lines,
      total: round2(lines.reduce((sum, line) => sum + line.amount, 0)),
      sections: [],
      nonFiscal: true,
      nonFiscalText: NON_FISCAL_TEXT
    };
    return { document, pdf: await pdf.render(document) };
  }

  return {
    async updateTicketSettings(input: UpdateTicketSettingsInput): Promise<FinancialState> {
      return uow.run(async (tx) => {
        const next = mergeFinancialState(await settings.load(tx), input);
        await settings.save(tx, next);
        return next;
      });
    },

    async buildSaleTicket(input: SaleTicketInput): Promise<TicketResult> {
      return uow.run(async (tx) => {
        const state = await settings.load(tx);
        const venta = await ventas.findById(tx, input.ventaId);
        if (venta === null) throw saleNotFound(input.ventaId);
        return render(headerFromSettings(state), venta.id, "venta", venta.status, saleLines(venta));
      });
    },

    async buildRepairTicket(input: RepairTicketInput): Promise<TicketResult> {
      return uow.run(async (tx) => {
        const state = await settings.load(tx);
        const receipt = await receipts.findById(tx, input.receiptId);
        if (receipt === null) throw receiptNotFound(input.receiptId);
        return render(
          headerFromSettings(state),
          receipt.id,
          "receipt",
          receipt.repairStatus,
          repairLines(receipt)
        );
      });
    }
  };
}
