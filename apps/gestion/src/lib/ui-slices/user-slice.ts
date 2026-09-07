import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

// NOTE: AuthActor shape twin. server/shared/auth is deliberately not imported
// here: it pulls server-only infrastructure (node:crypto, JsonStore) that must
// never leak into this client store.
export interface UserActor {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly role: string;
}

export interface UserSlice {
  readonly actor: UserActor | null;
  readonly setUser: (actor: UserActor) => void;
  readonly clearUser: () => void;
}

export const createUserSlice: StateCreator<UiState, [], [], UserSlice> = (set) => ({
  actor: null,
  clearUser: () => set({ actor: null }),
  setUser: (actor) => set({ actor })
});
