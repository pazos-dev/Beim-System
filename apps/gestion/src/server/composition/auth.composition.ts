// Auth composition: the sole backend choice for the auth vertical.
//
// `const repository: AuthRepositoryPort = new JsonAuthRepository(dir)`
// below is the only place that decides how auth documents are stored;
// use-cases and controllers stay persistence-agnostic. Mirrors
// `src/server/composition/clientes.ts` (read-only).

import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema } from "../data/schemas";
import { AuditRepository } from "../shared/audit";
import { AuthController } from "../auth/auth-controller";
import { AuthUseCases } from "../auth/auth-use-cases";
import type { AuthRepositoryPort } from "../auth/auth-port";
import { JsonAuthRepository } from "../auth/json-auth-repository";

export function createAuthUseCases(dataDirectory: string): AuthUseCases {
  const repository: AuthRepositoryPort = new JsonAuthRepository(dataDirectory);
  return new AuthUseCases({
    audit: new AuditRepository(new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)),
    dataDirectory,
    repository
  });
}

export function createAuthController(dataDirectory: string): AuthController {
  return new AuthController(createAuthUseCases(dataDirectory));
}
