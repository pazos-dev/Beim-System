import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

export interface SearchSlice {
  readonly sidebarCollapsed: boolean;
  readonly searchQuery: string;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setSearchQuery: (query: string) => void;
}

export const createSearchSlice: StateCreator<UiState, [], [], SearchSlice> = (set) => ({
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  sidebarCollapsed: false
});
