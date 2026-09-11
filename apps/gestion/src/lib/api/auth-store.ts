/**
 * Auth store — global user state with cookie persistence.
 * Token lives in a cookie (accessible by JS for Bearer headers).
 * Actor lives in Zustand AND cookie for hydration.
 */

import { create } from "zustand";
import {
  clearAuthActor,
  clearAuthToken,
  getAuthActor,
  getAuthToken,
  setAuthActor,
  setAuthToken,
} from "./cookies";

export interface UserActor {
  readonly id: string;
  readonly username: string;
  readonly name: string;
  readonly role: string;
}

interface AuthState {
  readonly token: string | null;
  readonly actor: UserActor | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly hasHydrated: boolean;

  readonly setToken: (token: string, actor: UserActor) => void;
  readonly clearAuth: () => void;
  readonly setLoading: (loading: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setHasHydrated: (hydrated: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: typeof window !== "undefined" ? getAuthToken() : null,
  actor: typeof window !== "undefined" ? getAuthActor() : null,
  isLoading: false,
  error: null,
  hasHydrated: false,

  setToken: (token, actor) => {
    setAuthToken(token);
    setAuthActor(actor);
    set({ token, actor, error: null, isLoading: false });
  },

  clearAuth: () => {
    clearAuthToken();
    clearAuthActor();
    set({ token: null, actor: null, error: null, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
}));

/** Hook to get the current auth token for API calls. */
export function useAuthToken(): string | null {
  return useAuthStore((s) => s.token);
}

/** Hook to check if the user is authenticated. */
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => s.token !== null);
}

/** Hook to get the current actor. */
export function useActor(): UserActor | null {
  return useAuthStore((s) => s.actor);
}
