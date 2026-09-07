/**
 * Console-users admin service (issue #155).
 *
 * Thin rules over gestionUsersRepository: 404 translation for unknown ids and
 * the closed console role list (vendedor/tecnico/caja/administrador/
 * administrador_principal, mirroring the operator roles in router.ts)
 * enforced BEFORE touching the DB so an invalid role surfaces as 422 instead
 * of a constraint violation. Passwords follow the webshop policy (enforced at
 * the zod boundary with the byte-identical refine); the hash never leaves the
 * repository layer. `gestionLogin` in webshop/services/auth.ts is untouched —
 * it keeps reading the same rows this service writes.
 */
import { NotFoundError, ValidationError } from "../../../errors/taxonomy.js";
import { hashPassword } from "../../webshop/services/auth.js";
import type { AuditLogActor } from "../ports.js";
import { auditLogsRepository } from "../repositories/pg-audit-logs.js";
import {
  gestionUsersRepository,
  type GestionUsersFilter,
  type PublicGestionUser
} from "../repositories/pg-gestion-users.js";

const ALLOWED_GESTION_ROLES = ["vendedor", "tecnico", "caja", "administrador", "administrador_principal"] as const;

export type GestionRole = (typeof ALLOWED_GESTION_ROLES)[number];

function isAllowedGestionRole(role: string): role is GestionRole {
  return (ALLOWED_GESTION_ROLES as readonly string[]).includes(role);
}

function invalidRoleError(): ValidationError {
  return new ValidationError("Rol inválido", [
    { path: "role", message: `Rol inválido: debe ser uno de ${ALLOWED_GESTION_ROLES.join(", ")}` }
  ]);
}

export const gestionUsersService = {
  listGestionUsers(filter: GestionUsersFilter = {}): Promise<{
    items: PublicGestionUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    return gestionUsersRepository.list(filter);
  },

  /**
   * Creates the console user, or null when the username is already taken
   * (anti-enumeration: the router still answers 201 with `{ user: null }`).
   */
  async createGestionUser(
    input: {
      username: string;
      name: string;
      password: string;
      role: string;
    },
    actor: AuditLogActor = {}
  ): Promise<PublicGestionUser | null> {
    const username = input.username.trim();
    if (username === "") {
      throw new ValidationError("username requerido", [{ path: "username", message: "username requerido" }]);
    }
    if (!isAllowedGestionRole(input.role)) throw invalidRoleError();
    const passwordHash = await hashPassword(input.password);
    const created = await gestionUsersRepository.create({
      username,
      name: input.name,
      passwordHash,
      role: input.role
    });
    if (created !== null) {
      await journalGestionUserAction("gestion-user.create", created.id, actor).catch(() => undefined);
    }
    return created;
  },

  async setGestionUserRole(id: string, role: string, actor: AuditLogActor = {}): Promise<PublicGestionUser> {
    if (!isAllowedGestionRole(role)) throw invalidRoleError();
    const user = await gestionUsersRepository.setRole(id, role);
    if (user === null) throw new NotFoundError(`Usuario de consola no encontrado: ${id}`);
    await journalGestionUserAction("gestion-user.role", id, actor, { role }).catch(() => undefined);
    return user;
  },

  async setGestionUserActive(id: string, active: boolean, actor: AuditLogActor = {}): Promise<PublicGestionUser> {
    const user = await gestionUsersRepository.setActive(id, active);
    if (user === null) throw new NotFoundError(`Usuario de consola no encontrado: ${id}`);
    await journalGestionUserAction("gestion-user.active", id, actor, { active: String(active) }).catch(
      () => undefined
    );
    return user;
  },

  async resetGestionUserPassword(
    id: string,
    password: string,
    actor: AuditLogActor = {}
  ): Promise<PublicGestionUser> {
    const passwordHash = await hashPassword(password);
    const user = await gestionUsersRepository.resetPassword(id, passwordHash);
    if (user === null) throw new NotFoundError(`Usuario de consola no encontrado: ${id}`);
    // Never journal the password itself — the action + id is the audit trail.
    await journalGestionUserAction("gestion-user.password", id, actor).catch(() => undefined);
    return user;
  }
};

async function journalGestionUserAction(
  action: string,
  userId: string,
  actor: AuditLogActor,
  extra: Record<string, string> = {}
): Promise<void> {
  await auditLogsRepository.insert({
    actorUserId: actor.actorUserId ?? null,
    actorRole: actor.actorRole ?? null,
    action,
    entityType: "gestion_user",
    entityId: userId,
    details: { userId, ...extra }
  });
};
