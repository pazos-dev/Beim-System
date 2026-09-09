/**
 * CashSession aggregate (domain slice, change `clean-arch-domain` Phase 6).
 *
 * Caja (`domain-entities.md` v3 §6): `BusinessDate` unique (format checked
 * here, uniqueness enforced by the repository), `expected = opening` at
 * open, movements open-only, `difference = counted − expected` computed by
 * `close`. Double open and double close answer 409 (`ConflictError`).
 * Immutable values; every behavior returns a new copy. No DDL/SQL here.
 */
import { ConflictError, ValidationError } from "../shared/errors.js";

export type CashSessionStatus = "open" | "closed";

export interface CashMovement {
  readonly type: string;
  readonly amount: number;
}

export interface CashSession {
  readonly id: string;
  readonly businessDate: string;
  readonly openingAmount: number;
  readonly expectedAmount: number;
  readonly countedAmount: number | null;
  readonly difference: number | null;
  readonly status: CashSessionStatus;
  readonly notes: string;
  readonly movements: readonly CashMovement[];
}

export interface OpenCashSessionInput {
  readonly id: string;
  readonly businessDate: string;
  readonly openingAmount?: number;
  readonly notes?: string;
}

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function cleanId(value: string): string {
  if (value.trim() === "") {
    throw new ValidationError("Caja inválida: id no puede estar vacío", { value });
  }
  return value;
}

function cleanAmount(value: number, noun: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`Caja inválida: ${noun} debe ser un número >= 0`, {
      [noun]: value
    });
  }
  return value;
}

/**
 * Opens a session when none is open. `hasOpenSession` comes from
 * `CashSessionRepository.findOpen()`; a second open answers 409.
 */
export function openCashSession(
  input: OpenCashSessionInput,
  guard: { hasOpenSession: boolean }
): CashSession {
  if (guard.hasOpenSession) {
    throw new ConflictError("Caja inválida: ya existe una sesión abierta", {});
  }
  if (!BUSINESS_DATE_PATTERN.test(input.businessDate)) {
    throw new ValidationError("Caja inválida: businessDate debe ser YYYY-MM-DD", {
      businessDate: input.businessDate
    });
  }
  const openingAmount = cleanAmount(input.openingAmount ?? 0, "openingAmount");
  return {
    id: cleanId(input.id),
    businessDate: input.businessDate,
    openingAmount,
    expectedAmount: openingAmount,
    countedAmount: null,
    difference: null,
    status: "open",
    notes: input.notes ?? "",
    movements: []
  };
}

/** Journals a movement open-only; closed sessions answer 409. */
export function recordMovement(
  session: CashSession,
  type: string,
  amount: number
): CashSession {
  if (session.status !== "open") {
    throw new ConflictError("Caja inválida: movimientos solo en sesión abierta", {
      id: session.id
    });
  }
  if (type.trim() === "") {
    throw new ValidationError("Caja inválida: movement type no puede estar vacío", {});
  }
  if (!Number.isFinite(amount) || amount === 0) {
    throw new ValidationError("Caja inválida: movement amount debe ser distinto de 0", {
      amount
    });
  }
  return {
    ...session,
    expectedAmount: session.expectedAmount + amount,
    movements: [...session.movements, { type, amount }]
  };
}

/**
 * Closes an open session recording `counted` and `difference`
 * (`counted − expected`). A second close answers 409.
 */
export function closeCashSession(session: CashSession, counted: number): CashSession {
  if (session.status !== "open") {
    throw new ConflictError("Caja inválida: la sesión ya está cerrada", {
      id: session.id
    });
  }
  return {
    ...session,
    status: "closed",
    countedAmount: cleanAmount(counted, "countedAmount"),
    difference: counted - session.expectedAmount
  };
}
