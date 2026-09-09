import { beforeEach, describe, expect, it, vi } from "vitest";

import { selectCajaFormRevision, selectPeriod, selectSidebarCollapsed } from "./selectors";
import { useUiSliceStore } from "./ui.slice";

function resetUi(): void {
  useUiSliceStore.setState({
    bumpCajaFormRevision: useUiSliceStore.getState().bumpCajaFormRevision,
    cajaFormRevision: 0,
    clienteModalOpen: false,
    duplicateWarning: null,
    period: { type: "day", value: "" },
    purchaseModalOpen: false,
    servicioCreateOpen: false,
    servicioDeactivating: null,
    servicioEditing: null,
    setClienteModalOpen: useUiSliceStore.getState().setClienteModalOpen,
    setDuplicateWarning: useUiSliceStore.getState().setDuplicateWarning,
    setPeriod: useUiSliceStore.getState().setPeriod,
    setPurchaseModalOpen: useUiSliceStore.getState().setPurchaseModalOpen,
    setServicioCreateOpen: useUiSliceStore.getState().setServicioCreateOpen,
    setServicioDeactivating: useUiSliceStore.getState().setServicioDeactivating,
    setServicioEditing: useUiSliceStore.getState().setServicioEditing,
    setSidebarCollapsed: useUiSliceStore.getState().setSidebarCollapsed,
    setStockMovementModalOpen: useUiSliceStore.getState().setStockMovementModalOpen,
    setStockTransferModalOpen: useUiSliceStore.getState().setStockTransferModalOpen,
    setVentaAnularModalId: useUiSliceStore.getState().setVentaAnularModalId,
    setVentaCreateModalOpen: useUiSliceStore.getState().setVentaCreateModalOpen,
    sidebarCollapsed: false,
    stockMovementModalOpen: false,
    stockTransferModalOpen: false,
    ventaAnularModalId: null,
    ventaCreateModalOpen: false
  });
}

beforeEach(() => {
  resetUi();
  vi.unstubAllGlobals();
});

describe("ui slice", () => {
  it("resets ephemeral state to defaults (reload semantics)", () => {
    const state = useUiSliceStore.getState();

    expect(selectSidebarCollapsed(state)).toBe(false);
    expect(selectPeriod(state)).toEqual({ type: "day", value: "" });
    expect(selectCajaFormRevision(state)).toBe(0);
    expect(state.clienteModalOpen).toBe(false);
    expect(state.ventaAnularModalId).toBeNull();
  });

  it("toggles modals and bumps the caja form revision", () => {
    useUiSliceStore.getState().setClienteModalOpen(true);
    useUiSliceStore.getState().bumpCajaFormRevision();

    expect(useUiSliceStore.getState().clienteModalOpen).toBe(true);
    expect(selectCajaFormRevision(useUiSliceStore.getState())).toBe(1);
  });

  it("exposes no dead searchQuery key", () => {
    expect("searchQuery" in useUiSliceStore.getState()).toBe(false);
    expect("setSearchQuery" in useUiSliceStore.getState()).toBe(false);
  });

  it("persists nothing to storage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem: () => null, removeItem: vi.fn(), setItem } });
    useUiSliceStore.getState().setSidebarCollapsed(true);
    useUiSliceStore.getState().setPeriod({ type: "month", value: "2026-09" });

    expect(setItem).not.toHaveBeenCalled();
  });
});
