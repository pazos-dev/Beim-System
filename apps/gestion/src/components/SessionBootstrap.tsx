"use client";

import { useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useUiStore } from "../lib/ui-store";
import type { UserActor } from "../lib/ui-slices/user-slice";

// Single owner of the session query contract: the query key, the fetcher,
// and the sync hook below. ConfiguracionPanel reuses them so both components
// share one cached request instead of fetching the session twice.
export const SESSION_QUERY_KEY = ["gestion", "session"] as const;

const SESSION_API = "/api/gestion/auth/session";
const SESSION_STALE_TIME_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionActor(value: unknown): value is UserActor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.username === "string" &&
    typeof value.displayName === "string" &&
    typeof value.role === "string"
  );
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: unknown; readonly ok: true } {
  return isRecord(payload) && payload.ok === true;
}

// Cookie session: credentials stay in the httpOnly cookie (same-origin
// default). Only the public actor travels to the client, never tokens.
export async function fetchSessionActor(): Promise<UserActor> {
  const response = await fetch(SESSION_API, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isSuccessEnvelope(payload) && isSessionActor(payload.data)) return payload.data;
  throw new Error("The session is not available.");
}

export function sessionQueryOptions() {
  return {
    queryFn: fetchSessionActor,
    queryKey: SESSION_QUERY_KEY,
    // Unauthorized must surface immediately so the store clears; retrying a
    // 401 only delays that and never recovers.
    retry: false,
    staleTime: SESSION_STALE_TIME_MS
  } as const;
}

// Syncs the cached session into the user slice: actor on success, null on
// any error or unauthorized response. Idempotent, safe to call from every
// component that needs the actor.
export function useSessionSync(): UseQueryResult<UserActor, Error> {
  const setUser = useUiStore((state) => state.setUser);
  const clearUser = useUiStore((state) => state.clearUser);
  const query = useQuery(sessionQueryOptions());

  useEffect(() => {
    if (query.data) setUser(query.data);
    else if (query.error) clearUser();
  }, [query.data, query.error, setUser, clearUser]);

  return query;
}

// Mounted once under QueryProvider in app/app/layout.tsx. Renders nothing;
// its only job is keeping the user slice populated app-wide.
export function SessionBootstrap() {
  useSessionSync();
  return null;
}
