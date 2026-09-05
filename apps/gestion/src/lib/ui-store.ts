import { create } from "zustand";

import type { Period } from "../components/features/PeriodFilter";

interface UiState {
  readonly sidebarCollapsed: boolean;
  readonly searchQuery: string;
  readonly period: Period;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setPeriod: (period: Period) => void;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export const useUiStore = create<UiState>()((set) => ({
  period: DEFAULT_PERIOD,
  searchQuery: "",
  setPeriod: (period) => set({ period }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  sidebarCollapsed: false
}));
