import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { computeExpected, closeCashSession } from "../../lib/domain/cash/cash";
import { JsonStore, type VersionedDocument } from "../data/json-store";
import {
  gastosDocumentSchema,
  sesionesCajaDocumentSchema,
  sesionCajaSchema,
  ventasDocumentSchema,
  type Gasto,
  type GestionError,
  type SesionCaja,
  type Venta
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import {
  mapStoreError,
  readOrEmpty
} from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { CajaAbrirInput, CajaAuditHook, CajaCerrarInput, CajaMovements, CajaRepositoryPort } from "../ports/caja";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

function emptySesionesCaja(): SesionesDocument {
  return { version: 0, sesionesCaja: [] };
}

type SesionesDocument = { version: number; sesionesCaja: SesionCaja[] };
type VentasDocument = { version: number; ventas: Venta[] };
type GastosDocument = { version: number; gastos: Gasto[] };

export class JsonCajaRepository implements CajaRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async list(actor: PortActor): Promise<Result<SesionCaja[], GestionError>> {
    const sesiones = await this.readSesiones();
    if (!sesiones.ok) return sesiones;
    return ok(sesiones.value.sesionesCaja.filter((sesion) => isVisible(actor, sesion.ownerId)));
  }

  public async findAbierta(actor: PortActor): Promise<Result<SesionCaja | null, GestionError>> {
    const sesiones = await this.readSesiones();
    if (!sesiones.ok) return sesiones;
    return ok(
      sesiones.value.sesionesCaja.find(
        (sesion) => sesion.estado === "abierta" && isVisible(actor, sesion.ownerId)
      ) ?? null
    );
  }

  public async getById(actor: PortActor, id: string): Promise<Result<SesionCaja, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const sesiones = await this.readSesiones();
    if (!sesiones.ok) return sesiones;
    const found = sesiones.value.sesionesCaja.find((sesion) => sesion.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async readMovements(actor: PortActor): Promise<Result<CajaMovements, GestionError>> {
    const [ventas, gastos] = await Promise.all([this.readVentas(), this.readGastos()]);
    if (!ventas.ok) return ventas;
    if (!gastos.ok) return gastos;
    return ok({
      ventas: ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId)),
      gastos: gastos.value.gastos.filter((gasto) => isVisible(actor, gasto.ownerId))
    });
  }

  public async applyAbrir(
    actor: PortActor,
    input: CajaAbrirInput,
    audit: CajaAuditHook
  ): Promise<Result<SesionCaja, GestionError>> {
    const [sesiones, ventas, gastos] = await Promise.all([
      this.readSesiones(),
      this.readVentas(),
      this.readGastos()
    ]);
    if (!sesiones.ok) return sesiones;
    if (!ventas.ok) return err(ventas.error);
    if (!gastos.ok) return err(gastos.error);
    // Single-open invariant per owner (global admins share one lane): a
    // second opening returns CONFLICT with zero writes.
    const open = sesiones.value.sesionesCaja.find(
      (sesion) => sesion.estado === "abierta" && isVisible(actor, sesion.ownerId)
    );
    if (open !== undefined) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["fecha"] }));
    }
    const ownVentas = ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId));
    const dayGastos = gastos.value.gastos.filter(
      (gasto) => isVisible(actor, gasto.ownerId) && gasto.fecha.slice(0, 10) === input.fecha
    );
    const expected = computeExpected({
      apertura: input.apertura,
      ventas: ownVentas,
      gastos: dayGastos,
      retiros: 0
    });
    const parsed = sesionCajaSchema.safeParse({
      id: `sc_${randomUUID()}`,
      ownerId: actor.id,
      version: 1,
      fecha: input.fecha,
      apertura: input.apertura,
      esperado: expected.esperado,
      contado: 0,
      diferencia: 0,
      estado: "abierta"
    });
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    const store = this.sesionesStore();
    const next: SesionesDocument = {
      version: sesiones.value.version + 1,
      sesionesCaja: [...sesiones.value.sesionesCaja, parsed.data]
    };
    const written = await store.write(next, sesiones.value.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const audited = await audit(parsed.data);
    if (!audited.ok) {
      await this.restore(store, sesiones.value);
      return audited;
    }
    return ok(parsed.data);
  }

  public async applyCerrar(
    actor: PortActor,
    input: CajaCerrarInput,
    audit: CajaAuditHook
  ): Promise<Result<SesionCaja, GestionError>> {
    const [sesiones, ventas, gastos] = await Promise.all([
      this.readSesiones(),
      this.readVentas(),
      this.readGastos()
    ]);
    if (!sesiones.ok) return sesiones;
    if (!ventas.ok) return err(ventas.error);
    if (!gastos.ok) return err(gastos.error);
    // Closing with none open returns CONFLICT with zero writes.
    const open = sesiones.value.sesionesCaja.find(
      (sesion) => sesion.estado === "abierta" && isVisible(actor, sesion.ownerId)
    );
    if (open === undefined) {
      return err(createGestionError(ERROR_CODES.CONFLICT));
    }
    const ownVentas = ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId));
    const dayGastos = gastos.value.gastos.filter(
      (gasto) => isVisible(actor, gasto.ownerId) && gasto.fecha.slice(0, 10) === open.fecha
    );
    // Verbatim domain close: diferencia = contado − esperado, classified
    // sobrante|faltante|exacto. No formula duplication.
    const closed = closeCashSession({
      apertura: open.apertura,
      ventas: ownVentas,
      gastos: dayGastos,
      retiros: input.retiros,
      contado: input.contado
    });
    const parsed = sesionCajaSchema.safeParse({
      ...open,
      esperado: closed.esperado,
      contado: closed.contado,
      diferencia: closed.diferencia,
      estado: "cerrada",
      cierre: new Date().toISOString(),
      version: open.version + 1
    });
    if (!parsed.success) {
      return err(
        createGestionError(ERROR_CODES.VALIDATION_ERROR, {
          fields: parsed.error.issues.map((issue) => issue.path.join("."))
        })
      );
    }
    const store = this.sesionesStore();
    const next: SesionesDocument = {
      version: sesiones.value.version + 1,
      sesionesCaja: sesiones.value.sesionesCaja.map((sesion) =>
        sesion.id === open.id ? parsed.data : sesion
      )
    };
    const written = await store.write(next, sesiones.value.version);
    if (!written.ok) return err(mapStoreError(written.error));
    const audited = await audit(parsed.data);
    if (!audited.ok) {
      await this.restore(store, sesiones.value);
      return audited;
    }
    return ok(parsed.data);
  }

  private async restore(
    store: JsonStore<SesionesDocument & VersionedDocument>,
    snapshot: SesionesDocument
  ): Promise<void> {
    const current = await store.read();
    if (!current.ok) return;
    await store.write({ ...snapshot, version: current.value.version + 1 }, current.value.version);
  }

  private async readSesiones() {
    return readOrEmpty(this.sesionesStore(), emptySesionesCaja());
  }

  private async readVentas() {
    return readOrEmpty(this.ventasStore(), { version: 0, ventas: [] });
  }

  private async readGastos() {
    return readOrEmpty(this.gastosStore(), { version: 0, gastos: [] });
  }

  private sesionesStore(): JsonStore<SesionesDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "sesiones-caja.json"), sesionesCajaDocumentSchema);
  }

  private ventasStore(): JsonStore<VentasDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "ventas.json"), ventasDocumentSchema);
  }

  private gastosStore(): JsonStore<GastosDocument & VersionedDocument> {
    return new JsonStore(join(this.dataDirectory, "gastos.json"), gastosDocumentSchema);
  }
}
