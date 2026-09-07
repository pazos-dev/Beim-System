import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonAdminRepository } from "../adapters/json-admin-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { AdminUseCases } from "../use-cases/admin";

export function createAdminUseCases(dataDirectory: string): AdminUseCases {
  return new AdminUseCases(
    new JsonAdminRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    )
  );
}
