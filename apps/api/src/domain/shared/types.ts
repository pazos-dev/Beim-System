/**
 * Shared-kernel Types (slice 0.1, change `clean-architecture-backend`).
 *
 * Pure domain value objects + determinism ports. No I/O, no framework
 * imports: only the frozen error taxonomy (which itself has no I/O).
 * New files only — legacy `REPAIR_STATUSES` / role lists stay untouched
 * until their strangler slices re-home onto these canonical sets.
 */
import { ValidationError } from "../../errors/taxonomy.js";

/** Closed currency set (mirrors the `currency` CHECK in `schema.sql`). */
export const CURRENCIES = ["UYU", "USD", "USDT"] as const;

export type Currency = (typeof CURRENCIES)[number];

function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}

/** Branded money value object: non-negative finite amount + closed currency. */
export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

export function createMoney(amount: number, currency: string): Money {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ValidationError("Monto inválido: debe ser un número finito no negativo", { amount });
  }
  if (!isCurrency(currency)) {
    throw new ValidationError(`Moneda inválida: debe ser una de ${CURRENCIES.join(", ")}`, { currency });
  }
  return { amount, currency };
}

/** Identity of a user in either realm (console `gestion_users` / webshop `users`). */
export type UserId = string & { readonly __brand: "UserId" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createUserId(value: string): UserId {
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError("Identificador de usuario inválido: debe ser un uuid", { value });
  }
  return value as UserId;
}

/** Identity of a catalog product. */
export type ProductId = string & { readonly __brand: "ProductId" };

export function createProductId(value: string): ProductId {
  if (value.trim() === "") {
    throw new ValidationError("Identificador de producto inválido: no puede estar vacío", { value });
  }
  return value as ProductId;
}

/** Identity of a labor catalog entry (uuid from the `gestion.services.<uuid>` key suffix). */
export type ServiceId = string & { readonly __brand: "ServiceId" };

export function createServiceId(value: string): ServiceId {
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError("Identificador de servicio inválido: debe ser un uuid", { value });
  }
  return value as ServiceId;
}

/** Closed role set: console operators + webshop roles (see `domain-entities.md`). */
export const ROLES = [
  "vendedor",
  "tecnico",
  "caja",
  "administrador",
  "administrador_principal",
  "cliente",
  "admin",
  "superadmin"
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Closed 5-state repair set (canonical source; legacy services re-home later). */
export const REPAIR_STATUSES = ["Ingresado", "En reparación", "Listo", "Entregado", "Cancelado"] as const;

export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export function isRepairStatus(value: string): value is RepairStatus {
  return (REPAIR_STATUSES as readonly string[]).includes(value);
}

/**
 * Payment states across both realms: orders (`Pendiente de pago`),
 * receipts (`Pendiente` / `Sin abonar`), journal reversals (`Anulado`).
 */
export const PAYMENT_STATUSES = [
  "Pendiente de pago",
  "Pendiente",
  "Pagado",
  "Sin abonar",
  "Anulado",
  "Cancelado"
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

/** Determinism port: wall-clock access behind an interface so tests inject fakes. */
export interface Clock {
  now(): Date;
}

/** Determinism port: uuid generation behind an interface so tests inject fakes. */
export interface Uuid {
  generate(): string;
}
