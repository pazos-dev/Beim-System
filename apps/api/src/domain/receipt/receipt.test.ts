import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "../../errors/taxonomy.js";
import { allocateTallerLots, createStockLot } from "../product/stock-lot.js";
import {
  annulReceipt,
  createReceipt,
  nextReceiptNumber,
  transitionRepairStatus,
  type Receipt
} from "./receipt.js";

const LOT_DATE = new Date("2026-01-01T00:00:00.000Z");

function intake(overrides: Partial<Parameters<typeof createReceipt>[0]> = {}): Receipt {
  return createReceipt({
    id: "r-1",
    receiptNumber: 1000,
    price: "1500",
    ...overrides
  });
}

describe("Receipt aggregate (domain slice)", () => {
  it("forces Ingresado on intake regardless of input", () => {
    const receipt = intake({ repairStatus: "Listo" });
    expect(receipt.repairStatus).toBe("Ingresado");
  });

  it("sequences ReceiptNumber from 1000", () => {
    expect(nextReceiptNumber(null)).toBe(1000);
    expect(nextReceiptNumber(1000)).toBe(1001);
    expect(() => nextReceiptNumber(999)).toThrow(ValidationError);
  });

  it("follows Ingresado → En reparación → Listo → Entregado", () => {
    let receipt = intake();
    for (const to of ["En reparación", "Listo", "Entregado"] as const) {
      receipt = transitionRepairStatus(receipt, to);
      expect(receipt.repairStatus).toBe(to);
    }
  });

  it("rejects illegal transitions leaving the receipt unchanged", () => {
    const delivered = transitionRepairStatus(
      transitionRepairStatus(transitionRepairStatus(intake(), "En reparación"), "Listo"),
      "Entregado"
    );
    expect(() => transitionRepairStatus(delivered, "Ingresado")).toThrow(ValidationError);
    expect(delivered.repairStatus).toBe("Entregado");
    expect(() => transitionRepairStatus(intake(), "Cancelado")).toThrow(ValidationError);
  });

  it("annuls atomically: restores taller lots, flips flags, journals reversals", () => {
    const lane = [
      createStockLot({
        id: "t-1",
        productId: "p-1",
        initialQty: 4,
        unitCostAmount: 10,
        unitCostCurrency: "UYU",
        purpose: "taller",
        createdAt: LOT_DATE
      })
    ];
    const consumed = allocateTallerLots(lane, 3);
    const receipt = transitionRepairStatus(
      createReceipt({
        id: "r-1",
        receiptNumber: 1000,
        price: "1500",
        parts: [
          {
            id: "rp-1",
            productId: "p-1",
            quantity: 3,
            stockDecremented: true,
            allocations: consumed.allocations
          }
        ],
        payments: [{ id: "pay-1", amount: 1500, currency: "UYU", method: "efectivo" }]
      }),
      "En reparación"
    );
    const result = annulReceipt(receipt, new Map([["p-1", consumed.lots]]), "2026-02-01");
    expect(result.receipt.repairStatus).toBe("Cancelado");
    expect(result.receipt.paymentStatus).toBe("Sin abonar");
    expect(result.receipt.price).toBe("0");
    expect(result.lots.get("p-1")?.[0].remainingQty).toBe(4);
    expect(result.reversals).toEqual([
      {
        receiptId: "r-1",
        amount: -1500,
        currency: "UYU",
        method: "efectivo",
        paymentStatus: "Anulado",
        businessDate: "2026-02-01"
      }
    ]);
  });

  it("keeps annul atomic on unknown lanes and idempotent once cancelled", () => {
    const receipt = transitionRepairStatus(intake(), "En reparación");
    const withPart = createReceipt({
      id: "r-2",
      receiptNumber: 1001,
      price: "500",
      parts: [
        {
          id: "rp-9",
          productId: "p-9",
          quantity: 1,
          stockDecremented: true,
          allocations: [{ lotId: "t-9", qty: 1 }]
        }
      ]
    });
    expect(() => annulReceipt(withPart, new Map(), "2026-02-01")).toThrow(NotFoundError);
    expect(withPart.repairStatus).toBe("Ingresado");
    const first = annulReceipt(receipt, new Map(), "2026-02-01");
    const second = annulReceipt(first.receipt, new Map(), "2026-02-01");
    expect(second.receipt).toEqual(first.receipt);
    expect(second.reversals).toEqual([]);
  });
});
