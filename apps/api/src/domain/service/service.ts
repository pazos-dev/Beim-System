/**
 * Service aggregate (domain slice, change `clean-arch-domain`).
 *
 * Labor / no-stock catalog entry (`domain-entities.md` v3 §3): `Money`
 * price >= 0, `active` defaults true (absent `isActive` backfill), updates
 * merge present fields only with the `value` remainder carried as `data`.
 * Framework-free: immutable values; every behavior returns a new copy.
 */
import { ValidationError } from "../shared/errors.js";
import { createMoney, createServiceId, type Money, type ServiceId } from "../shared/types.js";

/** Remainder of the catalog `value` document carried through updates. */
export type ServiceData = { readonly [key: string]: unknown };

/** Labor entry (`app_settings` key `gestion.services.<uuid>`, `value` jsonb). */
export interface Service {
  readonly id: ServiceId;
  readonly name: string;
  readonly price: Money;
  readonly active: boolean;
  readonly data: ServiceData;
  readonly updatedAt: Date | null;
}

export interface CreateServiceInput {
  readonly id: string;
  readonly name: string;
  readonly priceAmount: number;
  readonly priceCurrency: string;
  readonly active?: boolean;
  readonly data?: ServiceData;
}

export interface UpdateServiceInput {
  readonly name?: string;
  readonly priceAmount?: number;
  readonly active?: boolean;
  readonly data?: ServiceData;
}

function cleanName(value: string): string {
  const cleaned = value.trim();
  if (cleaned === "") {
    throw new ValidationError("Servicio inválido: name no puede estar vacío", { field: "name" });
  }
  return cleaned;
}

export function createService(input: CreateServiceInput): Service {
  return {
    id: createServiceId(input.id),
    name: cleanName(input.name),
    price: createMoney(input.priceAmount, input.priceCurrency),
    active: input.active ?? true,
    data: input.data ?? {},
    updatedAt: null
  };
}

/** Labor relabel: keeps price, flag, remainder, and timestamps. */
export function renameService(service: Service, name: string): Service {
  return { ...service, name: cleanName(name) };
}

/** Labor reprice in the entry currency: keeps name, flag, and remainder. */
export function repriceService(service: Service, amount: number): Service {
  return { ...service, price: createMoney(amount, service.price.currency) };
}

/** Reactivates a catalog entry. */
export function activateService(service: Service): Service {
  return { ...service, active: true };
}

/** Soft-removes a catalog entry from offer. */
export function deactivateService(service: Service): Service {
  return { ...service, active: false };
}

/** Partial merge: only present fields change; `data` merges shallowly. */
export function updateService(service: Service, input: UpdateServiceInput): Service {
  let updated = service;
  if (input.name !== undefined) {
    updated = renameService(updated, input.name);
  }
  if (input.priceAmount !== undefined) {
    updated = repriceService(updated, input.priceAmount);
  }
  if (input.active !== undefined) {
    updated = input.active ? activateService(updated) : deactivateService(updated);
  }
  if (input.data !== undefined) {
    updated = { ...updated, data: { ...updated.data, ...input.data } };
  }
  return updated;
}
