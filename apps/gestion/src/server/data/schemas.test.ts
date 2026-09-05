import { describe, expect, it } from "vitest";

import {
  auditEventSchema,
  errorEnvelopeSchema,
  idempotencyKeySchema,
  idempotencyRecordSchema,
  stateTokenSchema,
  successEnvelopeSchema
} from "./schemas";

describe("shared data schemas", () => {
  it("validates the audit event contract", () => {
    const result = auditEventSchema.safeParse({
      id: "a_000001",
      actorId: "u_1",
      accion: "ventas.create",
      entidad: "ventas",
      entidadId: "v_1",
      instante: "2026-09-04T12:00:00.000Z",
      resultado: "ok",
      detalles: { total: 1500 }
    });

    expect(result.success).toBe(true);
  });

  it("validates idempotency keys and records", () => {
    expect(idempotencyKeySchema.safeParse("k-1").success).toBe(true);
    expect(idempotencyKeySchema.safeParse("").success).toBe(false);
    expect(
      idempotencyRecordSchema.safeParse({
        key: "k-1",
        payloadHash: "a".repeat(64),
        result: { ok: true, value: { id: "v_1" } },
        createdAt: "2026-09-04T12:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("accepts canonical state tokens and both envelope shapes", () => {
    expect(stateTokenSchema.safeParse("en_reparacion").success).toBe(true);
    expect(successEnvelopeSchema.safeParse({ ok: true, data: { id: "v_1" } }).success).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Payload inválido." }
      }).success
    ).toBe(true);
  });
});
