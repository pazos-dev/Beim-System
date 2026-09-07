/**
 * Users admin services (issue #85).
 *
 * Thin rules over usersRepository: 404 translation for unknown ids and the
 * closed webshop role list (cliente/admin/superadmin, mirroring the
 * users_role_check constraint in schema.sql) enforced BEFORE touching the DB
 * so an invalid role surfaces as 422 instead of a constraint violation.
 */
import { NotFoundError, ValidationError } from "../../../errors/taxonomy.js";
import type { AuditLogActor } from "../ports.js";
import { auditLogsRepository } from "../repositories/pg-audit-logs.js";
import {
  usersRepository,
  type PublicUser,
  type UsersListFilter
} from "../repositories/pg-users.js";

const ALLOWED_ROLES = ["cliente", "admin", "superadmin"] as const;

export type WebshopRole = (typeof ALLOWED_ROLES)[number];

function isAllowedRole(role: string): role is WebshopRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role);
}

export const usersService = {
  listUsers(filter: UsersListFilter = {}): Promise<{
    items: PublicUser[];
    total: number;
    page: number;
    limit: number;
  }> {
    return usersRepository.list(filter);
  },

  async approveUser(id: string, actor: AuditLogActor = {}): Promise<PublicUser> {
    const user = await usersRepository.approve(id);
    if (user === null) throw new NotFoundError(`Usuario no encontrado: ${id}`);
    // Audit journal (issue #97): best-effort, never masks the admin outcome.
    await journalUserAction("user.approve", id, actor).catch(() => undefined);
    return user;
  },

  async setUserRole(id: string, role: string, actor: AuditLogActor = {}): Promise<PublicUser> {
    if (!isAllowedRole(role)) {
      throw new ValidationError("Rol inválido", [
        { path: "role", message: `Rol inválido: debe ser uno de ${ALLOWED_ROLES.join(", ")}` }
      ]);
    }
    const user = await usersRepository.setRole(id, role);
    if (user === null) throw new NotFoundError(`Usuario no encontrado: ${id}`);
    await journalUserAction("user.role", id, actor, { role }).catch(() => undefined);
    return user;
  },

  async disableUser(id: string, actor: AuditLogActor = {}): Promise<PublicUser> {
    const user = await usersRepository.disable(id);
    if (user === null) throw new NotFoundError(`Usuario no encontrado: ${id}`);
    await journalUserAction("user.disable", id, actor).catch(() => undefined);
    return user;
  }
};

async function journalUserAction(
  action: string,
  userId: string,
  actor: AuditLogActor,
  extra: Record<string, string> = {}
): Promise<void> {
  await auditLogsRepository.insert({
    actorUserId: actor.actorUserId ?? null,
    actorRole: actor.actorRole ?? null,
    action,
    entityType: "user",
    entityId: userId,
    details: { userId, ...extra }
  });
}
