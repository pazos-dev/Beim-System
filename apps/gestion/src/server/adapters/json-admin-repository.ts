import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createBackup, listBackups, restoreBackup } from "../backup/backup";
import { JsonStore } from "../data/json-store";
import type { GestionError } from "../data/schemas";
import {
  rolePermissionsDocumentSchema,
  type AuthActor,
  type RolePermissionsDocument
} from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import { dryRun, migrationStateSchema, type MigrationPlan } from "../migration/migration";
import {
  buildMenuTree,
  createMenuStore,
  insertMenuNode,
  loadMenuDocument,
  moveMenuNode,
  type MenuDocument
} from "../../lib/domain/admin/menu";
import { mapStoreError, readOrEmpty, restoreDocument } from "../handlers/order-context";
import type { PortActor } from "../ports/actor";
import type {
  AdminAuditHook,
  AdminRepositoryPort,
  CreatedMenuNode,
  MovedMenuNode
} from "../ports/admin";

export { buildMenuTree };

function emptyMenu(): MenuDocument {
  return { version: 0, nodes: [] };
}

/**
 * JSON-backed Admin port. Menu mutations reuse the ported `menu.ts`
 * pure functions verbatim; the audit hook runs after the OCC-guarded
 * write and rolls the document back on AUDIT_FAILURE. Roles,
 * backups, and dry-run delegate to their canonical modules verbatim.
 */
export class JsonAdminRepository implements AdminRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async readMenu(_actor: PortActor): Promise<Result<MenuDocument, GestionError>> {
    return readOrEmpty(createMenuStore(this.dataDirectory), emptyMenu());
  }

  public async applyCreateNode(
    _actor: PortActor,
    input: unknown,
    audit: AdminAuditHook
  ): Promise<Result<CreatedMenuNode, GestionError>> {
    const store = createMenuStore(this.dataDirectory);
    const loaded = await loadMenuDocument(store);
    if (!loaded.ok) return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    const inserted = insertMenuNode(loaded.value, input);
    if (!inserted.ok) return err(inserted.error);
    const written = await store.write(inserted.value, loaded.value.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const node = written.value.nodes[written.value.nodes.length - 1];
    const audited = await audit({ action: "admin.menu.create", entityId: node.id });
    if (!audited.ok) {
      await restoreDocument(store, loaded.value);
      return err(audited.error);
    }
    return ok({ document: written.value, node });
  }

  public async applyMoveNode(
    _actor: PortActor,
    id: string,
    patch: unknown,
    audit: AdminAuditHook
  ): Promise<Result<MovedMenuNode, GestionError>> {
    const store = createMenuStore(this.dataDirectory);
    const loaded = await loadMenuDocument(store);
    if (!loaded.ok) return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    const moved = moveMenuNode(loaded.value, id, patch);
    if (!moved.ok) return err(moved.error);
    const written = await store.write(moved.value, loaded.value.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const node = written.value.nodes.find((candidate) => candidate.id === id);
    if (node === undefined) return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    const audited = await audit({ action: "admin.menu.move", entityId: id });
    if (!audited.ok) {
      await restoreDocument(store, loaded.value);
      return err(audited.error);
    }
    return ok({ document: written.value, node });
  }

  public async readRoles(_actor: PortActor): Promise<Result<RolePermissionsDocument, GestionError>> {
    const store = new JsonStore(join(this.dataDirectory, "role-permissions.json"), rolePermissionsDocumentSchema);
    const loaded = await store.read();
    if (!loaded.ok) return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    return ok(loaded.value);
  }

  public async listBackups(_actor: PortActor) {
    return listBackups(this.dataDirectory);
  }

  public async triggerBackup(actor: AuthActor) {
    return createBackup(this.dataDirectory, actor);
  }

  public async restoreBackup(actor: AuthActor, id: string) {
    return restoreBackup(this.dataDirectory, actor, id);
  }

  public async dryRunPlan(_actor: PortActor, dump: unknown): Promise<Result<MigrationPlan, GestionError>> {
    // Read-only: migration-state.json is read for reporting only, never written.
    let estado = "bloqueado";
    try {
      const raw = await readFile(join(this.dataDirectory, "migration-state.json"), "utf8");
      estado = migrationStateSchema.parse(JSON.parse(raw) as unknown).estado;
    } catch {
      estado = "bloqueado";
    }
    return ok(dryRun(dump, estado));
  }
}
