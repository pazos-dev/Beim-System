import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import { NotFoundError, ValidationError } from "../../domain/shared/errors.js";
import {
  allocateTallerLots,
  createStockLot,
  type StockLot
} from "../../domain/product/stock-lot.js";
import {
  createReceipt,
  transitionRepairStatus,
  type Receipt,
  type ReceiptReversal
} from "../../domain/receipt/receipt.js";
import { makeReceiptHandlers } from "./receipts.js";
import type { ReceiptStore } from "./ports.js";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeReceiptStore implements ReceiptStore {
  receipts = new Map<string, Receipt>();
  lots = new Map<string, StockLot[]>();
  reversals: ReceiptReversal[] = [];
  seenTx: TxClient[] = [];
  saves = 0;
  lotSaves = 0;
  reversalSaves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findById(tx: TxClient, id: string): Promise<Receipt | null> {
    this.touch(tx);
    return this.receipts.get(id) ?? null;
  }

  async save(tx: TxClient, receipt: Receipt): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.receipts.set(receipt.id, receipt);
  }

  async findTallerLots(tx: TxClient, productId: string): Promise<readonly StockLot[] | null> {
    this.touch(tx);
    return this.lots.get(productId) ?? null;
  }

  async saveTallerLots(tx: TxClient, productId: string, lots: readonly StockLot[]): Promise<void> {
    this.touch(tx);
    this.lotSaves += 1;
    this.lots.set(productId, [...lots]);
  }

  async saveReversals(tx: TxClient, reversals: readonly ReceiptReversal[]): Promise<void> {
    this.touch(tx);
    this.reversalSaves += 1;
    this.reversals.push(...reversals);
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const receipts = new FakeReceiptStore();
  const handler = makeReceiptHandlers({ uow, receipts });
  return { uow, receipts, handler };
}

const LOT_DATE = new Date("2026-01-01T00:00:00.000Z");

function mkTallerLot(productId: string, qty: number): StockLot {
  return createStockLot({
    id: `taller-${productId}`,
    productId,
    initialQty: qty,
    unitCostAmount: 10,
    unitCostCurrency: "UYU",
    purpose: "taller",
    createdAt: LOT_DATE
  });
}

/** Receipt in `Listo` with one consumed `taller` lot + one cash payment. */
function seedListoWithPart(store: FakeReceiptStore): Receipt {
  const lane = [mkTallerLot("p-1", 4)];
  const consumed = allocateTallerLots(lane, 3);
  store.lots.set("p-1", [...consumed.lots]);
  const receipt = transitionRepairStatus(
    transitionRepairStatus(
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
    ),
    "Listo"
  );
  store.receipts.set(receipt.id, receipt);
  return receipt;
}

describe("Receipt handlers (application slice)", () => {
  it("intakes forcing Ingresado regardless of input, one run one save", async () => {
    const { uow, receipts, handler } = setup();
    const receipt = await handler.intake({
      id: "r-1",
      receiptNumber: 1000,
      repairStatus: "Listo",
      price: "1500"
    });
    expect(receipt.repairStatus).toBe("Ingresado");
    expect(uow.runs).toBe(1);
    expect(receipts.saves).toBe(1);
    expect(receipts.receipts.get("r-1")?.repairStatus).toBe("Ingresado");
    expect(receipts.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("walks Ingresado → En reparación → Listo → Entregado on the same tx", async () => {
    const { uow, receipts, handler } = setup();
    await handler.intake({ id: "r-2", receiptNumber: 1001 });
    for (const to of ["En reparación", "Listo", "Entregado"] as const) {
      const next = await handler.transitionStatus({ receiptId: "r-2", to });
      expect(next.repairStatus).toBe(to);
    }
    expect(uow.runs).toBe(4);
    expect(receipts.saves).toBe(4);
    expect(receipts.receipts.get("r-2")?.repairStatus).toBe("Entregado");
  });

  it("rejects illegal transitions and Cancelado-via-transition with zero saves", async () => {
    const { uow, receipts, handler } = setup();
    await handler.intake({ id: "r-3", receiptNumber: 1002 });
    const savesBefore = receipts.saves;
    await expect(handler.transitionStatus({ receiptId: "r-3", to: "Listo" })).rejects.toThrow(
      ValidationError
    );
    await expect(
      handler.transitionStatus({ receiptId: "r-3", to: "Cancelado" })
    ).rejects.toThrow(ValidationError);
    expect(receipts.saves).toBe(savesBefore);
    expect(receipts.receipts.get("r-3")?.repairStatus).toBe("Ingresado");
    expect(uow.runs).toBe(3);
  });

  it("rejects transitions on missing receipts with NotFoundError and zero saves", async () => {
    const { uow, receipts, handler } = setup();
    await expect(
      handler.transitionStatus({ receiptId: "missing", to: "En reparación" })
    ).rejects.toThrow(NotFoundError);
    await expect(handler.annul({ receiptId: "missing", businessDate: "2026-02-01" })).rejects.toThrow(
      NotFoundError
    );
    expect(receipts.saves).toBe(0);
    expect(receipts.lotSaves).toBe(0);
    expect(receipts.reversalSaves).toBe(0);
    expect(uow.runs).toBe(2);
  });

  it("annuls atomically: Cancelado, taller stock restored, price zeroed, reversals saved", async () => {
    const { uow, receipts, handler } = setup();
    seedListoWithPart(receipts);
    const result = await handler.annul({ receiptId: "r-1", businessDate: "2026-02-01" });
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
    expect(uow.runs).toBe(1);
    expect(receipts.saves).toBe(1);
    expect(receipts.lotSaves).toBe(1);
    expect(receipts.reversalSaves).toBe(1);
    expect(receipts.lots.get("p-1")?.[0].remainingQty).toBe(4);
  });

  it("keeps annul atomic on unknown taller lanes: NotFoundError, zero saves", async () => {
    const { receipts, handler } = setup();
    receipts.receipts.set(
      "r-9",
      createReceipt({
        id: "r-9",
        receiptNumber: 1009,
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
      })
    );
    await expect(handler.annul({ receiptId: "r-9", businessDate: "2026-02-01" })).rejects.toThrow(
      NotFoundError
    );
    expect(receipts.saves).toBe(0);
    expect(receipts.lotSaves).toBe(0);
    expect(receipts.reversalSaves).toBe(0);
    expect(receipts.receipts.get("r-9")?.repairStatus).toBe("Ingresado");
  });

  it("returns idempotent annul unchanged with zero saves once Cancelado", async () => {
    const { uow, receipts, handler } = setup();
    seedListoWithPart(receipts);
    await handler.annul({ receiptId: "r-1", businessDate: "2026-02-01" });
    const savesBefore = receipts.saves;
    const second = await handler.annul({ receiptId: "r-1", businessDate: "2026-02-01" });
    expect(second.receipt.repairStatus).toBe("Cancelado");
    expect(second.reversals).toEqual([]);
    expect(receipts.saves).toBe(savesBefore);
    expect(receipts.lotSaves).toBe(1);
    expect(uow.runs).toBe(2);
  });
});
