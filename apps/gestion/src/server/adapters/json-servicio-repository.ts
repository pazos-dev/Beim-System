import { join } from "node:path";

import { JSON_STORE_ERROR_REASONS, JsonStore } from "../data/json-store";
import {
  serviciosDocumentSchema,
  type GestionError,
  type Servicio
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../handlers/errors";
import { err, ok, type Result } from "../handlers/result";
import type { z } from "zod";

import type { PortActor } from "../ports/actor";
import type { ServicioRepositoryPort } from "../ports/servicio";

type ServiciosDocument = z.infer<typeof serviciosDocumentSchema>;

/**
 * JSON-backed Servicio port. Reads are intentionally ownership-blind:
 * any authenticated role may read the catalog (SRV-1), so every stored
 * row is visible and the use case owns `q` / `active` filtering.
 */
export class JsonServicioRepository implements ServicioRepositoryPort {
  private readonly store: JsonStore<ServiciosDocument>;

  public constructor(dataDirectory: string) {
    this.store = new JsonStore(join(dataDirectory, "servicios.json"), serviciosDocumentSchema);
  }

  public async list(_actor: PortActor): Promise<Result<Servicio[], GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok([]);
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    return ok(current.value.servicios);
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<Servicio, GestionError>> {
    const current = await this.store.read();
    if (!current.ok) {
      if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) {
        return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
      }
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }
    const found = current.value.servicios.find((servicio) => servicio.id === id);
    if (found === undefined) return err(createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN));
    return ok(found);
  }
}
