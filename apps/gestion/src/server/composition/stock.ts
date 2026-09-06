import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../adapters/json-stock-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { StockUseCases } from "../use-cases/stock";

export function createStockUseCases(dataDirectory: string): StockUseCases {
  return new StockUseCases(
    new JsonStockRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema))
  );
}
