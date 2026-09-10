/**
 * Sales-batch handler (change `clean-arch-application`, Unit 3).
 *
 * One thin use case: counter (`mostrador`) batch sale. Plain DTOs →
 * `UnitOfWork.run` → load every `ProductWithLots` FOR UPDATE → server-side
 * pricing from the locked rows → `confirmVenta` (FIFO `venta` lots, exact
 * payments) → sync the simple stock pile → save the `Venta` root plus each
 * product on the same `TxClient` → commit. Every domain guard runs before
 * the first save, so a 409 shortfall leaves zero partial writes. Domain
 * errors pass through untouched to the edge `toAppError` mapping.
 */
import { NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import { createMoney, createProductId, type ProductId } from "../../domain/shared/types.js";
import { decrementProduct } from "../../domain/product/product.js";
import {
  addVentaPayment,
  confirmVenta,
  createVenta,
  priceVenta,
  type Venta,
  type VentaLotLane
} from "../../domain/venta/venta.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { SalesBatchDeps } from "./ports.js";

export interface SalesBatchLineInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface SalesBatchPaymentInput {
  readonly method: string;
  readonly amount: number;
  /** Legacy omits it: derived from the priced rows, never invented. */
  readonly currency?: string;
}

export interface ConfirmSalesBatchInput {
  readonly ventaId: string;
  /** Legacy intake metadata (`gestion` sales-batch vocabulary). */
  readonly clientName: string;
  readonly clientId?: string | null;
  readonly deviceBrand?: string | null;
  readonly deviceModel?: string | null;
  readonly imeiSerial?: string | null;
  readonly reportedIssue?: string | null;
  readonly services?: readonly string[] | null;
  readonly lines: readonly SalesBatchLineInput[];
  readonly payments?: readonly SalesBatchPaymentInput[];
  /** Ownership (`ventas.user_id`); null on ownerless legacy rows. */
  readonly userId?: string | null;
}

export interface ConfirmSalesBatchResult {
  readonly venta: Venta;
  readonly products: ProductWithLots[];
}

function saleLineUnknown(id: ProductId): NotFoundError {
  return new NotFoundError(`Producto de la venta no encontrado: ${id}`);
}

export function makeSalesBatchHandler(deps: SalesBatchDeps) {
  const { uow, products, ventas } = deps;

  return {
    async confirmBatch(input: ConfirmSalesBatchInput): Promise<ConfirmSalesBatchResult> {
      // Required intake metadata fails here (422) with zero store touch.
      if (input.clientName.trim() === "") {
        throw new ValidationError("Venta inválida: clientName requerido", {
          field: "clientName"
        });
      }
      // Malformed ids fail here (422) with zero store touch, auth precedent.
      const ids = input.lines.map((line) => createProductId(line.productId));
      return uow.run(async (tx) => {
        let venta = createVenta({
          id: input.ventaId,
          channel: "mostrador",
          clientName: input.clientName,
          clientId: input.clientId ?? null,
          deviceBrand: input.deviceBrand ?? null,
          deviceModel: input.deviceModel ?? null,
          imeiSerial: input.imeiSerial ?? null,
          reportedIssue: input.reportedIssue ?? null,
          services: input.services ?? null,
          userId: input.userId ?? null,
          lines: input.lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity
          }))
        });
        const loaded: ProductWithLots[] = [];
        for (const id of ids) {
          const found = await products.findWithLots(tx, id);
          if (found === null) throw saleLineUnknown(id);
          loaded.push(found);
        }
        const byId = new Map<ProductId, ProductWithLots>(
          loaded.map((entry) => [entry.product.id, entry])
        );
        venta = priceVenta(venta, ({ productId }) => {
          const entry = productId === null ? undefined : byId.get(productId);
          if (entry === undefined) throw saleLineUnknown(productId as ProductId);
          return entry.product.price;
        });
        // Currency is row-derived only: explicit values must match the
        // priced total, omitted ones inherit it — never a default.
        const total = venta.total;
        if (total === null) {
          throw new ValidationError("Venta inválida: confirmar requiere precio server-side previo", {
            ventaId: input.ventaId
          });
        }
        for (const payment of input.payments ?? []) {
          venta = addVentaPayment(venta, {
            method: payment.method,
            amount: createMoney(payment.amount, payment.currency ?? total.currency)
          });
        }
        const lanes = new Map<string, VentaLotLane>(
          [...byId].map(([id, entry]) => [id, { lots: entry.lots, price: entry.product.price }])
        );
        const confirmed = confirmVenta(venta, lanes);
        // Guards (lot FIFO + simple stock) all run before the first save:
        // either one throws and nothing below is reached.
        const updated: ProductWithLots[] = confirmed.venta.lines.map((line) => {
          const entry = line.productId === null ? undefined : byId.get(line.productId);
          if (entry === undefined) throw saleLineUnknown(line.productId as ProductId);
          return {
            product: decrementProduct(entry.product, line.quantity),
            lots: [...(confirmed.lots.get(line.productId as string) ?? entry.lots)]
          };
        });
        await ventas.save(tx, confirmed.venta);
        for (const next of updated) {
          await products.saveWithLots(tx, next);
        }
        return { venta: confirmed.venta, products: updated };
      });
    }
  };
}
