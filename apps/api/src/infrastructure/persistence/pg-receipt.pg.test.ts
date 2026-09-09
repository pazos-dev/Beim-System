/**
 * Receipt intake (slice 3.2, change `clean-arch-infrastructure`).
 *
 * `describePg`: a non-`Ingresado` intake still lands `Ingresado` with `price`
 * intact; children round-trip through `findById`; `markAnnuled` flips
 * Cancelado / Sin abonar / 0 with reversals on the original date. Skips
 * without `TEST_DATABASE_URL`.
 */
import { describe, expect, it } from "vitest";
import { describePg, setupTestDatabase } from "../../db/testDb.js";
import { createReceipt } from "../../domain/receipt/receipt.js";

setupTestDatabase();

const { withTransaction } = await import("../../db/withTransaction.js");
const { PgReceiptAdapter } = await import("./pg-receipt.adapter.js");

describePg("receipt intake via port", () => {
  it("forces Ingresado with price intact and round-trips children", async () => {
    const adapter = new PgReceiptAdapter();
    const receipt = createReceipt({
      id: "11111111-1111-4111-8111-111111111111",
      receiptNumber: 1000,
      price: "1500.50",
      parts: [{ id: "22222222-2222-4222-8222-222222222222", productId: null, quantity: 1 }],
      payments: [{ id: "33333333-3333-4333-8333-333333333333", amount: 1500.5, currency: "UYU", method: "efectivo" }],
      checklists: [{ id: "44444444-4444-4444-8444-444444444444", checklistType: "ingreso", status: "Pendiente" }]
    });

    await withTransaction(async (tx) => {
      // Non-Ingresado intake: the adapter forces Ingresado anyway. Read on
      // the same connection — the shared pool cannot see uncommitted rows.
      await adapter.save({ ...receipt, repairStatus: "En reparación" }, tx);
      const stored = await tx.query<{ repair_status: string; price: string }>(
        "SELECT repair_status, price FROM beim_receipts WHERE id = $1",
        [receipt.id]
      );
      expect(stored.rows[0]).toMatchObject({ repair_status: "Ingresado", price: "1500.50" });

      const loaded = await adapter.findById(receipt.id, tx);
      expect(loaded?.price).toBe("1500.50");
      expect(loaded?.parts).toHaveLength(1);
      expect(loaded?.payments[0]).toMatchObject({ method: "efectivo" });
      expect(loaded?.checklists[0]).toMatchObject({ checklistType: "ingreso" });
    });
  });

  it("annuls with reversals on the original date", async () => {
    const adapter = new PgReceiptAdapter();
    const receipt = createReceipt({
      id: "55555555-5555-4555-8555-555555555555",
      receiptNumber: 1001,
      price: "800",
      payments: [{ id: "66666666-6666-4666-8666-666666666666", amount: 800, currency: "UYU", method: "tarjeta" }]
    });

    await withTransaction(async (tx) => {
      await adapter.save(receipt, tx);
      await adapter.insertReversal(tx, { receiptId: receipt.id, amount: -800, method: "tarjeta", businessDate: "2026-02-01" });
      await adapter.markAnnuled(tx, receipt.id);
      const loaded = await adapter.findById(receipt.id, tx);
      expect(loaded).toMatchObject({ repairStatus: "Cancelado", paymentStatus: "Sin abonar", price: "0" });
      const movements = await adapter.listMovements(tx, receipt.id);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ amount: -800, paymentStatus: "Anulado", businessDate: "2026-02-01" });
    });
  });
});
