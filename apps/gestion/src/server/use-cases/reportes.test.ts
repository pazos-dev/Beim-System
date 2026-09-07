import { describe, expect, it } from "vitest";

import { buildPeriodSnapshot, snapshotToCsv } from "../../lib/domain/reports/reports";
import type { GestionError } from "../data/schemas";
import { ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ReporteMovements, ReporteRepositoryPort } from "../ports/reporte";
import { ReporteUseCases, type ReporteActor } from "./reportes";

function actor(id: string, role: ReporteActor["role"], hasGlobalAccess: boolean): ReporteActor {
  return { hasGlobalAccess, id, role };
}

const CAJA = actor("u-mine", "caja", false);
const ADMIN = actor("u-admin", "administrador", true);
const QUERY = { desde: "2026-01-01", hasta: "2026-01-31", formato: "json" as const};

class StubReporteRepository implements ReporteRepositoryPort {
  public async getSnapshot(actor: PortActor): Promise<Result<ReporteMovements, GestionError>> {
    const seed: ReporteMovements = {
      ventas: [
        {
          id: "v_1",
          ownerId: "u-mine",
          version: 1,
          numero: "0001-000001",
          items: [{ productoId: "p_1", cantidad: 1, precio: 1000 }],
          pagos: [{ metodo: "efectivo", monto: 1000 }],
          total: 1000,
          estado: "confirmada"
        },
        {
          id: "v_2",
          ownerId: "u-other",
          version: 1,
          numero: "0001-000002",
          items: [{ productoId: "p_1", cantidad: 1, precio: 500 }],
          pagos: [{ metodo: "efectivo", monto: 500 }],
          total: 500,
          estado: "confirmada"
        },
        {
          id: "v_3",
          ownerId: "u-mine",
          version: 1,
          numero: "0001-000003",
          items: [{ productoId: "p_1", cantidad: 1, precio: 200 }],
          pagos: [{ metodo: "efectivo", monto: 200 }],
          total: 200,
          estado: "devuelta"
        }
      ],
      compras: [
        {
          id: "c_1",
          ownerId: "u-mine",
          version: 1,
          productoId: "p_1",
          proveedor: "Prov",
          cantidad: 1,
          costoUnitario: 400,
          fecha: "2026-01-10T12:00:00.000Z",
          total: 400
        }
      ],
      gastos: [
        {
          id: "g_1",
          ownerId: "u-mine",
          version: 1,
          descripcion: "Insumo",
          importe: 100,
          fecha: "2026-01-05T12:00:00.000Z",
          categoria: "operativo",
          medio: "efectivo"
        },
        {
          id: "g_2",
          ownerId: "u-mine",
          version: 1,
          descripcion: "Insumo",
          importe: 200,
          fecha: "2026-01-20T12:00:00.000Z",
          categoria: "operativo",
          medio: "efectivo"
        }
      ]
    };
    const visible = <T extends { ownerId: string }>(items: T[]): T[] =>
      items.filter((item) => actor.hasGlobalAccess || item.ownerId === actor.id);
    return ok({ ventas: visible(seed.ventas), compras: visible(seed.compras), gastos: visible(seed.gastos) });
  }
}

function useCases(): ReporteUseCases {
  return new ReporteUseCases(new StubReporteRepository());
}

describe("ReporteUseCases.getSnapshot", () => {
  it("rejects inverted periods with VALIDATION_ERROR", async () => {
    const read = await useCases().getSnapshot(CAJA, { ...QUERY, desde: "2026-02-01", hasta: "2026-01-01" });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed dates with VALIDATION_ERROR", async () => {
    const read = await useCases().getSnapshot(CAJA, { ...QUERY, desde: "01-01-2026" });
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.error.code).toBe("VALIDATION_ERROR");
  });

  it("denies vendedor and tecnico with FORBIDDEN", async () => {
    for (const role of ["vendedor", "tecnico"] as const) {
      const read = await useCases().getSnapshot(actor("u-x", role, false), QUERY);
      expect(read.ok).toBe(false);
      if (read.ok) continue;
      expect(read.error.code).toBe("FORBIDDEN");
    }
  });

  it("scopes caja to own items (netas 800, neto 500)", async () => {
    const read = await useCases().getSnapshot(CAJA, QUERY);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.snapshot.ventas.netas).toBe(800);
    expect(read.value.snapshot.compras.total).toBe(400);
    expect(read.value.snapshot.gastos.total).toBe(300);
    expect(read.value.snapshot.neto).toBe(500);
    expect(read.value.formato).toBe("json");
  });

  it("shows every document to global roles and matches buildPeriodSnapshot verbatim", async () => {
    const read = await useCases().getSnapshot(ADMIN, QUERY);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.snapshot.ventas.netas).toBe(1300);
    const port = new StubReporteRepository();
    const movements = await port.getSnapshot({ id: ADMIN.id, hasGlobalAccess: true });
    if (!movements.ok) throw new Error("Expected movements.");
    expect(read.value.snapshot).toEqual(
      buildPeriodSnapshot({ desde: QUERY.desde, hasta: QUERY.hasta, ...movements.value })
    );
  });

  it("serializes CSV through snapshotToCsv verbatim", async () => {
    const read = await useCases().getSnapshot(CAJA, QUERY);
    if (!read.ok) throw new Error("Expected snapshot.");
    expect(useCases().toCsv(read.value.snapshot)).toBe(snapshotToCsv(read.value.snapshot));
  });
});
