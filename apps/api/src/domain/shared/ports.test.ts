import { describe, expect, it } from "vitest";

import type { Clock, UnitOfWork, Uuid } from "./ports.js";

describe("shared base ports (domain slice)", () => {
  it("runs a unit of work and returns the handler result", async () => {
    const calls: string[] = [];
    const fakeUow: UnitOfWork = {
      async run<T>(fn: (tx: { readonly __txBrand: "TxClient" }) => Promise<T>): Promise<T> {
        const tx = { __txBrand: "TxClient" } as const;
        calls.push("run");
        return fn(tx);
      }
    };

    const result = await fakeUow.run(async (tx) => {
      expect(tx.__txBrand).toBe("TxClient");
      return 42;
    });

    expect(result).toBe(42);
    expect(calls).toEqual(["run"]);
  });

  it("injects deterministic time and uuids via stubs", () => {
    const fixed = new Date("2026-09-09T00:00:00.000Z");
    const clock: Clock = { now: () => fixed };
    const uuid: Uuid = { generate: () => "123e4567-e89b-12d3-a456-426614174000" };

    expect(clock.now()).toBe(fixed);
    expect(uuid.generate()).toBe("123e4567-e89b-12d3-a456-426614174000");
  });
});
