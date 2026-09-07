/**
 * Postgres CheckoutSessionsPort implementation — checkout-session minting
 * (checkout_sessions table, migration 0001).
 *
 * Split from pg-orders.ts (SOLID batch 2). Leaf module: only imports
 * config/db and ports.
 */
import { query } from "../../../config/db.js";
import type { CheckoutSessionRow, CheckoutSessionsPort } from "../ports.js";

export const checkoutRepository: CheckoutSessionsPort = {
  async create(input: {
    id: string;
    userId: string;
    orderId: string;
    paymentMethodId?: string | null;
    expiresAt: Date;
  }): Promise<CheckoutSessionRow> {
    const { rows } = await query<{
      id: string;
      user_id: string;
      order_id: string;
      payment_method_id: string | null;
      status: string;
      created_at: Date;
      expires_at: Date;
    }>(
      `INSERT INTO checkout_sessions (id, user_id, order_id, payment_method_id, status, expires_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING *`,
      [input.id, input.userId, input.orderId, input.paymentMethodId ?? null, input.expiresAt]
    );
    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      orderId: row.order_id,
      paymentMethodId: row.payment_method_id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at
    };
  }
};
