import type { Compra, Gasto, GestionError, Venta } from "../data/schemas";
import type { Result } from "../handlers/result";
import type { PortActor } from "./actor";

/** Scoped read inputs for the period report. The adapter filters by
 * visibility; the use case aggregates them with `buildPeriodSnapshot`. */
export interface ReporteMovements {
  compras: Compra[];
  gastos: Gasto[];
  ventas: Venta[];
}

export interface ReporteRepositoryPort {
  getSnapshot(actor: PortActor): Promise<Result<ReporteMovements, GestionError>>;
}
