/**
 * Cash handlers (change `clean-arch-application`, Unit 5).
 *
 * One thin function per use case: plain DTO → `UnitOfWork.run` → load
 * `CashSession` for-update → one domain behavior (`openCashSession`,
 * `recordMovement`, `closeCashSession`) → save on the same `TxClient` →
 * commit. `open` guards both invariants before the only save (at-most-one
 * open via `findOpen`, `BusinessDate` uniqueness via `findByBusinessDate`);
 * `close` on a closed session answers 409 with zero extra saves and
 * `difference = counted − expected`. Domain errors pass through untouched
 * to the edge `toAppError` mapping.
 */
import { ConflictError, NotFoundError } from "../../domain/shared/errors.js";
import {
  closeCashSession,
  openCashSession,
  recordMovement,
  type CashSession,
  type OpenCashSessionInput
} from "../../domain/cash-session/cash-session.js";
import type { CashDeps } from "./ports.js";

export interface RecordCashMovementInput {
  readonly sessionId: string;
  readonly type: string;
  readonly amount: number;
}

export interface CloseCashSessionInput {
  readonly sessionId: string;
  readonly counted: number;
}

function sessionNotFound(id: string): NotFoundError {
  return new NotFoundError(`Caja no encontrada: ${id}`);
}

export function makeCashHandlers(deps: CashDeps) {
  const { uow, cash } = deps;

  return {
    async open(input: OpenCashSessionInput): Promise<CashSession> {
      return uow.run(async (tx) => {
        const openSession = await cash.findOpen(tx);
        const duplicate = await cash.findByBusinessDate(tx, input.businessDate);
        if (duplicate !== null) {
          throw new ConflictError("Caja inválida: businessDate ya existe", {
            businessDate: input.businessDate
          });
        }
        const session = openCashSession(input, { hasOpenSession: openSession !== null });
        await cash.save(tx, session);
        return session;
      });
    },

    async recordMovement(input: RecordCashMovementInput): Promise<CashSession> {
      return uow.run(async (tx) => {
        const found = await cash.findById(tx, input.sessionId);
        if (found === null) throw sessionNotFound(input.sessionId);
        const next = recordMovement(found, input.type, input.amount);
        await cash.save(tx, next);
        return next;
      });
    },

    async close(input: CloseCashSessionInput): Promise<CashSession> {
      return uow.run(async (tx) => {
        const found = await cash.findById(tx, input.sessionId);
        if (found === null) throw sessionNotFound(input.sessionId);
        const next = closeCashSession(found, input.counted);
        await cash.save(tx, next);
        return next;
      });
    }
  };
}
