import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { MenuDocument } from "../../lib/domain/admin/menu";
import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { AuditRepository } from "../handlers/audit";
import type { AuthActor } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import type { Role } from "../handlers/auth";
import { err, ok, type Result } from "../handlers/result";
import { IdempotencyService } from "../handlers/idempotency";
import { dryRun } from "../migration/migration";
import type { PortActor } from "../ports/actor";
import type {
  AdminAuditHook,
  AdminRepositoryPort,
  CreatedMenuNode,
  MovedMenuNode
} from "../ports/admin";
import type { GestionError } from "../data/schemas";
import { AdminUseCases, toAdminActor, type AdminActor } from "./admin";

const ROLES_DOC = {
  version: 1,
  permissions: {
    vendedor: ["orders.create"],
    administrador: ["orders.create", "backups.manage"],
    administrador_principal: ["orders.create", "backups.manage", "permissions.manage"]
  }
};

function authActor(id: string, role: Role): AuthActor {
  return { id, username: role, displayName: role, role };
}

/** In-memory port with OCC + audit-hook semantics (mirrors the Json adapter). */
class StubAdminRepository implements AdminRepositoryPort {
  public menu: MenuDocument = { version: 0, nodes: [] };
  public hookCalls = 0;

  public async readMenu(_actor: PortActor) {
    return ok(structuredClone(this.menu));
  }

  public async applyCreateNode(
    _actor: PortActor,
    input: unknown,
    audit: AdminAuditHook
  ): Promise<Result<CreatedMenuNode, GestionError>> {
    const body = input as { label?: unknown; href?: unknown };
    if (typeof body?.label !== "string" || body.label.trim() === "" || typeof body?.href !== "string" || body.href.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["label"] }));
    }
    const node = { id: `m_stub_${this.menu.nodes.length + 1}`, parentId: null, label: body.label, href: body.href, order: this.menu.nodes.length };
    const next: MenuDocument = { version: this.menu.version + 1, nodes: [...this.menu.nodes, node] };
    this.menu = next;
    this.hookCalls += 1;
    const audited = await audit({ action: "admin.menu.create", entityId: node.id });
    if (!audited.ok) {
      this.menu = { version: next.version, nodes: next.nodes.slice(0, -1) };
      return err(audited.error);
    }
    return ok({ document: structuredClone(next), node });
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
    this.hookCalls += 1;
    const audited = await audit({ action: "admin.menu.move", entityId: id });
    if (!audited.ok) return err(audited.error);
    return ok({ document: structuredClone(next), node: next.nodes.find((node) => node.id === id) as MovedMenuNode["node"] });
  }

  public async readRoles(_actor: PortActor) {
    return ok(structuredClone(ROLES_DOC));
  }

  public async listBackups(_actor: PortActor) {
    return ok([]);
  }

  public async triggerBackup(actor: AuthActor) {
    return ok({ id: "b_stub", instante: new Date().toISOString(), actorId: actor.id, files: 0 });
  }

  public async restoreBackup(_actor: AuthActor, _id: string) {
    return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
  }

  public async dryRunPlan(_actor: PortActor, dump: unknown) {
    return ok(dryRun(dump, "bloqueado"));
  }
}

let directory = "";
let useCases: AdminUseCases;
let stub: StubAdminRepository;
let admin: AdminActor;
let vendedor: AdminActor;

async function auditEvents(): Promise<Array<{ accion: string; resultado: unknown }>> {
  const raw = JSON.parse(await readFile(join(directory, "audit.json"), "utf8") as string) as {
    events: Array<{ accion: string; resultado: unknown }>;
  };
  return raw.events;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "gestion-admin-usecase-"));
  await writeFile(join(directory, "audit.json"), JSON.stringify({ version: 0, events: [] }), "utf8");
  stub = new StubAdminRepository();
  useCases = new AdminUseCases(
    stub,
    new AuditRepository(new JsonStore(join(directory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema))
  );
  admin = toAdminActor(authActor("u-admin", "administrador"));
  vendedor = toAdminActor(authActor("u-vendedor", "vendedor"));
});

afterAll(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("AdminUseCases gates (ADM-1/2/6)", () => {
  it("maps session roles to admin actors (principal flagged)", () => {
    expect(toAdminActor(authActor("u-p", "administrador_principal")).isPrincipal).toBe(true);
    expect(admin.isPrincipal).toBe(false);
    expect(admin.hasGlobalAccess).toBe(true);
  });

  it("forbids non-admin roles silently (zero writes, no audit)", async () => {
    const before = await auditEvents();
    const beforeNodes = stub.menu.nodes.length;
    expect((await useCases.getMenu(vendedor)).ok).toBe(false);
    for (const outcome of [
      await useCases.createNode(vendedor, { label: "X", href: "/x" }, "k-forbid-1"),
      await useCases.getRoles(vendedor),
      await useCases.listBackups(vendedor),
      await useCases.dryRun(vendedor, {})
    ]) {
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.code).toBe("FORBIDDEN");
    }
    expect(stub.menu.nodes.length).toBe(beforeNodes);
    expect(await auditEvents()).toEqual(before);
  });

  it("requires an idempotency key on menu writes (missing key is 400)", async () => {
    const missing = await useCases.createNode(admin, { label: "X", href: "/x" }, undefined);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("AdminUseCases menu idempotency + OCC (ADM-1/6)", () => {
  it("creates once, replays the same key, and rejects key reuse with a new payload (409 audited)", async () => {
    const first = await useCases.createNode(admin, { label: "Replay", href: "/replay" }, "k-replay-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const hooksAfterFirst = stub.hookCalls;
    const replay = await useCases.createNode(admin, { label: "Replay", href: "/replay" }, "k-replay-1");
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.node.id).toBe(first.value.node.id);
    expect(stub.hookCalls).toBe(hooksAfterFirst);
    const diff = await useCases.createNode(admin, { label: "Changed", href: "/replay" }, "k-replay-1");
    expect(diff.ok).toBe(false);
    if (!diff.ok) expect(diff.error.code).toBe("CONFLICT");
    const conflicts = (await auditEvents()).filter((event) => event.accion === "admin.menu.create");
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects stale moves with CONFLICT (audited, zero writes)", async () => {
    const created = await useCases.createNode(admin, { label: "Move", href: "/move" }, "k-move-1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const version = created.value.version;
    const stale = await useCases.moveNode(admin, created.value.node.id, { order: 0, expectedVersion: version - 1 }, "k-stale-1");
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe("CONFLICT");
    const fresh = await useCases.moveNode(admin, created.value.node.id, { order: 0, expectedVersion: version }, "k-fresh-1");
    expect(fresh.ok).toBe(true);
  });

  it("returns NOT_FOUND_OR_FORBIDDEN for unknown menu ids", async () => {
    const menu = await useCases.getMenu(admin);
    expect(menu.ok).toBe(true);
    if (!menu.ok) return;
    const moved = await useCases.moveNode(admin, "m_missing", { order: 0, expectedVersion: menu.value.version }, "k-missing-1");
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });
});

describe("AdminUseCases roles/backups/recovery/dry-run (ADM-2/4/5)", () => {
  it("returns the roles mapping with actorHas for admins", async () => {
    const roles = await useCases.getRoles(admin);
    expect(roles.ok).toBe(true);
    if (!roles.ok) return;
    expect(roles.value.actorRole).toBe("administrador");
    const row = roles.value.roles.find((candidate) => candidate.role === "administrador");
    expect(row?.actions).toContain("backups.manage");
    expect(row?.actorHas).toEqual(row?.actions.map(() => true));
  });

  it("guards recovery with confirm=true (missing/false is 400, zero writes)", async () => {
    for (const body of [{ id: "b_stub" }, { id: "b_stub", confirm: false }, { id: "b_stub", confirm: "yes" }]) {
      const denied = await useCases.restoreBackup(admin, body);
      expect(denied.ok).toBe(false);
      if (!denied.ok) expect(denied.error.code).toBe("VALIDATION_ERROR");
    }
    const unknown = await useCases.restoreBackup(admin, { id: "b_missing", confirm: true });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
  });

  it("dry-runs without writes and blocks secrets with CONFLICT", async () => {
    const plan = await useCases.dryRun(admin, { "sistema-gestion-menu-v1": { version: 1 } });
    expect(plan.ok).toBe(true);
    const blocked = await useCases.dryRun(admin, { api_key: "sk-test" });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("CONFLICT");
  });
});
