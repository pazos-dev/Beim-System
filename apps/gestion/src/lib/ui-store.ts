import { create } from "zustand";

import type { Period } from "../components/features/PeriodFilter";

export type ClienteDuplicateWarning = "email" | "phone";

interface UiState {
  readonly sidebarCollapsed: boolean;
  readonly searchQuery: string;
  readonly period: Period;
  readonly clienteModalOpen: boolean;
  readonly duplicateWarning: ClienteDuplicateWarning | null;
  readonly stockMovementModalOpen: boolean;
  readonly stockTransferModalOpen: boolean;
  readonly purchaseModalOpen: boolean;
  readonly ventaCreateModalOpen: boolean;
  readonly ventaAnularModalId: string | null;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setPeriod: (period: Period) => void;
  readonly setClienteModalOpen: (open: boolean) => void;
  readonly setDuplicateWarning: (warning: ClienteDuplicateWarning | null) => void;
  readonly setStockMovementModalOpen: (open: boolean) => void;
  readonly setStockTransferModalOpen: (open: boolean) => void;
  readonly setPurchaseModalOpen: (open: boolean) => void;
  readonly setVentaCreateModalOpen: (open: boolean) => void;
  readonly setVentaAnularModalId: (id: string | null) => void;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export const useUiStore = create<UiState>()((set) => ({
  clienteModalOpen: false,
  duplicateWarning: null,
  stockMovementModalOpen: false,
  stockTransferModalOpen: false,
  purchaseModalOpen: false,
  ventaAnularModalId: null,
  ventaCreateModalOpen: false,
  setPurchaseModalOpen: (purchaseModalOpen) => set({ purchaseModalOpen }),
  setVentaAnularModalId: (ventaAnularModalId) => set({ ventaAnularModalId }),
  setVentaCreateModalOpen: (ventaCreateModalOpen) => set({ ventaCreateModalOpen }),
  setStockMovementModalOpen: (stockMovementModalOpen) => set({ stockMovementModalOpen }),
  setStockTransferModalOpen: (stockTransferModalOpen) => set({ stockTransferModalOpen }),
  period: DEFAULT_PERIOD,
  searchQuery: "",
  setClienteModalOpen: (clienteModalOpen) => set({ clienteModalOpen }),
  setDuplicateWarning: (duplicateWarning) => set({ duplicateWarning }),
  setPeriod: (period) => set({ period }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  sidebarCollapsed: false
}));
