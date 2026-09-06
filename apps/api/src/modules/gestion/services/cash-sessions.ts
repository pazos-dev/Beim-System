/**
 * Cash-sessions service (PR 3).
 *
 * Business gates (409 semantics) live here; the repository provides the
 * atomic primitives:
 *  - `open` rejects when ANY session is already open OR the business date is
 *    taken (both → 409 CONFLICT). expected_amount = opening_amount at open;
 *  - `close` rejects unknown ids (404) and double closes (409); difference is
 *    computed by the repository as counted - expected;
 *  - `recordMovement` rejects unknown sessions (404) and closed ones (409);
 *    movements journal to audit_logs (action 'cash.movement') and never touch
 *    a closed session.
 */
import { ConflictError, NotFoundError } from "../../../errors/taxonomy.js";
import type { AuditLogRow, CashSessionRow } from "../ports.js";
import { cashSessionsRepository } from "../repositories/pg-cash-sessions.js";

export const cashSessionsService = {
  async open(input: {
    businessDate: string;
    openingAmount: number;
    notes?: string;
  }): Promise<CashSessionRow> {
    const row = await cashSessionsRepository.create({
      businessDate: input.businessDate,
      openingAmount: input.openingAmount,
      notes: input.notes ?? ""
    });
    if (row === null) {
      throw new ConflictError("Ya existe una sesión de caja abierta para esa fecha");
    }
    return row;
  },

  async close(id: string, countedAmount: number): Promise<CashSessionRow> {
    const existing = await cashSessionsRepository.getById(id);
    if (existing === null) {
      throw new NotFoundError(`Sesión de caja no encontrada: ${id}`);
    }
    const closed = await cashSessionsRepository.close(id, countedAmount);
    if (closed === null) {
      throw new ConflictError("La sesión de caja ya está cerrada");
    }
    return closed;
  },

  async current(): Promise<CashSessionRow | null> {
    return cashSessionsRepository.getCurrent();
  },

  async list(): Promise<CashSessionRow[]> {
    return cashSessionsRepository.list();
  },

  async recordMovement(
    id: string,
    input: { type: string; amount: number; notes?: string }
  ): Promise<AuditLogRow> {
    const existing = await cashSessionsRepository.getById(id);
    if (existing === null) {
      throw new NotFoundError(`Sesión de caja no encontrada: ${id}`);
    }
    const journaled = await cashSessionsRepository.recordMovement(id, {
      type: input.type,
      amount: input.amount,
      notes: input.notes ?? ""
    });
    if (journaled === null) {
      throw new ConflictError("La sesión de caja está cerrada");
    }
    return journaled;
  }
};