"use client";

// Bootstrap query: sole owner of key ['bootstrap'], the bootstrap fetch,
// and its response parse. Login/logout mutations invalidate this key on
// settle (see `useSession.ts`); pages read domain data via `useListQuery`.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export const BOOTSTRAP_KEY = ["bootstrap"] as const;

export type BootstrapData = Record<string, unknown>;

const BOOTSTRAP_API = "/api/gestion/bootstrap";
const BOOTSTRAP_STALE_TIME_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: BootstrapData } {
  return isRecord(payload) && payload.ok === true && isRecord(payload.data);
}

export async function fetchBootstrap(): Promise<BootstrapData> {
  const response = await fetch(BOOTSTRAP_API, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isSuccessEnvelope(payload)) return payload.data;
  throw new Error("The bootstrap payload is not available.");
}

export function bootstrapQueryOptions() {
  return {
    queryFn: fetchBootstrap,
    queryKey: BOOTSTRAP_KEY,
    retry: 1,
    staleTime: BOOTSTRAP_STALE_TIME_MS
  } as const;
}

export function useBootstrap(): UseQueryResult<BootstrapData, Error> {
  return useQuery(bootstrapQueryOptions());
}
