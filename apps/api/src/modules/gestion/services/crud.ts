/**
 * CRUD services (PR 3): clients, categories, services, purchases.
 *
 * Thin pass-throughs over the repositories — the storage-shape decisions
 * (users role 'cliente', categories table, app_settings doc services,
 * audit-event purchases) live in the repositories; the services exist so the
 * router layer never touches SQL and future business rules have a home.
 */
import type { JsonValue } from "../ports.js";
import { clientsRepository } from "../repositories/pg-clients.js";
import { categoriesRepository } from "../repositories/pg-categories.js";
import { servicesRepository } from "../repositories/pg-services.js";
import { purchasesRepository } from "../repositories/pg-purchases.js";

export const clientsService = {
  list: () => clientsRepository.list(),
  getById: (id: string) => clientsRepository.getById(id),
  create: (input: { name: string; email?: string; phone?: string }) => clientsRepository.create(input)
};

export const categoriesService = {
  list: () => categoriesRepository.list(),
  getById: (id: string) => categoriesRepository.getById(id),
  create: (input: { id: string; name: string; code: string }) => categoriesRepository.create(input)
};

export const servicesService = {
  list: () => servicesRepository.list(),
  create: (input: { name: string; data?: JsonValue }) => servicesRepository.create(input)
};

export const purchasesService = {
  list: () => purchasesRepository.list(),
  create: (input: { supplierName: string; data?: JsonValue }) => purchasesRepository.create(input)
};