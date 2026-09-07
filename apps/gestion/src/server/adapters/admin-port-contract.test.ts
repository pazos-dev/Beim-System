import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { MenuDocument } from "../../lib/domain/admin/menu";
import type { RolePermissionsDocument } from "../handlers/auth";
import type { AuthActor } from "../handlers/auth";
import type { GestionError } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type {
  AdminAuditHook,
  AdminRepositoryPort,
  CreatedMenuNode,
  MovedMenuNode
} from "../ports/admin";
import { JsonAdminRepository } from "./json-admin-repository";

const ACTOR: PortActor = { hasGlobalAccess: true, id: "u-admin" };

const ROLES_SEED: RolePermissionsDocument = {
  version: 1,
  permissions: {
    vendedor: ["orders.create"],
    administrador: ["orders.create", "backups.manage"],
    administrador_principal: ["orders.create", "backups.manage", "permissions.manage"]
  }
};

function okHook(counter: { calls: number }): AdminAuditHook {
  return async () => {
    counter.calls += 1;
    return ok(undefined);
  };
}

/** In-memory second implementation so the suite proves the port, not the adapter. */
class StubAdminRepository implements AdminRepositoryPort {
  private menu: MenuDocument = { version: 0, nodes: [] };
  private readonly roles: RolePermissionsDocument = structuredClone(ROLES_SEED);

  public async readMenu(_actor: PortActor) {
    return ok(structuredClone(this.menu));
  }

  public async applyCreateNode(
    _actor: PortActor,
    input: unknown,
    audit: AdminAuditHook
  ): Promise<Result<CreatedMenuNode, GestionError>> {
    const parsed = input as { label?: unknown; href?: unknown; parentId?: unknown };
    if (typeof parsed?.label !== "string" || parsed.label.trim() === "" || typeof parsed?.href !== "string" || parsed.href.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["label"] }));
    }
    const node = {
      id: `m_stub_${this.menu.nodes.length + 1}`,
      parentId: null,
      label: parsed.label,
      href: parsed.href,
      order: this.menu.nodes.length
    };
    const next: MenuDocument = { version: this.menu.version + 1, nodes: [...this.menu.nodes, node] };
    this.menu = next;
    const created: CreatedMenuNode = { document: structuredClone(next), node };
    const audited = await audit({ action: "admin.menu.create", entityId: node.id });
    if (!audited.ok) {
      this.menu = { version: next.version, nodes: next.nodes.slice(0, -1) };
      return err(audited.error);
    }
    return ok(created);
  }

  public async applyMoveNode(
    _actor: PortActor,
    id: string,
    patch: unknown,
    audit: AdminAuditHook
  ): Promise<Result<MovedMenuNode, GestionError>> {
    const body = patch as { expectedVersion?: unknown; order?: unknown };
    if (typeof body?.expectedVersion !== "number" || body.expectedVersion !== this.menu.version) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    const target = this.menu.nodes.find((node) => node.id === id);
    if (target === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    const next: MenuDocument = {
      version: this.menu.version + 1,
      nodes: this.menu.nodes.map((node) =>
        node.id === id ? { ...node, order: typeof body.order === "number" ? body.order : node.order } : { ...node }
      )
    };
    this.menu = next;
    const moved: MovedMenuNode = {
      document: structuredClone(next),
      node: next.nodes.find((node) => node.id === id) as MovedMenuNode["node"]
    };
    const audited = await audit({ action: "admin.menu.move", entityId: id });
    if (!audited.ok) {
      return err(audited.error);
    }
    return ok(moved);
  }

  public async readRoles(_actor: PortActor) {
    return ok(structuredClone(this.roles));
  }

  public async listBackups(_actor: PortActor) {
    return ok([]);
  }

  public async triggerBackup(actor: AuthActor) {
    void actor;
    return ok({ id: "b_stub", instante: new Date().toISOString(), actorId: "u-admin", files: 0 });
  }

  public async restoreBackup(actor: AuthActor, id: string) {
    void actor;
    void id;
    return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
  }

  public async dryRunPlan(_actor: PortActor, _dump: unknown) {
    return ok({ mappings: [], ambiguos: [], bloqueos: [], estado: "bloqueado" });
  }
}

async function runContractSuite(name: string, makePort: () => Promise<AdminRepositoryPort>) {
  describe(name, () => {
    it("reads an empty menu as version 0 with no nodes", async () => {
      const port = await makePort();
      const menu = await port.readMenu(ACTOR);
      expect(menu.ok).toBe(true);
      if (!menu.ok) return;
      expect(menu.value.version).toBe(0);
      expect(menu.value.nodes).toEqual([]);
    });

    it("creates a node through the audit hook (menu tree grows, version bumps)", async () => {
      const port = await makePort();
      const counter = { calls: 0 };
      const created = await port.applyCreateNode(
        ACTOR,
        { label: "Hijo", href: "/app/hijo", parentId: null },
        okHook(counter)
      );
      expect(created.ok).toBe(true);
      expect(counter.calls).toBe(1);
      if (!created.ok) return;
      expect(created.value.document.version).toBe(1);
      expect(created.value.node.label).toBe("Hijo");
      const reloaded = await port.readMenu(ACTOR);
      expect(reloaded.ok && reloaded.value.nodes.length).toBe(1);
    });

    it("rejects a stale move with CONFLICT and zero writes (hook never runs)", async () => {
      const port = await makePort();
      const counter = { calls: 0 };
      const created = await port.applyCreateNode(
        ACTOR,
        { label: "Raiz", href: "/app", parentId: null },
        okHook({ calls: 0 })
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const stale = await port.applyMoveNode(
        ACTOR,
        created.value.node.id,
        { order: 0, expectedVersion: created.value.document.version - 1 },
        okHook(counter)
      );
      expect(stale.ok).toBe(false);
      if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
      expect(counter.calls).toBe(0);
      const reloaded = await port.readMenu(ACTOR);
      expect(reloaded.ok && reloaded.value.version).toBe(created.value.document.version);
    });

    it("rolls back the create when the audit hook fails", async () => {
      const port = await makePort();
      const created = await port.applyCreateNode(
        ACTOR,
        { label: "Efervescente", href: "/app/x", parentId: null },
        async () => err(createGestionError(ERROR_CODES.AUDIT_FAILURE))
      );
      expect(created.ok).toBe(false);
      const reloaded = await port.readMenu(ACTOR);
      expect(reloaded.ok && reloaded.value.nodes.length).toBe(0);
    });

    it("reads the roles mapping document", async () => {
      const port = await makePort();
      const roles = await port.readRoles(ACTOR);
      expect(roles.ok).toBe(true);
      if (!roles.ok) return;
      expect(roles.value.permissions["administrador"]).toContain("backups.manage");
      expect(roles.value.permissions["vendedor"]).toEqual(["orders.create"]);
    });

    it("lists backups (empty store yields no entries)", async () => {
      const port = await makePort();
      const listed = await port.listBackups(ACTOR);
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.value).toEqual([]);
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonAdminRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-admin-contract-"));
  jsonDirs.push(directory);
  await writeFile(join(directory, "role-permissions.json"), JSON.stringify(ROLES_SEED), "utf8");
  return new JsonAdminRepository(directory);
});

runContractSuite("StubAdminRepository contract", async () => new StubAdminRepository());

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonAdminRepository).toBeDefined();
    expect(StubAdminRepository).toBeDefined();
  });
});
