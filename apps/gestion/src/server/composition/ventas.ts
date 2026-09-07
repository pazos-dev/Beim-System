import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStockRepository } from "../stock/json-stock-repository";
import { JsonVentaRepository } from "../ventas/json-venta-repository";
import { AuditRepository } from "../shared/audit";
import { IdempotencyService } from "../shared/idempotency";
import { VentaUseCases } from "../ventas/ventas-use-cases";

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
