"use client";

// Bearer session hooks: login/logout flow through `api-fetch` (the sole HTTP
// exit: Authorization injection, 401 session death, envelope unwrap) against
// `POST {base}/auth/gestion-login` and `POST {base}/auth/logout`.
// `useSessionSync` is the SOLE manual writer of the session slice outside
// tests; login stores via `setSession` (it owns the token), logout clears via
// `clearSession`. Theme prefs live in `theme.slice.ts` and are never touched
// here, so logout clears identity while `oscuro` survives.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult
} from "@tanstack/react-query";
import { z } from "zod";

import { isRole } from "../kernel/role";
import { ApiError, apiFetch, type ApiFetchOptions } from "../lib/http/api-fetch";
import { selectSessionRole, useSessionStore, type UserActor } from "../store/session.slice";
import { BOOTSTRAP_KEY } from "./useBootstrap";

export const LOGIN_PATH = "/auth/gestion-login";
export const LOGOUT_PATH = "/auth/logout";

const loginUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  username: z.string().min(1)
});

const loginDataSchema = z.object({
  expiresAt: z.string().min(1),
  token: z.string().min(1),
  user: loginUserSchema
});

export type LoginData = z.infer<typeof loginDataSchema>;

const logoutDataSchema = z.object({
  loggedOut: z.literal(true)
});

function toSessionActor(user: z.infer<typeof loginUserSchema>): UserActor | null {
  if (!isRole(user.role)) return null;
  return {
    displayName: user.name,
    id: user.id,
    role: user.role,
    username: user.username
  };
}

export interface LoginVariables {
  readonly username: string;
  readonly credential: string;
}

export interface SessionRequestOptions {
  readonly fetchImpl?: ApiFetchOptions["fetchImpl"];
}

// POST {base}/auth/gestion-login → `{ token, expiresAt, user }`; maps the
// backend `user.name` onto the slice `displayName`. `expiresAt` is validated
// (a token without expiry is rejected) but not scheduled: refresh is out of
// scope, expiry surfaces as 401 session death.
export async function loginRequest(
  variables: LoginVariables,
  options?: SessionRequestOptions
): Promise<{ readonly actor: UserActor; readonly token: string }> {
  const data = await apiFetch<unknown>(LOGIN_PATH, {
    body: variables,
    ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    method: "POST"
  });
  const parsed = loginDataSchema.safeParse(data);
  if (!parsed.success) throw new Error("The login response is not available.");
  const actor = toSessionActor(parsed.data.user);
  if (!actor) throw new Error("The login response is not available.");
  return { actor, token: parsed.data.token };
}

// POST {base}/auth/logout → `{ loggedOut: true }`. A 401 here still means the
// server dropped the session, so callers clear on settle (see `useLogout`);
// `api-fetch` already ran session death (clear + redirect) before throwing.
export async function logoutRequest(options?: SessionRequestOptions): Promise<void> {
  const data = await apiFetch<unknown>(LOGOUT_PATH, {
    ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    method: "POST"
  });
  if (!logoutDataSchema.safeParse(data).success) {
    throw new Error("The logout response is not available.");
  }
}

function invalidateBootstrap(queryClient: {
  invalidateQueries: (filters: { queryKey: readonly string[] }) => void;
}): void {
  void queryClient.invalidateQueries({ queryKey: BOOTSTRAP_KEY });
}

export function useSessionRole(): UserActor["role"] | undefined {
  return useSessionStore(selectSessionRole);
}

// Manual sync setter (back-compat for `SessionBootstrap` / `ConfiguracionPanel`
// mounts). Fail-closed: an actor arriving without a held Bearer token is never
// written — without a token there is no authenticated session to represent.
export function useSessionSync(): (actor: UserActor | null) => void {
  return (actor) => {
    if (actor) {
      const token = useSessionStore.getState().token;
      if (token) useSessionStore.getState().setSession(actor, token);
    } else {
      useSessionStore.getState().clearSession();
    }
  };
}

export function useLogin(): UseMutationResult<UserActor, Error, LoginVariables> {
  const queryClient = useQueryClient();
  return useMutation<UserActor, Error, LoginVariables>({
    mutationFn: async (variables) => {
      const { actor, token } = await loginRequest(variables);
      useSessionStore.getState().setSession(actor, token);
      return actor;
    },
    onSettled: () => {
      invalidateBootstrap(queryClient);
    }
  });
}

export function useLogout(): UseMutationResult<void, Error, void> {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await logoutRequest();
    },
    onSettled: (_data, error) => {
      // Clear on success or 401 (server dropped the session); keep the actor
      // on transport failures so a flaky network cannot log the user out.
      if (!error || (error instanceof ApiError && error.status === 401)) {
        useSessionStore.getState().clearSession();
      }
      invalidateBootstrap(queryClient);
    }
  });
}

export type { UserActor };
