// JSON auth repository: sole JsonStore importer in the auth vertical.
//
// Brief-path mapping: the slice brief names this unit
// `adapters/json-auth-*.ts`; it lives here as `json-auth-repository.ts`
// to mirror the flat `src/server/clientes/` precedent. Composition owns
// the only backend choice (`new JsonAuthRepository(dir)`); use-cases see
// only the `AuthRepositoryPort`. Seed schemas are reused read-only from
// `server/shared/auth.ts` so document shapes cannot drift.

import { join } from "node:path";

import { createGestionError, ERROR_CODES } from "../../kernel";
import type { GestionError, Result } from "../../kernel";
import { err, ok } from "../../kernel";
import { JsonStore } from "../data/json-store";
import {
  rolePermissionsDocumentSchema,
  usersDocumentSchema,
  type RolePermissionsDocument as SharedRolePermissionsDocument,
  type UserDocument as SharedUserDocument
} from "../shared/auth";
import type {
  AuthRepositoryPort,
  AuthUserDocument,
  RolePermissionsDocument
} from "./auth-port";

function toKernelError(): GestionError {
  return createGestionError(ERROR_CODES.STORAGE_ERROR);
}

export class JsonAuthRepository implements AuthRepositoryPort {
  private readonly users: JsonStore<SharedUserDocument>;
  private readonly permissions: JsonStore<SharedRolePermissionsDocument>;

  public constructor(dataDirectory: string) {
    this.users = new JsonStore(join(dataDirectory, "users.json"), usersDocumentSchema);
    this.permissions = new JsonStore(
      join(dataDirectory, "role-permissions.json"),
      rolePermissionsDocumentSchema
    );
  }

  public async readUsers(): Promise<Result<AuthUserDocument, GestionError>> {
    const current = await this.users.read();
    if (!current.ok) return err(toKernelError());
    return ok({ users: current.value.users, version: current.value.version });
  }

  public async readPermissions(): Promise<Result<RolePermissionsDocument, GestionError>> {
    const current = await this.permissions.read();
    if (!current.ok) return err(toKernelError());
    return ok({ permissions: current.value.permissions, version: current.value.version });
  }
}
