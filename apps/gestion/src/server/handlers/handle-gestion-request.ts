import { z } from "zod";

import type { GestionError, GestionEnvelope, SuccessEnvelope } from "../data/schemas";
import { buildErrorEnvelope, createGestionError, ERROR_CODES } from "./errors";
import { AuditRepository, buildAuditEvent, type AuditContext } from "./audit";
import { IdempotencyService } from "./idempotency";
import { err, type Result } from "./result";

export interface HandleGestionRequestOptions<Input, Output> {
  body: unknown;
  schema: z.ZodType<Input>;
  idempotencyKey: unknown;
  idempotency: IdempotencyService;
  audit: AuditRepository;
  auditContext: AuditContext;
  execute: (input: Input) => Promise<Result<Output, GestionError>>;
}

export async function handleGestionRequest<Input, Output>(
  options: HandleGestionRequestOptions<Input, Output>
): Promise<GestionEnvelope<Output>> {
  const parsed = options.schema.safeParse(options.body);
  if (!parsed.success) {
    return buildErrorEnvelope(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    });
  }

  try {
    const result = await options.idempotency.execute(
      options.idempotencyKey,
      parsed.data,
      async () => {
        let execution: Result<Output, GestionError>;
        try {
          execution = await options.execute(parsed.data);
        } catch {
          execution = err(createGestionError(ERROR_CODES.STORAGE_ERROR));
        }

        const auditResult = await options.audit.append(
          buildAuditEvent(
            options.auditContext,
            execution.ok ? "ok" : execution.error.code
          )
        );
        if (!auditResult.ok) {
          return err(auditResult.error);
        }

        return execution;
      }
    );

    if (!result.ok) {
      return buildErrorEnvelope(result.error.code, result.error.details, result.error.message);
    }

    const response: SuccessEnvelope<Output> = { ok: true, data: result.value };
    return response;
  } catch {
    return buildErrorEnvelope(ERROR_CODES.STORAGE_ERROR);
  }
}
