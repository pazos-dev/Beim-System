import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { idempotencyDocumentSchema } from "../data/schemas";
import { JsonStore } from "../data/json-store";
import { IdempotencyService } from "./idempotency";
import { ok } from "./result";

describe("idempotency", () => {
  it("replays the exact result without executing the effect twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-idempotency-"));
    const service = new IdempotencyService(
      new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema)
    );
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return ok({ id: "v_1" });
    };

    const first = await service.execute("k-1", { amount: 10 }, execute);
    const replay = await service.execute("k-1", { amount: 10 }, execute);

    expect(first).toEqual({ ok: true, value: { id: "v_1" } });
    expect(replay).toEqual(first);
    expect(executions).toBe(1);
    await rm(directory, { recursive: true, force: true });
  });

  it("returns CONFLICT for the same key with a different payload hash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-idempotency-"));
    const service = new IdempotencyService(
      new JsonStore(
        join(directory, "idempotency.json"),
        idempotencyDocumentSchema.extend({
          version: z.number().int().nonnegative()
        })
      )
    );
    const execute = async () => ok({ id: "v_1" });

    await service.execute("k-1", { amount: 10 }, execute);
    const conflict = await service.execute("k-1", { amount: 20 }, execute);

    expect(conflict).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    await rm(directory, { recursive: true, force: true });
  });
});
