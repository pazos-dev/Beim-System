import { create } from "zustand";

import type { Role } from "../kernel/role";

export interface UserActor {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: Role;
}

export interface SessionSlice {
  readonly actor: UserActor | null;
  readonly token: string | null;
  readonly setUser: (actor: UserActor) => void;
  readonly clearUser: () => void;
  readonly setSession: (actor: UserActor, token: string) => void;
  readonly clearSession: () => void;
}

// Memory-only: no persist middleware, so actor and token never reach storage
// and logout (clearUser/clearSession) cannot leak identity across sessions.
// `setUser`/`clearUser` are the slice-1 cookie-flow API kept for existing
// hooks until the Bearer rewiring lands; new code uses setSession/clearSession.
export const useSessionStore = create<SessionSlice>()((set) => ({
  actor: null,
  clearSession: () => set({ actor: null, token: null }),
  // Fail-closed legacy path: clearing identity also drops any Bearer token.
  clearUser: () => set({ actor: null, token: null }),
  setSession: (actor, token) => set({ actor, token }),
  // Additive only: preserves an existing token for callers that only know
  // the actor (slice-1 session sync).
  setUser: (actor) => set({ actor }),
  token: null
}));

export function selectSessionRole(state: SessionSlice): Role | undefined {
  return state.actor?.role;
}
