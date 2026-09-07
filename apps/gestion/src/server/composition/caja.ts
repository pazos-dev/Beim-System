import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonCajaRepository } from "../adapters/json-caja-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { CajaUseCases } from "../use-cases/caja";

export function createCajaUseCases(dataDirectory: string): CajaUseCases {
  return new CajaUseCases(
    new JsonCajaRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    )
  );
}
