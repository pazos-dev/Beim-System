/**
 * Catalog service handlers (change `clean-arch-application`, Unit 2).
 *
 * One thin function per use case: plain DTO → `UnitOfWork.run` → load
 * `Service` for-update → one domain behavior → save on the same `TxClient`
 * → commit. Update merges present fields only (`updateService`); catalog
 * relabel/reprice live here because product has no rename/reprice behavior
 * (see product-handlers). Domain errors pass through untouched to the edge
 * `toAppError` mapping. Malformed ids parse outside `run` (422, zero store
 * touch); missing rows throw `NotFoundError` with zero saves.
 */
import { NotFoundError } from "../../domain/shared/errors.js";
import { createServiceId, type ServiceId } from "../../domain/shared/types.js";
import {
  activateService,
  createService,
  deactivateService,
  renameService,
  repriceService,
  updateService,
  type CreateServiceInput,
  type Service,
  type UpdateServiceInput
} from "../../domain/service/service.js";
import type { CatalogServiceDeps } from "./ports.js";

export interface ServiceIdInput {
  readonly serviceId: string;
}

export interface RenameServiceInput {
  readonly serviceId: string;
  readonly name: string;
}

export interface RepriceServiceInput {
  readonly serviceId: string;
  readonly amount: number;
}

export interface UpdateServiceRequest {
  readonly serviceId: string;
  readonly patch: UpdateServiceInput;
}

function serviceNotFound(id: ServiceId): NotFoundError {
  return new NotFoundError(`Servicio no encontrado: ${id}`);
}

export function makeCatalogServiceHandlers(deps: CatalogServiceDeps) {
  const { uow, services } = deps;

  async function loadForUpdate(
    tx: Parameters<Parameters<typeof uow.run>[0]>[0],
    id: ServiceId
  ): Promise<Service> {
    const found = await services.findService(tx, id);
    if (found === null) throw serviceNotFound(id);
    return found;
  }

  return {
    async create(input: CreateServiceInput): Promise<Service> {
      return uow.run(async (tx) => {
        const service = createService(input);
        await services.saveService(tx, service);
        return service;
      });
    },

    async rename(input: RenameServiceInput): Promise<Service> {
      const id = createServiceId(input.serviceId);
      return uow.run(async (tx) => {
        const current = await loadForUpdate(tx, id);
        const renamed = renameService(current, input.name);
        await services.saveService(tx, renamed);
        return renamed;
      });
    },

    async reprice(input: RepriceServiceInput): Promise<Service> {
      const id = createServiceId(input.serviceId);
      return uow.run(async (tx) => {
        const current = await loadForUpdate(tx, id);
        const repriced = repriceService(current, input.amount);
        await services.saveService(tx, repriced);
        return repriced;
      });
    },

    async update(input: UpdateServiceRequest): Promise<Service> {
      const id = createServiceId(input.serviceId);
      return uow.run(async (tx) => {
        const current = await loadForUpdate(tx, id);
        const updated = updateService(current, input.patch);
        await services.saveService(tx, updated);
        return updated;
      });
    },

    async activate(input: ServiceIdInput): Promise<Service> {
      const id = createServiceId(input.serviceId);
      return uow.run(async (tx) => {
        const current = await loadForUpdate(tx, id);
        const activated = activateService(current);
        await services.saveService(tx, activated);
        return activated;
      });
    },

    async deactivate(input: ServiceIdInput): Promise<Service> {
      const id = createServiceId(input.serviceId);
      return uow.run(async (tx) => {
        const current = await loadForUpdate(tx, id);
        const deactivated = deactivateService(current);
        await services.saveService(tx, deactivated);
        return deactivated;
      });
    }
  };
}
