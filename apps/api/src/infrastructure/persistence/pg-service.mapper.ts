import { createMoney, createServiceId } from "../../domain/shared/types.js";
import type { Service, ServiceData } from "../../domain/service/service.js";

/**
 * Service rows (slice 2.5, change `clean-arch-infrastructure`).
 *
 * Two sources: the dedicated `services` table (DDL `0007`, carries price +
 * timestamps) and the legacy `app_settings` docs under `gestion.services.<uuid>`
 * (`{ name, data, isActive }`, no price — fallback only). Mappers never select
 * or return secrets: services carry no hashes by shape.
 */

/** Key prefix shared with the legacy `pg-services.ts` repository. */
export const SERVICE_DOC_PREFIX = "gestion.services.";

/** Row of the dedicated `services` table (DDL `0007`). */
export interface ServiceTableRow {
  id: string;
  name: string;
  /** pg returns `numeric` as string; numbers are accepted too. */
  price_amount: string | number;
  price_currency: string;
  active: boolean;
  data: ServiceData;
  updated_at: Date | string | null;
}

/** Legacy docs row (`app_settings`, byte-identical projection to pg-services). */
export interface ServiceDocRow {
  key: string;
  value: { name: string; data?: unknown; isActive?: unknown };
}

/** Table row → `Service` (price + timestamps survive; `createMoney` fails closed). */
export function toDomainService(row: ServiceTableRow): Service {
  return {
    id: createServiceId(row.id),
    name: row.name,
    price: createMoney(Number(row.price_amount), row.price_currency),
    active: row.active,
    data: row.data,
    updatedAt: row.updated_at === null ? null : new Date(row.updated_at)
  };
}

function docData(value: ServiceDocRow["value"]): ServiceData {
  if (typeof value.data === "object" && value.data !== null && !Array.isArray(value.data)) {
    return value.data as ServiceData;
  }
  return {};
}

/**
 * Docs row → `Service`. Legacy docs store no price, so the fallback carries
 * `{ 0, UYU }`; `isActive` absent counts as active (legacy compatible).
 */
export function toDomainServiceFromDoc(row: ServiceDocRow): Service {
  return {
    id: createServiceId(row.key.slice(SERVICE_DOC_PREFIX.length)),
    name: row.value.name,
    price: createMoney(0, "UYU"),
    active: (row.value.isActive as boolean | undefined) ?? true,
    data: docData(row.value),
    updatedAt: null
  };
}
