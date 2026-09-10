import { describe, expect, it } from "vitest";

import type { TxClient, UnitOfWork } from "../../domain/shared/ports.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../domain/shared/errors.js";
import type { CashSession } from "../../domain/cash-session/cash-session.js";
import { makeCashHandlers } from "./cash.js";
import type { CashStore } from "./ports.js";

/** DB-free stand-in: runs the callback against one dummy client, counts runs. */
class FakeUnitOfWork implements UnitOfWork {
  runs = 0;
  readonly tx = {} as TxClient;

  run<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.runs += 1;
    return fn(this.tx);
  }
}

class FakeCashStore implements CashStore {
  sessions = new Map<string, CashSession>();
  seenTx: TxClient[] = [];
  saves = 0;

  private touch(tx: TxClient): void {
    this.seenTx.push(tx);
  }

  async findById(tx: TxClient, id: string): Promise<CashSession | null> {
    this.touch(tx);
    return this.sessions.get(id) ?? null;
  }

  async findOpen(tx: TxClient): Promise<CashSession | null> {
    this.touch(tx);
    for (const session of this.sessions.values()) {
      if (session.status === "open") return session;
    }
    return null;
  }

  async findByBusinessDate(tx: TxClient, businessDate: string): Promise<CashSession | null> {
    this.touch(tx);
    for (const session of this.sessions.values()) {
      if (session.businessDate === businessDate) return session;
    }
    return null;
  }

  async save(tx: TxClient, session: CashSession): Promise<void> {
    this.touch(tx);
    this.saves += 1;
    this.sessions.set(session.id, session);
  }
}

function setup() {
  const uow = new FakeUnitOfWork();
  const cash = new FakeCashStore();
  const handler = makeCashHandlers({ uow, cash });
  return { uow, cash, handler };
}

describe("cash handlers", () => {
  it("open creates a session with expected = opening", async () => {
    const { uow, cash, handler } = setup();
    const session = await handler.open({
      id: "cash-1",
      businessDate: "2026-09-09",
      openingAmount: 1000
    });
    expect(session.status).toBe("open");
    expect(session.expectedAmount).toBe(1000);
    expect(session.difference).toBeNull();
    expect(uow.runs).toBe(1);
    expect(cash.saves).toBe(1);
    expect(cash.seenTx.every((tx) => tx === uow.tx)).toBe(true);
  });

  it("open rejects a second open session with 409 and zero saves", async () => {
    const { cash, handler } = setup();
    await handler.open({ id: "cash-1", businessDate: "2026-09-09" });
    const savesBefore = cash.saves;
    await expect(
      handler.open({ id: "cash-2", businessDate: "2026-09-10" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(cash.saves).toBe(savesBefore);
  });

  it("open rejects a duplicate businessDate with 409 and zero saves", async () => {
    const { cash, handler } = setup();
    const first = await handler.open({ id: "cash-1", businessDate: "2026-09-09" });
    await handler.close({ sessionId: first.id, counted: 0 });
    const savesBefore = cash.saves;
    await expect(
      handler.open({ id: "cash-2", businessDate: "2026-09-09" })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(cash.saves).toBe(savesBefore);
  });

  it("open rejects a malformed businessDate with 422 and zero saves", async () => {
    const { cash, handler } = setup();
    const savesBefore = cash.saves;
    await expect(
      handler.open({ id: "cash-1", businessDate: "09-09-2026" })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(cash.saves).toBe(savesBefore);
  });

  it("recordMovement journals on the open session", async () => {
    const { handler } = setup();
    const opened = await handler.open({
      id: "cash-1",
      businessDate: "2026-09-09",
      openingAmount: 1000
    });
    const next = await handler.recordMovement({
      sessionId: opened.id,
      type: "sale",
      amount: 250
    });
    expect(next.expectedAmount).toBe(1250);
    expect(next.movements).toHaveLength(1);
  });

  it("recordMovement on an unknown session answers 404 with zero saves", async () => {
    const { cash, handler } = setup();
    await expect(
      handler.recordMovement({ sessionId: "missing", type: "sale", amount: 10 })
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(cash.saves).toBe(0);
  });

  it("close records counted and difference (counted − expected)", async () => {
    const { handler } = setup();
    const opened = await handler.open({
      id: "cash-1",
      businessDate: "2026-09-09",
      openingAmount: 1000
    });
    await handler.recordMovement({ sessionId: opened.id, type: "sale", amount: 250 });
    const closed = await handler.close({ sessionId: opened.id, counted: 1300 });
    expect(closed.status).toBe("closed");
    expect(closed.countedAmount).toBe(1300);
    expect(closed.difference).toBe(50);
  });

  it("double close answers 409 with zero extra saves", async () => {
    const { cash, handler } = setup();
    const opened = await handler.open({ id: "cash-1", businessDate: "2026-09-09" });
    await handler.close({ sessionId: opened.id, counted: 0 });
    const savesBefore = cash.saves;
    await expect(handler.close({ sessionId: opened.id, counted: 0 })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(cash.saves).toBe(savesBefore);
  });

  it("close on an unknown session answers 404 with zero saves", async () => {
    const { cash, handler } = setup();
    await expect(handler.close({ sessionId: "missing", counted: 0 })).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(cash.saves).toBe(0);
  });
});
