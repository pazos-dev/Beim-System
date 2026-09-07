import type { StateCreator } from "zustand";

import type { UiState } from "../ui-store";

export interface CajaSlice {
  readonly cajaFormRevision: number;
  readonly bumpCajaFormRevision: () => void;
}

export const createCajaSlice: StateCreator<UiState, [], [], CajaSlice> = (set) => ({
  cajaFormRevision: 0,
  bumpCajaFormRevision: () => set((state) => ({ cajaFormRevision: state.cajaFormRevision + 1 }))
});
