import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { auditDocumentSchema, idempotencyDocumentSchema } from "../data/schemas";
import { JsonStore } from "../data/json-store";
import { AuditRepository } from "./audit";
import { IdempotencyService } from "./idempotency";
import { handleGestionRequest } from "./handle-gestion-request";
import { ok } from "./result";

describe("handleGestionRequest", () => {
  it("does not report success when the mandatory audit write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gestion-request-"));
    const auditPath = join(directory, "audit.json");
    const seedStore = new JsonStore(auditPath, auditDocumentSchema);
    await seedStore.write({ version: 1, events: [] });
    const audit = new AuditRepository(new JsonStore(auditPath, auditDocumentSchema, {
      fileSystem: {
        rename: async () => {
          throw new Error("simulated audit failure");
        }
      }
    }));
    const idempotency = new IdempotencyService(
      new JsonStore(join(directory, "idempotency.json"), idempotencyDocumentSchema)
    );

    const response = await handleGestionRequest({
      body: { amount: 10 },
      schema: z.object({ amount: z.number().positive() }),
      idempotencyKey: "k-1",
      idempotency,
      audit,
      auditContext: {
        actorId: "u_1",
        accion: "test.create",
        entidad: "test",
        entidadId: "t_1"
      },
      execute: async () => ok({ id: "t_1" })
    });

    expect(response).toMatchObject({ ok: false, error: { code: "AUDIT_FAILURE" } });
    await rm(directory, { recursive: true, force: true });
  });
});
