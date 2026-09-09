import { create } from "zustand";

import type { Period } from "../components/features/PeriodFilter";
import type {
  ClienteDuplicateWarning,
  ServicioModalSelection
} from "../lib/ui-slices/modals-slice";

export interface UiSliceState {
  readonly sidebarCollapsed: boolean;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly period: Period;
  readonly setPeriod: (period: Period) => void;
  readonly cajaFormRevision: number;
  readonly bumpCajaFormRevision: () => void;
  readonly clienteModalOpen: boolean;
  readonly duplicateWarning: ClienteDuplicateWarning | null;
  readonly stockMovementModalOpen: boolean;
  readonly stockTransferModalOpen: boolean;
  readonly purchaseModalOpen: boolean;
  readonly servicioCreateOpen: boolean;
  readonly servicioEditing: ServicioModalSelection | null;
  readonly servicioDeactivating: ServicioModalSelection | null;
  readonly ventaCreateModalOpen: boolean;
  readonly ventaAnularModalId: string | null;
  readonly setClienteModalOpen: (open: boolean) => void;
  readonly setDuplicateWarning: (warning: ClienteDuplicateWarning | null) => void;
  readonly setStockMovementModalOpen: (open: boolean) => void;
  readonly setStockTransferModalOpen: (open: boolean) => void;
  readonly setPurchaseModalOpen: (open: boolean) => void;
  readonly setServicioCreateOpen: (open: boolean) => void;
  readonly setServicioEditing: (selection: ServicioModalSelection | null) => void;
  readonly setServicioDeactivating: (selection: ServicioModalSelection | null) => void;
  readonly setVentaCreateModalOpen: (open: boolean) => void;
  readonly setVentaAnularModalId: (id: string | null) => void;
}

// Ephemeral, memory-only: modals, sidebar collapse, in-progress filters.
// No persist middleware — reload resets to defaults. The dead `searchQuery`
// key is deliberately dropped: search is URL-driven (`q` via useListQuery).
export const useUiSliceStore = create<UiSliceState>()((set) => ({
  bumpCajaFormRevision: () => set((state) => ({ cajaFormRevision: state.cajaFormRevision + 1 })),
  cajaFormRevision: 0,
  clienteModalOpen: false,
  duplicateWarning: null,
  period: { type: "day", value: "" },
  purchaseModalOpen: false,
  servicioCreateOpen: false,
  servicioDeactivating: null,
  servicioEditing: null,
  setClienteModalOpen: (clienteModalOpen) => set({ clienteModalOpen }),
  setDuplicateWarning: (duplicateWarning) => set({ duplicateWarning }),
  setPeriod: (period) => set({ period }),
  setPurchaseModalOpen: (purchaseModalOpen) => set({ purchaseModalOpen }),
  setServicioCreateOpen: (servicioCreateOpen) => set({ servicioCreateOpen }),
  setServicioDeactivating: (servicioDeactivating) => set({ servicioDeactivating }),
  setServicioEditing: (servicioEditing) => set({ servicioEditing }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setStockMovementModalOpen: (stockMovementModalOpen) => set({ stockMovementModalOpen }),
  setStockTransferModalOpen: (stockTransferModalOpen) => set({ stockTransferModalOpen }),
  setVentaAnularModalId: (ventaAnularModalId) => set({ ventaAnularModalId }),
  setVentaCreateModalOpen: (ventaCreateModalOpen) => set({ ventaCreateModalOpen }),
  sidebarCollapsed: false,
  stockMovementModalOpen: false,
  stockTransferModalOpen: false,
  ventaAnularModalId: null,
  ventaCreateModalOpen: false
}));
