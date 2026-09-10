/**
 * Venta/Checkout adapters (slice 3.1, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests + SQL-text asserts. Lock (`published = true
 * FOR UPDATE`), order insert defaults (`'Pendiente'`/`'Pendiente de pago'`/
 * `false`), multi-row items and checkout insert are byte-identical to
 * `modules/webshop/repositories/pg-orders.ts` + `pg-checkout-sessions.ts`;
 * preference overwrite to `pg-payments.ts` `setPreferenceId`.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../domain/shared/ports.js";
import { ConflictError, InsufficientStockError } from "../../errors/taxonomy.js";

const { PgVentaAdapter } = await import("./pg-venta.adapter.js");
const { toVenta } = await import("./pg-venta.mapper.js");

/** Byte-identical lock from `pg-orders.ts` `ORDER_PRODUCT_SQL`. */
const LEGACY_LOCK =
  "SELECT id, name, product_code, price, currency, stock\n   FROM products\n   WHERE id = $1 AND published = true\n   FOR UPDATE";

/** Byte-identical order insert from `pg-orders.ts` `insertOrderOn`. */
const LEGACY_ORDER_INSERT =
  "INSERT INTO orders\n       (id, customer, email, phone, ci, rut, address, shipping, comments,\n        total, currency, status, payment_status, stock_committed, user_id)\n     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Pendiente', 'Pendiente de pago', false, $12)\n     RETURNING *";

/** Byte-identical checkout insert from `pg-checkout-sessions.ts` `create`. */
const LEGACY_CHECKOUT_INSERT =
  "INSERT INTO checkout_sessions (id, user_id, order_id, payment_method_id, status, expires_at)\n       VALUES ($1, $2, $3, $4, 'pending', $5)\n       RETURNING *";

/** Byte-identical preference overwrite from `pg-payments.ts` `setPreferenceId`. */
const LEGACY_PREFERENCE_UPDATE = "UPDATE orders SET mp_preference_id = $2 WHERE id = $1";

const PENDING_COUNT =
  "SELECT count(*)::text AS n FROM checkout_sessions WHERE order_id = $1 AND status = 'pending'";

function stubTx(captured: string[], queued: unknown[][]): TxClient {
  const tx = {
    query: async (text: string, _params?: unknown[]) => {
      captured.push(text);
      return { rows: queued.shift() ?? [] };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

function lockedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    name: "Repuesto",
    product_code: 7,
    price: "500.00",
    currency: "UYU",
    stock: 5,
    ...overrides
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "v-1",
    customer: "Mostrador",
    email: null,
    total: "1000.00",
    currency: "UYU",
    status: "Pendiente",
    payment_status: "Pendiente de pago",
    stock_committed: false,
    mp_preference_id: null,
    mp_payment_id: null,
    paid_at: null,
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides
  };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    order_id: "v-1",
    product_id: "p-1",
    product_code: 7,
    product_name: "Repuesto",
    quantity: 2,
    unit_price: "500.00",
    currency: "UYU",
    ...overrides
  };
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs-1",
    order_id: "v-1",
    status: "pending",
    created_at: new Date("2026-09-01T00:00:00.000Z"),
    expires_at: new Date("2026-09-01T00:30:00.000Z"),
    ...overrides
  };
}

describe("venta mapper", () => {
  it("maps an order + items + pending session to the Venta shape", () => {
    const venta = toVenta(orderRow(), [itemRow()], sessionRow());

    expect(venta.id).toBe("v-1");
    expect(venta.channel).toBe("webshop");
    expect(venta.status).toBe("Pendiente");
    expect(venta.total).toEqual({ amount: 1000, currency: "UYU" });
    expect(venta.lines).toHaveLength(1);
    expect(venta.checkoutSession?.id).toBe("cs-1");
    expect(venta.checkoutSession?.status).toBe("pending");
  });

  it("maps a paid row to Pagada with the provider payment reference", () => {
    const venta = toVenta(
      orderRow({
        id: "v-2",
        payment_status: "Pagado",
        stock_committed: true,
        mp_preference_id: "pref-1",
        mp_payment_id: "pay-1",
        paid_at: new Date("2026-09-02T00:00:00.000Z")
      }),
      [],
      null
    );

    expect(venta.status).toBe("Pagada");
    expect(venta.paymentRef).toBe("pay-1");
    expect(venta.stockCommitted).toBe(true);
  });
});

describe("PgVentaAdapter lock-then-insert", () => {
  it("locks every line with the legacy published FOR UPDATE SELECT", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [
      [lockedRow()],
      [orderRow({ id: "v-9", total: "500.00" })],
      [],
      [itemRow({ order_id: "v-9", quantity: 1 })]
    ]);
    const adapter = new PgVentaAdapter();

    await adapter.insertVenta(tx, { id: "v-9", customer: "Web" }, [{ productId: "p-1", quantity: 1 }]);

    expect(captured[0]).toBe(LEGACY_LOCK);
  });

  it("inserts the order with legacy defaults and multi-row items in one statement", async () => {
    const captured: string[] = [];
    let itemParams: unknown[] = [];
    let itemText = "";
    const tx = {
      query: async (text: string, params?: unknown[]) => {
        captured.push(text);
        if (text.startsWith("INSERT INTO order_items")) {
          itemText = text;
          itemParams = params ?? [];
          return { rows: [] };
        }
        if (text.startsWith("SELECT id, name")) return { rows: [lockedRow(), lockedRow()] };
        if (text.startsWith("SELECT * FROM orders")) return { rows: [] };
        if (text.startsWith("SELECT * FROM order_items")) return { rows: [itemRow({ order_id: "v-9", quantity: 1 })] };
        return { rows: [orderRow({ id: "v-9", customer: "Web", total: "1500.00" })] };
      }
    } as unknown as PoolClient;
    const adapter = new PgVentaAdapter();

    await adapter.insertVenta(
      tx as unknown as TxClient,
      { id: "v-9", customer: "Web" },
      [
        { productId: "p-1", quantity: 1 },
        { productId: "p-2", quantity: 2 }
      ]
    );

    expect(captured).toContain(LEGACY_ORDER_INSERT);
    expect(itemText.startsWith("INSERT INTO order_items (order_id")).toBe(true);
    expect(itemParams).toHaveLength(14);
  });

  it("short locked stock aborts with 409 before any INSERT", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [[lockedRow({ stock: 0 })]]);
    const adapter = new PgVentaAdapter();

    await expect(
      adapter.insertVenta(tx, { id: "v-9", customer: "Web" }, [{ productId: "p-1", quantity: 2 }])
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(captured.some((text) => text.startsWith("INSERT INTO"))).toBe(false);
  });
});

describe("PgVentaAdapter checkout + preference", () => {
  it("a second pending session conflicts with 409 and never inserts", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [
      [{ payment_status: "Pendiente de pago" }],
      [{ n: "1" }]
    ]);
    const adapter = new PgVentaAdapter();

    await expect(
      adapter.createCheckoutSession(tx, { id: "cs-2", userId: "u-1", orderId: "v-1", expiresAt: new Date() })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(captured).toEqual([
      "SELECT payment_status FROM orders WHERE id = $1 AND user_id = $2",
      PENDING_COUNT
    ]);
  });

  it("mints a pending session with the legacy byte-identical INSERT", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [[{ payment_status: "Pendiente de pago" }], [{ n: "0" }], [{ id: "cs-1" }]]);
    const adapter = new PgVentaAdapter();

    await adapter.createCheckoutSession(tx, {
      id: "cs-1",
      userId: "u-1",
      orderId: "v-1",
      expiresAt: new Date("2026-09-01T00:30:00.000Z")
    });

    expect(captured[2]).toBe(LEGACY_CHECKOUT_INSERT);
  });

  it("every preference mint overwrites the stored id in one UPDATE", async () => {
    const captured: string[] = [];
    const tx = stubTx(captured, [[]]);
    const adapter = new PgVentaAdapter();

    await adapter.setPreferenceId(tx, "v-1", "pref-fresh");

    expect(captured).toEqual([LEGACY_PREFERENCE_UPDATE]);
  });
});
