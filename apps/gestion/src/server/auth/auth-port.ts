// Auth repository port (kernel Result boundary).
//
// Brief-path mapping: the slice brief names this contract
// `ports/auth-*.ts`; the flat `src/server/auth/*` layout mirrors the
// existing `src/server/clientes/` precedent, so the port lives here as
// `auth-port.ts`. Only `json-auth-repository.ts` (plus composition)
// touches persistence for auth.

import type { GestionError, Result, Role } from "../../kernel";

export interface AuthUser {
  readonly id: string;
  readonly username: string;
  readonly credential: string;
  readonly displayName: string;
  readonly role: Role;
  readonly active: boolean;
}

export interface AuthUserDocument {
  readonly version: number;
  readonly users: readonly AuthUser[];
}

export interface RolePermissionsDocument {
  readonly version: number;
  readonly permissions: Readonly<Record<string, readonly string[]>>;
}

export interface AuthRepositoryPort {
  readUsers(): Promise<Result<AuthUserDocument, GestionError>>;
  readPermissions(): Promise<Result<RolePermissionsDocument, GestionError>>;
}
