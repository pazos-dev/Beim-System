import { z } from "zod";

import { buildMenuTree, type MenuTreeNode } from "../../lib/domain/admin/menu";
import type { BackupSummary } from "../backup/backup";
import type { GestionError } from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { MigrationPlan } from "../migration/migration";
import type { PortActor } from "../ports/actor";
import type { AdminRepositoryPort } from "../ports/admin";

export interface AdminActor extends AuthActor {
  hasGlobalAccess: boolean;
  isPrincipal: boolean;
}

export function toAdminActor(auth: AuthActor): AdminActor {
  return {
    ...auth,
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    isPrincipal: auth.role === "administrador_principal"
  };
}

export const ADMIN_ROLES: ReadonlySet<Role> = new Set(["administrador", "administrador_principal"]);

export interface MenuView {
  tree: MenuTreeNode[];
  version: number;
}

export interface RoleRow {
  actions: string[];
  actorHas: boolean[];
  role: string;
}

export interface RolesView {
  actorRole: string;
  roles: RoleRow[];
}

const restoreInputSchema = z.object({
  confirm: z.unknown(),
  id: z.string().trim().min(1).max(100)
});

const dryRunDumpSchema = z.record(z.string(), z.unknown());

function forbidden(): GestionError {
  return createGestionError(ERROR_CODES.FORBIDDEN);
}

function validationError(fields: string[]): GestionError {
  return createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields });
}

export class AdminUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: AdminRepositoryPort;

  public constructor(
    port: AdminRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async getMenu(actor: AdminActor): Promise<Result<MenuView, GestionError>> {
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    const menu = await this.port.readMenu(toPortActor(actor));
    if (!menu.ok) return err(menu.error);
    return ok({ version: menu.value.version, tree: buildMenuTree(menu.value.nodes) });
  }

  public async createNode(
    actor: AdminActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ node: MenuTreeNode; version: number }, GestionError>> {
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<{ node: MenuTreeNode; version: number }>(
      idempotencyKey,
      input,
      async () => {
        effectRan = true;
        return this.createEffect(actor, input);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "admin.menu.create", null, result);
    }
    return result;
  }

  public async moveNode(
    actor: AdminActor,
    id: unknown,
    patch: unknown,
    idempotencyKey: unknown
  ): Promise<Result<{ node: MenuTreeNode; version: number }, GestionError>> {
    if (typeof id !== "string" || id.trim() === "") {
      return err(validationError(["id"]));
    }
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    let effectRan = false;
    const result = await this.idempotency.execute<{ node: MenuTreeNode; version: number }>(
      idempotencyKey,
      { id, patch },
      async () => {
        effectRan = true;
        return this.moveEffect(actor, id, patch);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "admin.menu.move", id, result);
    }
    return result;
  }

  public async getRoles(actor: AdminActor): Promise<Result<RolesView, GestionError>> {
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    const roles = await this.port.readRoles(toPortActor(actor));
    if (!roles.ok) return err(roles.error);
    const actorActions = new Set(roles.value.permissions[actor.role] ?? []);
    return ok({
      actorRole: actor.role,
      roles: Object.entries(roles.value.permissions).map(([role, actions]) => ({
        role,
        actions,
        actorHas: actions.map((action) => actorActions.has(action))
      }))
    });
  }

  public async listBackups(actor: AdminActor): Promise<Result<BackupSummary[], GestionError>> {
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    return this.port.listBackups(toPortActor(actor));
  }

  public async triggerBackup(actor: AdminActor): Promise<Result<BackupSummary, GestionError>> {
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    // Single audit comes from the backup module (`backup.create`); no second entry here.
    return this.port.triggerBackup(actor);
  }

  public async restoreBackup(
    actor: AdminActor,
    input: unknown
  ): Promise<Result<BackupSummary, GestionError>> {
    const parsed = restoreInputSchema.safeParse(input);
    if (!parsed.success) return err(validationError(["id"]));
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    // Guard now (D4): missing/false confirm is 400 with zero writes.
    if (parsed.data.confirm !== true) return err(validationError(["confirm"]));
    const listed = await this.port.listBackups(toPortActor(actor));
    if (!listed.ok) return err(listed.error);
    if (!listed.value.some((backup) => backup.id === parsed.data.id)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    // Single audit comes from the backup module (`backup.restore`).
    return this.port.restoreBackup(actor, parsed.data.id);
  }

  public async dryRun(
    actor: AdminActor,
    dump: unknown
  ): Promise<Result<MigrationPlan, GestionError>> {
    const parsed = dryRunDumpSchema.safeParse(dump);
    if (!parsed.success) return err(validationError(["legacyDump"]));
    if (!ADMIN_ROLES.has(actor.role)) return err(forbidden());
    const planned = await this.port.dryRunPlan(toPortActor(actor), parsed.data);
    if (!planned.ok) return err(planned.error);
    if (planned.value.bloqueos.length > 0) {
      return this.auditOutcome(
        actor.id,
        "admin.migration.dry-run",
        null,
        err(
          createGestionError(
            ERROR_CODES.CONFLICT,
            { keys: planned.value.bloqueos.map((bloqueo) => bloqueo.legacyKey) },
            "Migration blocked: secret detected."
          )
        )
      );
    }
    return ok(planned.value);
  }

  private async createEffect(
    actor: AdminActor,
    input: unknown
  ): Promise<Result<{ node: MenuTreeNode; version: number }, GestionError>> {
    const created = await this.port.applyCreateNode(toPortActor(actor), input, async (hook) => {
      const appended = await this.audit.append(
        buildAuditEvent(
          { actorId: actor.id, accion: "admin.menu.create", entidad: "menu", entidadId: hook.entityId },
          "ok"
        )
      );
      if (!appended.ok) return err(appended.error);
      return ok(undefined);
    });
    if (!created.ok) return this.auditOutcome(actor.id, "admin.menu.create", null, created);
    return ok({ node: toTreeNode(created.value.node), version: created.value.document.version });
  }

  private async moveEffect(
    actor: AdminActor,
    id: string,
    patch: unknown
  ): Promise<Result<{ node: MenuTreeNode; version: number }, GestionError>> {
    const moved = await this.port.applyMoveNode(toPortActor(actor), id, patch, async (hook) => {
      const appended = await this.audit.append(
        buildAuditEvent(
          { actorId: actor.id, accion: "admin.menu.move", entidad: "menu", entidadId: hook.entityId },
          "ok"
        )
      );
      if (!appended.ok) return err(appended.error);
      return ok(undefined);
    });
    if (!moved.ok) return this.auditOutcome(actor.id, "admin.menu.move", id, moved);
    return ok({ node: toTreeNode(moved.value.node), version: moved.value.document.version });
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: accion.startsWith("admin.migration") ? "migration" : "menu", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }
}

function toPortActor(actor: AdminActor): PortActor {
  return { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
}

function toTreeNode(node: { id: string; parentId: string | null; label: string; href: string; order: number }): MenuTreeNode {
  return { ...node, children: [] };
}
