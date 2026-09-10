import { createUserId } from "../../domain/shared/types.js";
import type { Client } from "../../domain/user/user.js";

/**
 * Webshop client row: the `pg-clients` projection
 * (`id, name, email, phone, ci, rut, company, is_approved`). `password_hash`
 * is NEVER selected — the row type has no field for it.
 */
export interface WebshopClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ci: string | null;
  rut: string | null;
  company: string | null;
  is_approved: boolean;
}

/** Row → `Client`. `company` is dropped: the domain profile has no such field. */
export function toDomainClient(row: WebshopClientRow): Client {
  return {
    id: createUserId(row.id),
    name: row.name,
    email: row.email,
    phone: row.phone,
    ci: row.ci,
    rut: row.rut,
    isApproved: row.is_approved
  };
}
