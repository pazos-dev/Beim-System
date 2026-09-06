import { create } from "zustand";

import type { Period } from "../components/features/PeriodFilter";

export type ClienteDuplicateWarning = "email" | "phone";

interface UiState {
  readonly sidebarCollapsed: boolean;
  readonly searchQuery: string;
  readonly period: Period;
  readonly clienteModalOpen: boolean;
  readonly duplicateWarning: ClienteDuplicateWarning | null;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setPeriod: (period: Period) => void;
  readonly setClienteModalOpen: (open: boolean) => void;
  readonly setDuplicateWarning: (warning: ClienteDuplicateWarning | null) => void;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export const useUiStore = create<UiState>()((set) => ({
  clienteModalOpen: false,
  duplicateWarning: null,
  period: DEFAULT_PERIOD,
  searchQuery: "",
  setClienteModalOpen: (clienteModalOpen) => set({ clienteModalOpen }),
  setDuplicateWarning: (duplicateWarning) => set({ duplicateWarning }),
  setPeriod: (period) => set({ period }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  sidebarCollapsed: false
}));
