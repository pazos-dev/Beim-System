import { create } from "zustand";

import {
  createModalsSlice,
  type ClienteDuplicateWarning,
  type ModalsSlice,
  type ServicioModalSelection
} from "./ui-slices/modals-slice";
import { createCajaSlice, type CajaSlice } from "./ui-slices/caja-slice";
import { createPeriodSlice, type PeriodSlice } from "./ui-slices/period-slice";
import { createSearchSlice, type SearchSlice } from "./ui-slices/search-slice";

export type { ClienteDuplicateWarning, ModalsSlice, ServicioModalSelection };

export type UiState = SearchSlice & PeriodSlice & ModalsSlice & CajaSlice;

export const useUiStore = create<UiState>()((...args) => ({
  ...createSearchSlice(...args),
  ...createPeriodSlice(...args),
  ...createModalsSlice(...args),
  ...createCajaSlice(...args)
}));
