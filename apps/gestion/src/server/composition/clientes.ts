import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonClienteRepository } from "../clientes/json-cliente-repository";
import { HttpClienteRepository } from "../clientes/http-cliente-repository";
import { AuditRepository } from "../shared/audit";
import { IdempotencyService } from "../shared/idempotency";
import { ClienteUseCases } from "../clientes/clientes-use-cases";
import type { GestionApiContext } from "../api/gestion-api-context";
import type { ClienteRepositoryPort } from "../clientes/cliente-port";

/** Local composition root kept for existing isolated unit tests. */
export function createClienteUseCases(dataDirectory: string): ClienteUseCases {
  return new ClienteUseCases(
    new JsonClienteRepository(dataDirectory),
    new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(
      new JsonStore(join(dataDirectory, "idempotency.json"), idempotencyDocumentSchema)
    )
  );
}

/** Remote composition root: no JsonStore/JsonRepository for runtime reads. */
export function createRemoteClienteRepository(context: GestionApiContext): ClienteRepositoryPort {
  return new HttpClienteRepository({
    baseUrl: context.baseUrl,
    token: context.token
  });
}
