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
  readonly setUser: (actor: UserActor) => void;
  readonly clearUser: () => void;
}

// Memory-only: no persist middleware, so the actor never reaches storage
// and logout (clearUser) cannot leak identity across sessions.
export const useSessionStore = create<SessionSlice>()((set) => ({
  actor: null,
  clearUser: () => set({ actor: null }),
  setUser: (actor) => set({ actor })
}));

export function selectSessionRole(state: SessionSlice): Role | undefined {
  return state.actor?.role;
}
