import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonServicioRepository } from "../servicios/json-servicio-repository";
import { HttpServicioRepository } from "../servicios/http-servicio-repository";
import { AuditRepository } from "../shared/audit";
import { IdempotencyService } from "../shared/idempotency";
import { ServicioUseCases } from "../servicios/servicios-use-cases";
import type { GestionApiContext } from "../api/gestion-api-context";
import type { ServicioRepositoryPort } from "../servicios/servicio-port";

/** Local composition root kept for existing isolated unit tests. */
export function createServicioUseCases(dataDirectory: string): ServicioUseCases {
  return new ServicioUseCases(
    new JsonServicioRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    )
  );
}

/** Remote composition root: no JsonStore/JsonRepository for runtime reads. */
export function createRemoteServicioRepository(context: GestionApiContext): ServicioRepositoryPort {
  return new HttpServicioRepository({
    baseUrl: context.baseUrl,
    token: context.token
  });
}
