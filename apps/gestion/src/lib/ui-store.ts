import { create } from "zustand";

import type { Period } from "../components/features/PeriodFilter";

export type ClienteDuplicateWarning = "email" | "phone";

export interface ServicioModalSelection {
  readonly id: string;
  readonly displayName: string;
  readonly price: number;
  readonly active: boolean;
  readonly version: number;
}

interface UiState {
  readonly sidebarCollapsed: boolean;
  readonly searchQuery: string;
  readonly period: Period;
  readonly clienteModalOpen: boolean;
  readonly duplicateWarning: ClienteDuplicateWarning | null;
  readonly stockMovementModalOpen: boolean;
  readonly stockTransferModalOpen: boolean;
  readonly purchaseModalOpen: boolean;
  readonly servicioCreateOpen: boolean;
  readonly servicioEditing: ServicioModalSelection | null;
  readonly servicioDeactivating: ServicioModalSelection | null;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setPeriod: (period: Period) => void;
  readonly setClienteModalOpen: (open: boolean) => void;
  readonly setDuplicateWarning: (warning: ClienteDuplicateWarning | null) => void;
  readonly setStockMovementModalOpen: (open: boolean) => void;
  readonly setStockTransferModalOpen: (open: boolean) => void;
  readonly setPurchaseModalOpen: (open: boolean) => void;
  readonly setServicioCreateOpen: (open: boolean) => void;
  readonly setServicioEditing: (selection: ServicioModalSelection | null) => void;
  readonly setServicioDeactivating: (selection: ServicioModalSelection | null) => void;
}

const DEFAULT_PERIOD: Period = { type: "day", value: "" };

export const useUiStore = create<UiState>()((set) => ({
  clienteModalOpen: false,
  duplicateWarning: null,
  stockMovementModalOpen: false,
  stockTransferModalOpen: false,
  purchaseModalOpen: false,
  servicioCreateOpen: false,
  servicioDeactivating: null,
  servicioEditing: null,
  setPurchaseModalOpen: (purchaseModalOpen) => set({ purchaseModalOpen }),
  setServicioCreateOpen: (servicioCreateOpen) => set({ servicioCreateOpen }),
  setServicioDeactivating: (servicioDeactivating) => set({ servicioDeactivating }),
  setServicioEditing: (servicioEditing) => set({ servicioEditing }),
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
