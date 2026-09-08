"use client";

import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";

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

export function useGestionMutation<TData = unknown, TVariables = void>(
  config: GestionMutationConfig<TData, TVariables>
): UseMutationResult<TData, GestionMutationError, TVariables> {
  const queryClient = useQueryClient();
  return useMutation<TData, GestionMutationError, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const endpoint = typeof config.endpoint === "function" ? config.endpoint(variables) : config.endpoint;
      let response: Response;
      try {
        response = await fetch(endpoint, {
          body: config.buildBody ? JSON.stringify(config.buildBody(variables)) : undefined,
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-idempotency-key": crypto.randomUUID()
          },
          method: config.method ?? "POST"
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
    }
  });
}
