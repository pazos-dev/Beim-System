/**
 * Order handlers (change `clean-arch-application`, Unit 6).
 *
 * Webshop `createOrder`: server-side pricing from locked rows, check-only
 * `confirmVenta` (lots untouched), one pending session + fresh `mintPago`
 * preference — `Venta` + `Pago` persist on the same `TxClient` in one `run`.
 * `mintCheckoutSession` re-mints (second pending → 409, cancelled →
 * replaceable). Webhook pays; `markPaid` absent. Guards before first save.
 */
import { NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import { createProductId, type ProductId } from "../../domain/shared/types.js";
import {
  confirmVenta,
  createVenta,
  openCheckoutSession,
  priceVenta,
  type Venta,
  type VentaLotLane
} from "../../domain/venta/venta.js";
import { mintPago, type Pago } from "../../domain/pago/pago.js";
import type { TxClient } from "../../domain/shared/ports.js";
import type { ProductWithLots } from "../../domain/product/product.repository.js";
import type { OrderDeps } from "./ports.js";

export interface OrderLineInput {
  readonly productId: string;
  readonly quantity: number;
}

/**
 * Webshop order intake (legacy `orderCreateSchema` vocabulary: `items`).
 * `customer` is required here (legacy 422 when blank); the remaining
 * metadata is nullish. `userId` records ownership (`orders.user_id`).
 */
export interface CreateOrderInput {
  readonly orderId: string;
  readonly customer: string;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly ci?: string | null;
  readonly rut?: string | null;
  readonly address?: string | null;
  readonly shipping?: string | null;
  readonly comments?: string | null;
  readonly items: readonly OrderLineInput[];
  readonly userId: string;
}

export interface MintCheckoutSessionInput {
  readonly orderId: string;
  readonly paymentMethodId?: string | null;
  /** Ownership scope: enforced when present (foreign order → 404, no hint). */
  readonly userId?: string;
}

export interface OrderResult {
  readonly venta: Venta;
  readonly pago: Pago;
}

/** Checkout session lifetime: 30 minutes from creation. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

function orderLineUnknown(id: ProductId): NotFoundError {
  return new NotFoundError(`Producto de la orden no encontrado: ${id}`);
}

function orderNotFound(id: string): NotFoundError {
  return new NotFoundError(`Orden no encontrada: ${id}`);
}

function pricedTotal(venta: Venta): NonNullable<Venta["total"]> {
  if (venta.total === null) {
    throw new ValidationError("Pago inválido: la venta requiere precio server-side previo", {
      orderId: venta.id
    });
  }
  return venta.total;
}

export function makeOrderHandlers(deps: OrderDeps) {
  const { uow, products, ventas, pagos, gateway, clock, uuid } = deps;

  async function loadLocked(
    tx: TxClient,
    ids: readonly ProductId[]
  ): Promise<Map<ProductId, ProductWithLots>> {
    const byId = new Map<ProductId, ProductWithLots>();
    for (const id of ids) {
      const found = await products.findWithLots(tx, id);
      if (found === null) throw orderLineUnknown(id);
      byId.set(id, found);
    }
    return byId;
  }

  function priceFromLocked(venta: Venta, byId: Map<ProductId, ProductWithLots>): Venta {
    return priceVenta(venta, ({ productId }) => {
      const entry = productId === null ? undefined : byId.get(productId);
      if (entry === undefined) throw orderLineUnknown(productId as ProductId);
      return entry.product.price;
    });
  }

  function checkOnly(venta: Venta, byId: Map<ProductId, ProductWithLots>): Venta {
    const lanes = new Map<string, VentaLotLane>(
      [...byId].map(([id, entry]) => [id, { lots: entry.lots, price: entry.product.price }])
    );
    return confirmVenta(venta, lanes).venta;
  }

  async function attachSessionAndMint(
    tx: TxClient,
    venta: Venta,
    paymentMethodId: string | null
  ): Promise<OrderResult> {
    // Pure session validation (second pending → 409) runs before the
    // provider call, so conflicts never mint a dangling preference.
    const createdAt = clock.now();
    const withSession = openCheckoutSession(venta, {
      sessionId: uuid.generate(),
      createdAt,
      expiresAt: new Date(createdAt.getTime() + CHECKOUT_TTL_MS),
      paymentMethodId
    });
    const { preferenceId } = await gateway.createPreference(
      withSession.id,
      pricedTotal(withSession).amount
    );
    const pago = mintPago(withSession, preferenceId);
    await ventas.save(tx, withSession);
    await pagos.save(tx, pago);
    return { venta: withSession, pago };
  }

  return {
    async createOrder(input: CreateOrderInput): Promise<OrderResult> {
      // Malformed ids fail here (422) with zero store touch, sales-batch precedent.
      const ids = input.items.map((line) => createProductId(line.productId));
      return uow.run(async (tx) => {
        const draft = createVenta({
          id: input.orderId,
          channel: "webshop",
          customer: input.customer,
          email: input.email ?? null,
          phone: input.phone ?? null,
          ci: input.ci ?? null,
          rut: input.rut ?? null,
          address: input.address ?? null,
          shipping: input.shipping ?? null,
          comments: input.comments ?? null,
          userId: input.userId,
          lines: input.items.map((line) => ({
            productId: line.productId,
            quantity: line.quantity
          }))
        });
        const byId = await loadLocked(tx, ids);
        const checked = checkOnly(priceFromLocked(draft, byId), byId);
        return attachSessionAndMint(tx, checked, null);
      });
    },

    async mintCheckoutSession(input: MintCheckoutSessionInput): Promise<OrderResult> {
      return uow.run(async (tx) => {
        const found = await ventas.findById(tx, input.orderId);
        if (found === null) throw orderNotFound(input.orderId);
        if (input.userId !== undefined && found.userId !== input.userId) {
          throw orderNotFound(input.orderId);
        }
        return attachSessionAndMint(tx, found, input.paymentMethodId ?? null);
      });
    }
  };
}
