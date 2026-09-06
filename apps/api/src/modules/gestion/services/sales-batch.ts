/**
 * Sales-batch service (PR 3).
 *
 * The sales unit of work, ALL inside ONE transaction:
 *   1. reads prices SERVER-side (getPricesByIds — the client never sets price);
 *   2. guardDecrements every line (409 + currentStock on any shortage; the
 *      FOR UPDATE lock inside the shared tx serializes concurrency);
 *   3. creates the receipt with legacy sale defaults (repair_status
 *      'Entregado', quote_total = server total, price as text, payload tagged
 *      sale:true);
 *   4. writes one beim_receipt_parts row per line (stock_decremented=true);
 *   5. journals one gestion_payment_movements row per payment (the financial
 *      update the spec expects from a batch) — payments must cover the total.
 *
 * Any failure rolls the whole transaction back: no partial decrements, no
 * orphan receipts. The receipt is the cash register of the batch; the legacy
 * "stock movements" table that recorded 'venta' events is NOT part of the
 * vendored schema, so those events are not duplicated here (see ports.ts).
 */
import { withTransaction } from "../../../db/withTransaction.js";
import { NotFoundError, ValidationError } from "../../../errors/taxonomy.js";
import type { BeimReceipt } from "../ports.js";
import { paymentMovementsRepository } from "../repositories/pg-payment-movements.js";
import { receiptsRepository } from "../repositories/pg-receipts.js";
import { stockRepository } from "../repositories/pg-stock.js";

export interface SalesBatchItemInput {
  productId: string;
  quantity: number;
}

export interface SalesBatchPaymentInput {
  method: string;
  amount: number;
}

export interface SalesBatchInput {
  clientName: string;
  clientId: string;
  clientPhone?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceColor?: string;
  imeiSerial?: string;
  reportedIssue?: string;
  services?: string[];
  items: SalesBatchItemInput[];
  payments?: SalesBatchPaymentInput[];
}

export interface SalesBatchResult {
  receipt: BeimReceipt;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  total: number;
}

function serverDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const salesBatchService = {
  async run(input: SalesBatchInput): Promise<SalesBatchResult> {
    if (input.items.length === 0) {
      throw new ValidationError("La venta requiere al menos un producto", { field: "items" });
    }
    const unique = new Set(input.items.map((item) => item.productId));
    if (unique.size !== input.items.length) {
      throw new ValidationError("No se permiten productos duplicados", { field: "items" });
    }

    return withTransaction(async (tx) => {
      const prices = await stockRepository.getPricesByIds(
        input.items.map((item) => item.productId),
        tx
      );

      let total = 0;
      const lines: Array<{ productId: string; quantity: number; unitPrice: number }> = [];
      for (const item of input.items) {
        const unitPrice = prices.get(item.productId);
        if (unitPrice === undefined) {
          throw new NotFoundError(`Producto no encontrado: ${item.productId}`);
        }
        await stockRepository.guardDecrement(item.productId, item.quantity, tx);
        total += unitPrice * item.quantity;
        lines.push({ productId: item.productId, quantity: item.quantity, unitPrice });
      }

      if (input.payments !== undefined && input.payments.length > 0) {
        const paid = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
        if (Math.abs(paid - total) > 0.001) {
          throw new ValidationError("Los pagos no cubren el total de la venta", {
            field: "payments",
            expected: total,
            received: paid
          });
        }
      }

      const receipt = await receiptsRepository.insertReceipt(
        {
          clientName: input.clientName,
          clientId: input.clientId,
          clientPhone: input.clientPhone,
          deviceBrand: input.deviceBrand,
          deviceModel: input.deviceModel,
          deviceColor: input.deviceColor,
          imeiSerial: input.imeiSerial,
          reportedIssue: input.reportedIssue,
          services: input.services,
          repairStatus: "Entregado",
          quoteTotal: total,
          price: String(total),
          paymentStatus:
            input.payments !== undefined && input.payments.length > 0 ? "Pagado" : "Pendiente",
          payload: { sale: true, items: lines, total }
        },
        tx
      );

      await receiptsRepository.insertParts(
        tx,
        receipt.id,
        lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitCost: 0,
          unitPrice: line.unitPrice
        }))
      );

      for (const payment of input.payments ?? []) {
        await paymentMovementsRepository.insert(tx, {
          receiptId: receipt.id,
          amount: payment.amount,
          paymentStatus: "Pagado",
          method: payment.method,
          businessDate: serverDate()
        });
      }

      return { receipt, items: lines, total };
    });
  }
};