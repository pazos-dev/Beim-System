import { z } from "zod";

import { computeExpected, type PaymentTotal } from "../../lib/domain/cash/cash";
import type { GestionError, SesionCaja } from "../data/schemas";
import { AuditRepository, buildAuditEvent } from "../handlers/audit";
import type { AuthActor, Role } from "../handlers/auth";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { IdempotencyService } from "../handlers/idempotency";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { CajaRepositoryPort } from "../ports/caja";

export interface CajaActor {
  hasGlobalAccess: boolean;
  id: string;
  role: Role;
}

export function toCajaActor(auth: AuthActor): CajaActor {
  return {
    hasGlobalAccess: auth.role === "administrador" || auth.role === "administrador_principal",
    id: auth.id,
    role: auth.role
  };
}

export const CAJA_OPERATE_ROLES: ReadonlySet<Role> = new Set([
  "caja",
  "administrador",
  "administrador_principal"
]);

export const cajaAbrirInputSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." }),
  apertura: z.number().min(0)
});

export type CajaAbrirInput = z.infer<typeof cajaAbrirInputSchema>;

export const cajaEstadoQuerySchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." })
    .optional()
});

export type CajaEstadoQuery = z.infer<typeof cajaEstadoQuerySchema>;

export const cajaHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type CajaHistoryQuery = z.infer<typeof cajaHistoryQuerySchema>;

export interface CajaEstado {
  abierta: boolean;
  esperado: number;
  gastosDia: { count: number; total: number };
  porMetodo: PaymentTotal[];
  sesion: SesionCaja | null;
}

export interface CajaHistoryItem {
  apertura: number;
  diferencia: number;
  esperado: number;
  estado: SesionCaja["estado"];
  fecha: string;
  id: string;
  version: number;
}

export interface CajaHistoryResponse {
  items: CajaHistoryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
}

function toHistoryItem(sesion: SesionCaja): CajaHistoryItem {
  return {
    apertura: sesion.apertura,
    diferencia: sesion.diferencia,
    esperado: sesion.esperado,
    estado: sesion.estado,
    fecha: sesion.fecha,
    id: sesion.id,
    version: sesion.version
  };
}

export class CajaUseCases {
  private readonly audit: AuditRepository;
  private readonly idempotency: IdempotencyService;
  private readonly port: CajaRepositoryPort;

  public constructor(
    port: CajaRepositoryPort,
    audit: AuditRepository,
    idempotency: IdempotencyService
  ) {
    this.port = port;
    this.audit = audit;
    this.idempotency = idempotency;
  }

  public async getEstado(
    actor: CajaActor,
    query: CajaEstadoQuery
  ): Promise<Result<CajaEstado, GestionError>> {
    const parsed = cajaEstadoQuerySchema.safeParse(query);
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    if (!CAJA_OPERATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const portActor: PortActor = { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
    const abierta = await this.port.findAbierta(portActor);
    if (!abierta.ok) return err(abierta.error);
    const movements = await this.port.readMovements(portActor);
    if (!movements.ok) return err(movements.error);
    // Ventas v1 have no timestamp: every confirmed sale counts; dated gastos
    // filter by the requested day, else the open session day, else none.
    const day = parsed.data.fecha ?? abierta.value?.fecha;
    const dayGastos =
      day === undefined
        ? []
        : movements.value.gastos.filter((gasto) => gasto.fecha.slice(0, 10) === day);
    const expected = computeExpected({
      apertura: abierta.value?.apertura ?? 0,
      ventas: movements.value.ventas,
      gastos: dayGastos,
      retiros: 0
    });
    return ok({
      abierta: abierta.value !== null,
      esperado: expected.esperado,
      gastosDia: {
        count: dayGastos.length,
        total: dayGastos.reduce((sum, gasto) => sum + gasto.importe, 0)
      },
      porMetodo: expected.porMetodo,
      sesion: abierta.value
    });
  }

  public async list(
    actor: CajaActor,
    query: CajaHistoryQuery
  ): Promise<Result<CajaHistoryResponse, GestionError>> {
    const parsed = cajaHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR));
    }
    if (!CAJA_OPERATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const listed = await this.port.list({ hasGlobalAccess: actor.hasGlobalAccess, id: actor.id });
    if (!listed.ok) return err(listed.error);
    const sorted = [...listed.value].sort((a, b) => b.fecha.localeCompare(a.fecha));
    const totalItems = sorted.length;
    const start = (parsed.data.page - 1) * parsed.data.pageSize;
    return ok({
      items: sorted.slice(start, start + parsed.data.pageSize).map(toHistoryItem),
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalItems
    });
  }

  public async abrir(
    actor: CajaActor,
    input: unknown,
    idempotencyKey: unknown
  ): Promise<Result<SesionCaja, GestionError>> {
    const parsed = cajaAbrirInputSchema.safeParse(input);
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    if (!CAJA_OPERATE_ROLES.has(actor.role)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    let effectRan = false;
    const result = await this.idempotency.execute<SesionCaja>(
      idempotencyKey,
      parsed.data,
      async () => {
        effectRan = true;
        return this.abrirEffect(actor, parsed.data);
      }
    );
    if (!result.ok && result.error.code === ERROR_CODES.CONFLICT && !effectRan) {
      return this.auditOutcome(actor.id, "caja.abrir", null, result);
    }
    return result;
  }

  private async abrirEffect(actor: CajaActor, data: CajaAbrirInput): Promise<Result<SesionCaja, GestionError>> {
    const portActor: PortActor = { hasGlobalAccess: actor.hasGlobalAccess, id: actor.id };
    const created = await this.port.applyAbrir(portActor, data, async (persisted) => {
      const appended = await this.audit.append(
        buildAuditEvent(
          {
            actorId: actor.id,
            accion: "caja.abrir",
            entidad: "sesion-caja",
            entidadId: persisted.id,
            detalles: { fecha: persisted.fecha, apertura: persisted.apertura }
          },
          "ok"
        )
      );
      if (!appended.ok) return err(appended.error);
      return ok(undefined);
    });
    if (!created.ok) return this.auditOutcome(actor.id, "caja.abrir", null, created);
    return created;
  }

  private async auditOutcome<T>(
    actorId: string,
    accion: string,
    entidadId: string | null,
    outcome: Result<T, GestionError>
  ): Promise<Result<T, GestionError>> {
    const appended = await this.audit.append(
      buildAuditEvent(
        { actorId, accion, entidad: "sesion-caja", entidadId },
        outcome.ok ? "ok" : outcome.error.code
      )
    );
    if (!appended.ok) return err(appended.error);
    return outcome;
  }
}
