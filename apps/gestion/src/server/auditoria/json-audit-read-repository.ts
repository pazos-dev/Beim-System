import { join } from "node:path";

import { JsonStore } from "../data/json-store";
import { auditDocumentSchema, type AuditEvent } from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import type {
  AuditReadFilters,
  AuditReadPage,
  AuditReadPort
} from "./audit-read-port";
import type { GestionError } from "../data/schemas";

function matches(filters: AuditReadFilters, event: AuditEvent): boolean {
  if (filters.actorId !== undefined && event.actorId !== filters.actorId) return false;
  if (filters.action !== undefined && event.accion !== filters.action) return false;
  if (filters.from !== undefined && event.instante < filters.from) return false;
  if (filters.to !== undefined && event.instante > filters.to) return false;
  return true;
}

/**
 * Local audit reader: preserves the existing Json behavior (read audit.json,
 * filter in memory). This is the default implementation; the HTTP repository
 * is only selected through the env-gated factory.
 */
export class JsonAuditReadRepository implements AuditReadPort {
  public constructor(private readonly dataDirectory: string) {}

  public async list(filters: AuditReadFilters): Promise<Result<AuditReadPage, GestionError>> {
    const stored = await new JsonStore(
      join(this.dataDirectory, "audit.json"),
      auditDocumentSchema
    ).read();
    if (!stored.ok) {
      return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
    }

    const matched = stored.value.events.filter((event) => matches(filters, event));
    const total = matched.length;
    if (filters.page === undefined && filters.limit === undefined) {
      return ok({ items: matched, total });
    }

    const page = Math.max(filters.page ?? 1, 1);
    const limit = Math.max(filters.limit ?? total, 0);
    const start = (page - 1) * limit;
    return ok({ items: matched.slice(start, start + limit), total });
  }
}
