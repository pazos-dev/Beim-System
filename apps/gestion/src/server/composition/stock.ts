import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../stock/json-stock-repository";
import { HttpStockRepository } from "../stock/http-stock-repository";
import { AuditRepository } from "../shared/audit";
import { IdempotencyService } from "../shared/idempotency";
import { StockUseCases } from "../stock/stock-use-cases";
import type { GestionApiContext } from "../api/gestion-api-context";
import type { StockRepositoryPort } from "../stock/stock-port";

/** Local composition root kept for existing isolated unit tests. */
export function createStockUseCases(dataDirectory: string): StockUseCases {
  return new StockUseCases(
    new JsonStockRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema))
  );
}

/** Remote composition root: no JsonStore/JsonRepository for runtime reads. */
export function createRemoteStockRepository(context: GestionApiContext): StockRepositoryPort {
  return new HttpStockRepository({
    baseUrl: context.baseUrl,
    token: context.token
  });
}

/**
 * Remote read-only composition root.
 *
 * The audit and idempotency dependencies are constructed only for use-case type
 * compatibility. GET paths must not call mutation methods, so those JSON stores
 * are never read or written at runtime. Do not use this factory for mutations.
 */
export function createRemoteStockUseCases(context: GestionApiContext): StockUseCases {
  const dataDirectory = process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
  return new StockUseCases(
    createRemoteStockRepository(context),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema))
  );
}
