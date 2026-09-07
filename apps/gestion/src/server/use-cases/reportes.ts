import { z } from "zod";

import {
  buildPeriodSnapshot,
  snapshotToCsv,
  type PeriodSnapshot
} from "../../lib/domain/reports/reports";
import type { GestionError } from "../data/schemas";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { ReporteRepositoryPort } from "../ports/reporte";

export interface ReporteActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toReporteActor(auth: AuthActor): ReporteActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

export const REPORTE_READ_ROLES: ReadonlySet<Role> = new Set([
  "caja",
  "administrador",
  "administrador_principal"
]);

export const reporteQuerySchema = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." }),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." }),
    formato: z.enum(["json", "csv"]).default("json")
  })
  .refine((query) => query.desde <= query.hasta, {
    error: "The period must satisfy desde <= hasta."
  });

export type ReporteQuery = z.infer<typeof reporteQuerySchema>;

export interface ReporteRead {
  formato: "json" | "csv";
  snapshot: PeriodSnapshot;
}

export class ReporteUseCases {
  private readonly port: ReporteRepositoryPort;

  public constructor(port: ReporteRepositoryPort) {
    this.port = port;
  }

  public async getSnapshot(
    actor: ReporteActor,
    query: ReporteQuery
  ): Promise<Result<ReporteRead, GestionError>> {
    const parsed = reporteQuerySchema.safeParse(query);
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    if (!REPORTE_READ_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const portActor: PortActor = { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
    const movements = await this.port.getSnapshot(portActor);
    if (!movements.ok) return err(movements.error);
    // Verbatim domain aggregation: the use case scopes inputs only and
    // never re-derives totals. No expected-cash or session-close math here.
    return ok({
      formato: parsed.data.formato,
      snapshot: buildPeriodSnapshot({
        desde: parsed.data.desde,
        hasta: parsed.data.hasta,
        ventas: movements.value.ventas,
        compras: movements.value.compras,
        gastos: movements.value.gastos
      })
    });
  }

  /** Verbatim CSV serialization: the export is the snapshot, not a formula. */
  public toCsv(snapshot: PeriodSnapshot): string {
    return snapshotToCsv(snapshot);
  }
}
