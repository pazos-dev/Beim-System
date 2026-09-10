/**
 * User aggregate (domain slice, change `clean-arch-domain`).
 *
 * Pure refactor of `domain-entities.md` v3 §1: `User` roots children
 * `Client` (webshop profile) and `Session` (infrastructure detail: token
 * hash + expiry, one active per user). Framework-free: no I/O, no hashing,
 * no token minting — `passwordHash` and raw tokens never cross into here.
 * Aggregates are immutable values; every behavior returns a new copy.
 */
import { ValidationError } from "../shared/errors.js";
import { createUserId, isRole, type Clock, type Role, type UserId } from "../shared/types.js";

/** Console identity (`gestion_users`); webshop identity links via `webUserId`. */
export interface User {
  readonly id: UserId;
  readonly username: string;
  readonly name: string;
  readonly role: Role;
  readonly active: boolean;
  readonly webUserId: UserId | null;
  readonly lastLoginAt: Date | null;
}

export interface CreateUserInput {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly role: string;
  readonly webUserId?: string | null;
}

function cleanName(value: string, field: string): string {
  const cleaned = value.trim();
  if (cleaned === "") {
    throw new ValidationError(`Nombre de usuario inválido: ${field} no puede estar vacío`, { field });
  }
  return cleaned;
}

function cleanRole(value: string): Role {
  if (!isRole(value)) {
    throw new ValidationError("Rol inválido: fuera del conjunto cerrado", { value });
  }
  return value;
}

export function createUser(input: CreateUserInput): User {
  return {
    id: createUserId(input.id),
    username: cleanName(input.username, "username"),
    name: cleanName(input.name, "name"),
    role: cleanRole(input.role),
    active: true,
    webUserId: input.webUserId == null ? null : createUserId(input.webUserId),
    lastLoginAt: null
  };
}

export function activateUser(user: User): User {
  return { ...user, active: true };
}

export function changeUserRole(user: User, role: string): User {
  return { ...user, role: cleanRole(role) };
}

export function linkWebUser(user: User, webUserId: string | null): User {
  return { ...user, webUserId: webUserId == null ? null : createUserId(webUserId) };
}

/** Webshop profile hung off the `users` row for role `cliente`. */
export interface Client {
  readonly id: UserId;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly ci: string | null;
  readonly rut: string | null;
  readonly isApproved: boolean;
}

export interface CreateClientInput {
  readonly id: string;
  readonly name: string;
  readonly email?: string | null;
  readonly phone?: string | null;
}

export function createClient(input: CreateClientInput): Client {
  return {
    id: createUserId(input.id),
    name: cleanName(input.name, "name"),
    email: input.email ?? null,
    phone: input.phone ?? null,
    ci: null,
    rut: null,
    isApproved: false
  };
}

export function renameClient(client: Client, name: string): Client {
  return { ...client, name: cleanName(name, "name") };
}

export interface DocumentReassignment {
  readonly ci: string | null;
  readonly rut: string | null;
}

export function reassignClientDocument(client: Client, doc: DocumentReassignment): Client {
  return { ...client, ci: doc.ci, rut: doc.rut };
}

export function approveClient(client: Client): Client {
  return { ...client, isApproved: true };
}

/** Session detail: stored hash + expiry. Revocation is explicit state. */
export interface Session {
  readonly tokenHash: string;
  readonly userId: UserId;
  readonly expiresAt: Date;
  readonly revoked: boolean;
}

export interface CreateSessionInput {
  readonly tokenHash: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export function createSession(input: CreateSessionInput): Session {
  if (input.tokenHash.trim() === "") {
    throw new ValidationError("Sesión inválida: el hash del token no puede estar vacío", {});
  }
  return {
    tokenHash: input.tokenHash,
    userId: createUserId(input.userId),
    expiresAt: input.expiresAt,
    revoked: false
  };
}

export function revokeSession(session: Session): Session {
  return { ...session, revoked: true };
}

export function isSessionExpired(session: Session, clock: Clock): boolean {
  return session.revoked || session.expiresAt <= clock.now();
}

export interface Deactivation {
  readonly user: User;
  readonly sessions: Session[];
}

/**
 * `deactivate()` revokes every session owned by the user and flips
 * `active` off. Sessions of other users pass through untouched.
 */
export function deactivateUser(user: User, sessions: Session[]): Deactivation {
  return {
    user: { ...user, active: false },
    sessions: sessions.map((session) =>
      session.userId === user.id ? revokeSession(session) : session
    )
  };
}
