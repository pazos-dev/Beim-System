import { z } from "zod";

import {
  sesionCajaSchema,
  type GestionError,
  type SesionCaja
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type { PortActor } from "../shared/actor";
import type {
  CajaAbrirInput,
  CajaAuditHook,
  CajaCerrarInput,
  CajaMovements,
  CajaRepositoryPort
} from "../ports/caja";
import { GestionHttpClient, type GestionHttpFetch } from "../api/http-client";

const sesionCajaListSchema = z.array(sesionCajaSchema);

const PLACEHOLDER_MESSAGES = {
  movements: "Próxima implementación: lectura remota de movimientos de caja aún no definida.",
  abrir: "Próxima implementación: comando remoto de apertura de caja aún no definido.",
  cerrar: "Próxima implementación: comando remoto de cierre de caja aún no definido."
} as const;

function isVisible(actor: PortActor, ownerId: string): boolean {
  return actor.hasGlobalAccess || ownerId === actor.id;
}

export interface HttpCajaRepositoryConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

/**
 * Remote Caja adapter behind `CajaRepositoryPort`. Reads route through the
 * archived `/api/v1/cash-sessions` resource conventions; open-session filtering
 * is performed from validated remote data. Mutations and movement reads are
 * deferred because the remote command contract is not yet available.
 *
 * The actor is represented only by the configured bearer token. No actor id,
 * role or owner id is sent as authorization, and no local JSON store is used.
 */
export class HttpCajaRepository implements CajaRepositoryPort {
  private readonly client: GestionHttpClient;

  public constructor(config: HttpCajaRepositoryConfig) {
    this.client = new GestionHttpClient(config);
  }

  public async list(_actor: PortActor): Promise<Result<SesionCaja[], GestionError>> {
    return this.client.request("GET", "/api/v1/cash-sessions", {
      dataSchema: sesionCajaListSchema
    });
  }

  public async findAbierta(actor: PortActor): Promise<Result<SesionCaja | null, GestionError>> {
    const listed = await this.list(actor);
    if (!listed.ok) return listed;
    const open = listed.value.find(
      (sesion) => sesion.estado === "abierta" && isVisible(actor, sesion.ownerId)
    );
    return ok(open ?? null);
  }

  public async getById(_actor: PortActor, id: string): Promise<Result<SesionCaja, GestionError>> {
    return this.client.request("GET", `/api/v1/cash-sessions/${encodeURIComponent(id)}`, {
      dataSchema: sesionCajaSchema
    });
  }

  public async readMovements(
    _actor: PortActor
  ): Promise<Result<CajaMovements, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.movements));
  }

  public async applyAbrir(
    _actor: PortActor,
    _input: CajaAbrirInput,
    _audit: CajaAuditHook
  ): Promise<Result<SesionCaja, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.abrir));
  }

  public async applyCerrar(
    _actor: PortActor,
    _input: CajaCerrarInput,
    _audit: CajaAuditHook
  ): Promise<Result<SesionCaja, GestionError>> {
    return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, PLACEHOLDER_MESSAGES.cerrar));
  }
}
