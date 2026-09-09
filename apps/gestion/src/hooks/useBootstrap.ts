"use client";

// Bootstrap query: sole owner of key ['bootstrap'], the bootstrap fetch, and
// its response parse. Login/logout mutations invalidate this key on settle
// (see `useSession.ts`); pages read domain data via `useListQuery`.
//
// Bearer transport (PR2): the fetch flows through `api-fetch` against
// `GET {base}/bootstrap`, so the in-memory token rides as `Authorization` and
// a 401 runs session death (clear + redirect) before surfacing here.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { apiFetch, type ApiFetchOptions } from "../lib/http/api-fetch";

export const BOOTSTRAP_KEY = ["bootstrap"] as const;
export const BOOTSTRAP_PATH = "/bootstrap";

export type BootstrapData = Record<string, unknown>;

const BOOTSTRAP_STALE_TIME_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface BootstrapRequestOptions {
  readonly fetchImpl?: ApiFetchOptions["fetchImpl"];
}

export async function fetchBootstrap(options?: BootstrapRequestOptions): Promise<BootstrapData> {
  const data = await apiFetch<unknown>(BOOTSTRAP_PATH, {
    ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    method: "GET"
  });
  if (!isRecord(data)) throw new Error("The bootstrap payload is not available.");
  return data;
}

export function bootstrapQueryOptions() {
  return {
    // TanStack injects a QueryFunctionContext as the first argument; the
    // closure keeps it out of `fetchBootstrap` so the fetch stays callable
    // with zero or one args in tests.
    queryFn: () => fetchBootstrap(),
    queryKey: BOOTSTRAP_KEY,
    retry: 1,
    staleTime: BOOTSTRAP_STALE_TIME_MS
  } as const;
}

export function useBootstrap(): UseQueryResult<BootstrapData, Error> {
  return useQuery(bootstrapQueryOptions());
}
