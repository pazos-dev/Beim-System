import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { SesionCaja } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { CajaRepositoryPort, CajaAuditHook } from "../ports/caja";
import { JsonCajaRepository } from "./json-caja-repository";

function cajaFixture(id: string, ownerId: string, estado: SesionCaja["estado"], fecha: string): SesionCaja {
  return {
    id,
    ownerId,
    version: 1,
    fecha,
    apertura: 1000,
    esperado: 1000,
    contado: 0,
    diferencia: 0,
    estado
  };
}

function fullSeed(): SesionCaja[] {
  return [
    cajaFixture("sc_1", "u-mine", "abierta", "2026-01-15"),
    cajaFixture("sc_2", "u-other", "cerrada", "2026-01-14"),
    cajaFixture("sc_3", "u-mine", "cerrada", "2026-01-13")
  ];
}

function seedDocs(sesiones: SesionCaja[]): Record<string, unknown> {
  return {
    "sesiones-caja.json": { version: 1, sesionesCaja: sesiones },
    "ventas.json": { version: 0, ventas: [] },
    "gastos.json": { version: 0, gastos: [] }
  };
}

/** In-memory second implementation so the suite proves the port, not the adapter. */
class StubCajaRepository implements CajaRepositoryPort {
  private readonly sesiones = new Map<string, SesionCaja>([
    ["sc_1", cajaFixture("sc_1", "u-mine", "abierta", "2026-01-15")],
    ["sc_2", cajaFixture("sc_2", "u-other", "cerrada", "2026-01-14")],
    ["sc_3", cajaFixture("sc_3", "u-mine", "cerrada", "2026-01-13")]
  ]);

  public async list(actor: PortActor) {
    return ok(
      Array.from(this.sesiones.values()).filter(
        (sesion) => actor.hasGlobalAccess || sesion.ownerId === actor.id
      )
    );
  }

  public async findAbierta(actor: PortActor) {
    return ok(
      Array.from(this.sesiones.values()).find(
        (sesion) => sesion.estado === "abierta" && (actor.hasGlobalAccess || sesion.ownerId === actor.id)
      ) ?? null
    );
  }

  public async getById(actor: PortActor, id: string) {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const found = this.sesiones.get(id);
    if (found === undefined || (!actor.hasGlobalAccess && found.ownerId !== actor.id)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async readMovements(actor: PortActor) {
    void actor;
    return ok({ ventas: [], gastos: [] });
  }

  public async applyAbrir(actor: PortActor, input: { fecha: string; apertura: number }, audit: CajaAuditHook) {
    const open = Array.from(this.sesiones.values()).find(
      (sesion) => sesion.estado === "abierta" && (actor.hasGlobalAccess || sesion.ownerId === actor.id)
    );
    if (open !== undefined) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["fecha"] }));
    }
    const persisted: SesionCaja = {
      id: `sc_stub_${input.fecha}`,
      ownerId: actor.id,
      version: 1,
      fecha: input.fecha,
      apertura: input.apertura,
      esperado: input.apertura,
      contado: 0,
      diferencia: 0,
      estado: "abierta"
    };
    this.sesiones.set(persisted.id, persisted);
    const audited = await audit(persisted);
    if (!audited.ok) {
      this.sesiones.delete(persisted.id);
      return audited;
    }
    return ok(persisted);
  }

  public async applyCerrar(actor: PortActor, input: { contado: number; retiros: number }, audit: CajaAuditHook) {
    const open = Array.from(this.sesiones.values()).find(
      (sesion) => sesion.estado === "abierta" && (actor.hasGlobalAccess || sesion.ownerId === actor.id)
    );
    if (open === undefined) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    const persisted: SesionCaja = {
      ...open,
      esperado: open.apertura - input.retiros,
      contado: input.contado,
      diferencia: input.contado - (open.apertura - input.retiros),
      estado: "cerrada",
      cierre: new Date().toISOString(),
      version: open.version + 1
    };
    this.sesiones.set(persisted.id, persisted);
    const audited = await audit(persisted);
    if (!audited.ok) {
      this.sesiones.set(open.id, open);
      return audited;
    }
    return ok(persisted);
  }
}

async function runContractSuite(name: string, makePort: () => Promise<CajaRepositoryPort>) {
  describe(name, () => {
    it("lists only visible sessions (per-owner filter, global admin sees all)", async () => {
      const port = await makePort();
      const mine = await port.list({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.value.map((sesion) => sesion.id).sort()).toEqual(["sc_1", "sc_3"]);
      const global = await port.list({ id: "u-admin", hasGlobalAccess: true });
      expect(global.ok && global.value.length).toBe(3);
    });

    it("finds the open session per owner and globally for admins", async () => {
      const port = await makePort();
      const mine = await port.findAbierta({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok && mine.value?.id).toBe("sc_1");
      const other = await port.findAbierta({ id: "u-other", hasGlobalAccess: false });
      expect(other.ok).toBe(true);
      if (!other.ok) return;
      // u-other owns only a closed session, so no open session is visible.
      expect(other.value).toBeNull();
      const global = await port.findAbierta({ id: "u-admin", hasGlobalAccess: true });
      expect(global.ok && global.value?.id).toBe("sc_1");
    });

    it("returns NOT_FOUND_OR_FORBIDDEN for unknown ids and foreign sessions", async () => {
      const port = await makePort();
      const missing = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "missing");
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
      const foreign = await port.getById({ id: "u-mine", hasGlobalAccess: false }, "sc_2");
      expect(foreign.ok).toBe(false);
      if (!foreign.ok) expect(foreign.error.code).toBe("NOT_FOUND_OR_FORBIDDEN");
    });

    it("blocks a second opening with CONFLICT (single-open invariant)", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      let audited = 0;
      const second = await port.applyAbrir(
        actor,
        { fecha: "2026-01-16", apertura: 500 },
        async () => {
          audited += 1;
          return ok(undefined);
        }
      );
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.error.code).toBe("CONFLICT");
      // Zero writes: the audit hook never runs on conflict.
      expect(audited).toBe(0);
      const listed = await port.list(actor);
      expect(listed.ok && listed.value.length).toBe(2);
    });

    it("persists openings through the audit hook", async () => {
      const port = await makePort();
      const actor = { id: "u-fresh", hasGlobalAccess: false };
      let audited = 0;
      const created = await port.applyAbrir(
        actor,
        { fecha: "2026-01-16", apertura: 500 },
        async () => {
          audited += 1;
          return ok(undefined);
        }
      );
      expect(created.ok).toBe(true);
      expect(audited).toBe(1);
      if (!created.ok) return;
      expect(created.value.ownerId).toBe("u-fresh");
      expect(created.value.version).toBe(1);
      const found = await port.getById(actor, created.value.id);
      expect(found.ok).toBe(true);
    });

    it("rolls back the opening when the audit hook fails", async () => {
      const port = await makePort();
      const actor = { id: "u-rollback", hasGlobalAccess: false };
      const created = await port.applyAbrir(
        actor,
        { fecha: "2026-01-16", apertura: 500 },
        async () => err(createGestionError(ERROR_CODES.AUDIT_FAILURE))
      );
      expect(created.ok).toBe(false);
      const listed = await port.list(actor);
      expect(listed.ok && listed.value.length).toBe(0);
    });

    it("rejects closing with none open (CONFLICT, zero writes)", async () => {
      const port = await makePort();
      const actor = { id: "u-nobody", hasGlobalAccess: false };
      let audited = 0;
      const closed = await port.applyCerrar(
        actor,
        { contado: 100, retiros: 0 },
        async () => {
          audited += 1;
          return ok(undefined);
        }
      );
      expect(closed.ok).toBe(false);
      if (!closed.ok) expect(closed.error.code).toBe("CONFLICT");
      // Zero writes: the audit hook never runs on conflict.
      expect(audited).toBe(0);
    });

    it("closes the open session with esperado-vs-contado from the cash domain", async () => {
      const port = await makePort();
      const actor = { id: "u-mine", hasGlobalAccess: false };
      const closed = await port.applyCerrar(
        actor,
        { contado: 1150, retiros: 0 },
        async () => ok(undefined)
      );
      expect(closed.ok).toBe(true);
      if (!closed.ok) return;
      expect(closed.value.id).toBe("sc_1");
      expect(closed.value.estado).toBe("cerrada");
      expect(closed.value.esperado).toBe(1000);
      expect(closed.value.contado).toBe(1150);
      expect(closed.value.diferencia).toBe(150);
      expect(closed.value.version).toBe(2);
      expect(closed.value.cierre).toBeDefined();
      const found = await port.getById(actor, "sc_1");
      expect(found.ok && found.value.estado).toBe("cerrada");
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonCajaRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-caja-contract-"));
  jsonDirs.push(directory);
  const docs = seedDocs(fullSeed());
  for (const [file, doc] of Object.entries(docs)) {
    await writeFile(join(directory, file), JSON.stringify(doc), "utf8");
  }
  return new JsonCajaRepository(directory);
});

runContractSuite("StubCajaRepository contract", async () => new StubCajaRepository());

afterAll(async () => {
  for (const directory of jsonDirs) await rm(directory, { force: true, recursive: true });
});

describe("contract suite wiring", () => {
  it("registers both implementations", () => {
    expect(JsonCajaRepository).toBeDefined();
    expect(StubCajaRepository).toBeDefined();
  });
});
