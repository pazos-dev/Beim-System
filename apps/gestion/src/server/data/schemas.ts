import { z } from "zod";

import { STATE_TOKEN_VALUES } from "../../lib/state-tokens.js";

export const ERROR_CODE_VALUES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND_OR_FORBIDDEN",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "STORAGE_ERROR",
  "AUDIT_FAILURE"
] as const;

export const errorCodeSchema = z.enum(ERROR_CODE_VALUES);
export type SchemaErrorCode = z.infer<typeof errorCodeSchema>;

export const stateTokenSchema = z.enum(STATE_TOKEN_VALUES);
export type StateTokenSchemaValue = z.infer<typeof stateTokenSchema>;

const instantSchema = z.string().refine(
  (value) => value.endsWith("Z") && !Number.isNaN(Date.parse(value)),
  { error: "The instant must be a UTC ISO-8601 timestamp." }
);

export const auditResultSchema = z.union([z.literal("ok"), errorCodeSchema]);

export const auditEventSchema = z.object({
  id: z.string().min(1),
  actorId: z.string().min(1).nullable(),
  accion: z.string().min(1),
  entidad: z.string().min(1),
  entidadId: z.string().min(1).nullable(),
  instante: instantSchema,
  resultado: auditResultSchema,
  detalles: z.record(z.string(), z.unknown())
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;

export const auditDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  events: z.array(auditEventSchema)
});

export type AuditDocument = z.infer<typeof auditDocumentSchema>;

export const idempotencyKeySchema = z.string().trim().min(1).max(200);

export const idempotencyRecordSchema = z.object({
  key: idempotencyKeySchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/i),
  result: z.unknown(),
  createdAt: instantSchema
});

export type IdempotencyRecord = z.infer<typeof idempotencyRecordSchema>;

export const idempotencyDocumentSchema = z.object({
  version: z.number().int().nonnegative(),
  records: z.array(idempotencyRecordSchema)
});

export type IdempotencyDocument = z.infer<typeof idempotencyDocumentSchema>;

export const successEnvelopeSchema = z.object({
  ok: z.literal(true),
  data: z.unknown()
});

export const errorEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional()
  })
});

export const gestionEnvelopeSchema = z.union([successEnvelopeSchema, errorEnvelopeSchema]);

export interface GestionErrorDetails {
  [key: string]: unknown;
}

export interface GestionError {
  code: SchemaErrorCode;
  message: string;
  details?: GestionErrorDetails;
}

export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  error: GestionError;
}

export type GestionEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;
