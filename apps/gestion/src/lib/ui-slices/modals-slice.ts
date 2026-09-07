import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

export type ClienteDuplicateWarning = "email" | "phone";

export interface ServicioModalSelection {
  readonly id: string;
  readonly displayName: string;
  readonly price: number;
  readonly active: boolean;
  readonly version: number;
}

export interface ModalsSlice {
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

export const createModalsSlice: StateCreator<UiState, [], [], ModalsSlice> = (set) => ({
  clienteModalOpen: false,
  duplicateWarning: null,
  purchaseModalOpen: false,
  servicioCreateOpen: false,
  servicioDeactivating: null,
  servicioEditing: null,
  setClienteModalOpen: (clienteModalOpen) => set({ clienteModalOpen }),
  setDuplicateWarning: (duplicateWarning) => set({ duplicateWarning }),
  setPurchaseModalOpen: (purchaseModalOpen) => set({ purchaseModalOpen }),
  setServicioCreateOpen: (servicioCreateOpen) => set({ servicioCreateOpen }),
  setServicioDeactivating: (servicioDeactivating) => set({ servicioDeactivating }),
  setServicioEditing: (servicioEditing) => set({ servicioEditing }),
  setStockMovementModalOpen: (stockMovementModalOpen) => set({ stockMovementModalOpen }),
  setStockTransferModalOpen: (stockTransferModalOpen) => set({ stockTransferModalOpen }),
  setVentaAnularModalId: (ventaAnularModalId) => set({ ventaAnularModalId }),
  setVentaCreateModalOpen: (ventaCreateModalOpen) => set({ ventaCreateModalOpen }),
  stockMovementModalOpen: false,
  stockTransferModalOpen: false,
  ventaAnularModalId: null,
  ventaCreateModalOpen: false
});
