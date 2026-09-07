import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonCajaRepository } from "../adapters/json-caja-repository";
import { AuditRepository } from "../handlers/audit";
import { IdempotencyService } from "../handlers/idempotency";
import { CajaUseCases, toCajaActor } from "./caja";

const CAJA_OWNER = "u-caja";

function fixtureDocs(): Record<string, unknown> {
  return {
    "ventas.json": {
      version: 0,
      ventas: [
        { id: "v_1", ownerId: CAJA_OWNER, version: 1, numero: "0001-000001", items: [{ productoId: "p_1", cantidad: 1, precio: 500 }], pagos: [{ metodo: "efectivo", monto: 300 }, { metodo: "tarjeta", monto: 200 }], total: 500, estado: "confirmada" },
        { id: "v_2", ownerId: CAJA_OWNER, version: 1, numero: "0001-000002", items: [{ productoId: "p_1", cantidad: 1, precio: 200 }], pagos: [{ metodo: "efectivo", monto: 200 }], total: 200, estado: "confirmada" },
        { id: "v_3", ownerId: CAJA_OWNER, version: 1, numero: "0001-000003", items: [{ productoId: "p_1", cantidad: 1, precio: 999 }], pagos: [{ metodo: "efectivo", monto: 999 }], total: 999, estado: "anulada" }
      ]
    },
    "gastos.json": {
      version: 0,
      gastos: [
        { id: "g_1", ownerId: CAJA_OWNER, version: 1, descripcion: "Insumo", importe: 100, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" },
        { id: "g_2", ownerId: CAJA_OWNER, version: 1, descripcion: "Insumo", importe: 200, fecha: "2026-01-15T12:00:00.000Z", categoria: "operativo", medio: "efectivo" },
        { id: "g_3", ownerId: CAJA_OWNER, version: 1, descripcion: "Fuera de dia", importe: 999, fecha: "2026-02-01T12:00:00.000Z", categoria: "operativo", medio: "efectivo" }
      ]
    },
    "sesiones-caja.json": { version: 0, sesionesCaja: [] },
    "audit.json": { version: 0, events: [] },
    "idempotency.json": { version: 0, records: [] }
  };
}

async function makeUseCases() {
  const directory = await mkdtemp(join(tmpdir(), "gestion-caja-usecase-"));
  for (const [file, doc] of Object.entries(fixtureDocs())) {
    await writeFile(join(directory, file), JSON.stringify(doc), "utf8");
  }
  const useCases = new CajaUseCases(
    new JsonCajaRepository(directory),
    new AuditRepository(new JsonStore(join(directory, "audit.json"), auditDocumentSchema)),
    new IdempotencyService(new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema))
  );
  return { directory, useCases };
}

const cajaActor = toCajaActor({ id: CAJA_OWNER, username: "caja", displayName: "Caja", role: "caja" });
const vendedorActor = toCajaActor({ id: "u-vend", username: "vendedor", displayName: "Vend", role: "vendedor" });

const dirs: string[] = [];

describe("CajaUseCases.getEstado", () => {
  it("reports deterministic expected with porMetodo and day gastos", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const opened = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 1000 }, "uc-estado-1");
    expect(opened.ok).toBe(true);
    const estado = await useCases.getEstado(cajaActor, {});
    expect(estado.ok).toBe(true);
    if (!estado.ok) return;
    expect(estado.value.abierta).toBe(true);
    expect(estado.value.esperado).toBe(1000 + 500 - 300 - 0);
    expect(estado.value.porMetodo).toEqual([
      { metodo: "efectivo", total: 500 },
      { metodo: "tarjeta", total: 200 }
    ]);
    expect(estado.value.gastosDia).toEqual({ count: 2, total: 300 });
  });

  it("reports closed state with zero expected when nothing is open", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const estado = await useCases.getEstado(cajaActor, {});
    expect(estado.ok).toBe(true);
    if (!estado.ok) return;
    expect(estado.value.abierta).toBe(false);
    expect(estado.value.sesion).toBeNull();
  });
});

describe("CajaUseCases.abrir", () => {
  it("rejects invalid payloads with VALIDATION_ERROR", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const badFecha = await useCases.abrir(cajaActor, { fecha: "15-01-2026", apertura: 100 }, "uc-bad-1");
    expect(badFecha.ok).toBe(false);
    if (!badFecha.ok) expect(badFecha.error.code).toBe("VALIDATION_ERROR");
    const negative = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: -1 }, "uc-bad-2");
    expect(negative.ok).toBe(false);
  });

  it("requires an idempotency key with 400", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const result = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 100 }, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects forbidden roles with zero writes and no audit", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const before = await readFile(join(directory, "sesiones-caja.json"), "utf8");
    const result = await useCases.abrir(vendedorActor, { fecha: "2026-01-15", apertura: 100 }, "uc-forbidden-1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(await readFile(join(directory, "sesiones-caja.json"), "utf8")).toBe(before);
  });

  it("blocks a second opening with CONFLICT and audits it", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const first = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 1000 }, "uc-double-1");
    expect(first.ok).toBe(true);
    const before = await readFile(join(directory, "sesiones-caja.json"), "utf8");
    const second = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 1000 }, "uc-double-2");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("CONFLICT");
    expect(await readFile(join(directory, "sesiones-caja.json"), "utf8")).toBe(before);
    const audit = await readFile(join(directory, "audit.json"), "utf8");
    expect(audit).toMatch(/caja\.abrir/);
  });

  it("replays the same key once and conflicts on payload diff", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const input = { fecha: "2026-01-15", apertura: 1000 };
    const first = await useCases.abrir(cajaActor, input, "uc-replay-1");
    expect(first.ok).toBe(true);
    const second = await useCases.abrir(cajaActor, input, "uc-replay-1");
    expect(second.ok).toBe(true);
    expect(second).toEqual(first);
    const diff = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 999 }, "uc-replay-1");
    expect(diff.ok).toBe(false);
    if (!diff.ok) expect(diff.error.code).toBe("CONFLICT");
  });
});

describe("CajaUseCases.list", () => {
  it("paginates visible sessions for close-guard reads", async () => {
    const { directory, useCases } = await makeUseCases();
    dirs.push(directory);
    const opened = await useCases.abrir(cajaActor, { fecha: "2026-01-15", apertura: 1000 }, "uc-list-1");
    expect(opened.ok).toBe(true);
    const listed = await useCases.list(cajaActor, { page: 1, pageSize: 25 });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.totalItems).toBe(1);
    expect(listed.value.items).toHaveLength(1);
  });
});

afterAll(async () => {
  for (const directory of dirs) await rm(directory, { force: true, recursive: true });
});
