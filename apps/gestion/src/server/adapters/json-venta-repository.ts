import { join } from "node:path";

import { JsonStore, type VersionedDocument } from "../data/json-store";
import {
  ventasDocumentSchema,
  type GestionError,
  type Venta
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import {
  emptyVentas,
  mapStoreError,
  readOrEmpty,
  restoreDocument,
  rollbackSteps,
  type VentasDocument
} from "../handlers/order-context";
import { err, ok, type Result } from "../handlers/result";
import type { PortActor } from "../ports/actor";
import type { VentaAuditHook, VentaRepositoryPort } from "../ports/ventas";

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

export class JsonVentaRepository implements VentaRepositoryPort {
  private readonly dataDirectory: string;

  public constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
  }

  public async list(actor: PortActor): Promise<Result<Venta[], GestionError>> {
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    return ok(ventas.value.ventas.filter((venta) => isVisible(actor, venta.ownerId)));
  }

  public async getById(actor: PortActor, id: string): Promise<Result<Venta, GestionError>> {
    if (id.trim() === "") {
      return err(createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] }));
    }
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    const found = ventas.value.ventas.find((venta) => venta.id === id);
    if (found === undefined || !isVisible(actor, found.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    return ok(found);
  }

  public async applyCreate(
    actor: PortActor,
    input: { venta: Venta },
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    if (!isVisible(actor, input.venta.ownerId)) {
      return err(createGestionError(ERROR_CODES.FORBIDDEN));
    }
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    if (ventas.value.ventas.some((venta) => venta.id === input.venta.id)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["id"] }));
    }
    if (ventas.value.ventas.some((venta) => venta.numero === input.venta.numero)) {
      return err(createGestionError(ERROR_CODES.CONFLICT, { fields: ["numero"] }));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const persisted = await this.persist(
      this.ventasStore(),
      { ventas: [...ventas.value.ventas, input.venta], version: ventas.value.version + 1 },
      ventas.value,
      rollbacks
    );
    if (!persisted.ok) return persisted;
    const audited = await audit();
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(input.venta);
  }

  public async applyAnular(
    actor: PortActor,
    input: { venta: Venta },
    audit: VentaAuditHook
  ): Promise<Result<Venta, GestionError>> {
    const ventas = await this.readVentas();
    if (!ventas.ok) return ventas;
    const current = ventas.value.ventas.find((venta) => venta.id === input.venta.id);
    if (current === undefined || !isVisible(actor, current.ownerId)) {
      return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    }
    const rollbacks: Array<() => Promise<void>> = [];
    const persisted = await this.persist(
      this.ventasStore(),
      {
        ventas: ventas.value.ventas.map((venta) => (venta.id === input.venta.id ? input.venta : venta)),
        version: ventas.value.version + 1
      },
      ventas.value,
      rollbacks
    );
    if (!persisted.ok) return persisted;
    const audited = await audit();
    if (!audited.ok) {
      await rollbackSteps(rollbacks);
      return audited;
    }
    return ok(input.venta);
  }

  private async persist<T extends VersionedDocument>(
    store: JsonStore<T>,
    next: T,
    snapshot: T,
    rollbacks: Array<() => Promise<void>>
  ): Promise<Result<undefined, GestionError>> {
    const written = await store.write(next, snapshot.version);
    if (!written.ok) {
      await rollbackSteps(rollbacks);
      return err(mapStoreError(written.error));
    }
    rollbacks.push(() => restoreDocument(store, snapshot));
    return ok(undefined);
  }

  private async readVentas() {
    const store = this.ventasStore();
    return readOrEmpty(store, emptyVentas());
  }

  private ventasStore(): JsonStore<VentasDocument> {
    return new JsonStore(join(this.dataDirectory, "ventas.json"), ventasDocumentSchema);
  }
}
