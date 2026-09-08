import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

export interface SearchSlice {
  readonly sidebarCollapsed: boolean;
  /**
   * @deprecated Search is URL-driven now: the header writes `q` into the
   * current page and list pages read it from searchParams (useListQuery).
   * Kept only to preserve the store shape; nothing writes it anymore.
   */
  readonly searchQuery: string;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  /** @deprecated See searchQuery: search state lives in the URL. */
  readonly setSearchQuery: (query: string) => void;
}

export const createSearchSlice: StateCreator<UiState, [], [], SearchSlice> = (set) => ({
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  sidebarCollapsed: false
});
