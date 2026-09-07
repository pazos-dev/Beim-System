import type { BackupSummary } from "../backup/backup";
import type { GestionError } from "../data/schemas";
import type { AuthActor } from "../handlers/auth";
import type { Result } from "../handlers/result";
import type { MigrationPlan } from "../migration/migration";
import type { MenuDocument, MenuNode } from "../../lib/domain/admin/menu";
import type { RolePermissionsDocument } from "../handlers/auth";
import type { PortActor } from "./actor";

/**
 * Audit hook executed by the adapter AFTER persisting a menu mutation
 * but BEFORE returning success. When the hook fails, the adapter rolls
 * back the persisted step and returns the hook error (AUDIT_FAILURE).
 */
export type AdminAuditHook = (
  info: { action: string; entityId: string | null }
) => Promise<Result<undefined, GestionError>>;

export interface CreatedMenuNode {
  document: MenuDocument;
  node: MenuNode;
}

export interface MovedMenuNode {
  document: MenuDocument;
  node: MenuNode;
}

/**
 * Admin seam port (PR-A1a). Single façade over the menu, roles,
 * backups, and migration dry-run stores (D2). Menu pure functions are
 * reused verbatim; backup mutations keep their canonical `backup.*`
 * single audit inside the backup module, so the port takes no hook
 * for them. Reads never audit.
 */
export interface AdminRepositoryPort {
  readMenu(actor: PortActor): Promise<Result<MenuDocument, GestionError>>;
  applyCreateNode(
    actor: PortActor,
    input: unknown,
    audit: AdminAuditHook
  ): Promise<Result<CreatedMenuNode, GestionError>>;
  applyMoveNode(
    actor: PortActor,
    id: string,
    patch: unknown,
    audit: AdminAuditHook
  ): Promise<Result<MovedMenuNode, GestionError>>;
  readRoles(actor: PortActor): Promise<Result<RolePermissionsDocument, GestionError>>;
  listBackups(actor: PortActor): Promise<Result<BackupSummary[], GestionError>>;
  triggerBackup(actor: AuthActor): Promise<Result<BackupSummary, GestionError>>;
  restoreBackup(actor: AuthActor, id: string): Promise<Result<BackupSummary, GestionError>>;
  dryRunPlan(actor: PortActor, dump: unknown): Promise<Result<MigrationPlan, GestionError>>;
}
