/**
 * Venta aggregate (domain slice, change `clean-arch-domain` Phase 4).
 *
 * Root absorbs Order + Sale (`domain-entities.md` v3 §4): counter and
 * webshop sales in one boundary. Immutable values; behaviors return copies.
 * Pricing is server-side (the resolver feeds locked rows, never the client);
 * `confirm()` consumes `venta` lots FIFO for mostrador and only checks them
 * for webshop (`stockCommitted=false`). No DDL/SQL here.
 */
import { allocateVentaLots, type StockLot, type VentaAllocation } from "../product/stock-lot.js";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors.js";
import { createMoney, createProductId, type Money, type ProductId } from "../shared/types.js";

/** Lifecycle: draft `Pendiente`, webhook `Pagada`, terminal `Cancelada`. */
export const VENTA_STATUSES = ["Pendiente", "Pagada", "Cancelada"] as const;

export type VentaStatus = (typeof VENTA_STATUSES)[number];

/** Creation path: counter batch vs webshop order (drives stock commit). */
export const VENTA_CHANNELS = ["mostrador", "webshop"] as const;

export type VentaChannel = (typeof VENTA_CHANNELS)[number];

export function isVentaChannel(value: string): value is VentaChannel {
  return (VENTA_CHANNELS as readonly string[]).includes(value);
}

/** Exact-payment tolerance: payments must equal the total within this gap. */
export const PAYMENT_TOLERANCE = 0.001;

export type CheckoutSessionStatus = "pending" | "cancelled";

/** One pending checkout attempt per sale; cancel flips pending→cancelled. */
export interface CheckoutSession {
  readonly id: string;
  readonly ventaId: string;
  readonly status: CheckoutSessionStatus;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** Legacy `checkout_sessions.payment_method_id` (nullish on old rows). */
  readonly paymentMethodId: string | null;
}

/** `productId` null = manual/described line, never touches stock. */
export interface VentaLine {
  readonly productId: ProductId | null;
  readonly quantity: number;
  readonly unitPrice: Money | null;
  readonly allocations: readonly VentaAllocation[];
}

export interface VentaPayment {
  readonly method: string;
  readonly amount: Money;
}

export interface Venta {
  readonly id: string;
  readonly channel: VentaChannel;
  readonly status: VentaStatus;
  readonly lines: readonly VentaLine[];
  readonly payments: readonly VentaPayment[];
  readonly checkoutSession: CheckoutSession | null;
  readonly stockCommitted: boolean;
  readonly total: Money | null;
  readonly paymentRef: string | null;
  readonly paidAt: Date | null;
  /** Legacy `orders` customer metadata (webshop orders; null on mostrador). */
  readonly customer: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly ci: string | null;
  readonly rut: string | null;
  readonly address: string | null;
  readonly shipping: string | null;
  readonly comments: string | null;
  /** Owner (`orders.user_id`); null on ownerless legacy rows. */
  readonly userId: string | null;
  /** Mostrador intake metadata (legacy sales-batch; null on webshop). */
  readonly clientName: string | null;
  readonly clientId: string | null;
  readonly deviceBrand: string | null;
  readonly deviceModel: string | null;
  readonly imeiSerial: string | null;
  readonly reportedIssue: string | null;
  readonly services: readonly string[] | null;
}

export interface VentaLineInput {
  readonly productId: string | null;
  readonly quantity: number;
}

export interface CreateVentaInput {
  readonly id: string;
  readonly channel: string;
  readonly lines: readonly VentaLineInput[];
  readonly customer?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly ci?: string | null;
  readonly rut?: string | null;
  readonly address?: string | null;
  readonly shipping?: string | null;
  readonly comments?: string | null;
  readonly userId?: string | null;
  readonly clientName?: string | null;
  readonly clientId?: string | null;
  readonly deviceBrand?: string | null;
  readonly deviceModel?: string | null;
  readonly imeiSerial?: string | null;
  readonly reportedIssue?: string | null;
  readonly services?: readonly string[] | null;
}

function cleanQty(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ValidationError("Venta inválida: quantity debe ser un entero positivo", {
      quantity: value
    });
  }
  return value;
}

/** Optional at domain level (mostrador sales carry none); webshop callers
 * always provide it. Blank-when-provided is 422, never silent. */
function cleanCustomer(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (value.trim() === "") {
    throw new ValidationError("Venta inválida: customer no puede estar vacío", {});
  }
  return value;
}

/** Optional at domain level (webshop drafts carry none); blank-when-provided
 * is 422, never silent — the sales-batch handler requires `clientName`. */
function cleanIntakeText(value: string | null | undefined, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (value.trim() === "") {
    throw new ValidationError(`Venta inválida: ${field} no puede estar vacío`, {});
  }
  return value;
}

function cleanServices(value: readonly string[] | null | undefined): readonly string[] | null {
  if (value === undefined || value === null) return null;
  for (const entry of value) {
    if (entry.trim() === "") {
      throw new ValidationError("Venta inválida: services no acepta entradas vacías", {});
    }
  }
  return [...value];
}

export function createVenta(input: CreateVentaInput): Venta {
  if (input.id.trim() === "") {
    throw new ValidationError("Venta inválida: id no puede estar vacío", { id: input.id });
  }
  if (!isVentaChannel(input.channel)) {
    throw new ValidationError("Venta inválida: channel debe ser mostrador o webshop", {
      channel: input.channel
    });
  }
  if (input.lines.length === 0) {
    throw new ValidationError("Venta inválida: requiere al menos una línea", {});
  }
  const seen = new Set<string>();
  const lines = input.lines.map((line) => {
    const productId = line.productId === null ? null : createProductId(line.productId);
    if (productId !== null) {
      if (seen.has(productId)) {
        throw new ValidationError("Venta inválida: productIds duplicados en líneas", {
          productId
        });
      }
      seen.add(productId);
    }
    return { productId, quantity: cleanQty(line.quantity), unitPrice: null, allocations: [] };
  });
  return {
    id: input.id,
    channel: input.channel,
    status: "Pendiente",
    lines,
    payments: [],
    checkoutSession: null,
    stockCommitted: false,
    total: null,
    paymentRef: null,
    paidAt: null,
    customer: cleanCustomer(input.customer),
    email: input.email ?? null,
    phone: input.phone ?? null,
    ci: input.ci ?? null,
    rut: input.rut ?? null,
    address: input.address ?? null,
    shipping: input.shipping ?? null,
    comments: input.comments ?? null,
    userId: input.userId ?? null,
    clientName: cleanIntakeText(input.clientName, "clientName"),
    clientId: cleanIntakeText(input.clientId, "clientId"),
    deviceBrand: cleanIntakeText(input.deviceBrand, "deviceBrand"),
    deviceModel: cleanIntakeText(input.deviceModel, "deviceModel"),
    imeiSerial: cleanIntakeText(input.imeiSerial, "imeiSerial"),
    reportedIssue: cleanIntakeText(input.reportedIssue, "reportedIssue"),
    services: cleanServices(input.services)
  };
}

function requirePending(venta: Venta, action: string): void {
  if (venta.status !== "Pendiente") {
    throw new ValidationError(`Venta inválida: no se puede ${action} una venta ${venta.status}`, {
      status: venta.status
    });
  }
}

/**
 * Server-side pricing: every line price resolves via callback (the
 * application feeds locked catalog rows); the total is always recomputed.
 */
export function priceVenta(
  venta: Venta,
  resolvePrice: (line: { productId: ProductId | null; quantity: number }) => Money
): Venta {
  requirePending(venta, "preciar");
  const lines = venta.lines.map((line) => {
    const resolved = resolvePrice({ productId: line.productId, quantity: line.quantity });
    return { ...line, unitPrice: createMoney(resolved.amount, resolved.currency) };
  });
  const currencies = new Set(lines.map((line) => (line.unitPrice as Money).currency));
  if (currencies.size !== 1) {
    throw new ValidationError("Venta inválida: todas las líneas deben compartir moneda", {
      currencies: [...currencies]
    });
  }
  const currency = lines[0].unitPrice as Money;
  const total = lines.reduce(
    (sum, line) => sum + line.quantity * (line.unitPrice as Money).amount,
    0
  );
  return { ...venta, lines, total: createMoney(total, currency.currency) };
}

export interface AddVentaPaymentInput {
  readonly method: string;
  readonly amount: Money;
}

export function addVentaPayment(venta: Venta, input: AddVentaPaymentInput): Venta {
  requirePending(venta, "agregar pago a");
  if (input.method.trim() === "") {
    throw new ValidationError("Venta inválida: payment method no puede estar vacío", {});
  }
  const amount = createMoney(input.amount.amount, input.amount.currency);
  if (amount.amount <= 0) {
    throw new ValidationError("Venta inválida: payment amount debe ser mayor a 0", {
      amount: amount.amount
    });
  }
  if (venta.total !== null && amount.currency !== venta.total.currency) {
    throw new ValidationError("Venta inválida: el pago debe usar la moneda del total", {
      currency: amount.currency
    });
  }
  return { ...venta, payments: [...venta.payments, { method: input.method, amount }] };
}

/** Locked lane per product: remaining lots plus the catalog fallback price. */
export interface VentaLotLane {
  readonly lots: readonly StockLot[];
  readonly price: Money;
}

export interface ConfirmResult {
  readonly venta: Venta;
  readonly lots: ReadonlyMap<string, readonly StockLot[]>;
}

function paymentsCover(total: Money, payments: readonly VentaPayment[]): boolean {
  const paid = payments.reduce((sum, payment) => sum + payment.amount.amount, 0);
  return Math.abs(paid - total.amount) <= PAYMENT_TOLERANCE;
}

/**
 * Mostrador: exact payments required, `venta` lots decremented FIFO,
 * `stockCommitted=true`. Webshop: availability checked only, lots untouched,
 * `stockCommitted=false` (payment arrives later via webhook `markPaid`).
 */
export function confirmVenta(
  venta: Venta,
  lanes: ReadonlyMap<string, VentaLotLane>
): ConfirmResult {
  requirePending(venta, "confirmar");
  if (venta.total === null) {
    throw new ValidationError("Venta inválida: confirmar requiere precio server-side previo", {});
  }
  const commit = venta.channel === "mostrador";
  if (commit && venta.stockCommitted) {
    throw new ConflictError("Venta en conflicto: el stock ya fue comprometido", {});
  }
  if (commit) {
    if (!paymentsCover(venta.total, venta.payments)) {
      throw new ValidationError("Venta inválida: los pagos deben igualar el total ±0.001", {
        total: venta.total
      });
    }
    for (const payment of venta.payments) {
      if (payment.amount.currency !== venta.total.currency) {
        throw new ValidationError("Venta inválida: el pago debe usar la moneda del total", {
          currency: payment.amount.currency
        });
      }
    }
  }
  const lots = new Map<string, readonly StockLot[]>();
  const lines = venta.lines.map((line) => {
    if (line.productId === null) {
      return line;
    }
    const lane = lanes.get(line.productId);
    if (lane === undefined) {
      throw new NotFoundError("Venta inválida: producto de la línea desconocido", {
        productId: line.productId
      });
    }
    const { lots: updated, allocations } = allocateVentaLots(lane.lots, line.quantity, lane.price);
    lots.set(line.productId, commit ? updated : lane.lots);
    return commit ? { ...line, allocations } : line;
  });
  for (const [productId, lane] of lanes) {
    if (!lots.has(productId)) {
      lots.set(productId, lane.lots);
    }
  }
  return { venta: { ...venta, lines, stockCommitted: commit }, lots };
}

/** Idempotent: cancelling a `Cancelada` sale returns it unchanged. */
export function cancelVenta(venta: Venta): Venta {
  if (venta.status === "Cancelada") {
    return venta;
  }
  const checkoutSession =
    venta.checkoutSession?.status === "pending"
      ? { ...venta.checkoutSession, status: "cancelled" as const }
      : venta.checkoutSession;
  return { ...venta, status: "Cancelada", checkoutSession };
}

export interface MarkPaidInput {
  readonly paymentRef: string;
  readonly paidAt: Date;
}

/** Webhook path only: same reference is idempotent, another one is 409. */
export function markPaidVenta(venta: Venta, input: MarkPaidInput): Venta {
  if (venta.status === "Cancelada") {
    throw new ValidationError("Venta inválida: no se puede pagar una venta cancelada", {
      status: venta.status
    });
  }
  if (input.paymentRef.trim() === "") {
    throw new ValidationError("Venta inválida: paymentRef no puede estar vacío", {});
  }
  if (venta.status === "Pagada") {
    if (venta.paymentRef === input.paymentRef) {
      return venta;
    }
    throw new ConflictError("Venta en conflicto: ya fue pagada con otra referencia", {
      paymentRef: input.paymentRef
    });
  }
  return { ...venta, status: "Pagada", paymentRef: input.paymentRef, paidAt: input.paidAt };
}

export interface OpenCheckoutSessionInput {
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly paymentMethodId?: string | null;
}

/** A second pending session answers 409; a cancelled one is replaceable. */
export function openCheckoutSession(venta: Venta, input: OpenCheckoutSessionInput): Venta {
  requirePending(venta, "abrir checkout para");
  if (input.sessionId.trim() === "") {
    throw new ValidationError("Checkout inválido: sessionId no puede estar vacío", {});
  }
  if (input.expiresAt.getTime() <= input.createdAt.getTime()) {
    throw new ValidationError("Checkout inválido: expiresAt debe ser posterior a createdAt", {});
  }
  if (venta.checkoutSession?.status === "pending") {
    throw new ConflictError("Checkout en conflicto: ya existe una sesión pendiente", {
      sessionId: venta.checkoutSession.id
    });
  }
  return {
    ...venta,
    checkoutSession: {
      id: input.sessionId,
      ventaId: venta.id,
      status: "pending",
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      paymentMethodId: input.paymentMethodId ?? null
    }
  };
}

/** Idempotent: flips pending→cancelled, keeps the record for audit. */
export function cancelCheckoutSession(venta: Venta): Venta {
  if (venta.checkoutSession?.status !== "pending") {
    return venta;
  }
  return {
    ...venta,
    checkoutSession: { ...venta.checkoutSession, status: "cancelled" }
  };
}
