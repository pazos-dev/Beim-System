import { useShallow } from "zustand/react/shallow";

import type { Period } from "../components/features/PeriodFilter";
import { useUiSliceStore } from "./ui.slice";

export function selectSidebarCollapsed(state: { readonly sidebarCollapsed: boolean }): boolean {
  return state.sidebarCollapsed;
}

export function selectPeriod(state: { readonly period: Period }): Period {
  return state.period;
}

export function selectCajaFormRevision(state: { readonly cajaFormRevision: number }): number {
  return state.cajaFormRevision;
}

export interface UiModalsSelection {
  readonly clienteModalOpen: boolean;
  readonly ventaCreateModalOpen: boolean;
  readonly ventaAnularModalId: string | null;
}

// Multi-field reads use useShallow so components re-render only when one
// of the selected keys changes. Never subscribe to the whole store.
export function useUiModals(): UiModalsSelection {
  return useUiSliceStore(
    useShallow((state) => ({
      clienteModalOpen: state.clienteModalOpen,
      ventaAnularModalId: state.ventaAnularModalId,
      ventaCreateModalOpen: state.ventaCreateModalOpen
    }))
  );
}
