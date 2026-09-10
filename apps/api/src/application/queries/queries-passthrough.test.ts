import { describe, expect, it } from "vitest";

import {
  ConflictError,
  InsufficientStockError,
  NotFoundError,
  ValidationError
} from "../../domain/shared/errors.js";
// Test-only edge import: production handlers must NEVER import this module
// (Unit 12 contract — failures bubble so the edge maps code + status).
import { toAppError } from "../../infrastructure/persistence/error-map.js";
import { makeQueryHandlers } from "./queries.js";
import type { QueriesDeps } from "./ports.js";

const UID = "c3333333-3333-4333-8333-333333333333";

function rejectingDeps(err: Error): QueriesDeps {
  const rejected = (): Promise<never> => Promise.reject(err);
  return {
    clients: { findClient: rejected },
    ventas: { listOpenByClient: rejected },
    catalog: { listProductsWithLots: rejected },
    receipts: { findReceipt: rejected },
    cash: { findCashSession: rejected }
  };
}

describe("query handlers pass-through (Unit 12, 5.3)", () => {
  it("getClientWithOpenSales bubbles the domain error with code + status intact", async () => {
    const boom = new NotFoundError("gone");
    const handlers = makeQueryHandlers(rejectingDeps(boom));
    await expect(handlers.getClientWithOpenSales({ clientId: UID })).rejects.toBe(boom);
    const mapped = toAppError(boom);
    expect(mapped).toBe(boom);
    expect(mapped).toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN", status: 404 });
  });

  it("listCatalogWithAvailability bubbles the domain error with code + status intact", async () => {
    const boom = new ConflictError("locked");
    const handlers = makeQueryHandlers(rejectingDeps(boom));
    await expect(handlers.listCatalogWithAvailability({})).rejects.toBe(boom);
    const mapped = toAppError(boom);
    expect(mapped).toBe(boom);
    expect(mapped).toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("getReceiptDetail bubbles the domain error with code + status intact", async () => {
    const boom = new InsufficientStockError();
    const handlers = makeQueryHandlers(rejectingDeps(boom));
    await expect(handlers.getReceiptDetail({ receiptId: "r-1" })).rejects.toBe(boom);
    const mapped = toAppError(boom);
    expect(mapped).toBe(boom);
    expect(mapped).toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 });
  });

  it("getCashSessionDetail bubbles the domain error with code + status intact", async () => {
    const boom = new ValidationError("bad");
    const handlers = makeQueryHandlers(rejectingDeps(boom));
    await expect(handlers.getCashSessionDetail({ sessionId: "c-1" })).rejects.toBe(boom);
    const mapped = toAppError(boom);
    expect(mapped).toBe(boom);
    expect(mapped).toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
  });
});
