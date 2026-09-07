import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { buildPeriodSnapshot, snapshotToCsv } from "../../lib/domain/reports/reports";
import type { Compra, Gasto, GestionError, Venta } from "../data/schemas";
import { ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ReporteMovements, ReporteRepositoryPort } from "../ports/reporte";
import { JsonReporteRepository } from "./json-reporte-repository";

const DESDE = "2026-01-01";
const HASTA = "2026-01-31";

function ventaFixture(id: string, ownerId: string, estado: Venta["estado"], total: number): Venta {
  return {
    id,
    ownerId,
    version: 1,
    numero: `0001-${id}`,
    items: [{ productoId: "p_1", cantidad: 1, precio: total }],
    pagos: [{ metodo: "efectivo", monto: total }],
    total,
    estado
  };
}

function compraFixture(id: string, ownerId: string, fecha: string, total: number): Compra {
  return {
    id,
    ownerId,
    version: 1,
    productoId: "p_1",
    proveedor: "Prov",
    cantidad: 1,
    costoUnitario: total,
    fecha,
    total
  };
}

function gastoFixture(
  id: string,
  ownerId: string,
  fecha: string,
  importe: number,
  categoria: string
): Gasto {
  return {
    id,
    ownerId,
    version: 1,
    descripcion: "Insumo",
    importe,
    fecha,
    categoria,
    medio: "efectivo"
  };
}

function fullSeed(): ReporteMovements {
  return {
    ventas: [
      ventaFixture("v_1", "u-mine", "confirmada", 1000),
      ventaFixture("v_2", "u-other", "confirmada", 500),
      ventaFixture("v_3", "u-mine", "anulada", 999),
      ventaFixture("v_4", "u-mine", "devuelta", 200)
    ],
    compras: [
      compraFixture("c_1", "u-mine", "2026-01-10T12:00:00.000Z", 400),
      compraFixture("c_2", "u-other", "2026-01-12T12:00:00.000Z", 100),
      compraFixture("c_3", "u-mine", "2026-02-01T12:00:00.000Z", 777)
    ],
    gastos: [
      gastoFixture("g_1", "u-mine", "2026-01-05T12:00:00.000Z", 100, "operativo"),
      gastoFixture("g_2", "u-mine", "2026-01-20T12:00:00.000Z", 200, "administracion"),
      gastoFixture("g_3", "u-other", "2026-01-06T12:00:00.000Z", 50, "operativo"),
      gastoFixture("g_4", "u-mine", "2026-02-01T12:00:00.000Z", 999, "operativo")
    ]
  };
}

function seedDocs(seed: ReporteMovements): Record<string, unknown> {
  return {
    "ventas.json": { version: 0, ventas: seed.ventas },
    "compras.json": { version: 0, compras: seed.compras },
    "gastos.json": { version: 0, gastos: seed.gastos }
  };
}

/** In-memory second implementation so the suite proves the port, not the adapter. */
class StubReporteRepository implements ReporteRepositoryPort {
  private readonly seed = fullSeed();

  private visible<T extends { ownerId: string }>(actor: PortActor, items: T[]): T[] {
    return items.filter((item) => actor.hasGlobalAccess || item.ownerId === actor.id);
  }

  public async getSnapshot(actor: PortActor): Promise<Result<ReporteMovements, GestionError>> {    return ok({
      ventas: this.visible(actor, this.seed.ventas),
      compras: this.visible(actor, this.seed.compras),
      gastos: this.visible(actor, this.seed.gastos)
    });
  }
}

async function runContractSuite(name: string, makePort: () => Promise<ReporteRepositoryPort>) {
  describe(name, () => {
    it("scopes caja-own versus global reads", async () => {
      const port = await makePort();
      const mine = await port.getSnapshot({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      expect(mine.value.ventas.map((venta) => venta.id).sort()).toEqual(["v_1", "v_3", "v_4"]);
      expect(mine.value.compras.map((compra) => compra.id).sort()).toEqual(["c_1", "c_3"]);
      expect(mine.value.gastos.map((gasto) => gasto.id).sort()).toEqual(["g_1", "g_2", "g_4"]);
      const global = await port.getSnapshot({ id: "u-admin", hasGlobalAccess: true });
      expect(global.ok).toBe(true);
      if (!global.ok) return;
      expect(global.value.ventas.length).toBe(4);
      expect(global.value.compras.length).toBe(3);
      expect(global.value.gastos.length).toBe(4);
    });

    it("feeds buildPeriodSnapshot verbatim (netas 800, neto 500)", async () => {
      const port = await makePort();
      const mine = await port.getSnapshot({ id: "u-mine", hasGlobalAccess: false });
      expect(mine.ok).toBe(true);
      if (!mine.ok) return;
      const snapshot = buildPeriodSnapshot({ desde: DESDE, hasta: HASTA, ...mine.value });
      expect(snapshot.ventas.netas).toBe(800);
      expect(snapshot.ventas.cantidad).toBe(1);
      expect(snapshot.ventas.devoluciones).toBe(200);
      expect(snapshot.compras.total).toBe(400);
      expect(snapshot.compras.cantidad).toBe(1);
      expect(snapshot.gastos.total).toBe(300);
      expect(snapshot.neto).toBe(500);
    });

    it("reads empty over missing stores and unknown owners", async () => {
      const port = await makePort();
      void port;
      const emptyDir = await mkdtemp(join(tmpdir(), "gestion-reporte-empty-"));
      jsonDirs.push(emptyDir);
      const empty = new JsonReporteRepository(emptyDir);
      const snapshot = await empty.getSnapshot({ id: "u-ghost", hasGlobalAccess: false });
      expect(snapshot.ok).toBe(true);
      if (!snapshot.ok) return;
      expect(snapshot.value).toEqual({ ventas: [], compras: [], gastos: [] });
      const aggregated = buildPeriodSnapshot({ desde: DESDE, hasta: HASTA, ...snapshot.value });
      expect(aggregated.ventas.netas).toBe(0);
      expect(aggregated.neto).toBe(0);
    });

    it("fails closed with STORAGE_ERROR on corrupt stores", async () => {
      const directory = await mkdtemp(join(tmpdir(), "gestion-reporte-corrupt-"));
      jsonDirs.push(directory);
      const seed = fullSeed();
      await writeFile(join(directory, "ventas.json"), "{ corrupt");
      await writeFile(join(directory, "compras.json"), JSON.stringify({ version: 0, compras: seed.compras }));
      await writeFile(join(directory, "gastos.json"), JSON.stringify({ version: 0, gastos: seed.gastos }));
      const port = new JsonReporteRepository(directory);
      const snapshot = await port.getSnapshot({ id: "u-admin", hasGlobalAccess: true });
      expect(snapshot.ok).toBe(false);
      if (snapshot.ok) return;
      expect(snapshot.error.code).toBe("STORAGE_ERROR");
    });
  });
}

const jsonDirs: string[] = [];

runContractSuite("JsonReporteRepository contract", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gestion-reporte-contract-"));
  jsonDirs.push(directory);
  for (const [file, doc] of Object.entries(seedDocs(fullSeed()))) {
    await writeFile(join(directory, file), JSON.stringify(doc));
  }
  return new JsonReporteRepository(directory);
});

runContractSuite("StubReporteRepository contract", async () => new StubReporteRepository());

afterAll(async () => {
  await Promise.all(jsonDirs.map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("snapshotToCsv byte pin", () => {
  it("pins BOM, quoted ; cells, CRLF, sorted categories and fixed row order", () => {
    const port = new StubReporteRepository();
    return port
      .getSnapshot({ id: "u-mine", hasGlobalAccess: false })
      .then((mine) => {
        if (!mine.ok) throw new Error("Expected scoped movements.");
        const snapshot = buildPeriodSnapshot({ desde: DESDE, hasta: HASTA, ...mine.value });
        const first = snapshotToCsv(snapshot);
        expect(snapshotToCsv(snapshot)).toBe(first);
        expect(first.startsWith("\ufeff")).toBe(true);
        const body = first.replace(/^\ufeff/, "");
        expect(body.endsWith("\r\n")).toBe(true);
        expect(body.replaceAll("\r\n", "")).not.toContain("\n");
        const lines = body.replace(/\r\n$/, "").split("\r\n");
        expect(lines[0]).toBe('"periodo_desde";"2026-01-01"');
        expect(lines[2]).toBe('"ventas_netas";"800"');
        expect(lines[8]).toBe('"neto";"500"');
        expect(lines[9]).toBe("");
        expect(lines[10]).toBe('"gasto_categoria";"total"');
        expect(lines.slice(11)).toEqual(['"administracion";"200"', '"operativo";"100"']);
        for (const line of lines) {
          if (line === "") continue;
          for (const cell of line.split(";")) {
            expect(cell.startsWith('"') && cell.endsWith('"')).toBe(true);
          }
        }
      });
  });

  it("renders header only when porCategoria is empty", () => {
    const snapshot = buildPeriodSnapshot({ desde: DESDE, hasta: HASTA, ventas: [], compras: [], gastos: [] });
    const csv = snapshotToCsv(snapshot).replace(/^\ufeff/, "").replace(/\r\n$/, "").split("\r\n");
    expect(csv.at(-1)).toBe('"gasto_categoria";"total"');
  });
});
