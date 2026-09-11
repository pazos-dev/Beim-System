import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonCajaRepository } from "../adapters/json-caja-repository";
import { HttpCajaRepository } from "../adapters/http-caja-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { CajaUseCases } from "../use-cases/caja";
import type { GestionApiContext } from "../api/gestion-api-context";
import type { CajaRepositoryPort } from "../ports/caja";

/** Local composition root kept for existing isolated unit tests. */
export function createCajaUseCases(dataDirectory: string): CajaUseCases {
  return new CajaUseCases(
    new JsonCajaRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    )
  );
}

/** Remote composition root: no JsonStore/JsonRepository for runtime reads. */
export function createRemoteCajaRepository(context: GestionApiContext): CajaRepositoryPort {
  return new HttpCajaRepository({
    baseUrl: context.baseUrl,
    token: context.token
  });
}
