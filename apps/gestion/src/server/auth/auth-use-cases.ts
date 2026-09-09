// Pure auth use-cases: same signatures and behavior as `AuthService`
// (`server/shared/auth.ts`, read-only), with I/O only through injected
// boundaries (repository port, audit repository, frozen session helpers).
//
// Brief-path mapping: the slice brief names this unit
// `use-cases/auth-*.ts`; it lives here as `auth-use-cases.ts` to mirror
// the flat `src/server/clientes/` precedent.

import { createGestionError, ERROR_CODES, err, ok } from "../../kernel";
import type { GestionError, Result } from "../../kernel";
import { AuditRepository, buildAuditEvent } from "../shared/audit";
import {
  authenticate,
  authorizationSchema,
  authorizeAction,
  issueSession,
  resolveSession,
  revokeSessionToken,
  type AuthActor,
  type IssuedSession,
  type RolePermissionsDocument as SharedRolePermissionsDocument,
  type UserDocument as SharedUserDocument
} from "../shared/auth";
import type { AuthRepositoryPort, AuthUserDocument, RolePermissionsDocument } from "./auth-port";

export interface AuthUseCaseDeps {
  readonly repository: AuthRepositoryPort;
  readonly audit: AuditRepository;
  readonly dataDirectory: string;
}

interface LoadedDocuments {
  readonly users: AuthUserDocument;
  readonly permissions: RolePermissionsDocument;
}

type AuditOutcome = "ok" | keyof typeof ERROR_CODES;

function toSharedUsers(document: AuthUserDocument): SharedUserDocument {
  return { users: [...document.users], version: document.version };
}

function toSharedPermissions(document: RolePermissionsDocument): SharedRolePermissionsDocument {
  const permissions: Record<string, string[]> = {};
  for (const [role, actions] of Object.entries(document.permissions)) {
    permissions[role] = [...actions];
  }
  return { permissions, version: document.version };
}

export class AuthUseCases {
  private readonly repository: AuthRepositoryPort;
  private readonly audit: AuditRepository;
  private readonly dataDirectory: string;

  public constructor(deps: AuthUseCaseDeps) {
    this.repository = deps.repository;
    this.audit = deps.audit;
    this.dataDirectory = deps.dataDirectory;
  }

  private async load(): Promise<Result<LoadedDocuments, GestionError>> {
    const [users, permissions] = await Promise.all([
      this.repository.readUsers(),
      this.repository.readPermissions()
    ]);
    if (!users.ok) return err(users.error);
    if (!permissions.ok) return err(permissions.error);
    return ok({ permissions: permissions.value, users: users.value });
  }

  private async record(
    actorId: string | null,
    accion: string,
    resultado: AuditOutcome
  ): Promise<Result<undefined, GestionError>> {
    const result = await this.audit.append(
      buildAuditEvent({ accion, actorId, entidad: "session", entidadId: null }, resultado)
    );
    return result.ok ? ok(undefined) : err(result.error);
  }

  private async denied(
    actorId: string | null,
    accion: string,
    code: keyof typeof ERROR_CODES
  ): Promise<Result<never, GestionError>> {
    const recorded = await this.record(actorId, accion, code);
    return recorded.ok ? err(createGestionError(code)) : err(recorded.error);
  }

  public async login(input: unknown): Promise<Result<IssuedSession, GestionError>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;

    const actor = authenticate(input, toSharedUsers(loaded.value.users));
    if (!actor.ok) return this.denied(null, "auth.login", actor.error.code);

    const recorded = await this.record(actor.value.id, "auth.login", "ok");
    return recorded.ok ? ok(issueSession(actor.value, this.dataDirectory)) : err(recorded.error);
  }

  public async session(
    cookieValue: string | undefined
  ): Promise<Result<AuthActor, GestionError>> {
    const actor = resolveSession(cookieValue);
    return actor ? ok(actor) : this.denied(null, "auth.session", ERROR_CODES.AUTHENTICATION_REQUIRED);
  }

  public async authorize(
    cookieValue: string | undefined,
    input: unknown
  ): Promise<Result<AuthActor, GestionError>> {
    const actor = resolveSession(cookieValue);
    if (!actor) return this.denied(null, "auth.authorize", ERROR_CODES.AUTHENTICATION_REQUIRED);

    const parsed = authorizationSchema.safeParse(input);
    if (!parsed.success) return this.denied(actor.id, "auth.authorize", ERROR_CODES.VALIDATION_ERROR);

    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const authorized = authorizeAction(
      actor,
      input,
      toSharedPermissions(loaded.value.permissions),
      parsed.data.action
    );
    if (!authorized.ok) return this.denied(actor.id, "auth.authorize", authorized.error.code);

    const recorded = await this.record(actor.id, "auth.authorize", "ok");
    return recorded.ok ? authorized : err(recorded.error);
  }

  public async logout(
    cookieValue: string | undefined
  ): Promise<Result<AuthActor, GestionError>> {
    const actor = resolveSession(cookieValue);
    if (!actor) return this.denied(null, "auth.logout", ERROR_CODES.AUTHENTICATION_REQUIRED);

    const recorded = await this.record(actor.id, "auth.logout", "ok");
    if (!recorded.ok) return err(recorded.error);
    revokeSessionToken(cookieValue, this.dataDirectory);
    return ok(actor);
  }
}
