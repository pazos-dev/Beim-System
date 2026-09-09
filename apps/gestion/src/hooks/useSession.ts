"use client";

// Session hooks: single owner of the session query contract (key, fetch,
// parse, sync) and the ONLY `setUser`/`clearUser` caller outside tests.
// Pages read the role via `useSessionRole` (selector, no query access);
// login/logout mutate the session and invalidate `['bootstrap']` on settle.
// Theme prefs live in `theme.slice.ts` and are never touched here, so
// logout clears identity while `oscuro` survives.

import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult
} from "@tanstack/react-query";

import { isRole, type Role } from "../kernel/role";
import { selectSessionRole, useSessionStore, type UserActor } from "../store/session.slice";
import { BOOTSTRAP_KEY } from "./useBootstrap";

// Canonical session query contract (moved from `SessionBootstrap`, which
// re-exports these for existing importers such as `ConfiguracionPanel`).
export const SESSION_QUERY_KEY = ["gestion", "session"] as const;

const SESSION_API = "/api/gestion/auth/session";
const LOGIN_API = "/api/gestion/auth/login";
const LOGOUT_API = "/api/gestion/auth/logout";
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
    isRole(value.role)
  );
}

function isSuccessEnvelope(payload: unknown): payload is { readonly data: unknown } {
  return isRecord(payload) && payload.ok === true;
}

// Cookie session: credentials stay in the httpOnly cookie (same-origin
// default). Only the public actor travels to the client, never tokens.
export async function fetchSessionActor(): Promise<UserActor> {
  const response = await fetch(SESSION_API, { cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isSuccessEnvelope(payload) && isSessionActor(payload.data)) {
    return payload.data;
  }
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

export function useSessionRole(): Role | undefined {
  return useSessionStore(selectSessionRole);
}

export function useSessionSync(): (actor: UserActor | null) => void {
  const setUser = useSessionStore((state) => state.setUser);
  const clearUser = useSessionStore((state) => state.clearUser);
  const query = useQuery(sessionQueryOptions());

  // Fail-closed: a query error clears even when stale data is retained
  // (TanStack keeps the last success next to the error, so checking data
  // first would resurrect a logged-out actor on the 401 refetch).
  useEffect(() => {
    if (query.error) clearUser();
    else if (query.data) setUser(query.data);
  }, [query.data, query.error, setUser, clearUser]);

  return (actor) => {
    if (actor) setUser(actor);
    else clearUser();
  };
}

export interface LoginVariables {
  readonly username: string;
  readonly credential: string;
}

async function postJson(endpoint: string, body?: unknown): Promise<unknown> {
  const response = await fetch(endpoint, {
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isSuccessEnvelope(payload)) {
    throw new Error(`The request to ${endpoint} failed.`);
  }
  return payload.data;
}

function invalidateSessionState(queryClient: { invalidateQueries: (filters: { queryKey: readonly string[] }) => void }): void {
  void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
  void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
}

export function useLogin(): UseMutationResult<UserActor, Error, LoginVariables> {
  const queryClient = useQueryClient();
  const sync = useSessionSync();
  return useMutation<UserActor, Error, LoginVariables>({
    mutationFn: async (variables) => {
      const data = await postJson(LOGIN_API, variables);
      if (!isSessionActor(data)) throw new Error("The login response is not available.");
      return data;
    },
    onSettled: () => {
      invalidateSessionState(queryClient);
    },
    onSuccess: (actor) => {
      sync(actor);
    }
  });
}

export function useLogout(): UseMutationResult<UserActor, Error, void> {
  const queryClient = useQueryClient();
  const sync = useSessionSync();
  return useMutation<UserActor, Error, void>({
    mutationFn: async () => {
      const data = await postJson(LOGOUT_API);
      if (!isSessionActor(data)) throw new Error("The logout response is not available.");
      return data;
    },
    onSettled: () => {
      invalidateSessionState(queryClient);
    },
    onSuccess: () => {
      // Identity clears; theme prefs (owned by `theme.slice.ts`) survive.
      sync(null);
    }
  });
}

export type { UserActor };
