import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { z } from "zod";

import { auditDocumentSchema } from "../data/schemas";
import { JsonStore } from "../data/json-store";
import { AuditRepository, buildAuditEvent } from "./audit";
import { createGestionError, ERROR_CODES } from "./errors";
import {
  createSessionCookieValue,
  isLoginBypassActive,
  isSessionCookieFormatValid,
  SESSION_MAX_AGE_SECONDS
} from "./session";
import { err, ok, type Result } from "./result";

export const ROLE_VALUES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal"
] as const;

const roleSchema = z.enum(ROLE_VALUES);
const userSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  credential: z.string().min(1),
  displayName: z.string().min(1),
  role: roleSchema,
  active: z.boolean()
});

export const usersDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  users: z.array(userSchema)
});

export const rolePermissionsDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  permissions: z.record(z.string(), z.array(z.string().min(1)))
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  credential: z.string().min(1).max(200).optional(),
  password: z.string().min(1).max(200).optional()
}).refine((input) => input.credential ?? input.password, {
  path: ["credential"],
  error: "A credential is required."
});

const authorizationSchema = z.object({
  action: z.string().trim().min(1).max(100),
  actorId: z.string().optional(),
  role: roleSchema.optional()
});

export type UserDocument = z.infer<typeof usersDocumentSchema>;
export type RolePermissionsDocument = z.infer<typeof rolePermissionsDocumentSchema>;
export type Role = (typeof ROLE_VALUES)[number];

export interface AuthActor {
  id: string;
  username: string;
  displayName: string;
  role: Role;
}

interface SessionRecord {
  actor: AuthActor;
  expiresAt: number;
}

export interface IssuedSession {
  actor: AuthActor;
  cookieValue: string;
}

const sessions = new Map<string, SessionRecord>();

function publicActor(user: UserDocument["users"][number]): AuthActor {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

export function authenticate(input: unknown, document: UserDocument): Result<AuthActor, ReturnType<typeof createGestionError>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
  }

  const credential = parsed.data.credential ?? parsed.data.password;
  const user = document.users.find(
    (candidate) => candidate.username === parsed.data.username && candidate.credential === credential
  );
  if (!user?.active) {
    return err(createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED));
  }

  return ok(publicActor(user));
}

export function authorizeAction(
  actor: AuthActor,
  requestedActor: unknown,
  document: RolePermissionsDocument,
  action: string
): Result<AuthActor, ReturnType<typeof createGestionError>> {
  void requestedActor;
  if (!document.permissions[actor.role]?.includes(action)) {
    return err(createGestionError(ERROR_CODES.FORBIDDEN, { action }));
  }

  return ok(actor);
}

function issueSession(actor: AuthActor, now = new Date()): IssuedSession {
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  sessions.set(token, { actor, expiresAt: expiresAt.getTime() });
  return { actor, cookieValue: createSessionCookieValue(token, expiresAt) };
}

const DEV_BYPASS_ACTOR: AuthActor = {
  id: "dev-bypass",
  username: "administrador_principal",
  displayName: "Dev Bypass",
  role: "administrador_principal"
};

function tokenFromCookie(cookieValue: string): string | null {
  const [, , token, ...extra] = cookieValue.split(".");
  return token && extra.length === 0 ? token : null;
}

export function resolveSession(cookieValue: string | undefined, now = new Date()): AuthActor | null {
  const bypassFallback = isLoginBypassActive() ? DEV_BYPASS_ACTOR : null;
  if (!cookieValue || !isSessionCookieFormatValid(cookieValue, now)) {
    return bypassFallback;
  }

  const token = tokenFromCookie(cookieValue);
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expiresAt <= now.getTime()) {
    if (token) sessions.delete(token);
    return bypassFallback;
  }

  return session.actor;
}

export function clearSessionsForTests(): void {
  sessions.clear();
}

export class AuthService {
  private readonly users: JsonStore<UserDocument>;
  private readonly permissions: JsonStore<RolePermissionsDocument>;
  private readonly audit: AuditRepository;

  public constructor(dataDirectory = process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data")) {
    this.users = new JsonStore(join(dataDirectory, "users.json"), usersDocumentSchema);
    this.permissions = new JsonStore(join(dataDirectory, "role-permissions.json"), rolePermissionsDocumentSchema);
    this.audit = new AuditRepository(
      new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema)
    );
  }

  private async load(): Promise<Result<{
    users: UserDocument;
    permissions: RolePermissionsDocument;
  }, ReturnType<typeof createGestionError>>> {
    const [users, permissions] = await Promise.all([this.users.read(), this.permissions.read()]);
    if (!users.ok || !permissions.ok) {
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    return ok({ users: users.value, permissions: permissions.value });
  }

  private async record(
    actorId: string | null,
    accion: string,
    resultado: "ok" | keyof typeof ERROR_CODES
  ): Promise<Result<undefined, ReturnType<typeof createGestionError>>> {
    const result = await this.audit.append(buildAuditEvent({
      actorId,
      accion,
      entidad: "session",
      entidadId: null
    }, resultado));
    return result.ok ? ok(undefined) : err(result.error);
  }

  private async denied(
    actorId: string | null,
    accion: string,
    code: keyof typeof ERROR_CODES
  ): Promise<Result<never, ReturnType<typeof createGestionError>>> {
    const recorded = await this.record(actorId, accion, code);
    return recorded.ok ? err(createGestionError(code)) : err(recorded.error);
  }

  public async login(input: unknown): Promise<Result<IssuedSession, ReturnType<typeof createGestionError>>> {
    const loaded = await this.load();
    if (!loaded.ok) return loaded;

    const actor = authenticate(input, loaded.value.users);
    if (!actor.ok) return this.denied(null, "auth.login", actor.error.code);

    const recorded = await this.record(actor.value.id, "auth.login", "ok");
    return recorded.ok ? ok(issueSession(actor.value)) : err(recorded.error);
  }

  public async session(cookieValue: string | undefined): Promise<Result<AuthActor, ReturnType<typeof createGestionError>>> {
    const actor = resolveSession(cookieValue);
    return actor ? ok(actor) : this.denied(null, "auth.session", ERROR_CODES.AUTHENTICATION_REQUIRED);
  }

  public async authorize(
    cookieValue: string | undefined,
    input: unknown
  ): Promise<Result<AuthActor, ReturnType<typeof createGestionError>>> {
    const actor = resolveSession(cookieValue);
    if (!actor) return this.denied(null, "auth.authorize", ERROR_CODES.AUTHENTICATION_REQUIRED);

    const parsed = authorizationSchema.safeParse(input);
    if (!parsed.success) return this.denied(actor.id, "auth.authorize", ERROR_CODES.VALIDATION_ERROR);

    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const authorized = authorizeAction(actor, input, loaded.value.permissions, parsed.data.action);
    if (!authorized.ok) return this.denied(actor.id, "auth.authorize", authorized.error.code);

    const recorded = await this.record(actor.id, "auth.authorize", "ok");
    return recorded.ok ? authorized : err(recorded.error);
  }

  public async logout(cookieValue: string | undefined): Promise<Result<AuthActor, ReturnType<typeof createGestionError>>> {
    const actor = resolveSession(cookieValue);
    if (!actor) return this.denied(null, "auth.logout", ERROR_CODES.AUTHENTICATION_REQUIRED);

    const recorded = await this.record(actor.id, "auth.logout", "ok");
    if (!recorded.ok) return err(recorded.error);
    const token = cookieValue ? tokenFromCookie(cookieValue) : null;
    if (token) sessions.delete(token);
    return ok(actor);
  }
}
