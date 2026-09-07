import { join } from "node:path";

import { JsonStore, type VersionedDocument } from "../data/json-store";
import {
  comprasDocumentSchema,
  gastosDocumentSchema,
  ventasDocumentSchema,
  type Compra,
  type Gasto,
  type GestionError,
  type Venta
} from "../data/schemas";
import { readOrEmpty } from "../handlers/order-context";
import { ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ReporteMovements, ReporteRepositoryPort } from "../ports/reporte";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

type VentasDocument = { version: number; ventas: Venta[] };
type ComprasDocument = { version: number; compras: Compra[] };
type GastosDocument = { version: number; gastos: Gasto[] };

export class JsonReporteRepository implements ReporteRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async getSnapshot(actor: PortActor): Promise<Result<ReporteMovements, GestionError>> {
    const [ventas, compras, gastos] = await Promise.all([
      this.readVentas(),
      this.readCompras(),
      this.readGastos()
    ]);
    if (!ventas.ok) return ventas;
    if (!compras.ok) return compras;
    if (!gastos.ok) return gastos;
    return ok({
      ventas: ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId)),
      compras: compras.value.compras.filter((compra) => isVisible(actor, compra.ownerId)),
      gastos: gastos.value.gastos.filter((gasto) => isVisible(actor, gasto.ownerId))
    });
  }

  private async readVentas() {
    return readOrEmpty(this.ventasStore(), { version: 0, ventas: [] });
  }

  private async readCompras() {
    return readOrEmpty(this.comprasStore(), { version: 0, compras: [] });
  }

  private async readGastos() {
    return readOrEmpty(this.gastosStore(), { version: 0, gastos: [] });
  }

  private ventasStore(): JsonStore<VentasDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "ventas.json"), ventasDocumentSchema);
  }

  private comprasStore(): JsonStore<ComprasDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "compras.json"), comprasDocumentSchema);
  }

  private gastosStore(): JsonStore<GastosDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "gastos.json"), gastosDocumentSchema);
  }
}
