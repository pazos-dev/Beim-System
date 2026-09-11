/**
 * Generic HTTP client for direct backend consumption.
 * Handles Bearer auth, envelope parsing, and error translation.
 */

import { apiUrl } from "../api-config";
import { getAuthToken } from "./cookies";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiError {
  readonly code: string;
  readonly message?: string;
}

export interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: ApiError;
}

export interface HttpClientConfig {
  readonly getToken?: () => string | null;
}

export class HttpClient {
  private readonly getToken: () => string | null;

  public constructor(config?: HttpClientConfig) {
    this.getToken = config?.getToken ?? getAuthToken;
  }

  public async request<T>(
    method: HttpMethod,
    path: string,
    options: { body?: unknown; query?: Record<string, string | number | undefined> } = {}
  ): Promise<ApiEnvelope<T>> {
    const url = this.buildUrl(path, options.query);
    const token = this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token !== null) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const init: RequestInit = {
      method,
      headers,
      credentials: "omit", // Bearer auth, no cookies
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch {
      return { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE", message: "No se pudo conectar con el servidor" } };
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE", message: "Respuesta inválida del servidor" } };
    }

    if (!isRecord(raw)) {
      return { ok: false, error: { code: "DEPENDENCY_UNAVAILABLE", message: "Formato de respuesta inválido" } };
    }

    const envelope = raw as { ok?: unknown; data?: unknown; error?: unknown };
    if (envelope.ok !== true) {
      const errorCode = extractErrorCode(envelope.error);
      return { ok: false, error: { code: errorCode, message: extractErrorMessage(envelope.error) } };
    }

    return { ok: true, data: envelope.data as T };
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(apiUrl(path));
    if (query !== undefined) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractErrorCode(error: unknown): string {
  if (isRecord(error) && typeof error.code === "string") return error.code;
  return "UNKNOWN_ERROR";
}

function extractErrorMessage(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return undefined;
}
