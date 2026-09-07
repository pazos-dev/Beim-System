/**
 * CRUD services (PR 3, issue #87 update/deactivate): clients, categories,
 * services, purchases.
 *
 * Thin pass-throughs over the repositories — the storage-shape decisions
 * (users role 'cliente', categories table, app_settings doc services,
 * audit-event purchases) live in the repositories; the services exist so the
 * router layer never touches SQL and future business rules have a home.
 * Updates translate unknown ids to 404; client `active` delegates to
 * usersService (approve/disable with session revocation).
 */
import { NotFoundError } from "../../../errors/taxonomy.js";
import type { ActiveFilter, JsonValue } from "../ports.js";
import { clientsRepository } from "../repositories/pg-clients.js";
import { categoriesRepository } from "../repositories/pg-categories.js";
import { servicesRepository } from "../repositories/pg-services.js";
import { purchasesRepository } from "../repositories/pg-purchases.js";
import { usersService } from "./users.js";

export interface ClientUpdateInput {
  name?: string;
  email?: string;
  phone?: string;
  active?: boolean;
}

async function requireClient(id: string) {
  const client = await clientsRepository.getById(id);
  if (client === null) throw new NotFoundError(`Cliente no encontrado: ${id}`);
  return client;
}

export const clientsService = {
  list: (filter?: { active?: ActiveFilter }) => clientsRepository.list(filter),
  getById: (id: string) => clientsRepository.getById(id),
  create: (input: { name: string; email?: string; phone?: string }) => clientsRepository.create(input),

  async update(id: string, input: ClientUpdateInput) {
    await requireClient(id);
    // Approval toggle reuses the users admin flow (disable revokes sessions).
    if (input.active === true) await usersService.approveUser(id);
    else if (input.active === false) await usersService.disableUser(id);
    if (input.name !== undefined || input.email !== undefined || input.phone !== undefined) {
      await clientsRepository.update(id, { name: input.name, email: input.email, phone: input.phone });
    }
    const updated = await clientsRepository.getById(id);
    if (updated === null) throw new NotFoundError(`Cliente no encontrado: ${id}`);
    return updated;
  }
};

export const categoriesService = {
  list: (filter?: { active?: ActiveFilter }) => categoriesRepository.list(filter),
  getById: (id: string) => categoriesRepository.getById(id),
  create: (input: { id: string; name: string; code: string }) => categoriesRepository.create(input),

  async update(id: string, input: { name?: string; code?: string; active?: boolean }) {
    const updated = await categoriesRepository.update(id, input);
    if (updated === null) throw new NotFoundError(`Categoría no encontrada: ${id}`);
    return updated;
  }
};

export const servicesService = {
  list: (filter?: { active?: ActiveFilter }) => servicesRepository.list(filter),
  getById: (id: string) => servicesRepository.getById(id),
  create: (input: { name: string; data?: JsonValue }) => servicesRepository.create(input),

  async update(id: string, input: { name?: string; data?: JsonValue; active?: boolean }) {
    const updated = await servicesRepository.update(id, input);
    if (updated === null) throw new NotFoundError(`Servicio no encontrado: ${id}`);
    return updated;
  }
};

export const purchasesService = {
  list: (filter?: { active?: ActiveFilter }) => purchasesRepository.list(filter),
  getById: (id: string) => purchasesRepository.getById(id),
  create: (input: { supplierName: string; data?: JsonValue }) => purchasesRepository.create(input),

  async update(id: string, input: { supplierName?: string; data?: JsonValue; active?: boolean }) {
    const updated = await purchasesRepository.update(id, input);
    if (updated === null) throw new NotFoundError(`Compra no encontrada: ${id}`);
    return updated;
  }
};
