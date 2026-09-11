import { z } from "zod";

import {
  gestionEnvelopeSchema,
  type GestionError
} from "../data/schemas";
import { createGestionError, ERROR_CODES, type ErrorCode } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Minimal HTTP response surface (ISP): only what the client needs, mockable. */
export interface GestionHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface GestionHttpRequestInit {
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}

export interface GestionHttpFetch {
  (url: string, init: GestionHttpRequestInit): Promise<GestionHttpResponse>;
}

export interface GestionHttpClientConfig {
  baseUrl: string;
  token: string;
  fetchImpl?: GestionHttpFetch;
}

export interface GestionHttpRequestOptions<T> {
  body?: unknown;
  dataSchema?: z.ZodType<T>;
}

/**
 * Inverse of `HTTP_STATUS_BY_CODE` (shared/errors.ts), plus 422 for the
 * validation status used by the frozen API contract. Only these codes are
 * mapped; any other status fails closed as DEPENDENCY_UNAVAILABLE.
 */
const HTTP_STATUS_ERROR_CODE: Readonly<Record<number, ErrorCode>> = {
  400: ERROR_CODES.VALIDATION_ERROR,
  401: ERROR_CODES.AUTHENTICATION_REQUIRED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND_OR_FORBIDDEN,
  409: ERROR_CODES.CONFLICT,
  422: ERROR_CODES.VALIDATION_ERROR,
  500: ERROR_CODES.STORAGE_ERROR,
  503: ERROR_CODES.DEPENDENCY_UNAVAILABLE
};

function defaultFetch(url: string, init: GestionHttpRequestInit): Promise<GestionHttpResponse> {
  return fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body
  });
}

/**
 * Server-only generic HTTP seam over the frozen `{ ok, data | error }`
 * envelope. Callers inject `fetchImpl` (tests and composition roots); the
 * bearer token travels only in the Authorization header, never in a body.
 * Every failure path returns a `Result`, so no expected error throws.
 */
export class GestionHttpClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: GestionHttpFetch;

  public constructor(config: GestionHttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? defaultFetch;
  }

  public async request<T>(
    method: HttpMethod,
    path: string,
    options: GestionHttpRequestOptions<T> = {}
  ): Promise<Result<T, GestionError>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: GestionHttpResponse;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
    } catch {
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return this.statusErrorOrDependency(response.status);
    }

    const envelope = gestionEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      return this.statusErrorOrDependency(response.status);
    }
    const body = envelope.data;
    if (!body.ok) {
      return err(createGestionError(body.error.code, body.error.details, body.error.message));
    }
    if (!response.ok) {
      // Error status paired with a success envelope is inconsistent: fail closed.
      return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
    }

    if (options.dataSchema !== undefined) {
      const parsed = options.dataSchema.safeParse(body.data);
      if (!parsed.success) {
        return err(createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE));
      }
      return ok(parsed.data);
    }
    return ok(body.data as T);
  }

  private statusErrorOrDependency(status: number): Result<never, GestionError> {
    const code = HTTP_STATUS_ERROR_CODE[status] ?? ERROR_CODES.DEPENDENCY_UNAVAILABLE;
    return err(createGestionError(code));
  }
}
