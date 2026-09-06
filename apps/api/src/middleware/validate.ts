import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodIssue, ZodType } from "zod";
import { ValidationError } from "../errors/taxonomy.js";

export type ValidationSource = "body" | "query" | "params";

interface FieldIssue {
  path: string;
  message: string;
}

function formatIssues(issues: ZodIssue[]): FieldIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

/**
 * Validates `req[source]` against a zod schema and replaces it with the
 * parsed (coerced/defaulted) value. Failures become a 422 ValidationError
 * with field-level details.
 */
export function validate<TSchema extends ZodType>(
  schema: TSchema,
  source: ValidationSource = "body"
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(new ValidationError(undefined, formatIssues(result.error.issues)));
      return;
    }
    // Express 5 exposes req.query as a getter-only accessor; defineProperty
    // overrides it so the parsed value is what downstream handlers read.
    Object.defineProperty(req, source, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true
    });
    next();
  };
}