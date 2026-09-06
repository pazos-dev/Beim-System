import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../adapters/json-stock-repository";
import { JsonVentaRepository } from "../adapters/json-venta-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { VentaUseCases } from "../use-cases/ventas";

export function createVentaUseCases(dataDirectory: string): VentaUseCases {
  return new VentaUseCases(
    new JsonVentaRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    ),
    new JsonStockRepository(dataDirectory)
  );
}
