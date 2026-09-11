"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

import { API_BASE_URL, getAuthToken } from "../lib/api-config";

const LEGACY_API_PREFIX = "/api/gestion/";

function resolveBaseUrl(baseUrl: string | undefined, endpoint: string): string {
  if (baseUrl !== undefined) return baseUrl;
  // Compatibilidad: las páginas heredadas que aún usan rutas internas de Next.js
  // siguen funcionando con URLs relativas hasta que migren al backend.
  return endpoint.startsWith(LEGACY_API_PREFIX) ? "" : API_BASE_URL;
}

// Shared mutation transport for gestion write actions. Owns JSON encoding,
// the response envelope contract ({ok:true,data} / {ok:false,error{code}}),
// the per-attempt idempotency key, and post-success cache invalidation.
// It carries no business logic: each domain hook below owns its endpoint,
// payload shape, and invalidated keys.
export class GestionMutationError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "GestionMutationError";
    this.code = code;
  }
}

export type GestionMutationMethod = "POST" | "PATCH" | "PUT" | "DELETE";

export interface GestionMutationConfig<TData, TVariables> {
  readonly endpoint: string | ((variables: TVariables) => string);
  readonly method?: GestionMutationMethod;
  readonly buildBody?: (variables: TVariables) => unknown;
  readonly invalidateKeys?: ReadonlyArray<readonly string[]>;
  // Base URL for the request. Defaults to the backend API.
  readonly baseUrl?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string") {
    return payload.error.code;
  }
  return "unknown";
}

function readErrorMessage(payload: unknown): string | undefined {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return undefined;
}

function buildMutationUrl(baseUrl: string, endpoint: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${path}`;
}

function buildAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function useGestionMutation<TData = unknown, TVariables = void>(
  config: GestionMutationConfig<TData, TVariables>
): UseMutationResult<TData, GestionMutationError, TVariables> {
  const queryClient = useQueryClient();

  return useMutation<TData, GestionMutationError, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const endpoint = typeof config.endpoint === "function" ? config.endpoint(variables) : config.endpoint;
      const resolvedBaseUrl = resolveBaseUrl(config.baseUrl, endpoint);
      const url = buildMutationUrl(resolvedBaseUrl, endpoint);
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-idempotency-key": crypto.randomUUID(),
        ...buildAuthHeaders(),
      };

      let response: Response;
      try {
        response = await fetch(url, {
          body: config.buildBody ? JSON.stringify(config.buildBody(variables)) : undefined,
          credentials: "omit",
          headers,
          method: config.method ?? "POST",
        });
      } catch {
        throw new GestionMutationError("network");
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.ok !== true) {
        throw new GestionMutationError(readErrorCode(payload), readErrorMessage(payload));
      }
      return (payload as { data: TData }).data;
    },
    onSuccess: () => {
      for (const key of config.invalidateKeys ?? []) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    },
  });
}
