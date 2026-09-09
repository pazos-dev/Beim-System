import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import type { FinancialState } from "../../domain/settings/settings.js";
import type { Receipt } from "../../domain/receipt/receipt.js";
import type { Venta } from "../../domain/venta/venta.js";

/** Business header printed on the ticket; every field optional (blank template). */
export interface TicketHeader {
  readonly name?: string;
  readonly address?: string;
  readonly phone?: string;
  readonly rut?: string;
}

/** One monetary row of the ticket (amount = quantity × unitPrice). */
export interface TicketLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

/** One trailing text block (template content, fixed order). */
export interface TicketSection {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

/** Plain ticket document: header + ticket + lines + total + sections. */
export interface TicketDocument {
  readonly header: TicketHeader;
  readonly ticket: { readonly id: string; readonly kind: "venta" | "receipt"; readonly status: string };
  readonly lines: readonly TicketLine[];
  readonly total: number;
  readonly sections: readonly TicketSection[];
  readonly nonFiscal: true;
  readonly nonFiscalText: string;
}

/** Tx-bound singleton settings (id 1); adapters own SQL, merge lives in domain. */
export interface TicketSettingsStore {
  load(tx: TxClient): Promise<FinancialState>;
  save(tx: TxClient, state: FinancialState): Promise<void>;
}

/** Tx-bound sale reads; the ticket never mutates the sale. */
export interface TicketVentaStore {
  findById(tx: TxClient, id: string): Promise<Venta | null>;
}

/** Tx-bound repair reads; the ticket never mutates the receipt. */
export interface TicketReceiptStore {
  findById(tx: TxClient, id: string): Promise<Receipt | null>;
}

/** Server-side PDF renderer; the handler never touches pdfkit or disk. */
export interface TicketPdfPort {
  render(doc: TicketDocument): Promise<Uint8Array>;
}

export interface TicketDeps {
  uow: UnitOfWork;
  settings: TicketSettingsStore;
  ventas: TicketVentaStore;
  receipts: TicketReceiptStore;
  pdf: TicketPdfPort;
}
