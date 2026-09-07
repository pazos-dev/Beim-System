import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../stock/json-stock-repository";
import { AuditRepository } from "../shared/audit";
import { IdempotencyService } from "../shared/idempotency";
import { StockUseCases } from "../stock/stock-use-cases";

export function createStockUseCases(dataDirectory: string): StockUseCases {
  return new StockUseCases(
    new JsonStockRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema))
  );
}
