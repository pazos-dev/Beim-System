import { randomUUID } from "node:crypto";

import type { GestionError, Venta } from "../server/data/schemas";
import { createGestionError, ERROR_CODES } from "../server/handlers/errors";
import { err, ok, type Result } from "../server/handlers/result";
import type { PortActor } from "../server/ports/actor";
import type {
  VentaAnularInput,
  VentaAuditHook,
  VentaCreateInput,
  VentaRepositoryPort
} from "../server/ports/ventas";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

function ventaFixture(id: string, ownerId: string, estado: Venta["estado"], numero: string): Venta {
  return {
    id,
    ownerId,
    version: 1,
    numero,
    items: [{ productoId: "p_1", cantidad: 1, precio: 100 }],
    pagos: [{ metodo: "efectivo", monto: 100 }],
    total: 100,
    estado
  };
}

export class StubApiVentaRepository implements VentaRepositoryPort {
  private readonly ventas = new Map<string, Venta>([
    ["v_1", ventaFixture("v_1", "u-mine", "confirmada", "0001-000101")],
    ["v_2", ventaFixture("v_2", "u-other", "confirmada", "0001-000102")],
    ["v_3", ventaFixture("v_3", "u-mine", "anulada", "0001-000103")]
  ]);

  public async list(actor: PortActor): Promise<Result<Venta[], GestionError>> {
    return ok(Array.from(this.ventas.values()).filter((venta) => isVisible(actor, venta.ownerId)));
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const found = this.ventas.get(id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async applyCreate(
    actor: PortActor,
    input: VentaCreateInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    if ("draft" in input) {
      const venta: Venta = {
        id: `v_${randomUUID()}`,
        ownerId: actor.id,
        version: 1,
        numero: input.draft.numero ?? `stub-${randomUUID()}`,
        items: input.draft.items,
        pagos: input.draft.pagos,
        total: input.draft.total,
        estado: "confirmada",
        ...(input.draft.ordenId === undefined ? {} : { ordenId: input.draft.ordenId }),
        ...(input.draft.descuento === undefined ? {} : { descuento: input.draft.descuento })
      };
      return this.applyCreate(actor, { venta }, audit);
    }
    const venta = input.venta;
    if (!isVisible(actor, venta.ownerId)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    if (this.ventas.has(venta.id)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["id"] }));
    }
    this.ventas.set(venta.id, venta);
    const audited = await audit(venta);
    if (!audited.ok) {
      this.ventas.delete(venta.id);
      return audited;
    }
    return ok(venta);
  }

  public async applyAnular(
    actor: PortActor,
    input: VentaAnularInput,
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    const current = this.ventas.get(input.venta.id);
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    this.ventas.set(input.venta.id, input.venta);
    const audited = await audit(input.venta);
    if (!audited.ok) {
      this.ventas.set(input.venta.id, current);
      return audited;
    }
    return ok(input.venta);
  }
}
