/**
 * Receipt adapter (slice 3.2, change `clean-arch-infrastructure`).
 *
 * DB-free: mapper unit tests (price-text passthrough, no secret columns) +
 * SQL-text asserts (closed-field-set insert, forced Ingresado, byte-identical
 * annul flip + movement journal). Legacy reference:
 * `modules/gestion/repositories/pg-receipts.ts` + `pg-payment-movements.ts`.
 */
process.env.DATABASE_URL ??= "postgres://beim@127.0.0.1:5432/beim_api_test";

import type { PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import type { TxClient } from "../../db/withTransaction.js";
import { createReceipt, type Receipt } from "../../domain/receipt/receipt.js";

const { PgReceiptAdapter } = await import("./pg-receipt.adapter.js");
const { toDomainReceipt } = await import("./pg-receipt.mapper.js");

/** Legacy annul flip, copied verbatim from `pg-receipts.ts` markAnnuled. */
const LEGACY_ANNUL_SQL = `UPDATE beim_receipts
       SET repair_status = 'Cancelado', payment_status = 'Sin abonar', price = '0', updated_at = now()
       WHERE id = $1
       RETURNING id`;

/** Legacy movement journal, copied verbatim from `pg-payment-movements.ts`. */
const LEGACY_MOVEMENT_INSERT = `INSERT INTO gestion_payment_movements (receipt_id, amount, payment_status, method, business_date)
       VALUES ($1, $2, $3, $4, $5::date)
       RETURNING id, receipt_id, amount, payment_status, method, business_date, created_at`;

const LEGACY_MOVEMENTS_SELECT = `SELECT id, receipt_id, amount, payment_status, method, business_date, created_at
       FROM gestion_payment_movements
       WHERE receipt_id = $1
       ORDER BY id`;

function intake(): Receipt {
  return createReceipt({ id: "r-1", receiptNumber: 1000, price: "1500.50" });
}

interface LoggedCall {
  text: string;
  params: unknown[];
}

function stubTx(log: LoggedCall[], queued: Array<{ rows: unknown[]; rowCount: number }> = []) {
  const tx = {
    query: async (text: string, params: unknown[] = []) => {
      log.push({ text, params });
      const next = queued.shift();
      return { rows: next?.rows ?? [], rowCount: next?.rowCount ?? 1 };
    }
  } as unknown as PoolClient;
  return tx as unknown as TxClient;
}

describe("receipt mapper", () => {
  it("hydrates header + children keeping price as text", () => {
    const receipt = toDomainReceipt(
      {
        id: "r-1",
        receipt_number: 1000,
        user_id: null,
        repair_status: "Ingresado",
        payment_status: "Sin abonar",
        price: "1500.50"
      },
      [
        {
          id: "rp-1",
          receipt_id: "r-1",
          product_id: "p-1",
          quantity: 2,
          unit_cost: "10",
          unit_price: "0",
          warranty_days: 30,
          supplier_name: "",
          stock_decremented: true
        }
      ],
      [{ id: "pay-1", receipt_id: "r-1", amount: "1500.50", currency: "UYU", method: "efectivo", reference: "" }],
      [{ id: "ch-1", receipt_id: "r-1", checklist_type: "ingreso", status: "Pendiente", checks: { pantalla: "ok" } }]
    );

    expect(receipt.price).toBe("1500.50");
    expect(typeof receipt.price).toBe("string");
    expect(receipt.parts[0]).toMatchObject({ quantity: 2, unitPrice: null, stockDecremented: true, allocations: [] });
    expect(receipt.payments[0]?.amount).toEqual({ amount: 1500.5, currency: "UYU" });
    expect(receipt.payments[0]).toMatchObject({ method: "efectivo", reference: null });
    expect(receipt.checklists[0]).toMatchObject({ checklistType: "ingreso", checks: { pantalla: "ok" } });
  });
});

describe("PgReceiptAdapter intake", () => {
  it("forces Ingresado and passes price through as text", async () => {
    const log: LoggedCall[] = [];
    await new PgReceiptAdapter().save({ ...intake(), repairStatus: "En reparación" }, stubTx(log));

    expect(log[0].text.startsWith("INSERT INTO beim_receipts (id, receipt_number, price, repair_status, payment_status)")).toBe(
      true
    );
    expect(log[0].params).toEqual(["r-1", 1000, "1500.50", "Ingresado", "Sin abonar"]);
  });

  it("keeps the closed field set in fixed order, omitting absent keys", async () => {
    const log: LoggedCall[] = [];
    await new PgReceiptAdapter().save({ ...intake(), userId: "u-1" }, stubTx(log));

    expect(log[0].text.startsWith("INSERT INTO beim_receipts (id, receipt_number, user_id, price, repair_status, payment_status)")).toBe(
      true
    );
    expect(log[0].params).toEqual(["r-1", 1000, "u-1", "1500.50", "Ingresado", "Sin abonar"]);
  });
});

describe("PgReceiptAdapter annul + journal", () => {
  it("flips with the legacy byte-identical UPDATE and 404s when missing", async () => {
    const log: LoggedCall[] = [];
    await new PgReceiptAdapter().markAnnuled(stubTx(log, [{ rows: [{ id: "r-1" }], rowCount: 1 }]), "r-1");

    expect(log[0].text).toBe(LEGACY_ANNUL_SQL);
    expect(log[0].params).toEqual(["r-1"]);
    await expect(new PgReceiptAdapter().markAnnuled(stubTx([], [{ rows: [], rowCount: 0 }]), "r-x")).rejects.toThrow(
      "Recibo no encontrado: r-x"
    );
  });

  it("journals reversals on the original business date with the legacy INSERT", async () => {
    const log: LoggedCall[] = [];
    const tx = stubTx(log, [
      {
        rows: [
          {
            id: 7,
            receipt_id: "r-1",
            amount: "-1500.50",
            payment_status: "Anulado",
            method: "efectivo",
            business_date: "2026-02-01",
            created_at: new Date("2026-02-01T00:00:00.000Z")
          }
        ],
        rowCount: 1
      }
    ]);
    const reversal = await new PgReceiptAdapter().insertReversal(tx, {
      receiptId: "r-1",
      amount: -1500.5,
      method: "efectivo",
      businessDate: "2026-02-01"
    });

    expect(log[0].text).toBe(LEGACY_MOVEMENT_INSERT);
    expect(log[0].params).toEqual(["r-1", -1500.5, "Anulado", "efectivo", "2026-02-01"]);
    expect(reversal).toMatchObject({ amount: -1500.5, paymentStatus: "Anulado", businessDate: "2026-02-01" });
  });

  it("reads movements with the legacy byte-identical SELECT", async () => {
    const log: LoggedCall[] = [];
    await new PgReceiptAdapter().listMovements(stubTx(log, [{ rows: [], rowCount: 0 }]), "r-1");

    expect(log[0].text).toBe(LEGACY_MOVEMENTS_SELECT);
    expect(log[0].params).toEqual(["r-1"]);
  });
});
