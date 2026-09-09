"use client";

// Bootstrap query: sole owner of key ['bootstrap'], the bootstrap fetch, and
// its response parse. Login/logout mutations invalidate this key on settle
// (see `useSession.ts`); pages read domain data via `useListQuery`.
//
// TEMPORARY binding (TODO(http-bootstrap)): the backend exposes no
// `GET {base}/bootstrap`, so this hook fetches the previous same-origin Next
// route `/api/gestion/bootstrap` (JsonStore-backed, cookie session, plain
// `fetch` with `cache: "no-store"` — same transport as `Dashboard`) to keep
// the dashboard working until a backend aggregate exists. Bearer/api-fetch
// transport stays for everything else.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export const BOOTSTRAP_KEY = ["bootstrap"] as const;
// TODO(http-bootstrap): temporary same-origin binding — the backend has no
// bootstrap aggregate yet. Rebind to `GET {base}/bootstrap` via `api-fetch`
// once it exists.
export const BOOTSTRAP_PATH = "/api/gestion/bootstrap";

export type BootstrapData = Record<string, unknown>;

const BOOTSTRAP_STALE_TIME_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export interface BootstrapRequestOptions {
  readonly fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

export async function fetchBootstrap(options?: BootstrapRequestOptions): Promise<BootstrapData> {
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;
  const response = await fetchImpl(BOOTSTRAP_PATH, { cache: "no-store", method: "GET" });
  const payload: unknown = await response.json();
  if (!isRecord(payload) || payload.ok !== true || !isRecord(payload.data)) {
    throw new Error("The bootstrap payload is not available.");
  }
  return payload.data;
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
